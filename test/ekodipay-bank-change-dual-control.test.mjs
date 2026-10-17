import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const sql=(n)=>readFileSync(new URL('../services/ekodipay/migrations/'+n,import.meta.url),'utf8');
function db(){
 const x=new DatabaseSync(':memory:');
 x.exec(sql('0001-private-multi-merchant.sql'));
 x.exec(sql('0002-bank-change-dual-control.sql'));
 return x;
}
const fp=x=>x.repeat(64);
const start=(x,m='merchant_a',bankFp=fp('a'))=>{
 x.prepare('INSERT INTO ekodipay_merchants(merchant_id,legal_entity_ref,created_at) VALUES (?,?,?)')
  .run(m,'entity_'+m,1790000000000);
 x.prepare("INSERT INTO ekodipay_merchant_bank_verification(merchant_id,bank_code,account_last4,account_hmac_fingerprint,proof_ref,verified_by_ref,verified_at,review_state) VALUES (?,'088','1234',?,'BANKPROOF_ORIGINAL','verifier_initial',1790000000000,'verified')")
  .run(m,bankFp);
};
const request=(x,m='merchant_a',old=fp('a'),next=fp('b'),ref='BANKREQUEST_001')=>
 x.prepare("INSERT INTO ekodipay_bank_change_requests(merchant_id,request_ref,old_fingerprint,new_fingerprint,new_bank_code,new_account_last4,new_proof_ref,requested_by_ref,requested_at,expires_at) VALUES (?,?,?,?, '004','4321','BANKPROOF_NEW', 'requestor_a',1790000100000,1790000500000)")
  .run(m,ref,old,next);
const approve=(x,role,actor,m='merchant_a',ref='BANKREQUEST_001',when=1790000200000)=>
 x.prepare("INSERT INTO ekodipay_bank_change_approvals(merchant_id,request_ref,role,reviewer_ref,proof_ref,approved_at) VALUES (?,?,?,?,'ATTESTED_PROOF_001',?)")
 .run(m,ref,role,actor,when);
const update=(x,m='merchant_a',next=fp('b'),when=1790000300000,proof='BANKPROOF_NEW')=>
 x.prepare("UPDATE ekodipay_merchant_bank_verification SET bank_code='004',account_last4='4321',account_hmac_fingerprint=?,proof_ref=?,verified_by_ref='finance_b',verified_at=? WHERE merchant_id=?")
  .run(next,proof,when,m);

test('bank change cannot update an already verified account without two independent approvals',()=>{
 const x=db();
 try{
  start(x);request(x);
  assert.throws(()=>update(x),/bank_change_dual_approval_required/);
  approve(x,'merchant_owner','owner_b');
  assert.throws(()=>update(x),/bank_change_dual_approval_required/);
  approve(x,'finance_reviewer','finance_b', 'merchant_a','BANKREQUEST_001',1790000210000);
  update(x);
  const row=x.prepare("SELECT account_hmac_fingerprint,account_last4,verified_by_ref FROM ekodipay_merchant_bank_verification WHERE merchant_id='merchant_a'").get();
  assert.equal(row.account_hmac_fingerprint,fp('b'));
  assert.equal(row.account_last4,'4321');assert.equal(row.verified_by_ref,'finance_b');
  const audit=x.prepare("SELECT request_ref,old_fingerprint,new_fingerprint,event_type FROM ekodipay_bank_change_audit").get();
  assert.equal(audit.event_type,'account_changed');assert.equal(audit.request_ref,'BANKREQUEST_001');
  assert.equal(audit.old_fingerprint,fp('a'));assert.equal(audit.new_fingerprint,fp('b'));
  assert.equal(x.prepare("SELECT consumed_at FROM ekodipay_bank_change_requests").get().consumed_at,1790000300000);
  assert.throws(()=>update(x,'merchant_a',fp('d'),1790000310000),/bank_change_dual_approval_required/);
  assert.throws(()=>x.exec("DELETE FROM ekodipay_merchant_bank_verification WHERE merchant_id='merchant_a'"),/bank_account_deletion_forbidden/);
 }finally{x.close();}
});

test('requester cannot approve own settlement change; same person cannot fill both review roles',()=>{
 const x=db();
 try{
  start(x);request(x);
  assert.throws(()=>approve(x,'merchant_owner','requestor_a'),/bank_change_reviewer_or_time_invalid/);
  approve(x,'merchant_owner','owner_b');
  assert.throws(()=>approve(x,'finance_reviewer','owner_b'),/UNIQUE constraint failed/);
  assert.throws(()=>approve(x,'finance_reviewer','finance_b','merchant_a','BANKREQUEST_001',1790000600000),/bank_change_reviewer_or_time_invalid/);
  approve(x,'finance_reviewer','finance_b');
  assert.throws(()=>x.exec("UPDATE ekodipay_bank_change_approvals SET reviewer_ref='requestor_a'"),/bank_change_approval_immutable/);
  assert.throws(()=>x.exec("DELETE FROM ekodipay_bank_change_approvals"),/bank_change_approval_immutable/);
  assert.throws(()=>x.exec("UPDATE ekodipay_bank_change_requests SET new_bank_code='555'"),/bank_change_request_immutable/);
 }finally{x.close();}
});

test('settlement bank changes are linked to the same tenant, proof, HMAC and approval validity window',()=>{
 const x=db();
 try{
  start(x);start(x,'merchant_b',fp('c'));
  request(x);
  approve(x,'merchant_owner','owner_b');
  approve(x,'finance_reviewer','finance_b');
  for(const fn of [
   ()=>update(x,'merchant_b',fp('b')),
   ()=>update(x,'merchant_a',fp('d')),
   ()=>update(x,'merchant_a',fp('b'),1790000600000),
   ()=>update(x,'merchant_a',fp('b'),1790000300000,'UNAPPROVED_PROOF'),
  ])assert.throws(fn,/bank_change_dual_approval_required/);
  assert.throws(()=>request(x,'merchant_b',fp('a'),fp('d'),'BANKREQUEST_OTHER'),/bank_change_existing_account_mismatch/);
  const still=x.prepare("SELECT account_hmac_fingerprint FROM ekodipay_merchant_bank_verification WHERE merchant_id='merchant_a'").get();
  assert.equal(still.account_hmac_fingerprint,fp('a'));
 }finally{x.close()}
});

test('suspension is fail closed, audited and cannot re-enable without fresh dual-control request',()=>{
 const x=db();
 try{
  start(x);
  x.exec("UPDATE ekodipay_merchant_bank_verification SET review_state='revoked' WHERE merchant_id='merchant_a'");
  assert.equal(x.prepare("SELECT review_state FROM ekodipay_merchant_bank_verification").get().review_state,'revoked');
  assert.equal(x.prepare("SELECT event_type FROM ekodipay_bank_change_audit").get().event_type,'account_revoked');
  assert.throws(()=>x.exec("UPDATE ekodipay_merchant_bank_verification SET review_state='verified'"),/bank_change_dual_approval_required/);
  assert.throws(()=>x.exec("DELETE FROM ekodipay_bank_change_audit"),/bank_change_audit_immutable/);
 }finally{x.close();}
});
