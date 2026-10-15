import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dorajiOfficeResponse} from '../ekodibiz-doraji-office.js';
import {dorajiLedgerClientScript} from '../ekodibiz-doraji-ledger-ui.js';
const auth=readFileSync(new URL('../auth-site/admin-auth.js',import.meta.url),'utf8');
const ROOT='https://ekodi.kr/ekodibiz/doraji';
const get=p=>new Request(ROOT+p);

test('each Doraji tab provides a visible admin entry and cannot expose ledger entries before verified login',async()=>{
 for(const path of ['/','/overview','/projects','/cultivation','/budget','/contracts','/delivery','/documents']){
  const response=dorajiOfficeResponse(get(path));
  assert.equal(response.status,200,path);
  const body=await response.text();
  assert.match(body,/data-ekodi-doraji-ledger/);
  assert.match(body,/data-ledger="login"/);
  assert.match(body,/data-ledger="panel" hidden/);
  assert.match(body,/\/ekodibiz\/doraji\/ledger-ui\.js/);
  assert.match(body,/초안/);
  assert.doesNotMatch(body,/<script[^>]+src="https:\/\/external\./);
 }
});

test('first-party ledger asset respects no-inline-script CSP',async()=>{
 const asset=dorajiOfficeResponse(get('/ledger-ui.js'));
 assert.equal(asset.status,200);
 assert.match(asset.headers.get('content-type'),/application\/javascript/);
 assert.equal(asset.headers.get('cache-control'),'no-store');
 const code=await asset.text();
 assert.equal(code,dorajiLedgerClientScript);
 assert.match(code,/data-ekodi-doraji-ledger/);
 assert.match(code,/sessionStorage\.getItem\('ekodi-auth-token'\)/);
 assert.match(code,/fragment\.get\('ekodi_admin_token'\)/);
 assert.match(code,/history\.replaceState/);
 assert.match(code,/\/auth\//);
 assert.match(code,/auth\.searchParams\.set\('return_to',target\.href\)/);
 assert.match(code,/credentials:'same-origin'/);
 assert.match(code,/headers\.set\('content-type','application\/json'\)/);
 assert.match(code,/method:'PATCH'/);
 assert.match(code,/version:editingRecord\.version/);
 assert.doesNotMatch(code,/fetch\('https:\/\/|localStorage|eval\(/);
});

test('admin Google login only allows the canonical original Doraji workspace page',()=>{
 assert.match(auth,/u\.pathname==='\/ekodibiz\/doraji'/);
 assert.match(auth,/u\.pathname\.startsWith\('\/ekodibiz\/doraji\/'\)/);
 assert.match(auth,/u\.pathname!=='\/ekodibiz\/doraji\/api'/);
 assert.match(auth,/!u\.pathname\.startsWith\('\/ekodibiz\/doraji\/api\/'\)/);
 assert.match(auth,/if\(u\.origin==='https:\/\/ekodi\.kr'/);
 assert.match(auth,/return u\.href/);
});

test('mutations remain form-submit-only, no payment action or automated signatures',()=>{
 assert.match(dorajiLedgerClientScript,/projectForm\.addEventListener\('submit'/);
 assert.match(dorajiLedgerClientScript,/recordForm\.addEventListener\('submit'/);
 assert.match(dorajiLedgerClientScript,/event\.preventDefault\(\)/);
 assert.match(dorajiLedgerClientScript,/recordForm\.scrollIntoView/);
 for(const banned of ['transfer_money','sign_contract','approve_delivery_settlement','sendPayment','paymentConfirmed'])assert.doesNotMatch(dorajiLedgerClientScript,new RegExp(banned));
});
