import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../scripts/verify-seasonal-workforce-native.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/verify-seasonal-workforce-native.yml',import.meta.url),'utf8');

test('real PC/mobile test uses EKODI first-party isolated browser only',()=>{
 assert.match(script,/from 'playwright'/);
 assert.match(script,/headless:true/);
 assert.match(script,/width:1440,height:900,mobile:false/);
 assert.match(script,/width:390,height:844,mobile:true/);
 assert.match(script,/serviceWorkers:'block'/);
 assert.match(script,/acceptDownloads:false/);
 assert.match(script,/https:\/\/ekodi\.kr/);
 assert.doesNotMatch(script,/Browserbase|browserless|puppeteer\.connect|cdp\.connect|remoteDesktop/i);
});

test('all nine subservice pages are checked as real HTTP 200 and mobile no-overflow screens',()=>{
 for(const route of ['/', '/demand','/mou','/learning','/housing','/entry','/help','/reports','/office']){
  assert.ok(script.includes("['"+route+"','"),'missing native route '+route);
 }
 assert.match(script,/response\?\.status\(\)===200/);
 assert.match(script,/layout\.documentWidth<=layout\.viewportWidth\+2/);
 assert.match(script,/page\.screenshot\(/);
 assert.match(script,/layout\.navCount>=8&&layout\.stylesheet&&layout\.proposal/);
 assert.match(script,/!row\.pageErrors\.length/);
 assert.match(script,/mou_internal_scroll_failed/);
 assert.match(script,/tableScroll\.headers===5/);
 assert.match(script,/tableScroll\.scrollLeft>0/);
});

test('all key subservice interactions verified without writes',()=>{
 for(const marker of [
  '#swp-demand-form button[type=submit]','24인·개월','#swp-demand-reset',
  'data-mou-filter="협약서"','data-mou-filter="전체"','data-mou="협약서"',
  '[data-check-progress]','[data-housing-check]',
  '#swp-metric-form button[type=submit]','12인·개월'
 ])assert.ok(script.includes(marker),'missing native interaction: '+marker);
 assert.ok(script.includes("context.route('**/*'"));
 assert.ok(script.includes("route.abort('blockedbyclient')"));
 assert.match(script,/!row\.blockedWrites\.length/);
 assert.doesNotMatch(script,/request\.post\(|request\.patch\(|request\.delete\(|page\.request\.post\(/);
});

test('mobile scroll motion and calculator reset regression remain fixed',()=>{
 const css=readFileSync(new URL('../seasonal-workforce/theme.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../seasonal-workforce/public.js',import.meta.url),'utf8');
 assert.ok(css.includes('@media(max-width:760px){html{scroll-behavior:auto}}'));
 assert.ok(css.includes('.swp-two-column{grid-template-columns:minmax(0,1fr)}'));
 assert.ok(css.includes('.swp-table-wrap{max-width:100%;min-width:0;overflow-x:auto;'));
 const route=readFileSync(new URL('../seasonal-workforce/route.mjs',import.meta.url),'utf8');
 assert.ok(route.includes('이 화면은 제안용 시안입니다. 공식 권한 등록 이전에는'));

 assert.ok(js.includes("result.style.display='';result.hidden=true;result.textContent=''"));
});

test('no real Google login or tenant mutation; API remains disabled',()=>{
 assert.match(script,/realGoogleAuthentication:false/);
 assert.match(script,/municipalDataMutation:false/);
 assert.match(script,/office-data.*isHidden/);
 assert.match(script,/return_to/);
 assert.match(script,/api\.status\(\)===503/);
 assert.match(script,/applications_not_enabled/);
 assert.match(script,/evidence\.success=/);
 assert.match(script,/if\(!evidence\.success\)process\.exitCode=1/);
});

test('independent PR workflow publishes evidence and does not trigger release',()=>{
 assert.match(workflow,/name: Seasonal Workforce Native PC Mobile Verification/);
 assert.match(workflow,/pull_request:/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/  push:\n    branches: \[main\]/);
 assert.match(workflow,/  schedule:\n    - cron: '17 0 \* \* \*'/);
 const pushPaths=workflow.split('  push:\n')[1]?.split('  schedule:\n')[0]||'';
 assert.ok(pushPaths.includes("'.github/workflows/verify-seasonal-workforce-native.yml'"));
 assert.ok(pushPaths.includes("'scripts/verify-seasonal-workforce-native.mjs'"));
 assert.equal(pushPaths.includes("'seasonal-workforce/**'"),false,'do not race a protected shared-site production deployment');

 assert.match(workflow,/contents: read/);
 assert.match(workflow,/playwright@1\.55\.0/);
 assert.match(workflow,/npx playwright install --with-deps chromium/);
 assert.match(workflow,/node scripts\/verify-seasonal-workforce-native\.mjs/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
 assert.match(workflow,/artifacts\/seasonal-workforce-native/);
 assert.match(workflow,/workflow_run:/);
 assert.match(workflow,/github\.event\.workflow_run\.conclusion == 'success'/);
 assert.match(workflow,/--mode=source/);
 assert.match(workflow,/--mode=live/);
 assert.match(script,/productionSiteVerified:MODE==='live'/);
 assert.match(script,/sourceCodePreview:MODE==='source'/);
 assert.doesNotMatch(workflow,/wrangler deploy|contents: write|pull-requests: write/);
});
