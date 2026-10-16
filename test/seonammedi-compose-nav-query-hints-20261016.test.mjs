import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
const observer=source.match(/const observeAuthRequest=request=>\{[\s\S]*?\n              \};/)?.[0];
assert.ok(observer,'outgoing Chromium navigation observer must exist');
function capture(href){
  const mainFrame={};
  const expectedReturn='https://seonammedi.kr/board/voices?compose=1';
  const requestIntent={login:false,returnPath:false,purpose:false,complete:false};
  const composeRequestHints={requests:0,returnToPresent:false,purposePresent:false,returnOriginMatches:false,returnPathMatches:false,composeFlagPresent:false};
  const handler=vm.runInNewContext(observer+'\nobserveAuthRequest',{URL,expectedReturn,requestIntent,composeRequestHints,page:{mainFrame:()=>mainFrame}});
  handler({isNavigationRequest:()=>true,frame:()=>mainFrame,url:()=>href});
  return {intent:requestIntent,hints:composeRequestHints};
}
test('exact citizen voice compose navigation records safe matching signals',()=>{
  const u=new URL('https://ekodi.kr/auth/');
  u.searchParams.set('site','seonammedi');
  u.searchParams.set('return_to','https://seonammedi.kr/board/voices?compose=1');
  u.searchParams.set('purpose','seonammedi-board-write');
  assert.deepEqual(capture(u.href),{intent:{login:true,returnPath:true,purpose:true,complete:true},hints:{requests:1,returnToPresent:true,purposePresent:true,returnOriginMatches:true,returnPathMatches:true,composeFlagPresent:true}});
});
test('missing parameters are distinguishable from a misplaced return target',()=>{
  assert.deepEqual(capture('https://ekodi.kr/auth/?site=seonammedi').hints,{requests:1,returnToPresent:false,purposePresent:false,returnOriginMatches:false,returnPathMatches:false,composeFlagPresent:false});
  const u=new URL('https://ekodi.kr/auth/');
  u.searchParams.set('site','seonammedi');
  u.searchParams.set('return_to','https://seonammedi.kr/board/notices?compose=1');
  u.searchParams.set('purpose','unexpected-purpose');
  const hints=capture(u.href).hints;
  assert.equal(hints.returnToPresent,true);
  assert.equal(hints.returnOriginMatches,true);
  assert.equal(hints.returnPathMatches,false);
  assert.equal(hints.composeFlagPresent,true);
  assert.equal(hints.purposePresent,true);
});
test('unrelated navigation never qualifies as citizen Google login',()=>{
  assert.equal(capture('https://other.example/auth/?site=seonammedi').hints.requests,0);
});
test('reported compose diagnostics expose only booleans and count, never raw return URLs',()=>{
  assert.ok(source.includes('record.composeAuthSignals={...composeRequestHints}'));
  assert.ok(!source.includes('record.composeRequestUrl='));
  assert.ok(!source.includes('record.rawReturnTo='));
});
