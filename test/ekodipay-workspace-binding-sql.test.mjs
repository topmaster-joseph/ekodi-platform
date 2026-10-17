import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handlePrivateMerchantStatus} from '../services/ekodipay/merchant-status-reader.js';

const url=(id)=>'https://ekodi.kr/ekodipay/private/merchants/'+id+'/status';
const migration=readFileSync(new URL('../services/ekodipay/migrations/0003-merchant-workspace-binding.sql',import.meta.url),'utf8');
function database(){
  const raw=new DatabaseSync(':memory:');
  raw.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE ekodipay_merchants(merchant_id TEXT PRIMARY KEY,state TEXT NOT NULL);
  CREATE TABLE ekodipay_merchant_mid(merchant_id TEXT,pg_mode TEXT,verified_at INTEGER,proof_ref TEXT);
  CREATE TABLE ekodipay_merchant_bank_verification(merchant_id TEXT,review_state TEXT);
  CREATE TABLE ekodipay_merchant_service_issuers(merchant_id TEXT,is_enabled INTEGER);
  CREATE TABLE ekodipay_merchant_approval_evidence(merchant_id TEXT,status TEXT,proof_ref TEXT,approved_at INTEGER);
  INSERT INTO ekodipay_merchants VALUES ('merchant_a','verified'),('merchant_b','pending');
  INSERT INTO ekodipay_merchant_mid VALUES('merchant_a','test',100,'PG_PROOF_001');
  INSERT INTO ekodipay_merchant_bank_verification VALUES('merchant_a','verified');
  INSERT INTO ekodipay_merchant_service_issuers VALUES('merchant_a',1);
  INSERT INTO ekodipay_merchant_approval_evidence VALUES('merchant_a','verified','EVIDENCE_001',111);
  `);
  raw.exec(migration);
  const insert=raw.prepare(`INSERT INTO ekodipay_merchant_workspace_bindings
    (merchant_id,workspace_id,status,proof_ref,verified_at,verified_by_ref)
    VALUES (?,?,?,?,?,?)`);
  insert.run('merchant_a','workspace_a','active','PROOF_A_001',111,'reviewer_a');
  insert.run('merchant_b','workspace_b','active','PROOF_B_001',222,'reviewer_b');
  const adapter={prepare(sql){return {bind(...args){return {
    async first(){return raw.prepare(sql).get(...args);}
  }}}}};
  return {raw,adapter};
}
function request(id,db,workspaceId){
  return handlePrivateMerchantStatus(new Request(url(id),{headers:{
      'x-workspace-id':'workspace_a','x-merchant-id':'merchant_a','x-role':'platform_admin'
    }}),{
    db,
    authenticate:async()=>({id:'customer:subject',kind:'user',authorityScope:'tenant',
      subject:{type:'tenant',key:'untrusted-readable-slug'}}),
    resolveWorkspaceId:async()=>workspaceId,
    // This callback deliberately grants access to demonstrate SQL remains an
    // independent barrier even if the capability layer makes a mistake.
    authorize:async()=>true,
  });
}
test('verified immutable workspace binding is required even after capability approval',async()=>{
  const {raw,adapter}=database();
  try{
    let result=await request('merchant_a',adapter,'workspace_a');
    assert.equal(result.status,200);
    const state=await result.json();
    assert.equal(state.checks.testMidVerified,true);
    assert.equal(state.canCharge,false);
    assert.equal(JSON.stringify(state).includes('PROOF_A_001'),false);
    result=await request('merchant_a',adapter,'workspace_b');
    assert.equal(result.status,404);
    result=await request('merchant_b',adapter,'workspace_a');
    assert.equal(result.status,404);
    result=await request('merchant_b',adapter,'workspace_b');
    assert.equal(result.status,200);
  }finally{raw.close();}
});
test('revoked or pending merchant-workspace binding blocks status even if merchant exists',async()=>{
  const {raw,adapter}=database();
  try{
    raw.exec("UPDATE ekodipay_merchant_workspace_bindings SET status='revoked' WHERE merchant_id='merchant_a'");
    assert.equal((await request('merchant_a',adapter,'workspace_a')).status,404);
    assert.throws(()=>raw.exec("UPDATE ekodipay_merchant_workspace_bindings SET status='active' WHERE merchant_id='merchant_a'"),/revoked_merchant_workspace_requires_new_authorization/);
    raw.exec("UPDATE ekodipay_merchant_workspace_bindings SET status='pending' WHERE merchant_id='merchant_b'");
    assert.equal((await request('merchant_b',adapter,'workspace_b')).status,404);
  }finally{raw.close();}
});
test('reference-only schema rejects unauthorized ownership rewriting and deletion',()=>{
  const {raw}=database();
  try{
    assert.throws(()=>raw.exec("UPDATE ekodipay_merchant_workspace_bindings SET workspace_id='workspace_b' WHERE merchant_id='merchant_a'"),/merchant_workspace_identity_immutable/);
    assert.throws(()=>raw.exec("UPDATE ekodipay_merchant_workspace_bindings SET proof_ref='FORGED_00001' WHERE merchant_id='merchant_a'"),/merchant_workspace_identity_immutable/);
    assert.throws(()=>raw.exec("DELETE FROM ekodipay_merchant_workspace_bindings WHERE merchant_id='merchant_a'"),/merchant_workspace_binding_delete_forbidden/);
    assert.throws(()=>raw.exec("INSERT INTO ekodipay_merchant_workspace_bindings VALUES ('merchant_a','workspace_fake','active','PROOF_FAKE_001',NULL,NULL)"),/CHECK constraint failed/);
  }finally{raw.close();}
});
