import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleMailContactApi, mailContactPage, MAIL_CONTACT_RECIPIENT } from '../mail-contact.js';
import { sendGoogleMailMessage } from '../mail-google-adapter.js';
import platformRouter from '../platform-router-entry-worker.js';

const contactRequest=(body,headers={})=>new Request('https://ekodi.kr/mail/api/contact',{
  method:'POST',
  headers:{origin:'https://ekodi.kr','content-type':'application/json','cf-connecting-ip':'203.0.113.9',...headers},
  body:JSON.stringify(body),
});
const decodeRaw=value=>Buffer.from(String(value||''),'base64url').toString('utf8');

async function privateKeyPem(){
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const bytes=new Uint8Array(await crypto.subtle.exportKey('pkcs8',pair.privateKey));
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(bytes).toString('base64').match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
}

test('public contact page fixes the recipient and does not require sign-in', async()=>{
  const response=mailContactPage();
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(html,/에코디에 문의하기/);
  assert.match(html,new RegExp(MAIL_CONTACT_RECIPIENT.replace('.','\\.')));
  assert.match(html,/\/mail\/api\/contact/);
  assert.doesNotMatch(html,/auth\.ekodi\.kr/);
});
test('public contact validates reply email before sending', async()=>{
  const response=await handleMailContactApi(contactRequest({email:'bad-address',subject:'문의',message:'내용'}),{ENVIRONMENT:'test'});
  assert.equal(response.status,400);
  assert.equal((await response.json()).code,'INVALID_EMAIL');
});

test('production contact fails closed when rate limiter is unavailable', async()=>{
  const response=await handleMailContactApi(contactRequest({email:'person@example.com',subject:'문의',message:'내용'}),{ENVIRONMENT:'production'});
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'RATE_LIMITER_UNAVAILABLE');
});

test('mail adapter emits a safe Reply-To header', async()=>{
  const original=globalThis.fetch; let raw='';
  globalThis.fetch=async(_url,init)=>{raw=JSON.parse(init.body).raw;return new Response(JSON.stringify({id:'sent-1'}),{status:200,headers:{'content-type':'application/json'}});};
  try{
    await sendGoogleMailMessage('token',{to:MAIL_CONTACT_RECIPIENT,replyTo:'reply@example.com',subject:'테스트',body:'본문'});
    const decoded=decodeRaw(raw);
    assert.match(decoded,/To: joseph@ekodi\.kr/);
    assert.match(decoded,/Reply-To: reply@example\.com/);
  } finally { globalThis.fetch=original; }
});
test('contact delivery ignores client recipient and sends fixed To with user Reply-To', async()=>{
  const original=globalThis.fetch,privateKey=await privateKeyPem(); let raw='',tokenCalls=0;
  globalThis.fetch=async(url,init={})=>{
    if(String(url).includes('oauth2.googleapis.com/token')){tokenCalls++;return new Response(JSON.stringify({access_token:'contact-token',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});}
    if(String(url).includes('gmail.googleapis.com')){raw=JSON.parse(init.body).raw;return new Response(JSON.stringify({id:'live-test',threadId:'thread-1'}),{status:200,headers:{'content-type':'application/json'}});}
    throw new Error(`unexpected fetch ${url}`);
  };
  try{
    const env={ENVIRONMENT:'production',MAIL_CONTACT_RECIPIENT:'attacker@example.net',MAIL_CONTACT_SENDER:'other@example.net',GOOGLE_SERVICE_ACCOUNT_EMAIL:'mailer@example.iam.gserviceaccount.com',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:privateKey,MAIL_CONTACT_RATE_LIMITER:{limit:async()=>({success:true})}};
    const response=await handleMailContactApi(contactRequest({name:'문의자',email:'reply@example.com',subject:'연결 문의',message:'테스트 문의입니다.',to:'attacker@example.net',source:'cgma',site:'청계면상인회'}),env);
    assert.equal(response.status,200);
    assert.equal((await response.json()).ok,true);
    assert.equal(tokenCalls,1);
    const decoded=decodeRaw(raw);
    assert.match(decoded,/To: joseph@ekodi\.kr/);
    assert.doesNotMatch(decoded,/attacker@example\.net/);
    assert.match(decoded,/Reply-To: reply@example\.com/);
    assert.match(decoded,/접수 사이트: 청계면상인회/);
  } finally { globalThis.fetch=original; }
});

test('canonical apex exposes public contact and legacy mail host redirects', async()=>{
  const originalRewriter=globalThis.HTMLRewriter;
  globalThis.HTMLRewriter=class{on(){return this}transform(response){return response}};
  let page;
  try{page=await platformRouter.fetch(new Request('https://ekodi.kr/mail/contact'),{ENVIRONMENT:'test'});}finally{if(originalRewriter)globalThis.HTMLRewriter=originalRewriter;else delete globalThis.HTMLRewriter;}
  assert.equal(page.status,200);
  assert.equal(page.headers.get('x-ekodi-route'),'mail-contact');
  assert.equal(page.headers.get('x-ekodi-shell'),'v2');
  assert.match(await page.text(),/joseph@ekodi\.kr/);
  const invalid=await platformRouter.fetch(contactRequest({email:'bad-address',subject:'문의',message:'내용'}),{ENVIRONMENT:'test'});
  assert.equal(invalid.status,400);
  assert.equal((await invalid.json()).code,'INVALID_EMAIL');
  const legacy=await platformRouter.fetch(new Request('https://mail.ekodi.kr/contact'),{ENVIRONMENT:'test'});
  assert.equal(legacy.status,308);
  assert.equal(legacy.headers.get('location'),'https://ekodi.kr/mail/contact');
});


test('public contact release guard is registered', async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json',import.meta.url),'utf8'));
  const probe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/mail/contact');
  assert.deepEqual(probe?.statuses,[200]);
  assert.ok(probe?.expect?.includes('joseph@ekodi.kr'));
  assert.ok(probe?.headerExpect?.includes('x-ekodi-route: mail-contact'));
  assert.equal(probe?.rollbackVerify,false);
  const wrangler=await readFile(new URL('../wrangler.site.toml',import.meta.url),'utf8');
  assert.match(wrangler,/name = "MAIL_CONTACT_RATE_LIMITER"/);
  assert.match(wrangler,/"\/mail\*"/);
  assert.match(wrangler,/limit = 5/);
});


test('shared-site workflow watches and validates the contact surface', async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
  assert.match(workflow,/- 'mail-contact\.js'/);
  assert.match(workflow,/- 'test\/mail-contact\.test\.mjs'/);
  assert.match(workflow,/mail-user-page\.js mail-contact\.js mail-admin-page\.js/);
  assert.match(workflow,/test\/preview-page\.test\.mjs test\/mail-contact\.test\.mjs/);
});
