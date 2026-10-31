import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const runner=readFileSync(new URL('../scripts/run-points-sql-smokes.mjs',import.meta.url),'utf8');
const wf=readFileSync(new URL('../.github/workflows/supabase-local-ci.yml',import.meta.url),'utf8');
test('points SQL smokes execute for real in the ephemeral Supabase CI job',()=>{
  assert.match(wf,/node scripts\/run-points-sql-smokes\.mjs --existing-schema/);
  assert.match(wf,/POINTS_SMOKE_DATABASE_URL: \$\{\{ env\.TEST_DB_URL \}\}/);
  assert.match(wf,/create database points_smoke_stub template template0/);
  assert.match(wf,/points_smoke_stub" node scripts\/run-points-sql-smokes\.mjs\n/);
  assert.match(runner,/scope === 'stub-only'/);
  for(const smoke of ['points-behavioral-smoke.sql','points-attendance-isolated-smoke.sql',
    'points-operator-isolated-smoke.sql','points-active-heartbeat-isolated-smoke.sql',
    'points-verified-referrals-isolated-smoke.sql','points-verified-referrals-positive-smoke.sql',
    'points-referral-hardening-isolated-smoke.sql','points-admin-governance-isolated-smoke.sql'])assert.ok(runner.includes(smoke),smoke);
});
test('runner never targets hosted Supabase and always rolls back',()=>{
  assert.match(runner,/renzehysxirjilvdxacv\|lxcxwbdwwojjkgybbqii/);
  assert.match(runner,/REFUSED: target holds point ledger rows/);
  assert.match(runner,/`BEGIN;\\n\$\{fixtures\}/);
  assert.match(runner,/\\nROLLBACK;\\n`/);
  assert.match(runner,/rollback residue rows before=/);
});
