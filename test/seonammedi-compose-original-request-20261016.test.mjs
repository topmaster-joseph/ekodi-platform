import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
const observer=source.match(/const observeAuthRequest=request=>\{[\s\S]*?\n              \};/)?.[0];
assert.ok(observer,'native Chromium request-level auth observer must exist');

function observe(href,{navigation=true,sameFrame=true}={}){
  const mainFrame={};
  const requestIntent={login:false,returnPath:false,purpose:false,complete:false};
  const expectedReturn='https://seonammedi.kr/board/voices?compose=1';
  const onRequest=vm.runInNewContext(observer+'\nobserveAuthRequest',{
    URL,expectedReturn,requestIntent,page:{mainFrame:()=>mainFrame}
  });
  onRequest({isNavigationRequest:()=>navigation,frame:()=>sameFrame?mainFrame:{},url:()=>href});
  return requestIntent;
}

test('Chromium outgoing Google navigation retains original citizen compose destination and purpose',()=>{
  const url=new URL('https://ekodi.kr/auth/');
  url.searchParams.set('site','seonammedi');
  url.searchParams.set('return_to','https://seonammedi.kr/board/voices?compose=1');
  url.searchParams.set('purpose','seonammedi-board-write');
  assert.deepEqual(observe(url.href),{login:true,returnPath:true,purpose:true,complete:true});
});
test('wrong compose destination fails even if login purpose is correct',()=>{
  const url='https://ekodi.kr/auth/?site=seonammedi&return_to=https%3A%2F%2Fevil.example%2Fboard%2Fvoices%3Fcompose%3D1&purpose=seonammedi-board-write';
  assert.deepEqual(observe(url),{login:true,returnPath:false,purpose:true,complete:false});
});
test('missing write purpose is separately detected without weakening the required full match',()=>{
  const url='https://ekodi.kr/auth/?site=seonammedi&return_to=https%3A%2F%2Fseonammedi.kr%2Fboard%2Fvoices%3Fcompose%3D1';
  assert.deepEqual(observe(url),{login:true,returnPath:true,purpose:false,complete:false});
});
test('unrelated origin, non-navigation, and subframe requests never satisfy the contract',()=>{
  const url='https://other.example/auth/?site=seonammedi&purpose=seonammedi-board-write';
  assert.equal(observe(url).login,false);
  assert.equal(observe('https://ekodi.kr/auth/?site=seonammedi',{navigation:false}).login,false);
  assert.equal(observe('https://ekodi.kr/auth/?site=seonammedi',{sameFrame:false}).login,false);
});
test('audit cleans request observers and never persists sensitive auth request URLs',()=>{
  assert.ok(source.includes("page.on('request',observeAuthRequest)"));
  assert.ok(source.includes("page.off('request',observeAuthRequest)"));
  assert.ok(source.includes('record.composeReturnMatches=requestIntent.complete||'));
  assert.doesNotMatch(source,/record\.loginRequests\s*=/);
});
