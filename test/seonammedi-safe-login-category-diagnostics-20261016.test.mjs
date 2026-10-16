import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../scripts/verify-seonammedi-nav-guest-native.mjs',import.meta.url),'utf8');
function codeBetween(first,next){
  const start=src.indexOf(first);
  assert.ok(start>=0,'Missing source diagnostic marker '+first);
  const end=src.indexOf(next,start);
  assert.ok(end>start,'Missing source diagnostic end marker '+next);
  return src.slice(start,end);
}
const purposeBlock=codeBetween("if(composeRequestHints.purposeCategory==='not-observed'){","const returnTo=u.searchParams.get('return_to');");
const pathBlock=codeBetween("if(composeRequestHints.returnPathCategory==='not-observed'){","composeRequestHints.returnOriginMatches ||=");

function classify(returnTo,purpose,expectedReturn='https://ekodi.kr/seonammedi/board/voices?compose=1'){
  const u=new URL('https://ekodi.kr/auth/?site=seonammedi');
  u.searchParams.set('return_to',returnTo);
  if(purpose!==undefined)u.searchParams.set('purpose',purpose);
  const composeRequestHints={purposeCategory:'not-observed',returnPathCategory:'not-observed'};
  vm.runInNewContext(purposeBlock+'\n'+pathBlock,{
    composeRequestHints,u,URL,
    dest:new URL(returnTo),expected:new URL(expectedReturn)
  });
  return JSON.parse(JSON.stringify(composeRequestHints));
}

test('correct original voice compose URL and purpose are classified without disclosure',()=>{
  assert.deepEqual(classify('https://ekodi.kr/seonammedi/board/voices?compose=1','seonammedi-board-write'),
    {purposeCategory:'write',returnPathCategory:'exact'});
});
test('trailing slash mismatch and alternate origin prefix are separately identified',()=>{
  assert.deepEqual(classify('https://ekodi.kr/seonammedi/board/voices/?compose=1','seonammedi-board-write'),
    {purposeCategory:'write',returnPathCategory:'trailing-slash'});
  assert.deepEqual(classify('https://ekodi.kr/board/voices?compose=1','seonammedi-board-admin'),
    {purposeCategory:'admin',returnPathCategory:'alternate-origin-route'});
});
test('other destination and purpose values never leak raw input',()=>{
  const result=classify('https://ekodi.kr/private/customer-secret?compose=1','unexpected-private');
  assert.deepEqual(result,{purposeCategory:'other',returnPathCategory:'other'});
  assert.ok(!JSON.stringify(result).includes('customer-secret'));
  assert.ok(!JSON.stringify(result).includes('unexpected-private'));
});
test('missing purpose is labelled missing without exposing the URL',()=>{
  assert.deepEqual(classify('https://seonammedi.kr/board/voices?compose=1',undefined,'https://seonammedi.kr/board/voices?compose=1'),
    {purposeCategory:'missing',returnPathCategory:'exact'});
});
test('guest audit still fails closed on original return/purpose mismatch',()=>{
  assert.match(src,/if\(!record\.composeReturnMatches\)violations\.push\(/);
  assert.match(src,/page\.route\('\*\*\/\*'/);
  assert.ok(src.includes('record.composeAuthSignals={...composeRequestHints}'));
});
