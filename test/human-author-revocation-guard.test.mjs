import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requiresHumanAuthorSchemaRelease } from '../scripts/lib/human-author-release-lane.mjs';

const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const workflow = read('.github/workflows/deploy-human-author-schema.yml');
const migration = read('supabase/migrations/20261029010000_human_author_revocation_guard.sql');
const probe = read('scripts/sql/human-author-revocation-postflight.sql');
const fixture = read('scripts/sql/human-author-dev-revocation-rollback.sql');

test('cancellation/expiry policy denies new premium replies but preserves owner history',()=>{
  assert.match(migration,/alter policy human_author_interview_owner_append/);
  for(const value of [
    'owner_user_id = (select auth.uid())',
    "e.writing_mode = 'human'",
    "e.status = 'active'",
    "s.status = 'active'",
    's.plan_id = e.plan_id',
    's.verified_payment_at is not null',
    's.paid_until > now()',
  ]) assert.ok(migration.includes(value),value);
  assert.doesNotMatch(migration,/\b(?:drop table|truncate|delete from|insert into|update public|grant|revoke|create table)\b/i);
  assert.doesNotMatch(migration,/human_author_interview_owner_read/);
  assert.match(probe,/owner_history_readable/);
  assert.match(probe,/revocation_guard/);
  assert.match(probe,/no_self_entitlement/);
});

test('orchestrator exact-SHA receipt lane includes only reviewed SQL and security probes',()=>{
  assert.ok(requiresHumanAuthorSchemaRelease(['supabase/migrations/20261029010000_human_author_revocation_guard.sql']));
  assert.ok(requiresHumanAuthorSchemaRelease(['scripts/sql/human-author-revocation-postflight.sql']));
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/if: github.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/test "\$GITHUB_SHA" = "\$EXPECTED_SHA"/);
  assert.ok(workflow.includes('release-receipt?taskId='));
  assert.ok(workflow.includes('a5139552064e3b134622e313cffade507c90a80d'));
  assert.ok(workflow.includes('b3cdf0e9296ac7c4ac402d7fa0d56ced88ab3761'));
  assert.match(workflow,/test "\$\(git hash-object "\$REVOKE_MIGRATION"\)"/);
  assert.ok(workflow.indexOf('Verify development revocation policy')<workflow.indexOf('Read-only production revocation preflight'));
  assert.ok(workflow.indexOf('Read-only production revocation preflight')<workflow.indexOf('Apply reviewed author-interview revocation policy'));
  assert.ok(workflow.indexOf('Apply reviewed author-interview revocation policy')<workflow.indexOf('Verify production revocation and historical read access'));
  assert.ok(workflow.includes("if: steps.revocation.outputs.installed == 'false'"));
  assert.match(workflow,/all\(\.\[\]; \. == true\)/);
  assert.doesNotMatch(workflow,/^  push:/m);
});

test('DEV-only synthetic test proves paid active, cancelled, expired, archived and resumed',()=>{
  assert.match(fixture,/DEV-ONLY/);
  assert.match(fixture,/NEVER run on production/);
  assert.match(fixture,/^begin;/m);
  assert.match(fixture,/^rollback;/m);
  assert.doesNotMatch(fixture,/^\s*commit\s*;/im);
  for(const name of ['cancelled_paid_append_bypass','expired_paid_append_bypass',
    'archived_project_append_bypass','renewed paid author could not append',
    'old draft lost after cancellation','old draft lost after archive',
    'synthetic_user_removed','synthetic_subscription_removed','synthetic_answers_removed']){
    assert.ok(fixture.includes(name),name);
  }
  assert.match(fixture,/exception when sqlstate '42501'/);
  assert.match(fixture,/DEV_HUMAN_AUTHOR_REVOKE_E2E_PASSED/);
});
