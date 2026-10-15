import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDorajiLedgerApiPath,validateDorajiProjectInput,validateDorajiRecordInput,dorajiLedgerApiResponse} from '../ekodibiz-doraji-ledger-api.js';

const URL='https://ekodi.kr/ekodibiz/doraji/api/v1';
const schema=readFileSync(new URL('../migrations/0133_doraji_operations_draft_ledger.sql',import.meta.url),'utf8');
const site=readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');

test('private api belongs to Doraji module and site guards it ahead of public HTML',()=>{
 assert.equal(isDorajiLedgerApiPath('/ekodibiz/doraji/api/v1/projects'),true);
 assert.equal(isDorajiLedgerApiPath('/ekodibiz/doraji/api/v1/projects/11111111-1111-4111-8111-111111111111/records'),true);
 assert.equal(isDorajiLedgerApiPath('/ekodibiz/doraji/api/v1/admin'),false);
 assert.ok(site.indexOf('if (isDorajiLedgerApiPath(url.pathname))')<site.indexOf('if (isDorajiOfficePath(url.pathname))'));
 assert.match(site,/private-ekodibiz-doraji-ledger/);
});

test('project inputs are bounded, versioned, and new records cannot self-declare approval',()=>{
 assert.equal(validateDorajiProjectInput({name:'전남 1호',region:'전남',areaSqm:500,greenhouseCount:2}).name,'전남 1호');
 assert.equal(validateDorajiProjectInput({name:'  '}),null);
 assert.equal(validateDorajiProjectInput({name:'x',owner_admin_id:42}),null);
 assert.equal(validateDorajiProjectInput({name:'x',status:'signed'}),null);
 assert.equal(validateDorajiProjectInput({name:'x',status:'cultivation'}),null);
 assert.equal(validateDorajiProjectInput({name:'x',version:1}),null);
 assert.equal(validateDorajiProjectInput({version:1},{partial:true}).version,1);
 assert.equal(validateDorajiProjectInput({status:'planning',version:0},{partial:true}),null);
});

test('cultivation, budget, buyer contract, delivery and document records can be draft only',()=>{
 for(const kind of ['cultivation','budget','contract','delivery','document']){
  const record=validateDorajiRecordInput({kind,date:'2026-10-15',title:'Draft',note:'현장메모',amountKRW:0,quantityKg:0});
  assert.equal(record.kind,kind);
 }
 for(const extra of [
  {state:'approved'},{signed:true},{paymentExecuted:true},{settlementApproved:true},{author_admin_id:2},
  {amountKRW:-1},{amountKRW:9007199254740992},{quantityKg:Infinity}
 ]){
  assert.equal(validateDorajiRecordInput({kind:'contract',date:'2026-10-15',title:'draft',...extra}),null);
 }
 assert.equal(validateDorajiRecordInput({kind:'contract',date:'2026-10-15',title:'draft',version:3}),null);
 assert.equal(validateDorajiRecordInput({note:'개정',version:2},{partial:true}).version,2);
 assert.equal(validateDorajiRecordInput({kind:'delivery',version:2},{partial:true}),null);
});

test('anonymous, missing DB, malicious Origin and retired business domain fail closed',async()=>{
 const get=path=>new Request(URL+path);
 assert.equal((await dorajiLedgerApiResponse(get('/projects'),{DB:{}})).status,401);
 assert.equal((await dorajiLedgerApiResponse(get('/projects'),{})).status,503);
 assert.equal((await dorajiLedgerApiResponse(new Request('https://business.ekodi.kr/ekodibiz/doraji/api/v1/projects'),{DB:{}})).status,403);
 assert.equal((await dorajiLedgerApiResponse(new Request(URL+'/projects',{headers:{origin:'https://evil.example'}}),{DB:{}})).status,403);
 assert.equal((await dorajiLedgerApiResponse(new Request(URL+'/projects',{method:'OPTIONS'}),{DB:{}})).status,405);
 assert.equal((await dorajiLedgerApiResponse(new Request(URL+'/projects',{headers:{authorization:'Bearer fake'}}),{DB:{prepare(){throw Error('D1 cannot verify')}}},{resolveSession:async()=>{throw Error('Auth unavailable')}})).status,503);
});

test('D1 schema only stores draft records and has project owner ACL and audit',()=>{
 for(const table of ['doraji_projects','doraji_project_roles','doraji_records','doraji_audit_events'])assert.match(schema,new RegExp('CREATE TABLE IF NOT EXISTS '+table));
 assert.match(schema,/owner_admin_id INTEGER NOT NULL REFERENCES admins\(id\)/);
 assert.match(schema,/admin_id INTEGER NOT NULL REFERENCES admins\(id\)/);
 assert.match(schema,/state TEXT NOT NULL DEFAULT 'draft' CHECK\(state='draft'\)/);
 for(const action of ['project_created','project_updated','record_created','record_updated'])assert.ok(schema.includes(action));
 assert.doesNotMatch(schema,/api_key|access_token|payment_secret|password/i);
});

test('protected ledger cannot execute signing or transfer-money actions',()=>{
 const code=readFileSync(new URL('../ekodibiz-doraji-ledger-api.js',import.meta.url),'utf8');
 for(const risky of ['sign_contract','approve_delivery_settlement'])assert.ok(code.includes(risky));
 assert.doesNotMatch(code,/paymentService\.fetch|checkoutUrl|transfer_money\(/);
 assert.match(code,/version_conflict/);
 assert.match(code,/projectAccess\(env,projectId,adminId\)/);
});
