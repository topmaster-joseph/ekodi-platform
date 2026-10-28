import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync(new URL('../scripts/sql/human-author-dev-rls-e2e-rollback.sql',import.meta.url),'utf8');

test('private Human Author RLS E2E fixture is rollback-only and explicitly DEV-only',()=>{
  assert.match(sql,/DEV-ONLY/);
  assert.match(sql,/NEVER run this script on production/);
  assert.match(sql,/^begin;/m);
  assert.match(sql,/^rollback;/m);
  assert.doesNotMatch(sql,/^\s*commit\s*;/im);
  assert.ok(sql.indexOf('rollback;')>sql.indexOf('insert into auth.users'));
  assert.match(sql,/example\.invalid/);
  for(const name of ['synthetic_users_removed','projects_removed','enrollments_removed','answers_removed','subscriptions_removed']){
    assert.ok(sql.includes(name),name);
  }
});

test('fixture checks role changes, owner isolation, valid paid proof, quotas and append-only writes',()=>{
  for(const check of [
    'set local role authenticated',
    "select set_config('request.jwt.claim.sub'",
    "select set_config('request.jwt.claims'",
    'human_author_reserve_project',
    'idempotent',
    'monthly_human_author_project_limit_reached',
    'verified_paid_human_subscription_required',
    'owned_writer_project_required',
    'writing_mode',
    'foreign owner data visible',
    'cross-account-interview-insert-bypass',
    'simple-interview-bypass',
    "when sqlstate '42501'",
    'DEV_ROLLBACK_HUMAN_AUTHOR_RLS_E2E_PASSED',
  ])assert.ok(sql.includes(check),check);
  assert.ok(sql.indexOf('reset role;')<sql.indexOf('rollback;'));
  assert.ok(sql.includes('human_author_interview_turns'));
  assert.ok(sql.includes('human_author_enrollments'));
  assert.ok(sql.includes('human_author_subscriptions'));
  assert.doesNotMatch(sql, /(?:stripe|toss|checkout|payment\/confirm)/i);
});
