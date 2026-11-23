// Release reconcile note (2026-11-08): church Pages deploys failed from 2026-11-05 at the
// source-validation step against ekodi-church 64509fb. ekodi-church main 8af9848 (#160, six-menu
// + Church–Mission calendar, /ekodichurch/schedule/) passes that step; this merged change asks the
// Orchestrator to dispatch the guarded church release so the new pages go live.
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
 assert.match(w,/select\(\.status=="prepared"\)/);
 assert.match(w,/live_materials=\$\(curl/);
 assert.match(w,/\/tmp\/church-week-live-materials\.js/);
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

test('Church-approved layout requires five-viewport multilingual Chromium production proof',async()=>{
 const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
 for(const contract of [
  'church-homepage-layout.css',
  'body:has(main :target) .hero{display:none!important}',
  'verify-church-header-navigation.mjs',
  'online-triad--broadcast',
  'href="/live/church/"',
  "if grep -Eiq 'meet",
  'Verify approved homepage on native Chromium across nine languages and PC/mobile',
  "const locales=['ko-KR','en','zh-CN','ja','my','kac','vi','mn','id']",
  "{name:'mobile-320',width:320,height:740},{name:'mobile-390',width:390,height:844},{name:'tablet-768',width:768,height:1000},{name:'desktop-1366',width:1366,height:900},{name:'desktop-1440',width:1440,height:900}",
  "const release=process.env.CHURCH_SOURCE_SHA",
  "initial.weeklyHidden,true",
  "initial.member,false",
  "initial.qtin,true",
  'worship.editorHidden,true',
  'live.cards,2',
  'Upload approved layout Chromium evidence'
 ])assert.ok(w.includes(contract),'missing Church layout guarded proof: '+contract);
 assert.match(w,/verify-church-header-navigation\.mjs[\s\S]*?--html church\/index\.html --subnav church\/church-section-nav\.js/);
 for(const marker of [
   "location.hash='#together'",
   ".church-section-subnav:not([hidden]) a[href=\"/qtin/church\"]",
   "Together must expose community",
   "Together must expose partner news",
   "churchSelectedSection==='home'"
 ])assert.ok(w.includes(marker),'missing contextual navigation live proof: '+marker);
 assert.match(w,/actions\/upload-artifact@v4/);
 assert.match(w,/CHURCH_SOURCE_SHA/);
 assert.match(w,/validate-ekodi-ai-change-orchestration\.mjs/);
});


test('the independently released Church Pages must show QTIN directly and preserve My Page behind account context',async()=>{
 const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
 const verifier=await read('scripts/verify-church-header-navigation.mjs');
 assert.match(verifier,/requireQtinPrimary/);
 assert.match(verifier,/--expect-qtin/);
 assert.match(w,/--html church\/index\.html --subnav church\/church-section-nav\.js --expect-qtin/);
 assert.match(w,/--subpage "church\/\$page\/index\.html" --kind "\$page" --expect-qtin/);
 assert.match(w,/grep -Fq 'href="\/qtin\/church">큐티인 신청<\/a>' church\/index\.html/);
 assert.match(w,/grep -Fq "href: '\/qtin\/church', label: '큐티인 신청'" church\/script\.js/);
 assert.match(w,/name\.href = '\/ekodichurch\/my\/'/);
 assert.match(w,/assert\.equal\(initial\.member,false/);
 assert.match(w,/assert\.equal\(initial\.qtin,true/);
 for(const scope of [
   '--subpage /tmp/church-devotion.html --kind devotion --expect-qtin',
   '--subpage /tmp/church-verify-notices.html --kind notices --expect-qtin',
   '--subpage /tmp/church-verify-schedule.html --kind schedule --expect-qtin'
 ])assert.ok(w.includes(scope),'missing production QTIN release proof: '+scope);
 assert.match(w,/CHURCH_CANONICAL_SOURCE_CUTOVER_APPROVED/);
 assert.match(w,/validate-ekodi-ai-change-orchestration\.mjs" --release/);
});


test('nine-language Church Pages production proof reports the exact residual text without relaxing the gate',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  assert.match(w,/Church nine-language residual diagnostic/);
  assert.match(w,/const korean=\[\.\.\.visible\.matchAll/);
  assert.match(w,/throw error;/);
  // Hidden and script-source Korean must not fail a translated rendered screen.
  assert.match(w,/NodeFilter\.SHOW_TEXT/);
  assert.match(w,/range\.getClientRects\(\)\.length===0/);
  assert.match(w,/\[data-ekodi-language-control\],\[data-ekodi-user-content\]/);
  assert.match(w,/window\.__EKODI_CHURCH_RENDERED_TEXT__/);
  assert.match(w,/return !\/\[가-힣\]\/.test\(window\.__EKODI_CHURCH_RENDERED_TEXT__\(\)\)/);
  assert.match(w,/body:window\.__EKODI_CHURCH_RENDERED_TEXT__\(\)/);
  assert.doesNotMatch(w,/body:clone\.innerText|visible=clone\.innerText/);
});

test('guarded Church Pages promotion requires translated account controls for all nine locales and member-name privacy',async()=>{
  const w=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  for(const marker of [
    `"'로그인':{en:'Sign in'" church/church-i18n.js`,
    `"'로그아웃':{en:'Sign out'" church/church-i18n.js`,
    `"add('로그인'," church/church-i18n-extended.js`,
    `"add('로그아웃'," church/church-i18n-extended.js`,
    `"name.dataset.ekodiUserContent = ''" church/church-account-header.js`
  ])assert.ok(w.includes(marker),'missing reviewed Church source release guard: '+marker);
  assert.match(w,/window\.__EKODI_CHURCH_RENDERED_TEXT__/);
  assert.doesNotMatch(w,/body:clone\.innerText/);
});


test('Church source PR 195 schedule proof requires vertically stacked today-selected schedule and safe details',async()=>{
  const workflow=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  const proof=await read('scripts/verify-church-schedule-day-detail-native.mjs');
  assert.match(workflow,/Verify Church schedule day-detail vertical flow on real Pages with isolated native Chromium/);
  assert.match(workflow,/test -s church\/church-shared-schedules\.js/);
  assert.match(workflow,/grep -Fq 'data-church-event-detail' church\/schedule\/index\.html/);
  assert.match(workflow,/verify-church-schedule-day-detail-native\.mjs/);
  assert.match(workflow,/Upload Church synthetic schedule calendar evidence/);
  assert.match(proof,/const today=localDay\(\),other=dayNear\(today\)/);
  assert.match(proof,/width of \[390,1366\]/);
  assert.match(proof,/first\.stacked,true/);
  assert.match(proof,/first\.selected,today/);
  assert.match(proof,/page\.click\('\[data-church-schedules-list\] \.church-schedule-event-select'\)/);
  assert.match(proof,/주보 원문에 근거해 공개한 일정 상세내용/);
  assert.match(proof,/source:'ekodimission'/);
  assert.match(proof,/await page\.click\('\[data-church-calendar-today\]'\)/);
  assert.match(proof,/assert\.deepEqual\(forbiddenWrites,\[\]/);
  assert.match(proof,/void req\.abort\('blockedbyclient'\)/);
  assert.match(proof,/await browser\.close\(\)/);
  assert.doesNotMatch(proof,/method:'(?:POST|PATCH|DELETE)'/);
});


test('read-only inline Church homepage source proof is an allowlisted guarded release trigger',async()=>{
  const converge=await read('scripts/converge-orchestrated-pr-merge.mjs');
  const script=await read('scripts/verify-church-homepage-production.mjs');
  assert.match(converge,/file==='scripts\/verify-church-homepage-production\.mjs'/);
  assert.match(converge,/if\(churchPagesTouched\)/);
  assert.match(script,/const CHURCH_ORIGIN='https:\/\/ekodi\.kr'/);
  assert.match(script,/expectedSourceSha/);
  assert.match(script,/return Object\.freeze/);
  assert.match(script,/method:'GET'/);
  assert.match(script,/realUserAuthenticated:false,dataMutations:false,loggedInCrudVerified:false/);
  assert.doesNotMatch(script,/\bmethod:'(?:POST|PUT|PATCH|DELETE)'/);
  assert.doesNotMatch(script,/\bAuthorization:/);
  assert.doesNotMatch(script,/location\.replace|window\.open/);
});


test('Church Pages release verifies compact notice title/date rows and full detail without board writes',async()=>{
  const workflow=await read('.github/workflows/deploy-ekodi-church-homepage.yml');
  const proof=await read('scripts/verify-church-notice-compact-native.mjs');
  assert.match(workflow,/Verify compact Church public notices index and full post detail with native Chromium/);
  assert.match(workflow,/grep -Fq "function noticeRow\(post\)" church\/church-public-updates\.js/);
  assert.match(workflow,/grep -Fq "church-public-notice-line" church\/church-public-updates\.css/);
  assert.match(workflow,/verify-church-notice-compact-native\.mjs/);
  assert.match(workflow,/church-notice-compact-native/);
  assert.match(proof,/CHURCH_NOTICE_COMPACT_PROOF/);
  assert.match(proof,/for\(const width of \[390,1366\]\)/);
  assert.match(proof,/index\.previewCount,0/);
  assert.match(proof,/index\.containsBody,false/);
  assert.match(proof,/dateRightEdgeGap<=5/);
  assert.match(proof,/detail\.body,posts\[0\]\.body/);
  assert.match(proof,/req\.abort\('blockedbyclient'\)/);
  assert.match(proof,/assert\.deepEqual\(forbiddenWrites,\[\]/);
  assert.match(proof,/await browser\.close\(\)/);
  assert.doesNotMatch(proof,/\.click\('#goLiveButton'|method:'POST'|method:'PATCH'/);
});
