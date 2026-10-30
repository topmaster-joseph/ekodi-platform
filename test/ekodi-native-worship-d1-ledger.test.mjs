import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createWorshipD1Ledger} from '../scripts/ekodi-native-worship-d1-ledger.mjs';

const date='2026-11-01',key='ekodi:church-weekly:'+date;
function db(){
  const sqlite=new DatabaseSync(':memory:');
  const migration=awaitMigration();
  sqlite.exec(migration);
  function prepared(sql,values=[]){
    return{
      bind(...params){return prepared(sql,params);},
      async run(){const r=sqlite.prepare(sql).run(...values);return{meta:{changes:r.changes}};},
      async first(){return sqlite.prepare(sql).get(...values)||null;},
      async all(){return{results:sqlite.prepare(sql).all(...values)};}
    };
  }
  return{sqlite,prepare:sql=>prepared(sql)};
}
let migration='';
function awaitMigration(){return migration;}
const types=['sermonGoogleDocId','bulletinGoogleDocId','worshipGoogleSlidesId'];
const ids=['ekodi_sermon_file_0001','ekodi_bulletin_file_0002','ekodi_presentation_file_0003'];

test('native worship D1 schema is additive, private and strict on job/asset identity',async()=>{
  migration=await readFile(new URL('../migrations/202610300300_church_native_draft_ledger.sql',import.meta.url),'utf8');
  const b=db();
  assert.equal(b.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name LIKE 'ekodi_church_native_draft_%'").get().n,2);
  assert.equal(b.sqlite.prepare('SELECT count(*) AS n FROM ekodi_church_native_draft_runs').get().n,0);
  assert.doesNotMatch(migration,/token|authorization|plaintext|sermon_body/i);
});
test('atomic unique claim blocks duplicate draft creation on the same Sunday',async()=>{
  const b=db();const store=createWorshipD1Ledger(b,{newLease:()=> 'ekodi_test_lease_1234'});
  assert.deepEqual(await store.claim(key),{claimed:true,leaseId:'ekodi_test_lease_1234'});
  assert.deepEqual(await store.claim(key),{claimed:false});
  assert.equal(b.sqlite.prepare('SELECT count(*) AS n FROM ekodi_church_native_draft_runs').get().n,1);
});
test('records require matching lease and same Google file readback',async()=>{
  const b=db();const store=createWorshipD1Ledger(b,{newLease:()=> 'ekodi_test_lease_1234'});
  const claim=await store.claim(key);const lease=claim.leaseId;
  assert.equal((await store.record(key,'another_lease_1234',{kind:types[0],fileId:ids[0],state:'created_pending_readback'})).stored,false);
  assert.equal((await store.record(key,lease,{kind:types[0],fileId:ids[0],state:'created_pending_readback'})).stored,true);
  assert.equal((await store.record(key,lease,{kind:types[0],fileId:'wrong_doc_id_abc',state:'draft_readback_verified'})).stored,false);
  assert.equal((await store.record(key,lease,{kind:types[0],fileId:ids[0],state:'draft_readback_verified'})).stored,true);
  assert.equal((await store.record(key,lease,{kind:types[0],fileId:ids[0],state:'draft_readback_verified'})).stored,false);
  assert.equal(b.sqlite.prepare('SELECT state FROM ekodi_church_native_draft_assets').get().state,'draft_readback_verified');
});
test('only all three matching verified draft asset IDs permit pastor-review state',async()=>{
  const b=db();const store=createWorshipD1Ledger(b,{newLease:()=> 'ekodi_test_lease_1234'});
  const lease=(await store.claim(key)).leaseId;
  const receipt={jobId:key,publicationState:'private_draft',approvalState:'pastoral_review_required',
    sourceRegistryId:'approved_church_scripture_202611',assets:Object.fromEntries(types.map((x,i)=>[x,ids[i]]))};
  assert.equal((await store.finish(key,lease,receipt)).stored,false);
  for(let i=0;i<3;i++){
    assert.equal((await store.record(key,lease,{kind:types[i],fileId:ids[i],state:'created_pending_readback'})).stored,true);
    assert.equal((await store.record(key,lease,{kind:types[i],fileId:ids[i],state:'draft_readback_verified'})).stored,true);
  }
  assert.equal((await store.finish(key,lease,receipt)).stored,true);
  assert.equal(b.sqlite.prepare('SELECT state FROM ekodi_church_native_draft_runs').get().state,'draft_ready_for_pastor_review');
  assert.equal((await store.finish(key,lease,receipt)).stored,false);
  assert.equal((await store.record(key,lease,{kind:types[0],fileId:ids[0],state:'created_pending_readback'})).stored,false);
});
test('external error marks permanently blocked without deleting partial created files',async()=>{
  const b=db();const store=createWorshipD1Ledger(b,{newLease:()=> 'ekodi_test_lease_1234'});
  const lease=(await store.claim(key)).leaseId;
  await store.record(key,lease,{kind:types[0],fileId:ids[0],state:'created_pending_readback'});
  assert.equal((await store.block(key,lease,'GOOGLE_RATE_OR_SCOPE_DENIED')).stored,true);
  assert.equal((await store.claim(key)).claimed,false);
  assert.equal((await store.record(key,lease,{kind:types[0],fileId:ids[0],state:'draft_readback_verified'})).stored,false);
  const row=b.sqlite.prepare('SELECT state,reason FROM ekodi_church_native_draft_runs').get();
  assert.equal(row.state,'blocked_reconciliation_required');
  assert.equal(row.reason,'GOOGLE_RATE_OR_SCOPE_DENIED');
  assert.equal(b.sqlite.prepare('SELECT count(*) AS n FROM ekodi_church_native_draft_assets').get().n,1);
});
