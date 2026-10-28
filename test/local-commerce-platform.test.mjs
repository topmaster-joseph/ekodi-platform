import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../local-commerce-worker.js';

test('local commerce worker health keeps financial execution disabled',async()=>{
  const response=await worker.fetch(new Request('https://ekodi.kr/local-commerce/health'),{DATA_MODE:'production'});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.service,'ekodi-local-commerce');
  assert.equal(body.canonicalPath,'/local-commerce');
  assert.equal(body.cashCustody,false);
  assert.equal(body.storedValueCash,false);
  assert.equal(body.automaticMoneyTransfer,false);
  assert.equal(body.paymentAdapter,'disabled');
});

test('local commerce admin stays on canonical path',async()=>{
  const response=await worker.fetch(new Request('https://ekodi.kr/local-commerce/admin'),{DATA_MODE:'production'});
  assert.equal(response.status,307);
  assert.equal(response.headers.get('location'),'https://ekodi.kr/local-commerce/?mode=admin');
});

test('user surface exposes wallet, merchant, operator and accounting flows',()=>{
  const html=fs.readFileSync(new URL('../local-commerce/index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../local-commerce/app.js',import.meta.url),'utf8');
  for(const marker of ['내 지역상권 지갑','가맹점 참여 신청','QR 결제 확인','상인 결제요청 만들기','회계·정산'])assert.match(html,new RegExp(marker));
  for(const route of ['/claim','/merchant-requests','/qr-intents','/redeem','/programs/update','/settlements/draft','/settlements/review'])assert.ok(app.includes(route));
  assert.ok(app.includes('x-ekodi-confirm-impact'));
  for(const marker of ['value="church"','value="nonprofit"','value="enterprise"','value="public_agency"','value="community"','programPolicyForm','policyMerchants'])assert.ok(html.includes(marker));
});

test('local commerce admin owns site-scoped language publication controls',()=>{
  const html=fs.readFileSync(new URL('../local-commerce/index.html',import.meta.url),'utf8');
  const language=fs.readFileSync(new URL('../local-commerce/language-admin.js',import.meta.url),'utf8');
  for(const marker of ['languageAdminTab','languageAdminPanel','다국어 번역·게시','/local-commerce/language-admin.js'])assert.ok(html.includes(marker));
  assert.ok(language.includes("SERVICE='local-commerce'"));
  assert.ok(language.includes('/api/i18n/v1/admin'));
  assert.ok(language.includes('publicationStatus'));
  assert.ok(language.includes('EKODILocalCommerceFetch'));
  assert.ok(language.includes('translation_not_ready'));
});

test('local commerce login preserves only canonical apex and trusted initiating path', async()=>{
  const {runInNewContext}=await import('node:vm');
  const account=fs.readFileSync(new URL('../local-commerce/account.js',import.meta.url),'utf8');
  const line=account.split('\n').find(s=>s.startsWith('function loginUrl()'));
  assert.ok(line,'account login function must exist');
  const make=href=>new URL(runInNewContext('('+line+')()', {URL,location:{href}}));
  const good=make('https://ekodi.kr/local-commerce/merchant/?program=autumn#untrusted-hash');
  assert.equal(good.origin,'https://ekodi.kr');
  assert.equal(good.pathname,'/auth/');
  assert.equal(good.searchParams.get('site'),'local-commerce');
  assert.equal(good.searchParams.get('return_to'),'https://ekodi.kr/local-commerce/merchant/?program=autumn');
  for(const href of ['https://example.invalid/local-commerce/','https://ekodi.kr/local-commerce-fake/','https://ekodi.kr/admin/','http://ekodi.kr/local-commerce/']){
    assert.equal(make(href).searchParams.get('return_to'),'https://ekodi.kr/local-commerce/');
  }
});

test('local commerce runtime, CSP and staging/production vars use the canonical auth entry',async()=>{
  const forgedEnv={DATA_MODE:'production',AUTH_URL:'https://legacy.invalid/?site=local-commerce'};
  const response=await worker.fetch(new Request('https://ekodi.kr/local-commerce/config.js'),forgedEnv);
  assert.equal(response.status,200);
  const body=await response.text();
  assert.ok(body.includes('"authUrl":"https://ekodi.kr/auth/?site=local-commerce"'));
  assert.ok(!body.includes('legacy.invalid'));
  assert.ok(response.headers.get('content-security-policy').includes("form-action 'self' https://ekodi.kr"));
  for(const path of ['wrangler.local-commerce.toml','wrangler.local-commerce.staging.toml']){
    const source=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.ok(source.includes('AUTH_URL = "https://ekodi.kr/auth/?site=local-commerce"'),path);
    const oldHost=['auth','ekodi','kr'].join('.');
    assert.ok(!source.includes('https://'+oldHost),path);
  }
});
