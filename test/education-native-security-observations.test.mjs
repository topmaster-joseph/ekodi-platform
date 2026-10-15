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
const beaconChromium156="Loading the script '"+BEACON_PREFIX+"v4bc70e2c01a94c73b74392e4234840661791215815920' violates the following Content Security Policy directive: \\"script-src 'self' https://cdn.jsdelivr.net https://ekodi.kr\\". Note that 'script-src-elem' was not explicitly set, so 'script-src' is used as a fallback. The action has been blocked.";
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
  assert.match(classroom,/const legacy=await page\.request\.get\(ORIGIN\+ROUTE/);
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
