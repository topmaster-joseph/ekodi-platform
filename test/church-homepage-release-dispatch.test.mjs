import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Church Pages guarded workflow requires exact EKODI release provenance',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(w,/workflow_dispatch:\s+inputs:/);
  assert.match(w,/release_branch_ref:\s+description:[\s\S]*?required: true/);
  assert.match(w,/release_task_id:\s+description:[\s\S]*?required: true/);
  assert.match(w,/EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref/);
  assert.match(w,/EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id/);
  assert.match(w,/validate-ekodi-ai-change-orchestration\.mjs\" --release/);
  assert.doesNotMatch(w,/EKODI_ORCHESTRATION_STATIC_POLICY/);
});
test('Orchestrator convergence dispatches Church Pages only from scoped source change',async()=>{
  const s=await read('scripts/converge-orchestrated-pr-merge.mjs');
  assert.match(s,/const churchPagesTouched=changedFiles\.some/);
  assert.match(s,/file==='\.github\/workflows\/deploy-ekodi-church-homepage\.yml'/);
  assert.match(s,/if\(churchPagesTouched\)/);
  assert.match(s,/actions\/workflows\/deploy-ekodi-church-homepage\.yml\/dispatches/);
  assert.match(s,/release_branch_ref:branch,release_task_id:taskId/);
  assert.match(s,/release receipt is not authorized/);
});
test('Church Pages production proof checks newly authorized inline asset on real domain',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(w,/test -s "church\/\$file"/);
  assert.match(w,/church-worship-admin\.js/);
  assert.match(w,/node --check "church\/\$file"/);
  assert.match(w,/https:\/\/ekodi\.kr\/ekodichurch\/church-worship-admin\.js\?release=\$\{release\}/);
  assert.match(w,/grep -Fq 'scope=worship-access' \/tmp\/church-worship-admin\.js/);
  assert.match(w,/CHURCH_SOURCE_SHA/);
});

test('Church weekly packet assets are guarded by release checks',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  for(const phrase of [
    'church-weekly-worship.js','church-weekly-worship.css',
    'worship/weekly.json','2026-10-18/materials.json',
    'data-church-weekly','weekly_manifest','weekly_service','CHURCH_SOURCE_SHA'
  ])assert.ok(w.includes(phrase),'missing guarded Church evidence: '+phrase);
});
test('Church admin edits trigger the guarded Site Core release',async()=>{
  const source=await read('scripts/converge-orchestrated-pr-merge.mjs');
  for(const phrase of [
    "file==='church-pastor-admin-page.js'",
    'if(sharedSiteTouched)',
    'actions/workflows/deploy-site-core.yml/dispatches'
  ])assert.ok(source.includes(phrase),'missing release dispatch: '+phrase);
});

test('church guarded Pages release rejects the previous-week live default and date heading',async()=>{
 const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
 assert.match(w,/test -s church\/live\/worship-materials\.js/);
 assert.match(w,/grep -Fq '10\.18–10\.24' church\/worship\/2026-10-18\/index\.html/);
 assert.match(w,/live_materials=\$\(curl/);
 assert.match(w,/\/tmp\/church-oct18-live-materials\.js/);
 assert.match(w,/resolveServiceDate/);
 assert.match(w,/query\.get\('date'\)\|\|'2026-10-11'/);
});

test('Church QR director camera and resizable program require real deployment canary',async()=>{
 const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
 for(const marker of [
  'Verify director QR cameras and resizable live program on real Church Pages',
  'church/live/management-camera-qr.js',
  'id="openManagementCameraButton"',
  'id="managementCameraDialog"',
  'id="presenterResizeGrip"',
  'function createManagementCameraPair(',
  'function beginOverlayResize(',
  'function beginPresenterResize(',
  'CHURCH_SOURCE_SHA'
 ])assert.ok(w.includes(marker),'missing QR on-air canary '+marker);
 assert.match(w,/Verified director QR camera and overlay sizing assets in production/);
});

test('PR #114 worship-first approved layout requires source and live PC/mobile multilingual Chromium proof',async()=>{
 const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
 for(const contract of [
  'church-homepage-layout.css',
  'body:has(main :target) .hero{display:none!important}',
  'href="#weekly-worship">예배자료</a>',
  'online-triad--broadcast',
  'href="/live/church/"',
  "if grep -Eiq 'meet",
  'Verify approved homepage on native Chromium across nine languages and PC/mobile',
  "const locales=['ko-KR','en','zh-CN','ja','my','kac','vi','mn','id']",
  "{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}",
  "const release=process.env.CHURCH_SOURCE_SHA",
  "initial.weeklyHidden,true",
  "initial.member,true",
  'worship.editorHidden,true',
  'live.cards,2',
  'Upload approved layout Chromium evidence'
 ])assert.ok(w.includes(contract),'missing Church layout guarded proof: '+contract);
 assert.match(w,/actions\/upload-artifact@v4/);
 assert.match(w,/CHURCH_SOURCE_SHA/);
 assert.match(w,/validate-ekodi-ai-change-orchestration\.mjs/);
});

test('9-language Church native browser accepts only canonical same-origin member paths and records truthful DOM on failure',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(w,/document\.querySelectorAll\('#main-nav a\[href\]'\)/);
  assert.match(w,/url\.origin===location\.origin&&url\.pathname==='\/ekodichurch\/my\/'/);
  assert.match(w,/url\.search===''&&url\.hash===''/);
  assert.match(w,/assert\.equal\(initial\.member,true,'site-local member navigation retained'\)/);
  assert.match(w,/EKODI_CHURCH_MEMBER_NAV_EVIDENCE/);
  assert.match(w,/document\.querySelector\('#main-nav'\)\?\.outerHTML/);
  assert.match(w,/CHURCH_SOURCE_SHA/);
});
