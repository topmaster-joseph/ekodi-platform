// BOOKS-GUEST-OTP-001 — no payment bypass; verified mailbox ownership is independent of membership.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { guestConfig, guestBuyer, guestEndpoint } from '../books-guest-commerce.js';
import { createOrder, confirm, library, download } from '../books-commerce.js';

function database() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(new URL('../migrations/0010_books_channel_finance.sql',import.meta.url),'utf8').split('INSERT OR IGNORE')[0]);
  raw.exec(fs.readFileSync(new URL('../migrations/202610271400_books_direct_commerce.sql',import.meta.url),'utf8'));
  raw.exec(fs.readFileSync(new URL('../migrations/202611101300_books_guest_otp.sql',import.meta.url),'utf8'));
  const stmt=(sql,args=[])=>({
    bind:(...a)=>stmt(sql,a),
    first:async()=>raw.prepare(sql).get(...args)??null,
    all:async()=>({results:raw.prepare(sql).all(...args)}),
    run:async()=>{const r=raw.prepare(sql).run(...args);return{meta:{changes:Number(r.changes)}};},
  });
  return {raw,prepare:sql=>stmt(sql),batch:async list=>{raw.exec('BEGIN');try{for(const s of list)await s.run();raw.exec('COMMIT');}catch(e){raw.exec('ROLLBACK');throw e;}}};
}
const catalog=JSON.parse(fs.readFileSync(new URL('../books/books.json',import.meta.url),'utf8'));
const policy=JSON.parse(fs.readFileSync(new URL('../books/commerce.json',import.meta.url),'utf8'));
function env(db) {
  return {
    DB:db,ASSETS:{fetch:async request=>new Response(JSON.stringify(new URL(request.url).pathname==='/books.json'?catalog:policy))},
    BOOK_FILES:{head:async()=>({size:20}),get:async()=>({body:new Uint8Array([80,75,3,4]),size:4})},
    OPERATOR_EMAILS:'op@ekodi.kr',BOOKS_GUEST_CHECKOUT_ENABLED:'true',BOOKS_DIGITAL_MID_APPROVED:'true',
    PAYMENTS_ENABLED:'true',BOOKS_GUEST_MAIL_SENDER:'ekodibiz@gmail.com',
    BOOKS_GUEST_OTP_SECRET:'a-test-secret-not-for-production-32-characters-long-20261110',
    BOOKS_GUEST_ACCESS_ENABLED:'true',
    EKODIPAY_PROFILE:'books',PUBLIC_BASE_URL:'https://ekodi.kr/books',
    EKODIPAY:{
      readiness:async()=>({ok:true,data:{ready:true,mode:'live',profile:'books',merchant:'test',mid:'test-digital'}}),
      clientKey:async()=>({ok:true,data:'live_ck_demo_never_used_for_real_charge'}),
    },
  };
}
const address='https://ekodi.kr/books/api/commerce/';
const req=(path,body,extra={})=>new Request(address+path,{
  method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json',...(extra.headers||{})},
  body:JSON.stringify(body||{}),
});
async function verified(e,email='reader@example.com',now=Date.now()) {
  let delivered='';
  const started=await guestEndpoint(e,req('guest/start',{email}),'/guest/start',{email},
    {now,mailReady:true,sendCode:async(to,code)=>{assert.equal(to,email);delivered=code;}});
  assert.equal(started.status,200);
  assert.match(delivered,/^[0-9]{6}$/);
  const {challengeId}=await started.json();
  const verify=await guestEndpoint(e,req('guest/verify',{challengeId,code:delivered}),'/guest/verify',
    {challengeId,code:delivered},{now:now+100});
  assert.equal(verify.status,200);
  const cookie=verify.headers.get('set-cookie');
  assert.match(cookie,/Secure; HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(cookie,/reader@example.com/);
  return {cookie,cid:challengeId,code:delivered};
}
const anon=cookie=>new Request(address+'orders',{method:'POST',headers:{cookie}});
test('production MID and mail gates default off even if enabled by someone in the UI',()=>{
  assert.equal(guestConfig({}).enabled,false);
  assert.equal(guestConfig({PAYMENTS_ENABLED:'true',BOOKS_GUEST_CHECKOUT_ENABLED:'true',BOOKS_DIGITAL_MID_APPROVED:'true',
    EKODIPAY_PROFILE:'mall',BOOKS_GUEST_OTP_SECRET:'x'.repeat(64),BOOKS_GUEST_MAIL_SENDER:'ekodibiz@gmail.com'}).enabled,false);
  assert.equal(guestConfig({PAYMENTS_ENABLED:'false',BOOKS_GUEST_CHECKOUT_ENABLED:'true',BOOKS_DIGITAL_MID_APPROVED:'true',
    EKODIPAY_PROFILE:'books',BOOKS_GUEST_OTP_SECRET:'x'.repeat(64),BOOKS_GUEST_MAIL_SENDER:'ekodibiz@gmail.com'}).enabled,false);
});
test('unapproved digital MID fails closed before any mail or order writes',async()=>{
  const db=database(),e={...env(db),BOOKS_DIGITAL_MID_APPROVED:'false'};
  const sent=await guestEndpoint(e,req('guest/start',{email:'reader@example.com'}),'/guest/start',
    {email:'reader@example.com'},{mailReady:true,sendCode:async()=>assert.fail('must not send')});
  assert.equal(sent.status,503);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM books_guest_challenges').get().n,0);
  assert.equal(await guestBuyer(e,anon('')),null);
});
test('email OTP challenge is single-use, rate limited, origin guarded, and never echoed',async()=>{
  const db=database(),e=env(db),now=Date.now();
  const start=async(email,options={})=>{
    let code;
    const response=await guestEndpoint(e,req('guest/start',{email}),'/guest/start',{email},
      {now,mailReady:true,sendCode:async(_,x)=>{code=x;},...options});
    return {response,code};
  };
  const x=await start('a@example.com');
  assert.equal(x.response.status,200);
  assert.equal((await x.response.clone().text()).includes(x.code),false);
  const challengeId=(await x.response.json()).challengeId;
  const wrong=await guestEndpoint(e,req('guest/verify',{challengeId,code:'999999'}),'/guest/verify',
    {challengeId,code:x.code==='999999'?'111111':'999999'},{now:now+1});
  assert.equal(wrong.status,403);
  const ok=await guestEndpoint(e,req('guest/verify',{challengeId,code:x.code}),'/guest/verify',
    {challengeId,code:x.code},{now:now+2});
  assert.equal(ok.status,200);
  const reuse=await guestEndpoint(e,req('guest/verify',{challengeId,code:x.code}),'/guest/verify',
    {challengeId,code:x.code},{now:now+3});
  assert.equal(reuse.status,410);
  await start('a@example.com');await start('a@example.com');
  assert.equal((await start('a@example.com')).response.status,429);
  const malicious=new Request(address+'guest/start',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:'{}'});
  assert.equal((await guestEndpoint(e,malicious,'/guest/start',{email:'a@example.com'},{mailReady:true})).status,403);
});
test('paid guest entitlement is scoped to verified email and survives email re-verification',async()=>{
  const db=database(),e=env(db),now=Date.now();
  const {cookie}=await verified(e,'reader@example.com',now);
  const buyer=await guestBuyer(e,anon(cookie),now+110);
  assert.match(buyer.userId,/^guest-[0-9a-f]{40}$/);
  assert.equal(buyer.isGuest,true);
  const created=await createOrder(e,anon(cookie),{bookId:'BOOK-EKODI-000001',consent:true,source:'mall'},new Date(now+200));
  assert.equal(created.status,201,JSON.stringify(created.data));
  assert.equal(created.data.amount,9900);
  const unverified=await createOrder(e,anon(''),{bookId:'BOOK-EKODI-000001',consent:true},new Date(now+200));
  assert.equal(unverified.status,401);
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM books_entitlements').get().n,0);
  const purchase=await confirm(e,{paymentKey:'pk_guest_test',orderId:created.data.orderId,amount:9900},new Date(now+300),
    async()=>({orderId:created.data.orderId,totalAmount:9900,status:'DONE',method:'카드',receipt:{url:'https://receipt.example/'}}));
  assert.equal(purchase.status,200);
  const got=await library(e,anon(cookie));
  assert.equal(got.status,200);
  assert.equal(got.data.guestVerified,true);
  assert.equal(got.data.operator,false);
  assert.equal(got.data.items.length,1);
  assert.equal((await download(e,anon(cookie),'BOOK-EKODI-000001')).status,200);
  const other=await verified(e,'other@example.com',now+1000);
  assert.equal((await library(e,anon(other.cookie))).data.items.length,0);
  assert.equal((await download(e,anon(other.cookie),'BOOK-EKODI-000001')).status,403);
  const again=await verified(e,'reader@example.com',now+10000);
  assert.equal((await library(e,anon(again.cookie))).data.items.length,1);
  const closed=await guestEndpoint(e,req('guest/signout',{}, {headers:{cookie}}),'/guest/signout',{}, {now:now+11000});
  assert.equal(closed.status,200);
  assert.equal(await guestBuyer(e,anon(cookie)),null);
});
