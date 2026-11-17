import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const schema = fs.readFileSync(new URL('../schemas/ekodibiz/campus-ai-draft.sql',import.meta.url),'utf8');
const db=()=>{
  const connection=new DatabaseSync(':memory:');
  connection.exec('PRAGMA foreign_keys=ON');
  connection.exec(schema);
  connection.exec(schema);
  return connection;
};
const agreement=(d,{id='uni-contract-1',workspace='ws-campus-1',seats=2,budget=10000}={})=>
  d.prepare('INSERT INTO ekodibiz_campus_ai_agreements(agreement_id,university_workspace_id,provider_code,contract_reference,term_start_date,seat_limit,budget_minor,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(id,workspace,'openai','contract-receipt','2026-11-30',seats,budget,'2026-11-05','2026-11-05');
const member=(d,{contract='uni-contract-1',workspace='ws-campus-1',subject='opaque-person-1'}={})=>
  d.prepare('INSERT INTO ekodibiz_campus_ai_participants(agreement_id,university_workspace_id,subject_ref,consent_receipt_ref,membership_receipt_ref,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(contract,workspace,subject,'consent-ref','membership-ref','2026-11-05','2026-11-05');
const quote=(d,{cycle=0,amount=3000,subject='opaque-person-1'}={})=>
  d.prepare('INSERT INTO ekodibiz_campus_ai_cycle_previews(agreement_id,subject_ref,cycle_index,quote_minor,due_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('uni-contract-1',subject,cycle,amount,'2026-11-30','2026-11-05','2026-11-05');

test('schema runs twice in synthetic SQLite with foreign key enforcement',()=>{
  const d=db();assert.equal(d.prepare('PRAGMA foreign_keys').get().foreign_keys,1);d.close();
});
test('university agreements remain EKODIBIZ, 3 months and non-executable drafts',()=>{
  const d=db();agreement(d);const a=d.prepare('SELECT operator_org,term_months,stage FROM ekodibiz_campus_ai_agreements').get();
  assert.deepEqual({...a},{operator_org:'EKODIBIZ',term_months:3,stage:'draft'});
  assert.throws(()=>d.prepare("UPDATE ekodibiz_campus_ai_agreements SET operator_org='EKODICHURCH'").run(),/CHECK constraint/);
  assert.throws(()=>d.prepare('UPDATE ekodibiz_campus_ai_agreements SET term_months=12').run(),/CHECK constraint/);
  d.close();
});
test('opaque personal references require an agreement and same university workspace',()=>{
  const d=db();agreement(d);assert.throws(()=>member(d,{workspace:'ws-other'}),/FOREIGN KEY/);
  member(d);assert.equal(d.prepare('SELECT COUNT(*) AS n FROM ekodibiz_campus_ai_participants').get().n,1);d.close();
});
test('seat-cap trigger prevents over-enrolment',()=>{
  const d=db();agreement(d,{seats:1});member(d);
  assert.throws(()=>member(d,{subject:'opaque-person-2'}),/SEAT_LIMIT_EXCEEDED/);d.close();
});
test('only three billing previews possible per person and no cycle duplication',()=>{
  const d=db();agreement(d);member(d);for(let i=0;i<3;i++)quote(d,{cycle:i});
  assert.throws(()=>quote(d,{cycle:3,amount:1}),/CHECK constraint/);
  assert.throws(()=>quote(d,{cycle:0,amount:1}),/UNIQUE constraint/);
  d.close();
});
test('quotes cannot reserve above university budget, even on update',()=>{
  const d=db();agreement(d,{budget:5000});member(d);quote(d,{amount:3000});
  assert.throws(()=>quote(d,{cycle:1,amount:3000}),/CAMPUS_AI_BUDGET_EXCEEDED/);
  quote(d,{cycle:1,amount:2000});
  assert.throws(()=>d.prepare("UPDATE ekodibiz_campus_ai_cycle_previews SET quote_minor=3000 WHERE cycle_index=1").run(),/CAMPUS_AI_BUDGET_EXCEEDED/);
  d.close();
});
test('cancellation needs an external receipt and proof personal account remains',()=>{
  const d=db();agreement(d);member(d);
  const insert=d.prepare('INSERT INTO ekodibiz_campus_ai_termination_proofs(agreement_id,subject_ref,provider_cancellation_receipt,cancellation_confirmed_at,owner_account_preserved,created_at) VALUES(?,?,?,?,?,?)');
  assert.throws(()=>insert.run('uni-contract-1','opaque-person-1','provider-cancel','2027-01-31',0,'2027-01-31'),/CHECK constraint/);
  insert.run('uni-contract-1','opaque-person-1','provider-cancel','2027-01-31',1,'2027-01-31');
  assert.equal(d.prepare('SELECT owner_account_preserved FROM ekodibiz_campus_ai_termination_proofs').get().owner_account_preserved,1);
  d.close();
});
test('draft schema has no payment credential, account password or content columns',()=>{
  const d=db();
  const tables=['ekodibiz_campus_ai_agreements','ekodibiz_campus_ai_participants','ekodibiz_campus_ai_cycle_previews','ekodibiz_campus_ai_termination_proofs'];
  const names=tables.flatMap(name=>d.prepare('PRAGMA table_info('+name+')').all().map(row=>row.name));
  for(const sensitive of ['password','otp','card_number','cvv','provider_api_key','chat_content','conversation','email'])assert.equal(names.some(name=>name===sensitive),false);
  assert.equal(names.includes('subject_ref'),true);
  d.close();
});
