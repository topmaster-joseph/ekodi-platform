import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  TELEMETRY_URL,BEACON_PREFIX,
  classifyConsoleSecurityBlock,classifyRequestSecurityBlock,
  classifyMutationSecurityBlock,verifyKnownSecurityBlocks
} from '../scripts/education-native-security-observations.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const inline='Refused to apply inline style because it violates the following Content Security Policy directive: "style-src \'self\' https://ekodi.kr https://ekodi.kr/shell". Either the \'unsafe-inline\' keyword, a hash (\'sha256-abc\'), or a nonce (\'nonce-...\') is required to enable inline execution.';
const beacon="Refused to load the script '"+BEACON_PREFIX+"v4bc70e2c01a94c73b74392e4234840661791215815920' because it violates the following Content Security Policy directive: \"script-src 'self' https://cdn.jsdelivr.net https://ekodi.kr\". Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback.";
const blocked='Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector';
const inlineChromium156="Applying inline style violates the following Content Security Policy directive 'style-src 'self' https://ekodi.kr https://ekodi.kr/shell'. Either the 'unsafe-inline' keyword, a hash ('sha256-6VVFqLR4PDJXyCW7LUvhdS2zhZdIHiNuwZA+lh0G6zI='), or a nonce ('nonce-...') is required to enable inline execution. The action has been blocked.";
const beaconChromium156="Loading the script '"+BEACON_PREFIX+"v4bc70e2c01a94c73b74392e4234840661791215815920' violates the following Content Security Policy directive: \"script-src 'self' https://cdn.jsdelivr.net https://ekodi.kr\". Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback. The action has been blocked.";
const telemetry={method:'POST',url:TELEMETRY_URL};

test('actual captured security blocks remain rejected by the browser, but are reported separately',()=>{
  assert.equal(classifyConsoleSecurityBlock(inline),'inline-style-rejected-by-strict-CSP');
  assert.equal(classifyConsoleSecurityBlock(inlineChromium156),'inline-style-rejected-by-strict-CSP');
  assert.equal(classifyConsoleSecurityBlock(beacon),'unapproved-cloudflare-beacon-blocked-by-CSP');
  assert.equal(classifyConsoleSecurityBlock(beaconChromium156),'unapproved-cloudflare-beacon-blocked-by-CSP');
  assert.equal(classifyConsoleSecurityBlock(blocked),'read-only-probe-blocked-network-mutation');
  assert.equal(classifyRequestSecurityBlock(BEACON_PREFIX+'v123','csp'),'unapproved-cloudflare-beacon-blocked-by-CSP');
  assert.equal(classifyRequestSecurityBlock(TELEMETRY_URL,'net::ERR_BLOCKED_BY_CLIENT.Inspector'),'read-only-probe-blocked-network-mutation');
  assert.equal(classifyMutationSecurityBlock(telemetry.method,telemetry.url),'read-only-probe-blocked-network-mutation');
  assert.deepEqual(verifyKnownSecurityBlocks({
    consoleBlocks:[{message:inline},{message:inlineChromium156},{message:beacon},{message:beaconChromium156},{message:blocked}],
    requestBlocks:[{url:BEACON_PREFIX+'v123',failure:'csp'},{url:TELEMETRY_URL,failure:'net::ERR_BLOCKED_BY_CLIENT.Inspector'}],
    mutations:[telemetry]
  }),{ok:true,reason:'known-security-blocks-observed-and-enforced'});
});
test('unrelated browser and network errors remain fatal',()=>{
  assert.equal(classifyConsoleSecurityBlock('TypeError: global app died'),null);
  assert.equal(classifyConsoleSecurityBlock('Refused to apply inline style because it violates style-src *'),null);
  assert.equal(classifyConsoleSecurityBlock(inlineChromium156.replace('https://ekodi.kr/shell','https://malicious.example')),null);
  assert.equal(classifyConsoleSecurityBlock(beaconChromium156.replace('https://cdn.jsdelivr.net','*')),null);
  assert.equal(classifyRequestSecurityBlock('https://evil.example/capture','csp'),null);
  assert.equal(classifyRequestSecurityBlock(TELEMETRY_URL,'net::ERR_CONNECTION_REFUSED'),null);
  assert.equal(classifyMutationSecurityBlock('POST','https://ekodi.kr/api/payment/charge'),null);
  assert.equal(classifyMutationSecurityBlock('PUT',TELEMETRY_URL),null);
  assert.equal(verifyKnownSecurityBlocks({mutations:[{method:'POST',url:'https://ekodi.kr/api/admin/delete'}]}).ok,false);
  assert.equal(verifyKnownSecurityBlocks({consoleBlocks:[{message:blocked}]}).reason,'unattributed-blocked-resource-message');
  assert.equal(verifyKnownSecurityBlocks({consoleBlocks:[{message:'Unhandled promise rejection'}]}).ok,false);
  assert.equal(verifyKnownSecurityBlocks({requestBlocks:[{url:'https://cdn.bad/test.js',failure:'csp'}]}).ok,false);
});
test('actual native runners keep strict no-mutation isolation, error logs and entire course/studio E2E',()=>{
  const [classroom,studio,deploy,workflow,documents]=[
    read('scripts/verify-education-bootcamp-native.mjs'),
    read('scripts/verify-education-material-studio-native.mjs'),
    read('.github/workflows/deploy-education.yml'),
    read('.github/workflows/education-release-continuity.yml'),
    read('scripts/verify-education-documents-native.mjs')
  ];
  for(const source of [classroom,studio,documents]){
    assert.match(source,/classifyMutationSecurityBlock/);
    assert.match(source,/verifyKnownSecurityBlocks/);
    assert.match(source,/pageerror/);
    assert.match(source,/requestfailed/);
    assert.match(source,/route\('\*\*\/\*'/);
    assert.match(source,/chromium\.launch\(\{headless:true\}\)/);
    assert.doesNotMatch(source,/launchPersistentContext|connectOverCDP|ignoreHTTPSErrors:\s*true|bypassCSP:\s*true/);
  }
  assert.match(classroom,/TARGET_ROUTE=previewAllowed\?ROUTE:'\/edu'\+ROUTE/);
  assert.match(classroom,/const registered=await page\.request\.get\(SERVICE_BASE\+ROUTE/,'checks the registered service address (apex path after the apex-only migration)');
  assert.match(classroom,/TARGET_ORIGIN\+TARGET_ROUTE/);
  assert.match(classroom,/sessionRows:24/);
  assert.match(classroom,/slideCounts/);
  assert.match(studio,/studioSlideCounter/);
  assert.match(studio,/exportDraft/);
  assert.match(studio,/https:\/\/ekodi\.kr/);
  assert.match(deploy,/Verify actual canonical \/edu material studio desktop and mobile/);
  assert.match(deploy,/artifacts\/education-studio-native/);
  assert.match(deploy,/Verify actual bootcamp instructor documents on desktop and mobile/);
  assert.match(deploy,/artifacts\/education-documents-native/);
  assert.match(deploy,/EKODI AI Orchestration Gate/);
  assert.match(deploy,/guarded-worker-release\.mjs/);
  assert.match(deploy,/preflight-merged-release/);
  assert.match(workflow,/EKODI Orchestrated PR Convergent Merge/);
});


test('Premium Studio bootcamp cross-check is once per release and backs off rather than bypassing 429',()=>{
  const live=read('scripts/verify-education-live-studio-native.mjs');
  const deploy=read('.github/workflows/deploy-education.yml');
  assert.match(live,/async function bootcampRegressionProbe\(browser\)/);
  assert.match(live,/await bootcampRegressionProbe\(browser\)/);
  assert.equal((live.match(/page\.goto\(ORIGIN\+R\.bootcamp/g)||[]).length,1,
    'no duplicate bootcamp asset burst on every layout viewport');
  assert.match(live,/report\.bootcampRegression=\{passed:true,lessons,batches,attempts:/);
  assert.match(live,/if\(lessons!==4\)fail\('existing bootcamp lost its 4 lessons'\)/);
  assert.match(live,/if\(batches!==6\)fail\('existing bootcamp lost its 6 batches'\)/);
  assert.match(live,/Number\(response\.headers\(\)\['retry-after'\]\)/);
  assert.match(live,/page\.__ekodiRateLimited/);
  assert.match(live,/if\(delay>180\)fail/);
  assert.match(live,/await page\.waitForTimeout\(Math\.max\(delay,5\)\*1000\)/);
  assert.match(live,/for\(let attempt=0;attempt<3;attempt\+\+\)/);
  assert.doesNotMatch(live,/bypassCSP|ignoreHTTPSErrors:\s*true|context\.route\([^)]*429|route\.fulfill/);
  const single=deploy.indexOf('Verify actual Education classroom on desktop and mobile with EKODI-owned Chromium');
  const premium=deploy.indexOf('Verify Premium Studio instructor, presenter and learner flows on desktop and mobile');
  assert.ok(single>=0&&premium>single,'dedicated five-viewport bootcamp verification still runs first');
});

test('Cloudflare JS detections blocked by the Education CSP: accepted only for the audited snippet hash',async()=>{
  const m=await import('../scripts/education-native-security-observations.mjs');
  const {createHash}=await import('node:crypto');
  const body="window.__CF$cv$params={r:'b1c2d3e4f5a6b7c8',t:'MTc5MjgzOTA5Nw==',u:'01a16d899f687206b341f5c0bdc3fa89'};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";
  const hash=createHash('sha256').update(body).digest('base64');
  const msg=h=>"Executing inline script violates the following Content Security Policy directive 'script-src 'self' https://cdn.jsdelivr.net https://ekodi.kr'. Either the 'unsafe-inline' keyword, a hash ('sha256-"+h+"'), or a nonce ('nonce-...') is required to enable inline execution. The action has been blocked.";
  assert.equal(m.classifyConsoleSecurityBlock(msg(hash)),'cloudflare-js-detection-blocked-by-CSP');
  assert.equal(m.classifyConsoleSecurityBlock(msg(hash).replace('https://ekodi.kr','https://evil.example')),null,'other policies stay errors');
  assert.equal(m.verifyKnownSecurityBlocks({consoleBlocks:[{message:msg(hash)}]}).ok,false,'unaudited hash is never accepted');
  // Lookalikes are not trusted: external loader, other path, malformed ray id.
  for(const bad of [body.replace("a.src='/cdn-cgi","a.src='https://evil.example/cdn-cgi"),body.replace('/cdn-cgi/challenge-platform/scripts/jsd/main.js','/evil.js'),body.replace("r:'b1c2d3e4f5a6b7c8'","r:'zz'")])
    assert.deepEqual(m.cloudflareJsDetectionHashes('<body><script>'+bad+'</script></body>'),[]);
  m.trustCloudflareJsDetections('<html><body><main>x</main><script>'+body+'</script></body></html>');
  assert.deepEqual(m.verifyKnownSecurityBlocks({consoleBlocks:[{message:msg(hash)}]}),{ok:true,reason:'known-security-blocks-observed-and-enforced'});
  const other=createHash('sha256').update('alert(1)').digest('base64');
  assert.equal(m.verifyKnownSecurityBlocks({consoleBlocks:[{message:msg(hash)},{message:msg(other)}]}).reason,'blocked-inline-script-not-an-audited-cloudflare-js-detection');
  for(const f of ['bootcamp','material-studio','documents','live-studio'])
    assert.match(readFileSync(new URL('../scripts/verify-education-'+f+'-native.mjs',import.meta.url),'utf8'),/observeCloudflareJsDetections\((?:context|ctx)\);/,f);
});

test('a failing native probe surfaces its reason as bounded, sanitized workflow annotations',async()=>{
  const {annotationsFrom}=await import('../scripts/education-probe-annotate.mjs');
  const lines=annotationsFrom({error:'boom\nnext',httpErrors:Array.from({length:6},(_,i)=>({profile:'mobile',status:404,url:'https://ekodi.kr/x'+i}))},'education-native');
  assert.equal(lines[0],'::error title=education-native failed::boom%0Anext');
  assert.equal(lines.filter(l=>l.includes('httpErrors')).length,5,'four rows plus a "more" line');
  assert.match(annotationsFrom(null,'x')[0],/result\.json missing/);
  assert.match(annotationsFrom({},'x')[0],/without a recorded reason/);
  const wf=readFileSync(new URL('../.github/workflows/deploy-education.yml',import.meta.url),'utf8');
  for(const [script,dir] of [['bootcamp','education-native'],['material-studio','education-studio-native'],['documents','education-documents-native'],['live-studio','education-live-native']])
    assert.match(wf,new RegExp('node scripts/verify-education-'+script+'-native\\.mjs \\|\\| \\{ node scripts/education-probe-annotate\\.mjs artifacts/'+dir+'; exit 1; \\}'),script);
});
