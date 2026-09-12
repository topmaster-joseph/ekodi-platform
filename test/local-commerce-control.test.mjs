import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleLocalCommerceControl, LOCAL_COMMERCE_CONTRACT } from '../local-commerce-control.js';

const migration = fs.readFileSync(new URL('../migrations/0082_local_commerce_voucher.sql', import.meta.url), 'utf8');

function seededDb(){
  const db=new DatabaseSync(':memory:');
  db.exec(migration);
  const t='2026-09-11T00:00:00.000Z';
  db.prepare(`INSERT INTO local_commerce_issuers (id,workspace_id,workspace_slug,issuer_type,name,status,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?,?)`).run('issuer1','ws1','cgma','merchant_association','청계면상인회','u1',t,t);
  db.prepare(`INSERT INTO local_commerce_programs (id,issuer_id,name,program_type,unit_name,budget_minor,status,created_by_user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'active',?,?,?)`).run('program1','issuer1','청깨비 포인트','points','P',100,'u1',t,t);
  db.prepare(`INSERT INTO local_commerce_wallet_accounts (id,user_id,issuer_id,program_id,balance_minor,created_at,updated_at) VALUES (?,?,?,?,0,?,?)`).run('wallet1','user1','issuer1','program1',t,t);
  return db;
}

test('local commerce health explicitly keeps cash execution disabled', async()=>{
  const response=await handleLocalCommerceControl(new Request('https://api.ekodi.kr/api/local-commerce/health'),{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.cashCustody,false);
  assert.equal(body.storedValueCash,false);
  assert.equal(body.automaticMoneyTransfer,false);
  assert.equal(body.paymentAdapter,'disabled');
  assert.equal(LOCAL_COMMERCE_CONTRACT.ledger,'append-only');
});

test('ledger enforces exact balance transitions and append-only history',()=>{
  const db=seededDb();
  const t='2026-09-11T01:00:00.000Z';
  db.prepare(`INSERT INTO local_commerce_ledger_entries (id,wallet_id,issuer_id,program_id,user_id,entry_type,amount_minor,balance_after_minor,actor_type,actor_id,idempotency_key,created_at) VALUES (?,?,?,?,?,'issue',100,100,'workspace_admin','u1','seed',?)`).run('l1','wallet1','issuer1','program1','user1',t);
  db.prepare(`UPDATE local_commerce_wallet_accounts SET balance_minor=100 WHERE id='wallet1'`).run();
  assert.throws(()=>db.prepare(`INSERT INTO local_commerce_ledger_entries (id,wallet_id,issuer_id,program_id,user_id,entry_type,amount_minor,balance_after_minor,actor_type,actor_id,idempotency_key,created_at) VALUES (?,?,?,?,?,'redeem',-80,80,'consumer','user1','bad',?)`).run('l2','wallet1','issuer1','program1','user1',t),/local_commerce_invalid_balance_transition/);
  assert.throws(()=>db.prepare(`UPDATE local_commerce_ledger_entries SET amount_minor=90 WHERE id='l1'`).run(),/local_commerce_ledger_append_only/);
  assert.throws(()=>db.prepare(`DELETE FROM local_commerce_ledger_entries WHERE id='l1'`).run(),/local_commerce_ledger_append_only/);
});

test('program budget cannot be over-issued',()=>{
  const db=seededDb();
  assert.throws(()=>db.prepare(`UPDATE local_commerce_programs SET issued_minor=101 WHERE id='program1'`).run(),/local_commerce_program_budget_exceeded/);
  db.prepare(`UPDATE local_commerce_programs SET issued_minor=100 WHERE id='program1'`).run();
  assert.equal(db.prepare(`SELECT issued_minor FROM local_commerce_programs WHERE id='program1'`).get().issued_minor,100);
});
