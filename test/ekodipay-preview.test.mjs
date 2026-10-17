import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../ekodipay-worker.js';
const base='https://ekodi.kr/ekodipay/preview';

test('preview provides the prior six-screen responsive design without a payment API',async()=>{
 const r=await worker.fetch(new Request(base));
 assert.equal(r.status,200);
 const html=await r.text();
 for(const marker of ['DESIGN PREVIEW','통합 현황','청구·결제','고객 결제창','거래내역','사업자·정산','설정·보안','실제 결제·환불·정산은 실행되지 않습니다']) assert.ok(html.includes(marker),marker);
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.match(r.headers.get('x-robots-tag'),/noindex/);
 assert.match(r.headers.get('content-security-policy'),/connect-src 'none'/);
 assert.match(r.headers.get('content-security-policy'),/form-action 'none'/);
 const style=html.match(/<style nonce="([a-f0-9]{32})">/);
 assert.ok(style,'CSP style nonce');
 assert.ok(html.includes('<script nonce="'+style[1]+'">'),'matching script nonce');
 assert.ok(r.headers.get('content-security-policy').includes("'nonce-"+style[1]+"'"));
 assert.doesNotMatch(html,/XMLHttpRequest|navigator\.sendBeacon|localStorage|<iframe/i);
});
test('read-only preview blocks POST, query manipulation, foreign hosts and HEAD body',async()=>{
 let r=await worker.fetch(new Request(base,{method:'HEAD'}));
 assert.equal(r.status,200);assert.equal(await r.text(),'');
 r=await worker.fetch(new Request(base+'?status=paid'));
 assert.equal(r.status,400);
 r=await worker.fetch(new Request(base,{method:'POST',body:'amount=10'}));
 assert.equal(r.status,405);
 r=await worker.fetch(new Request('https://pay.ekodi.kr/ekodipay/preview'));
 assert.equal(r.status,404);
});
test('canonical home advertises preview without changing live-safe demo/checkout routes',async()=>{
 const home=await worker.fetch(new Request('https://ekodi.kr/ekodipay/'));
 assert.match(await home.text(),/href="\/ekodipay\/preview"/);
 const health=await worker.fetch(new Request('https://ekodi.kr/ekodipay/api/health'));
 assert.equal((await health.json()).realMoneyProcessing,'disabled-until-human-approved-pg-activation');
 const checkout=await worker.fetch(new Request('https://ekodi.kr/ekodipay/checkout?amount=1'));
 assert.equal(checkout.status,400);
});
