import test from 'node:test';
import assert from 'node:assert/strict';
import {BBQCG_NATIVE_PROFILES,BBQCG_NATIVE_PHRASES,BBQCG_FIXED_SHELL_STYLE_HASHES,bbqcgNativeTask,
  verifyBbqcgNativeReceipt} from '../scripts/verify-bbqcg-native-browser.mjs';

const buildReport=(profile,overrides={})=>({
  ok:true,virtualizationProvider:'ekodi-background-browser-worker',
  headless:true,ephemeralContext:true,activeUserProfileReused:false,
  allowMutation:false,deviceProfile:profile,canonicalOrigin:'https://ekodi.kr',
  blockedExternalNavigationCount:0,blockedMutations:[],pageErrors:[],httpErrorResponses:[],consoleErrors:[],
  results:[
    {type:'initial-goto',url:'https://ekodi.kr/bbqcg',status:200},
    {type:'waitFor',visible:true},
    {type:'assertText',matched:true},
    {type:'assertText',matched:true},
    {type:'screenshot'},
    {type:'snapshot',horizontalOverflow:false},
    {type:'goto',url:'https://ekodi.kr/bbqcg/order',status:200},
    {type:'assertText',matched:true},
    {type:'assertDisabled',passed:true},
    {type:'snapshot',horizontalOverflow:false}
  ],
  ...overrides
});
test('EKODI owned browser checks three real viewports without user Opera or any write',()=>{
  assert.deepEqual(BBQCG_NATIVE_PROFILES,['compact-mobile','mobile-portrait','desktop']);
  for(const profile of BBQCG_NATIVE_PROFILES){
    const task=bbqcgNativeTask(profile);
    assert.equal(task.path,'/bbqcg');
    assert.equal(task.allowMutation,false);
    assert.equal(task.deviceProfile,profile);
    assert.ok(task.actions.length<=30);
    assert.ok(task.actions.every(a=>!['click','fill','press'].includes(a.type)));
    assert.ok(task.actions.some(a=>a.type==='waitFor'&&a.selector==='#bbqOrderQr img:visible'));
    assert.ok(task.actions.some(a=>a.type==='assertDisabled'&&a.selector==='.order-sidebar button'));
    assert.ok(task.actions.some(a=>a.type==='assertText'&&a.text===BBQCG_NATIVE_PHRASES.launch));
    assert.ok(task.actions.some(a=>a.type==='assertText'&&a.text===BBQCG_NATIVE_PHRASES.paymentLocked));
  }
  assert.throws(()=>bbqcgNativeTask('unknown'),/NOT_ALLOWED/);
});
test('receipt passes only real first-party browser, 200 pages and no mobile overflow',()=>{
  for(const profile of BBQCG_NATIVE_PROFILES){
    const verified=verifyBbqcgNativeReceipt(buildReport(profile),profile);
    assert.equal(verified.ok,true,JSON.stringify(verified.checks));
    assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{
      results:buildReport(profile).results.map(x=>x.type==='snapshot'?{...x,horizontalOverflow:true}:x)
    }),profile).ok,false);
    assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{virtualizationProvider:'external'}),profile).ok,false);
    assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{pageErrors:[{name:'Error'}]}),profile).ok,false);
    for(const hash of BBQCG_FIXED_SHELL_STYLE_HASHES){
      assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{
        consoleErrors:['Applying inline style violates CSP. Either a hash (\\''+hash+'\\') or nonce is required.']
      }),profile).ok,false,'known Shell blocked style must fail: '+hash);
    }
    assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{
      consoleErrors:['Analytics request blocked by strict CSP']
    }),profile).ok,true,'unrelated analytics CSP block is not claimed fixed');
    const noConsoleLog=buildReport(profile);delete noConsoleLog.consoleErrors;
    assert.equal(verifyBbqcgNativeReceipt(noConsoleLog,profile).ok,false,
      'first-party browser must provide diagnostic console log field');
    assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{httpErrorResponses:[{status:404,url:'https://ekodi.kr/workspace-api/v1/site-chrome/public?subject_key=bbqcg'}]}),profile).ok,false,
      'legacy missing native site-chrome 404 must fail');
    assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{httpErrorResponses:[{status:404,url:'https://ekodi.kr/other-service'}]}),profile).ok,true,
      'unrelated 404 must not be interpreted as missing native chrome');
    const withoutHttpLog=buildReport(profile);
    delete withoutHttpLog.httpErrorResponses;
    assert.equal(verifyBbqcgNativeReceipt(withoutHttpLog,profile).ok,false,
      'native browser must provide HTTP response diagnostics');
    assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{blockedMutations:[{method:'POST'}]}),profile).ok,true,
      'telemetry POSTs are safe when the owned browser intercepts and blocks them');
    assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{blockedMutations:[{method:'GET'}]}),profile).ok,false,
      'unrecognized blocked-read record should not silently pass');
    assert.equal(verifyBbqcgNativeReceipt(buildReport(profile,{allowMutation:true}),profile).ok,false);
    const bad=buildReport(profile);
    bad.results=bad.results.filter(x=>x.type!=='assertDisabled');
    assert.equal(verifyBbqcgNativeReceipt(bad,profile).ok,false);
  }
});
