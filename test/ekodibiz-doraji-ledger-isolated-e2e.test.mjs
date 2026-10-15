import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dorajiLedgerApiResponse } from '../ekodibiz-doraji-ledger-api.js';
const prefix='https://ekodi.kr/ekodibiz/doraji/api/v1';
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec("PRAGMA foreign_keys=ON;CREATE TABLE admins(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE);");
 sqlite.prepare('INSERT INTO admins(id,email) VALUES(?,?)').run(11,'writer@example.invalid');
 sqlite.prepare('INSERT INTO admins(id,email) VALUES(?,?)').run(22,'reader@example.invalid');
 sqlite.exec(fs.readFileSync(new URL('../schemas/ekodibiz/doraji-draft-ledger.sql',import.meta.url),'utf8'));
 const prepared=(sql,params=[])=>({
  sql,params,bind(...args){return prepared(sql,args)},
  async first(){return sqlite.prepare(sql).get(...params)||null},
  async all(){return {results:sqlite.prepare(sql).all(...params)}},
  async run(){const r=sqlite.prepare(sql).run(...params);return {meta:{changes:r.changes}}}
 });
 const DB={
  prepare(sql){return prepared(sql)},
  async batch(batch){
   sqlite.exec('BEGIN IMMEDIATE');
   try{
    const out=batch.map(q=>{const r=sqlite.prepare(q.sql).run(...q.params);return {meta:{changes:r.changes}}});
    sqlite.exec('COMMIT');return out;
   }catch(e){sqlite.exec('ROLLBACK');throw e}
  }
 };
 const resolveSession=async req=>{
  const bearer=req.headers.get('authorization');
  const email=bearer==='Bearer writer'?'writer@example.invalid':bearer==='Bearer reader'?'reader@example.invalid':'';
  return {principal:email?{kind:'admin',email}:null};
 };
 async function call(method,path,identity='',body){
  const headers={};
  if(identity)headers.authorization='Bearer '+identity;
  if(body!==undefined)headers['content-type']='application/json';
  const req=new Request(prefix+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const res=await dorajiLedgerApiResponse(req,{DB},{resolveSession});
  return {status:res.status,json:await res.json()};
 }
 return {sqlite,call};
}
test('D1 draft ledger isolated end-to-end: project ownership, viewer scope, version and audit',async()=>{
 const {sqlite,call}=fixture();
 try{
  assert.equal((await call('GET','/projects')).status,401);
  const created=await call('POST','/projects','writer',{name:'테스트 사업단위',region:'전남',greenhouseCount:1,areaSqm:500});
  assert.equal(created.status,201,JSON.stringify(created));
  const project=created.json.id;assert.match(project,/^[0-9a-f-]{36}$/);
  assert.equal((await call('GET','/projects','reader')).json.items.length,0);
  assert.equal((await call('GET','/projects/'+project,'reader')).status,404);
  const changed=await call('PATCH','/projects/'+project,'writer',{version:1,status:'planning'});
  assert.equal(changed.status,200,JSON.stringify(changed));
  assert.equal((await call('PATCH','/projects/'+project,'writer',{version:1,status:'harvest'})).status,409);
  sqlite.prepare('INSERT INTO doraji_project_roles(project_id,admin_id,role,granted_by_admin_id,created_at) VALUES(?,?,?,?,?)')
   .run(project,22,'viewer',11,new Date().toISOString());
  assert.equal((await call('GET','/projects','reader')).json.items.length,1);
  assert.equal((await call('PATCH','/projects/'+project,'reader',{version:2,name:'no'})).status,403);
  const draft={kind:'contract',date:'2026-10-15',title:'수매 검토 초안',counterparty:'테스트 거래처',amountKRW:500000,quantityKg:100};
  assert.equal((await call('POST','/projects/'+project+'/records','reader',draft)).status,403);
  assert.equal((await call('POST','/projects/'+project+'/records','writer',{...draft,state:'signed'})).status,400);
  const record=await call('POST','/projects/'+project+'/records','writer',draft);
  assert.equal(record.status,201,JSON.stringify(record));assert.equal(record.json.paymentExecuted,false);
  const list=await call('GET','/projects/'+project+'/records?kind=contract','reader');
  assert.equal(list.status,200);assert.equal(list.json.items.length,1);
  assert.equal(list.json.items[0].state,'draft');
  const updated=await call('PATCH','/projects/'+project+'/records/'+record.json.id,'writer',{version:1,note:'재검토'});
  assert.equal(updated.status,200,JSON.stringify(updated));
  assert.equal((await call('PATCH','/projects/'+project+'/records/'+record.json.id,'writer',{version:1,note:'stale'})).status,409);
  const audit=await call('GET','/projects/'+project+'/audit','reader');
  assert.equal(audit.status,200);assert.equal(audit.json.items.length,4);
  assert.equal(sqlite.prepare('SELECT COUNT(*) c FROM doraji_audit_events').get().c,4);
 }finally{sqlite.close()}
});
