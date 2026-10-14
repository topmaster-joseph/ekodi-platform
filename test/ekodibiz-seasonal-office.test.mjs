import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isSeasonalOfficePath,seasonalOfficePage,seasonalOfficeScript,seasonalOfficeApi,SEASONAL_OFFICE} from '../ekodibiz-seasonal-office.js';

const root='https://ekodi.kr/ekodibiz/seasonal-workers';
function req(path='',method='GET',body,token='test-token'){
  return new Request(root+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}
const identity=async(url,init)=>new Response(
  url.includes('/auth/v1/user')?JSON.stringify({id:'user-1',email:'staff@example.net'}):
  JSON.stringify([{tenant:'ekodi-biz',tenant_id:'immutable-ws-1',authorization_role:'manager'}]),
  {status:200,headers:{'content-type':'application/json'}}
);
const viewer=async(url,init)=>new Response(
  url.includes('/auth/v1/user')?JSON.stringify({id:'user-2',email:'viewer@example.net'}):
  JSON.stringify([{tenant:'ekodi-biz',tenant_id:'immutable-ws-2',authorization_role:'viewer'}]),
  {status:200}
);
test('private office canonical surface and client assets are explicit',async()=>{
  for(const path of ['/ekodibiz/seasonal-workers','/ekodibiz/seasonal-workers/','/ekodibiz/seasonal-workers/app.js','/ekodibiz/seasonal-workers/api/records','/ekodibiz/seasonal-workers/api/activity'])assert.ok(isSeasonalOfficePath(path),path);
  for(const path of ['/ekodibiz/seasonal-workers/unlisted','/ekodibiz','/ekodibiz/seasonal-workers/public'])assert.equal(isSeasonalOfficePath(path),false);
  assert.equal(SEASONAL_OFFICE.path,'/ekodibiz/seasonal-workers');
  assert.equal(SEASONAL_OFFICE.originalDocumentUploaded,false);
  const page=await seasonalOfficePage().text();
  assert.match(page,/계절근로자사업 웹오피스/);
  assert.match(page,/noindex,nofollow/);
  assert.match(page,/data-ekodi-business-unit="seasonal-workers"/);
  assert.doesNotMatch(page,/staff@example.net|access_token/);
  assert.match(await seasonalOfficeScript().text(),/Google 계정으로 로그인/);
});
test('auth and tenant membership are mandatory before private records',async()=>{
  const noAuth=await seasonalOfficeApi(req('/api/records','GET',undefined,''),{DB:{}},identity);
  assert.equal(noAuth.status,401);
  const noMembership=async(url)=>new Response(url.includes('/auth/v1/user')?JSON.stringify({id:'user-1',email:'staff@example.net'}):'[]',{status:200});
  assert.equal((await seasonalOfficeApi(req('/api/records'),{DB:{}},noMembership)).status,401);
  assert.equal((await seasonalOfficeApi(req('/api/records'),{},identity)).status,503);
  assert.equal((await seasonalOfficeApi(req('/api/activity','POST',{}),{},identity)).status,405);
});
test('read-only viewer cannot write, and no original file is claimed to be stored',async()=>{
  const access=await seasonalOfficeApi(req('/api/records','POST',{title:'공개',category:'tasks'},'viewer'),{DB:{}},viewer);
  assert.equal(access.status,403);
  assert.equal((await access.json()).error,'EDITOR_ROLE_REQUIRED');
});
test('writes reject unsafe shape before any database operation',async()=>{
  const invalid={title:'a',category:'tasks',summary:'review',status:'active'};
  const fakeDb={prepare(){throw new Error('should not access DB')}};
  const res=await seasonalOfficeApi(req('/api/records','POST',invalid),{DB:fakeDb},identity);
  assert.equal(res.status,400);
  const piiFreeShape={title:'사업 진행현황',category:'tasks',status:'review',referenceUrl:'javascript:alert(1)'};
  assert.equal((await seasonalOfficeApi(req('/api/records','POST',piiFreeShape),{DB:fakeDb},identity)).status,400);
});
test('source routes through shared site without broadening public shell CSP',async()=>{
  const src=await readFile(new URL('../site-worker.js',import.meta.url),'utf8');
  assert.match(src,/isSeasonalOfficePath\(url.pathname\)/);
  assert.match(src,/seasonalOfficeApi\(request,env\)/);
  assert.match(src,/SEASONAL_OFFICE_CSP/);
  assert.ok(src.indexOf('isSeasonalOfficePath(url.pathname)')<src.lastIndexOf('return env.ASSETS.fetch(request)'));
  const migration=await readFile(new URL('../migrations/0130_ekodibiz_seasonal_office.sql',import.meta.url),'utf8');
  assert.match(migration,/workspace_id TEXT NOT NULL/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS seasonal_office_audit/);
});
