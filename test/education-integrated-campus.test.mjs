import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const check=p=>execFileSync(process.execPath,['--check',fileURLToPath(new URL('../'+p,import.meta.url))],{stdio:'pipe'});

test('canonical /edu real-photo homepage retains legacy Admission and Study',async()=>{
  const [html,css,js]=await Promise.all([
    read('education/index.html'),read('education/campus.css'),read('education/campus.js')
  ]);
  for(const anchor of ['EKODI AI 교육과정','AI 교육과정','강의실 바로가기',
    '최근 공지','실습자료 보기','생성형 AI 실무','데이터 분석','업무 자동화',
    '프로젝트 실습','수강신청','강사소개','TWO AREAS · ONE EDUCATION CONTEXT',
    '민감한 여권·성적표·재정증빙 파일을 저장하지 않습니다',
    'href="./admission/"','href="./study/"','href="./portal/"']){
    assert.ok(html.includes(anchor),'missing homepage: '+anchor);
  }
  assert.match(html,/class="campus-header"/);
  assert.match(css,/position:sticky/);
  assert.match(css,/images\.unsplash\.com/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.doesNotMatch(html,/<script(?![^>]*src=)[^>]*>/);
  assert.doesNotMatch(html,/\sonclick=/);
  assert.match(js,/lmsEnabled!==true/);
  assert.match(js,/textContent/);
  check('education/campus.js');
});
test('existing real 4×6 coursework remains source of truth',async()=>{
  const [home,portal,classroom,study]=await Promise.all([
    read('education/index.html'),read('education/portal/portal.js'),
    read('education/study/ai-bootcamp/index.html'),read('education/study/index.html')
  ]);
  assert.match(home,/\.\/study\/ai-bootcamp\//);
  assert.match(portal,/import \{COURSE\} from '\.\.\/study\/ai-bootcamp\/catalog\.js'/);
  assert.match(classroom,/id="presentDialog"/);
  assert.match(study,/4회차 × 6세트/);
  assert.doesNotMatch(portal,/\bSUPABASE_SERVICE_ROLE_KEY\b|\.service_role\b/);
  check('education/portal/portal.js');
});
test('only verified session and deployed RLS capabilities permit durable course writes',async()=>{
  const [page,js,worker,migration]=await Promise.all([
    read('education/portal/index.html'),read('education/portal/portal.js'),
    read('education-worker.js'),
    read('supabase/migrations/20261016010000_education_online_campus_rls.sql')
  ]);
  for(const id of ['panel-dashboard','panel-enroll','panel-materials','panel-practice',
    'panel-manage','portalAuthButton','enrollForm','postForm','operatorEnrollments'])assert.ok(page.includes(id),id);
  assert.match(page,/id="manageNav" hidden/);
  assert.match(js,/cfg\.lmsEnabled===true&&cfg\.dataEnabled===true/);
  assert.match(js,/sb\.rpc\('education_actor_role'\)/);
  assert.match(js,/if\(!session\|\|!databaseReady\|\|!roles\.includes\(role\)\)/);
  assert.match(js,/address\.searchParams\.set\('return_to',location\.href\)/);
  assert.match(js,/onAuthStateChange/);
  assert.match(js,/\.upsert\(/);
  assert.match(js,/from\('education_enrollments'\)/);
  assert.match(js,/from\('education_course_posts'\)/);
  assert.match(worker,/lmsEnabled:env\.EDUCATION_LMS_ENABLED==='true'&&dataEnabled/);
  assert.match(migration,/education_actor_role\(\)/);
  assert.match(migration,/education_enrollments_self_request/);
  assert.match(migration,/auth\.uid\(\)=user_id/);
  assert.match(migration,/education_posts_admin_delete/);
  assert.match(migration,/public\.education_actor_role\(\)='admin'/);
  assert.match(migration,/education_learning_progress/);
  assert.match(migration,/enable row level security/g);
  assert.doesNotMatch(migration,/grant\s+all\s+on\s+public\.education/ig);
  assert.doesNotMatch(js,/service_role|\bapikey:\s*['"]sb_secret_/i);
  assert.doesNotMatch(page,/<script(?![^>]*src=)[^>]*>|\sonclick=|<style[\s>]/);
  check('education-worker.js');
});
test('the material studio remains local-first, unpublished until reviewed',async()=>{
  const [page,js]=await Promise.all([
    read('education/study/ai-bootcamp/studio/index.html'),
    read('education/study/ai-bootcamp/studio/studio.js')
  ]);
  assert.match(page,/파일 내용은 서버나 AI 서비스로 전송하거나 자동 게시하지 않습니다/);
  assert.match(js,/reviewConfirm/);
  assert.doesNotMatch(js,/\bfetch\(/);
});

test('public edu role RPC is invoker; elevated registry lookup stays in private schema',async()=>{
  const hardened=await read('supabase/migrations/20261016011500_education_role_private_wrapper.sql');
  assert.match(hardened,/create schema if not exists education_private/);
  assert.match(hardened,/create or replace function education_private\.actor_role\(\)/);
  assert.match(hardened,/security definer/);
  assert.match(hardened,/create or replace function public\.education_actor_role\(\)/);
  assert.match(hardened,/security invoker/);
  assert.match(hardened,/revoke all on function public\.education_actor_role\(\) from public, anon/);
  assert.match(hardened,/grant execute on function public\.education_actor_role\(\) to authenticated/);
  assert.doesNotMatch(hardened,/grant execute on function education_private\.actor_role\(\) to anon/);
});
test('single fixed education header remains adopted by shared Shell, with no duplicate fallback',async()=>{
  const [worker,html,portal]=await Promise.all([
    read('education-worker.js'),read('education/index.html'),
    read('education/portal/index.html')
  ]);
  assert.match(worker,/injectEkodiShell\(withHeaders\(response\),'edu','',\{existingHeader:true\}\)/);
  assert.match(html,/class="campus-header"/);
  assert.match(portal,/class="workspace-topbar"/);
});
