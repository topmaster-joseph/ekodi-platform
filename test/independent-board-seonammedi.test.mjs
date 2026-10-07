import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('SeonamMedi citizen voices use the standalone board API directly',async()=>{
  const [app,worker,config]=await Promise.all([
    read('sites/seonammedi/public/app.js'),
    read('services/independent-board/worker.js'),
    read('wrangler.independent-board.toml')
  ]);
  assert.match(app,/fetch\('\/board\/api\/posts'/);
  assert.match(app,/\/board\/api\/posts\/'\+voiceId\+'\/replies/);
  assert.doesNotMatch(app,/fetch\('\/api\/seonammedi\/voices'/);
  assert.match(worker,/env\.BOARD_DB/);
  assert.doesNotMatch(worker,/env\.DB\b/);
  assert.match(worker,/storage:'independent-board-d1'/);
  assert.match(worker,/private_contact/);
  assert.match(config,/binding = "BOARD_DB"/);
  assert.match(config,/database_name = "ekodi-independent-board"/);
  assert.match(config,/pattern = "seonammedi\.kr\/board\*"/);
  assert.match(config,/pattern = "ekodi\.kr\/seonammedi\/board\*"/);
  assert.match(worker,/function boardPage\(req\)/);
  assert.match(worker,/\/board\/voices/);
  assert.match(worker,/의견 등록/);
  assert.match(worker,/검색/);
  assert.match(worker,/답글 등록/);
  assert.match(worker,/data-edit/);
  assert.match(worker,/data-delete/);
  assert.match(worker,/data-reply-delete/);
});

test('finance and notice boards are first-class standalone board routes',async()=>{
  const [worker,migration,site]=await Promise.all([
    read('services/independent-board/worker.js'),
    read('services/independent-board/migrations/0003_finance_notice_boards.sql'),
    read('sites/seonammedi/public/index.html')
  ]);
  assert.match(worker,/function financePage\(req\)/);
  assert.match(worker,/function noticesPage\(req\)/);
  assert.match(worker,/path==='\/finance'/);
  assert.match(worker,/path==='\/notices'/);
  assert.match(worker,/\/board\/api\/admin\/finance/);
  assert.match(worker,/\/board\/api\/admin\/notices/);
  assert.match(worker,/requirePermission\(req,'finance'\)/);
  assert.match(worker,/requirePermission\(req,'notices'\)/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS finance_posts/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS notice_posts/);
  assert.match(site,/href="board\/voices">시민의견/);
  assert.match(site,/href="board\/finance">회계/);
  assert.match(site,/href="board\/notices">공지/);
});

test('standalone board supports both customer-domain and internal seonammedi mounts',async()=>{
  const mod=await import(new URL('../services/independent-board/worker.js?dual-mount='+Date.now(),import.meta.url));
  const external=await mod.default.fetch(new Request('https://seonammedi.kr/board/voices'),{});
  const internal=await mod.default.fetch(new Request('https://ekodi.kr/seonammedi/board/voices'),{});
  const externalHtml=await external.text(),internalHtml=await internal.text();
  assert.match(externalHtml,/href="\/board\/voices"/);
  assert.match(externalHtml,/href="\/board\/finance"/);
  assert.match(internalHtml,/href="\/seonammedi\/board\/voices"/);
  assert.match(internalHtml,/href="\/seonammedi\/board\/finance"/);
  assert.match(internalHtml,/href="\/seonammedi\/#timeline"/);
  assert.doesNotMatch(internalHtml,/MY OPERATING SPACES|내 운영공간/);
});

test('all three board pages share the SeonamMedi header and footer contract',async()=>{
  const worker=await read('services/independent-board/worker.js');
  assert.match(worker,/서남권 의대 설립 비상대책위원회 관련 공개 기록·소통 채널/);
  assert.match(worker,/자료의 성격과 출처를 구분해 보존합니다/);
  assert.match(worker,/boardPath\(req,'voices'\)/);
  assert.match(worker,/boardPath\(req,'finance'\)/);
  assert.match(worker,/boardPath\(req,'notices'\)/);
  assert.match(worker,/id="adminLink" href="#admin">관리자/);
  assert.match(worker,/document\.getElementById\("adminLink"\)\?\.addEventListener\("click",[\s\S]*login\(\)/);
});

test('independent board deployment provisions its own storage and verifies real CRUD',async()=>{
  const workflow=await read('.github/workflows/deploy-independent-board.yml');
  assert.match(workflow,/d1 create ekodi-independent-board/);
  assert.match(workflow,/d1 migrations apply ekodi-independent-board --remote/);
  assert.match(workflow,/r2 bucket create ekodi-independent-board-files/);
  assert.match(workflow,/Recover exact orchestrator provenance/);
  assert.match(workflow,/EKODI_RELEASE_BRANCH_REF=\$branch/);
  assert.match(workflow,/EKODI_RELEASE_TASK_ID=\$\{requested_task:-\$derived_task\}/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/health/);
  assert.match(workflow,/Verify production board UI/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/voices/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/finance/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/notices/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/seonammedi\/board\/voices/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/seonammedi\/board\/finance/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/seonammedi\/board\/notices/);
  assert.match(workflow,/release_branch_ref:/);
  assert.match(workflow,/release_task_id:/);
  assert.match(workflow,/REQUESTED_RELEASE_BRANCH_REF/);
  assert.match(workflow,/commits\/\$GITHUB_SHA\/pulls/);
  assert.match(workflow,/Requested release task does not match orchestrator branch/);
  assert.match(workflow,/Production create-list-reply canary and cleanup/);
  assert.match(workflow,/DELETE FROM board_replies WHERE post_id=\$post_id/);
  assert.match(workflow,/DELETE FROM board_posts WHERE id=\$post_id/);
});

test('board schema keeps private contact out of the public read model',async()=>{
  const [migration,worker]=await Promise.all([
    read('services/independent-board/migrations/0002_citizen_voice_fields.sql'),
    read('services/independent-board/worker.js')
  ]);
  assert.match(migration,/private_contact TEXT NOT NULL DEFAULT ''/);
  const listStart=worker.indexOf('async function list');
  const listEnd=worker.indexOf('async function adminList',listStart);
  const listBlock=worker.slice(listStart,listEnd);
  assert.doesNotMatch(listBlock,/private_contact/);
});

test('standalone boards reuse EKODI authentication and own their mutations',async()=>{
  const [worker,voiceAdmin,adminJs]=await Promise.all([
    read('services/independent-board/worker.js'),
    read('sites/seonammedi/public/voice-public-admin.js'),
    read('sites/seonammedi/public/admin/admin.js')
  ]);
  assert.match(worker,/new URL\('\/api\/seonammedi\/admin\/me'/);
  assert.match(worker,/auth\.permissions\?\.\[permission\]/);
  assert.match(worker,/path==='\/api\/admin\/posts'/);
  assert.match(worker,/createFinance\(req,env\)/);
  assert.match(worker,/createNotice\(req,env\)/);
  assert.doesNotMatch(worker,/\/api\/admin\/bootstrap|\/api\/admin\/login|board_sessions|board_admins/);
  assert.match(voiceAdmin,/\/board\/api\/admin\/posts/);
  assert.doesNotMatch(voiceAdmin,/\/api\/seonammedi\/admin\/voices/);
  assert.match(adminJs,/\/board\/api\/admin\/posts/);
});


test('SeonamMedi board admin login preserves the initiating external or internal mount',async()=>{
  const [worker,auth,access,site,adminSite]=await Promise.all([
    read('services/independent-board/worker.js'),
    read('auth-site/auth.js'),
    read('supabase/functions/access-api/index.ts'),
    read('sites/seonammedi/public/index.html'),
    read('sites/seonammedi/public/admin/index.html')
  ]);
  assert.match(worker,/commonScript\('\/board\/voices'\)/);
  assert.match(worker,/location\.pathname\.startsWith\(\"\/seonammedi\/board\"\)/);
  assert.match(worker,/\/api\/seonammedi\/admin\/auth\/exchange/);
  for(const route of ['voices','finance','notices']){
    assert.match(site,new RegExp('href="board/'+route+'"'));
    assert.match(adminSite,new RegExp('href="\\.\\./board/'+route+'"'));
  }
  assert.doesNotMatch(site,/href="https:\/\/seonammedi\.kr\/board\//);
  assert.doesNotMatch(adminSite,/href="https:\/\/seonammedi\.kr\/board\//);
  assert.match(auth,/seonamMediHandoff/);
  assert.match(auth,/await handoffToService\(\)/);
  assert.match(worker,/set\(\"site\",\"seonammedi\"\)/);
  assert.match(access,/seonammedi:\["https:\/\/seonammedi\.kr"/);
  assert.match(access,/if\(site==="portal"\|\|site==="seonammedi"\)[\s\S]*generateLink\(\{type:"magiclink",email\}\)[\s\S]*workspace:null/);
});


test('standalone board preserves slash parity on external and internal mounts',async()=>{
  const mod=await import(new URL('../services/independent-board/worker.js?slash-parity='+Date.now(),import.meta.url));
  const pairs=[
    ['https://seonammedi.kr/board/voices','https://seonammedi.kr/board/voices/','시민의견'],
    ['https://seonammedi.kr/board/finance','https://seonammedi.kr/board/finance/','회계'],
    ['https://seonammedi.kr/board/notices','https://seonammedi.kr/board/notices/','공지'],
    ['https://ekodi.kr/seonammedi/board/voices','https://ekodi.kr/seonammedi/board/voices/','시민의견'],
    ['https://ekodi.kr/seonammedi/board/finance','https://ekodi.kr/seonammedi/board/finance/','회계'],
    ['https://ekodi.kr/seonammedi/board/notices','https://ekodi.kr/seonammedi/board/notices/','공지']
  ];
  for(const [slashless,trailing,label] of pairs){
    const [a,b]=await Promise.all([mod.default.fetch(new Request(slashless),{}),mod.default.fetch(new Request(trailing),{})]);
    assert.equal(a.status,b.status,slashless);
    const [ha,hb]=await Promise.all([a.text(),b.text()]);
    assert.match(ha,new RegExp('<h1>'+label+'</h1>'));
    assert.match(hb,new RegExp('<h1>'+label+'</h1>'));
    assert.equal(ha.includes('MY OPERATING SPACES'),false);
    assert.equal(hb.includes('MY OPERATING SPACES'),false);
  }
});


test('orchestrated merge dispatches board/shared-site deploys and live legacy handoff verification',async()=>{
  const [script,mergeWorkflow,deployWorkflow,sharedDeploy,router]=await Promise.all([
    read('scripts/converge-orchestrated-pr-merge.mjs'),
    read('.github/workflows/converge-orchestrated-pr-merge.yml'),
    read('.github/workflows/deploy-independent-board.yml'),
    read('.github/workflows/deploy-site-core.yml'),
    read('platform-router-entry-worker.js')
  ]);
  assert.match(mergeWorkflow,/actions: write/);
  assert.match(deployWorkflow,/pull-requests: read/);
  assert.match(script,/independentBoardTouched/);
  assert.match(script,/sharedSiteTouched/);
  assert.match(script,/file\.startsWith\('sites\/'\)/);
  assert.match(script,/deploy-independent-board\.yml\/dispatches/);
  assert.match(script,/deploy-site-core\.yml\/dispatches/);
  assert.match(script,/release_branch_ref:branch/);
  assert.match(script,/release_task_id:taskId/);
  assert.match(script,/sync_domains:'false'/);
  assert.match(script,/async function dispatchPostMergeDeploys\(\)/);
  assert.match(script,/merged===true\)\{await dispatchPostMergeDeploys\(\)/);
  assert.match(script,/already merged; post-merge deploys reconciled/);
  assert.match(script,/action:'deploy-dispatched'/);
  assert.match(sharedDeploy,/Verify stray SeonamMedi board URLs canonicalize/);
  assert.match(sharedDeploy,/https:\/\/ekodi\.kr\/board\/\$\{route\}/);
  assert.match(sharedDeploy,/https:\/\/seonammedi\.kr\/board\/\$\{route\}/);
  assert.match(router,/legacySeonamBoardRedirect/);
  assert.match(router,/https:\/\/seonammedi\.kr\/board\//);
  assert.ok(router.indexOf('legacySeonamBoardRedirect(request)')<router.indexOf('handleSiteBoardRequest(request,env)'));
});
