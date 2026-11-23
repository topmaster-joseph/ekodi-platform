import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyPointsDevelopmentGuardPreflight,REQUIRED_FLAGS} from '../scripts/classify-points-development-guard-preflight.mjs';

const wf=readFileSync(new URL('../.github/workflows/deploy-points-nonverified-development-guard.yml',import.meta.url),'utf8');
const pre=readFileSync(new URL('../scripts/sql/points-nonverified-development-preflight.sql',import.meta.url),'utf8');
const post=readFileSync(new URL('../scripts/sql/points-nonverified-development-postflight.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261108224500_ekodi_points_nonverified_reward_guard.sql',import.meta.url),'utf8');

test('only an explicit topmaster-joseph workflow_dispatch on protected main can mutate development',()=>{
  assert.match(wf,/on:\n  workflow_dispatch:/);
  assert.doesNotMatch(wf,/\n  push:|\n  pull_request:|\n  schedule:|renzehysxirjilvdxacv|environment: production/);
  assert.match(wf,/environment: development/);
  assert.match(wf,/test "\$GITHUB_ACTOR" = topmaster-joseph/);
  assert.match(wf,/test "\$OWNER_CONFIRMS_DEV_ONLY" = true/);
  assert.match(wf,/test "\$GITHUB_REF" = refs\/heads\/main/);
  assert.match(wf,/test "\$GITHUB_SHA" = "\$EXPECTED_MAIN_SHA"/);
  assert.match(wf,/test "\$\(git ls-remote origin refs\/heads\/main/);
  assert.match(wf,/git merge-base --is-ancestor 33ed214f7f08cd4f11ad7e31e8ce1e3562a48003/);
  assert.match(wf,/DEV_PROJECT: lxcxwbdwwojjkgybbqii/);
  assert.match(wf,/MIGRATION_GIT_BLOB: 17a1003aa5968c4a7a4914684a144abf5b462ce6/);
  assert.match(wf,/EKODI AI Orchestration Gate\n\s+run: node "\$GITHUB_WORKSPACE\/scripts\/validate-ekodi-ai-change-orchestration.mjs" --release/);
  assert.ok(wf.indexOf('name: EKODI AI Orchestration Gate')<wf.indexOf('name: Apply exactly one reviewed additive migration'),'gate must precede DB writes');
});

test('management SQL is single-purpose, atomic, no retries and never targets production',()=>{
  assert.equal((wf.match(/read_only:false/g)||[]).length,1);
  assert.equal((wf.match(/read_only:true/g)||[]).length,2);
  assert.match(wf,/printf 'BEGIN;/);
  assert.match(wf,/cat "\$MIGRATION"/);
  assert.match(wf,/INSERT INTO supabase_migrations\.schema_migrations\(version,name\)/);
  assert.match(wf,/VALUES \('20261108224500','ekodi_points_nonverified_reward_guard'\)/);
  assert.match(wf,/COMMIT;/);
  assert.match(wf,/Do not auto-retry an ambiguous mutation result/);
  assert.doesNotMatch(wf,/--retry.*\/database\/query|supabase db push|POINTS_ENABLED=true|any_valid_service_token|CREATE POLICY/);
  assert.match(migration,/POINTS_NONVERIFIED_REWARD_POLICY_REVIEW_REQUIRED/);
  assert.match(migration,/ADD CONSTRAINT ekodi_points_no_unverified_active_credit/);
  assert.match(migration,/ADD CONSTRAINT ekodi_points_no_devotion_self_report_credit/);
});

test('preflight requires all 20 earlier migrations, no balances and no legacy rule enabled',()=>{
  for(const required of ['previous_20_recorded','guard_not_recorded','no_partial_guard',
    'active_credit_disabled','devotional_credit_disabled','ledger_empty','wallets_zero','no_e2e_sites']) {
    assert.ok(pre.includes(required),required);
  }
  assert.match(pre,/count\(\*\) = 20/);
  assert.ok(wf.includes('node scripts/classify-points-development-guard-preflight.mjs'));
  assert.ok(wf.includes('echo "mode=$mode" >> "$GITHUB_OUTPUT"'));
  assert.match(pre,/count\(\*\) = 0 from pg_constraint/);
  assert.doesNotMatch(pre,/\b(?:update|delete|insert|alter|drop|truncate|grant|revoke)\s+(?:into|table|from|public|supabase)/i);
});
test('postflight verifies both validated and complete CHECK constraints, true ledger receipt, zero economic credit',()=>{
  for(const required of ['unverified_active_credit_denied','devotion_self_report_credit_denied','migration_recorded','ledger_empty','wallets_zero'])assert.ok(post.includes(required),required);
  assert.equal((post.match(/c\.contype = 'c' and c\.convalidated/g)||[]).length,2);
  assert.equal((post.match(/pg_get_expr\(c\.conbin,c\.conrelid\)/g)||[]).length,2);
  assert.match(post,/rule_id <> ''active''::text/);
  assert.match(post,/adapter <> ''devotion_self_report''::text/);
  assert.doesNotMatch(post,/\b(?:update|delete|insert|alter|drop|truncate|grant|revoke)\s+(?:into|table|from|public|supabase)/i);
});

const common={
  required_tables:true,previous_20_recorded:true,
  active_credit_disabled:true,devotional_credit_disabled:true,
  ledger_empty:true,wallets_zero:true,no_e2e_sites:true,
};
const fresh={...common,guard_not_recorded:true,guard_recorded:false,
  no_partial_guard:true,guards_verified:false};
const installed={...common,guard_not_recorded:false,guard_recorded:true,
  no_partial_guard:false,guards_verified:true};

test('owner-gated workflow accepts exactly fresh or fully verified installed guards',()=>{
  assert.equal(REQUIRED_FLAGS.length,11);
  assert.equal(classifyPointsDevelopmentGuardPreflight([fresh]),'fresh');
  assert.equal(classifyPointsDevelopmentGuardPreflight([installed]),'already_applied');
  assert.equal(wf.split("if: steps.preflight.outputs.mode == 'fresh'").length-1,2);
  assert.ok(wf.includes('Verify development CHECK validity, migration history and zero economic credit'));
});
test('missing, weak, partial or economically unsafe DEV guard always blocks',()=>{
  const installedInvalid=[
    {guard_recorded:false},{guard_not_recorded:true},{no_partial_guard:true},
    {guards_verified:false},{ledger_empty:false},{wallets_zero:false},
    {active_credit_disabled:false},{devotional_credit_disabled:false},
    {previous_20_recorded:false},{required_tables:false},{no_e2e_sites:false},
  ];
  for (const change of installedInvalid) {
    assert.throws(()=>classifyPointsDevelopmentGuardPreflight([{...installed,...change}]),/POINTS_DEV_GUARD_/);
  }
  for(const change of [
    {guard_recorded:true},{guard_not_recorded:false},
    {no_partial_guard:false},{guards_verified:true},
  ]) assert.throws(()=>classifyPointsDevelopmentGuardPreflight([{...fresh,...change}]),/POINTS_DEV_GUARD_/);
  for(const malformed of [[],{},[fresh,installed],[{...installed,unexpected:true}],
    [{...installed,guards_verified:'true'}]]) {
    assert.throws(()=>classifyPointsDevelopmentGuardPreflight(malformed),/POINTS_DEV_GUARD_/);
  }
});
test('read-only preflight recognizes only actual validated canonical checks, and keeps original migration pin',()=>{
  for(const key of ['guard_recorded','guard_not_recorded','no_partial_guard','guards_verified'])
    assert.ok(pre.includes(key),key);
  assert.ok(pre.includes("version <> '20261108224500'"));
  assert.ok(pre.includes("name = 'ekodi_points_nonverified_reward_guard'"));
  assert.equal(pre.split("c.contype = 'c' and c.convalidated").length-1,2);
  assert.equal(pre.split('pg_get_expr(c.conbin,c.conrelid)').length-1,2);
  assert.match(pre,/count\(\*\) = 20/);
  assert.match(wf,/MIGRATION_GIT_BLOB: 17a1003aa5968c4a7a4914684a144abf5b462ce6/);
  assert.ok(wf.includes('OWNER_CONFIRMS_DEV_ONLY'));
  assert.equal(wf.split('read_only:false').length-1,1);
});
