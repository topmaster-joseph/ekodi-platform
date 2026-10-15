import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../ekodipay-worker.js';
const root='https://ekodi.kr/ekodipay';
const load=async (path, init)=>worker.fetch(new Request(root+path,init));

test('home retains canonical entry, responsive hero, 4 accessible test service cards',async()=>{
 const res=await load('/');
 assert.equal(res.status,200);
 const html=await res.text();
 assert.match(html,/모든 에코디 서비스를 위한 하나의 결제 창구|에코디의 모든 서비스를/);
 for(const fragment of ['테스트 결제 체험','에코디몰','에코디비즈','에코디교육','동행 프로그램','/ekodipay/demo','@media(max-width:540px)'])
   assert.ok(html.includes(fragment),fragment);
 assert.equal((html.match(/class="card"/g)||[]).length,4);
 assert.match(res.headers.get('content-security-policy'),/default-src 'none'/);
 assert.equal(res.headers.get('cache-control'),'no-store');
});
test('non-financial test-mode GET walkthrough never asserts payment success or creates an order',async()=>{
 const select=await load('/demo');
 assert.equal(select.status,200);
 assert.match(await select.text(),/시연할 서비스를 선택하세요/);
 for(const [service,price] of [['mall','27,000'],['biz','150,000'],['edu','50,000'],['together','20,000']]){
   const review=await load('/demo?service='+service+'&step=review');
   assert.equal(review.status,200);
   const text=await review.text();
   assert.ok(text.includes(price),service);
   assert.ok(text.includes('가상'),service);
   assert.ok(text.includes('/ekodipay/demo?service='+service+'&amp;step=result')===false);
   assert.ok(text.includes('결제수단 선택'));
   assert.ok(text.includes('step=result&amp;method=card')===false);
   // href contains legitimate encoded query separators, no secret or POST.
   assert.ok(text.includes('step=result&method=card'));
   assert.doesNotMatch(text,/<form\b|<input\b|<script\b/i);
   const result=await load('/demo?service='+service+'&step=result&method=card');
   assert.equal(result.status,200);
   const end=await result.text();
   assert.match(end,/실제 결제는 실행되지 않았습니다/);
   assert.match(end,/PG 승인번호 \/ 영수증/);
   assert.match(end,/실제 금전 거래 0건/);
   assert.doesNotMatch(end,/결제 성공|결제 완료되었습니다|승인번호: [A-Z0-9]/);
 }
});
test('test-mode attempts to inject arbitrary money, receipt, payment key or duplicate parameters fail closed',async()=>{
 for(const query of [
  'service=edu&step=review&amount=1',
  'service=edu&step=review&price=2000',
  'service=edu&step=result&method=card&status=paid',
  'service=edu&step=result&method=card&paymentKey=LEAK',
  'service=edu&step=review&orderId=EB-ABCDEF',
  'service=edu&service=biz&step=review',
  'service=__proto__&step=review',
  'service=edu&step=result',
  'service=edu&step=result&method=fake',
  'service=edu&step=unexpected',
  'step=review',
 ]) {
  const res=await load('/demo?'+query);
  assert.equal(res.status,400,query);
 }
});
test('test-mode HEAD and non-GET security; existing checkout never becomes a charge endpoint',async()=>{
 let res=await load('/demo?service=edu&step=result&method=card',{method:'HEAD'});
 assert.equal(res.status,200);assert.equal(await res.text(),'');
 for(const pathname of ['/demo','/checkout']){
   res=await load(pathname,{method:'POST',body:'amount=50000'});
   assert.equal(res.status,405);
   assert.equal(res.headers.get('allow'),'GET, HEAD');
 }
 res=await load('/checkout?service=ekodibiz&orderId=EB-ABCDEF&amount=1');
 assert.equal(res.status,400);
 res=await load('/checkout?service=ekodibiz&orderId=EB-ABCDEF&status=paid');
 assert.equal(res.status,200);
 assert.match(await res.text(),/이 화면은 결제 완료 증명이 아닙니다/);
});
test('public health reports demo and real money execution as separate states',async()=>{
 const response=await load('/api/health');
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.realMoneyProcessing,'disabled-until-human-approved-pg-activation');
 assert.equal(data.demoMode,'read-only-no-transactions');
 assert.equal(data.paymentSecretsExposed,false);
});
