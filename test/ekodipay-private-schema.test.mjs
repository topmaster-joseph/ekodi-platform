import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

function database() {
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../services/ekodipay/migrations/0001-private-multi-merchant.sql',import.meta.url),'utf8'));
 return db;
}
const merchant=(db,id)=>db.prepare("INSERT INTO ekodipay_merchants(merchant_id,legal_entity_ref,created_at) VALUES(?,?,?)").run(id,'entity_'+id,1790000000000);
const bank=(db,id,fingerprint)=>db.prepare("INSERT INTO ekodipay_merchant_bank_verification(merchant_id,bank_code,account_last4,account_hmac_fingerprint,proof_ref,verified_by_ref,verified_at,review_state) VALUES (?,'088','1234',?,'BANK_PROOF_0001','owner_verified',1790000000000,'verified')").run(id,fingerprint);
test('reference-only tenant DB schema parses with real SQLite and forbids two merchants sharing settlement account HMAC',()=>{
 const db=database();
 try{
  merchant(db,'merchant_a');merchant(db,'merchant_b');
  bank(db,'merchant_a','a'.repeat(64));
  assert.throws(()=>bank(db,'merchant_b','a'.repeat(64)),/UNIQUE constraint failed/);
  bank(db,'merchant_b','b'.repeat(64));
 }finally{db.close()}
});
test('read-only merchant schema locks issuer, mode and MID to same immutable approved order',()=>{
 const db=database();
 try{
  merchant(db,'merchant_a');
  db.exec("INSERT INTO ekodipay_merchant_mid(merchant_id,pg_provider,pg_mode,mid,client_secret_binding_ref,server_secret_binding_ref) VALUES('merchant_a','tosspayments','test','TESTMID_001','PAY_MERCHANT_A_TEST_CLIENT','PAY_MERCHANT_A_TEST_SECRET')");
  db.exec("INSERT INTO ekodipay_merchant_service_issuers(merchant_id,service_id,issuer_ref,is_enabled) VALUES('merchant_a','ekodibiz','issuer_a',1)");
  db.exec("INSERT INTO ekodipay_merchant_service_issuers(merchant_id,service_id,issuer_ref,is_enabled) VALUES('merchant_a','ekodibiz','issuer_disabled',0)");
  db.exec("INSERT INTO ekodipay_approved_orders(order_id,merchant_id,service_id,issuer_ref,pg_provider,pg_mode,mid,amount,expires_at,issuer_proof_ref,created_at) VALUES('ORD_001','merchant_a','ekodibiz','issuer_a','tosspayments','test','TESTMID_001',50000,1790005000000,'APPROVED_001',1790000000000)");
  assert.throws(()=>db.exec("UPDATE ekodipay_approved_orders SET amount=1 WHERE order_id='ORD_001'"),/approved_order_immutable/);
  assert.throws(()=>db.exec("INSERT INTO ekodipay_approved_orders(order_id,merchant_id,service_id,issuer_ref,pg_provider,pg_mode,mid,amount,expires_at,issuer_proof_ref,created_at) VALUES('ORD_002','merchant_a','ekodibiz','wrong_issuer','tosspayments','test','TESTMID_001',50000,1790005000000,'APPROVED_002',1790000000000)"),/approved_order_issuer_not_enabled/);
  assert.throws(()=>db.exec("INSERT INTO ekodipay_approved_orders(order_id,merchant_id,service_id,issuer_ref,pg_provider,pg_mode,mid,amount,expires_at,issuer_proof_ref,created_at) VALUES('ORD_003','merchant_a','ekodibiz','issuer_disabled','tosspayments','test','TESTMID_001',50000,1790005000000,'APPROVED_003',1790000000000)"),/approved_order_issuer_not_enabled/);
  assert.throws(()=>db.exec("INSERT INTO ekodipay_approved_orders(order_id,merchant_id,service_id,issuer_ref,pg_provider,pg_mode,mid,amount,expires_at,issuer_proof_ref,created_at) VALUES('ORD_004','merchant_a','ekodibiz','issuer_a','tosspayments','test','OTHER_MID',50000,1790005000000,'APPROVED_004',1790000000000)"),/FOREIGN KEY constraint failed/);
  const insert=db.prepare("INSERT INTO ekodipay_settlement_snapshots(merchant_id,pg_mode,mid,transaction_key,payment_key,order_id,amount,paid_out_amount,paid_out_date,provider_evidence_digest,created_at) VALUES ('merchant_a',?,?,?,'PAY_001','ORD_001',50000,48400,'2026-10-15','SHA_001',1790000000000)");
  assert.throws(()=>insert.run('live','TESTMID_001','TX_01'),/FOREIGN KEY constraint failed/);
  assert.throws(()=>insert.run('test','OTHER_MID','TX_02'),/FOREIGN KEY constraint failed/);
  insert.run('test','TESTMID_001','TX_03');
 }finally{db.close()}
});
