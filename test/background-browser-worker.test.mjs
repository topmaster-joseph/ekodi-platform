import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeTask, summarizeNativeNavigationPerformance, shouldBlockNativeTopLevelNavigation } from '../scripts/ekodi-background-browser-worker.mjs';

const source=fs.readFileSync(new URL('../scripts/ekodi-background-browser-worker.mjs',import.meta.url),'utf8');
const policy=JSON.parse(fs.readFileSync(new URL('../config/background-browser-worker-policy.json',import.meta.url),'utf8'));
const workerWorkflow=fs.readFileSync(new URL('../.github/workflows/ekodi-background-browser-worker.yml',import.meta.url),'utf8');
const boardRegistry=JSON.parse(fs.readFileSync(new URL('../config/board-surface-verification.json',import.meta.url),'utf8'));
const sharedRelease=fs.readFileSync(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');

test('EKODI background browser policy is native, canonical-origin and isolated',()=>{
  assert.equal(policy.policyId,'EKODI-BROWSER-WORKER-001');
  assert.equal(policy.owner,'ekodi-orchestrator');
  assert.equal(policy.canonicalOrigin,'https://ekodi.kr');
  assert.equal(policy.originPolicy.canonicalOriginOnly,true);
  assert.equal(policy.isolation.ephemeralBrowserContextRequired,true);
  assert.equal(policy.isolation.activeUserProfileReuseForbidden,true);
  assert.equal(policy.networkSafety.mutationGrantDefault,false);
  assert.equal(policy.provider.externalBrowserServiceRequired,false);
  assert.equal(policy.routingPolicy,'config/virtualization-routing-policy.json');
  assert.equal(policy.provider.externalFallbackForThisWorker,'forbidden-unless-all-native-browser-routes-unusable-with-audited-failure-evidence');
  assert.equal(policy.provider.externalProviderDefault,'forbidden');
  assert.deepEqual(policy.provider.nativeBrowserPriority,['ekodi-background-browser-worker','ekodi-native-remote-computer','autonomous-execution-fabric']);
  assert.equal(policy.evidence.httpErrorResponsesCaptured,true);
});

test('task protocol rejects external origins and raw execution surfaces',()=>{
  assert.throws(()=>normalizeTask({path:'https://example.com/'}),/canonical ekodi\.kr/);
  assert.throws(()=>normalizeTask({actions:[{type:'evaluate',code:'1+1'}]}),/Unsupported browser action/);
  assert.throws(()=>normalizeTask({actions:[{type:'press',selector:'body',key:'Control+A'}]}),/Unsupported key/);
  const task=normalizeTask({path:'/admin/',deviceProfile:'mobile-portrait',actions:[
    {type:'click',selector:'button[data-test="open"]'},
    {type:'fill',selector:'input[name="q"]',value:'hello'},
    {type:'snapshot'},
  ]});
  assert.equal(task.path,'/admin/');
  assert.equal(task.allowMutation,false);
  assert.equal(task.actions.length,3);
});

test('worker uses Playwright isolated context without arbitrary JS task execution or host input',()=>{
  assert.match(source,/await import\('playwright'\)/);
  assert.match(source,/chromium\.launch\(\{headless:true\}\)/);
  assert.match(source,/browser\.newContext/);
  assert.match(source,/routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001'/);
  assert.match(source,/virtualizationProvider:'ekodi-background-browser-worker'/);
  assert.match(source,/virtualizationProviderType:'native'/);
  assert.match(source,/acceptDownloads:false/);
  assert.match(source,/userAiEntryCount:document\.querySelectorAll/);
  // Count rendered boxes only; <html data-ekodi-user-ai-entry="off"> is an opt-out marker, not a box.
  assert.match(source,/querySelectorAll\('aside\[data-ekodi-user-ai-entry\],\.ekodi-user-ai-entry'\)/);
  assert.match(source,/pageErrors\.push\(\{/);
  assert.match(source,/stack:clean\(err\?\.stack/);
  assert.match(source,/block-non-idempotent-http|blockedMutations/);
  assert.match(source,/page\.on\('response'/);
  assert.match(source,/httpErrorResponses/);
  assert.match(source,/status>=400/);
  assert.match(source,/waitForLoadState\('domcontentloaded'/);
  assert.match(source,/Execution context was destroyed\|Cannot find context/);
  assert.match(source,/for\(let attempt=0;attempt<3;attempt\+\+\)/);
  assert.doesNotMatch(source,/child_process|exec\(|spawn\(|powershell|cmd\.exe|SendKeys|SetCursorPos/);
  assert.doesNotMatch(source,/item\.code|action\.code|rawJavascript/);
});


test('shared-site guarded release invokes native browser verification after production deploy',()=>{
  assert.match(workerWorkflow,/workflow_call:/);
  assert.match(workerWorkflow,/surface_path:/);
  assert.match(workerWorkflow,/surface_paths:/);
  assert.match(workerWorkflow,/surface_registry:/);
  assert.match(workerWorkflow,/INPUT_PATHS/);
  assert.match(workerWorkflow,/INPUT_REGISTRY/);
  assert.match(workerWorkflow,/github\.event_name == 'pull_request' && 'config\/board-surface-verification\.json'/);
  assert.match(workerWorkflow,/horizontalOverflow/);
  assert.match(workerWorkflow,/userAiEntryCount/);
  assert.match(workerWorkflow,/test\("\/admin\(\?:\/\|\$\)"/);
  // Bottom AI command box is retired platform-wide: zero instances on every post-release snapshot.
  assert.match(workerWorkflow,/github\.event_name \}\}" != "pull_request"[\s\S]*select\(\.type == "snapshot" and \(\(\.userAiEntryCount \/\/ 0\) > 0\)\)/);
  assert.match(workerWorkflow,/\.pageErrors \| length == 0/);
  assert.match(workerWorkflow,/\.performance\.navigations/);
  assert.match(workerWorkflow,/\.performance\.p50Ms/);
  assert.match(workerWorkflow,/\.performance\.p95Ms/);
  assert.match(workerWorkflow,/\.navigationTimings\[\]\?/);
  assert.match(workerWorkflow,/Browser start count: 1/);
  assert.match(source,/url:clean\(page\.url\(\),500\)/);
  assert.match(workerWorkflow,/github\.event_name == 'pull_request'[\s\S]*'\/,\/my\/,\/admin\/'/);
  assert.match(workerWorkflow,/uses:\s*actions\/upload-artifact@v4\r?\n\s*if:\s*always\(\)/);
  assert.match(workerWorkflow,/device_profile:/);
  assert.match(workerWorkflow,/group:\s*ekodi-background-browser-worker-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}-\$\{\{ inputs\.verification_lane \|\| 'generic' \}\}-\$\{\{ inputs\.device_profile \|\| 'desktop' \}\}/);
  assert.match(workerWorkflow,/cancel-in-progress:\s*true/);
  assert.match(workerWorkflow,/verification_lane:\s*\n\s*description: Stable caller lane/);
  for(const [job,lane] of [['native_surface_verification_desktop','site-core'],['native_surface_verification_mobile','site-core'],['native_research_verification_desktop','research'],['native_research_verification_mobile','research']]){
    const part=sharedRelease.slice(sharedRelease.indexOf('\n  '+job+':')+3);
    const segment=part.split(/\n  [a-zA-Z0-9_-]+:/)[0];
    assert.ok(segment.includes('verification_lane: '+lane),'verification lane missing for '+job);
  }

  assert.match(sharedRelease,/native_surface_verification_desktop:/);
  assert.match(sharedRelease,/native_surface_verification_mobile:/);
  assert.match(sharedRelease,/uses:\s*\.\/\.github\/workflows\/ekodi-background-browser-worker\.yml/);
  assert.match(sharedRelease,/device_profile:\s*desktop/);
  assert.match(sharedRelease,/device_profile:\s*mobile-portrait/);
  assert.match(sharedRelease,/surface_paths:\s*\/,\/my\/,\/admin\/,\/ekodimall\/admin/);
  assert.equal((sharedRelease.match(/surface_registry:\s*config\/board-surface-verification\.json/g)||[]).length,2);
  assert.equal(boardRegistry.policyId,'EKODI-BOARD-NATIVE-VERIFY-001');
  assert.equal(policy.taskProtocol.maxActions,30);
  assert.ok(workerWorkflow.includes('const screenshotBudget=Math.max(0,30-(2*paths.length-1)-(expectedVisible?2:0))'),'real board screenshots must respect the 30-action limit');
  assert.ok(workerWorkflow.includes('screenshots<screenshotBudget'),'snapshot coverage must remain complete under budget');
  for(const count of [1,4,10,12]){
    const baseActions=2*count-1;
    const screenshots=Math.max(0,30-baseActions);
    assert.ok(baseActions+screenshots<=30,'action budget exceeded for '+count+' paths');
  }
  assert.equal(boardRegistry.readOnly,true);
  assert.deepEqual(boardRegistry.devices,['desktop','mobile-portrait']);
  for(const path of ['/seonammedi/board/voices','/seonammedi/board/notices','/community/','/journal'])assert.ok(boardRegistry.surfaces.some(item=>item.enabled!==false&&item.path===path),path);
  for(const retired of ['/seonammedi/#voices','/seonammedi/#notices'])assert.ok(!boardRegistry.surfaces.some(item=>item.enabled!==false&&item.path===retired),'retired hash-based board surface must not substitute for real board: '+retired);
  assert.match(sharedRelease,/authenticated_admin_surface_verification:/);
  assert.match(sharedRelease,/verify-admin-production-ui-e2e\.yml/);
  for (const verifierPath of [
    'scripts/verify-admin-production-ui-e2e.mjs',
    'scripts/ekodi-background-browser-worker.mjs',
    'scripts/validate-background-browser-worker.mjs',
    'config/background-browser-worker-policy.json',
    'config/board-surface-verification.json',
    'config/surface-system-verification-policy.json',
    '.github/workflows/ekodi-background-browser-worker.yml',
    '.github/workflows/verify-admin-production-ui-e2e.yml',
  ]) {
    assert.ok(sharedRelease.includes(`      - '${verifierPath}'`), `shared-site push trigger missing verifier: ${verifierPath}`);
  }
  const desktop=sharedRelease.match(/native_surface_verification_desktop:[\s\S]*?(?=\n\s{2}[a-zA-Z0-9_-]+:|$)/)?.[0]||'';
  const mobile=sharedRelease.match(/native_surface_verification_mobile:[\s\S]*?(?=\n\s{2}[a-zA-Z0-9_-]+:|$)/)?.[0]||'';
  assert.match(desktop,/needs:\s*deploy/);
  assert.match(mobile,/needs:\s*\[deploy,\s*native_surface_verification_desktop\]/);
});

test('SeonamMedi real native browser board routes match direct Notice and citizen voice links',()=>{
  const home=fs.readFileSync(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8');
  const menu=fs.readFileSync(new URL('../sites/seonammedi/public/central-category-runtime.js',import.meta.url),'utf8');
  const routes=new Map(boardRegistry.surfaces.filter(item=>item.enabled!==false).map(item=>[item.id,item.path]));
  assert.equal(routes.get('seonammedi.notice'),'/seonammedi/board/notices');
  assert.equal(routes.get('seonammedi.citizen_voice'),'/seonammedi/board/voices');
  assert.ok(home.includes('href="board/notices" >공지</a>'),'home Notice must navigate to actual board');
  assert.ok(home.includes('href="board/voices"'),'citizen opinion link must open the read-first board without forcing login');
  assert.ok(!menu.includes('"공지":'),'old dynamic category handler must not intercept Notice');
  assert.ok(!menu.includes('noticePreview'),'old central notice preview must not mask actual board');
});


test('different verifier workflows do not share one cancellation group on the same main revision',()=>{
  assert.match(workerWorkflow,/github\.workflow/);
  assert.match(workerWorkflow,/github\.event\.workflow_run\.head_sha \|\| github\.sha/);
  assert.doesNotMatch(workerWorkflow,/group:\s*ekodi-background-browser-worker-\$\{\{ github\.ref \}\}-\$\{\{ inputs\.device_profile/);
});

test('native browser emits deterministic per-route p50/p95 timings without third-party calls',()=>{
  assert.deepEqual(summarizeNativeNavigationPerformance([]),{navigations:0,p50Ms:null,p95Ms:null,maxMs:null});
  assert.deepEqual(summarizeNativeNavigationPerformance([
    {elapsedMs:200},{elapsedMs:100},{elapsedMs:400},{elapsedMs:300}
  ]),{navigations:4,p50Ms:200,p95Ms:400,maxMs:400});
  assert.match(source,/performance:summarizeNativeNavigationPerformance\(navigationTimings\)/);
  assert.match(source,/navigationTimings\.push\(\{path:canonicalPath/);
  assert.equal(policy.provider.externalBrowserServiceRequired,false);
});

test('synthetic page navigation excludes intentional Cloudflare pacing and settle waits',()=>{
  const start=source.indexOf('  const goto=async p=>');
  const end=source.indexOf('  try{\n    results.push(',start);
  assert.ok(start>=0 && end>start,'browser navigation function must be present');
  const code=source.slice(start,end);
  const pace=code.indexOf('if(pause>0)');
  const timer=code.indexOf('const documentReadyStartedAt=Date.now()');
  const goto=code.indexOf("response=await page.goto(target,{waitUntil:'domcontentloaded'");
  const captured=code.indexOf('const domContentLoadedElapsedMs=Date.now()-documentReadyStartedAt');
  const settle=code.indexOf("await page.waitForTimeout(Math.min(task.deviceProfile.includes('mobile')?650:250");
  assert.ok(pace>=0 && timer>pace && goto>timer && captured>goto && settle>captured,
    'real navigation clock must start after the policy pacing and stop on DOMContentLoaded');
  assert.match(code,/navigationTimings\.push\(\{path:canonicalPath,elapsedMs:domContentLoadedElapsedMs,/);
  assert.match(code,/pacingWaitMs,settleWaitMs,ttfbMs:browserTiming\.ttfbMs/);
  assert.match(code,/domContentLoadedMs:browserTiming\.domContentLoadedMs,fcpMs:browserTiming\.fcpMs/);
  assert.match(code,/const nav=performance\.getEntriesByType\('navigation'\)\[0\]/);
  assert.doesNotMatch(code,/elapsedMs:Date\.now\(\)-navStarted/);
  assert.match(code,/minimumGap=2200/,'quota-avoidance pacing must remain intact');
  assert.match(code,/CF_QUOTA_CIRCUIT_OPEN/);
  for(const privateField of ['location.href','document.cookie','localStorage','sessionStorage'])
    assert.ok(!code.slice(code.indexOf('const browserTiming=await page.evaluate'),code.indexOf('navigationTimings.push')).includes(privateField),
      'numeric performance collection must not access '+privateField);
});

test('native navigation stats treat deliberate throttle as out-of-band metadata',()=>{
  const data=[
    {elapsedMs:130,pacingWaitMs:2200,settleWaitMs:250},
    {elapsedMs:400,pacingWaitMs:2200,settleWaitMs:650},
    {elapsedMs:210,pacingWaitMs:0,settleWaitMs:250},
  ];
  assert.deepEqual(summarizeNativeNavigationPerformance(data),{
    navigations:3,p50Ms:210,p95Ms:400,maxMs:400,
  });
});


test('native Chromium blocks cross-origin redirects before a top-level document request is sent',()=>{
  for(const target of [
    'https://evil.example/path','https://ekodi.kr.evil.example/',
    'http://ekodi.kr/','https://ekodi.kr:8443/',
    'javascript:alert(1)','data:text/html,test','invalid-url',
    'https://admin:password@ekodi.kr/'
  ]) assert.equal(shouldBlockNativeTopLevelNavigation(target),true,target);
  for(const target of [
    'https://ekodi.kr/','https://ekodi.kr/ekodimall/?campaign=1',
    'https://ekodi.kr/admin/#section'
  ]) assert.equal(shouldBlockNativeTopLevelNavigation(target),false,target);
  assert.equal(shouldBlockNativeTopLevelNavigation(
    'https://ekodi-admin-staging.ekodi-development.workers.dev/',
    'https://ekodi-admin-staging.ekodi-development.workers.dev'
  ),false,'allowlisted staging host remains valid only in explicit staging runtime');
  assert.match(source,/await context\.route\('\*\*\/\*'/);
  assert.doesNotMatch(source,/await page\.route\('\*\*\/\*'/);
  assert.match(source,/req\.isNavigationRequest\(\)/);
  assert.match(source,/req\.frame\(\)\.parentFrame\(\)===null/);
  assert.match(source,/context\.on\('page',opened/);
  assert.match(source,/route\.abort\('blockedbyclient'\)/);
  assert.match(source,/if\(blockedExternalNavigations\.length\) fail\('BROWSER_REDIRECT_ORIGIN_FORBIDDEN'/);
  assert.match(source,/blockedExternalNavigationCount:blockedExternalNavigations\.length/);
  // Sensitive destination URL is never included in the blocked-nav evidence.
  const handler=source.slice(source.indexOf("if(mainFrameNavigation && shouldBlockNativeTopLevelNavigation"),source.indexOf("if(quotaCircuit) return route.abort"));
  assert.doesNotMatch(handler,/url:|host:|hostname:|requestUrl:/);
});

test('standalone worker sanitizes bad-task errors as well as runtime exceptions',()=>{
  assert.match(source,/Promise\.resolve\(\)\.then\(readTask\)\.then\(runTask\)/);
  assert.match(source,/console\.error\(JSON\.stringify\(sanitizeNativeBrowserFailure\(error\)\)\)/);
});


test('EKODI Chromium install cache is pinned and independent of paid browser services',()=>{
  assert.match(workerWorkflow,/Restore cached Chromium binaries/);
  assert.match(workerWorkflow,/uses: actions\/cache@v4/);
  assert.match(workerWorkflow,/path: ~\/\.cache\/ms-playwright/);
  assert.match(workerWorkflow,/ekodi-native-chromium-\$\{\{ runner\.os \}\}-\$\{\{ runner\.arch \}\}-playwright-1\.55\.0-v1/);
  assert.match(workerWorkflow,/npm install --no-save --package-lock=false playwright@1\.55\.0/);
  assert.match(workerWorkflow,/npx playwright install --with-deps chromium/);
  assert.match(workerWorkflow,/Record native Chromium cache evidence/);
  assert.match(workerWorkflow,/CHROMIUM_CACHE_HIT: \$\{\{ steps\.chromium-cache\.outputs\.cache-hit \}\}/);
  assert.doesNotMatch(workerWorkflow,/tinyfish|Browserstack|saucelabs/i);
});
