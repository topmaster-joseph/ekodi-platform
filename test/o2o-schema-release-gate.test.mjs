import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const workflow=readFileSync(new URL('../.github/workflows/deploy-o2o-qr-schema.yml',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261103165945_o2o_tenant_operator_qr.sql',import.meta.url));
const expectedBlob='c8f0059877222fa4c829624110b8ec12fbc91218';
const count=needle=>workflow.split(needle).length-1;

test('pinned additive QR migration and exact commit proof cannot be silently replaced',()=>{
  const blob=createHash('sha1').update('blob '+migration.length+'\0').update(migration).digest('hex');
  assert.equal(blob,expectedBlob,'migration SQL must match the reviewed blob');
  assert.ok(workflow.includes('MIGRATION_BLOB_SHA: '+expectedBlob));
  assert.equal(count('test "$(git hash-object "$MIGRATION")" = "$MIGRATION_BLOB_SHA"'),2,
    'validate and protected promotion must pin migration bytes');
  assert.ok(workflow.includes('test "$GITHUB_REF" = \'refs/heads/main\''));
  assert.ok(workflow.includes('test "$GITHUB_SHA" = "$EXPECTED_SHA"'));
  assert.ok(workflow.includes('test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"'));
  assert.equal(count('test "$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/main" --jq \'.object.sha\')" = "$EXPECTED_SHA"'),2,
    'before and after DEV, the protected release must verify current main');
});

test('promotion requires orchestrator receipt, production environment and manual dispatch',()=>{
  assert.ok(workflow.includes("if: github.event_name == 'workflow_dispatch'"));
  assert.ok(workflow.includes('environment: production'));
  assert.ok(workflow.includes('authority == "ekodi-orchestrator"'));
  assert.ok(workflow.includes('.authorized == true'));
  assert.ok(workflow.includes('test "$'+'{RELEASE_BRANCH##*/}" = "$RELEASE_TASK"'));
  assert.ok(workflow.includes('not has_table_privilege'));
  assert.ok(workflow.includes('anon_issue_denied'));
  assert.ok(workflow.includes('anon_resolve_available'));
});

test('DEV fast path skips writes only for installed schema, never partial state',()=>{
  assert.equal(count('query "$DEV_PROJECT" "$scratch/dev-installed.sql" true "$scratch/dev-installed.json"'),1);
  assert.ok(workflow.includes("to_regclass('public.o2o_campaign_links') is not null as links"));
  assert.ok(workflow.includes("to_regclass('public.o2o_campaign_audit') is not null as audit"));
  assert.ok(workflow.includes("to_regprocedure('public.o2o_operator_issue(uuid,text,text,text,timestamptz)') is not null as issue_rpc"));
  assert.ok(workflow.includes('all(.[]; . == true)'));
  assert.ok(workflow.includes('all(.[]; . == false)'));
  const skip=workflow.indexOf('DEV O2O schema already present. Run full read-only proof');
  const apply=workflow.indexOf('query "$DEV_PROJECT" "$MIGRATION" false "$scratch/dev-applied.json"');
  const partial=workflow.indexOf('DEV O2O schema is partially installed. Manual authorized reconciliation required.');
  const proof=workflow.indexOf('query "$DEV_PROJECT" "$scratch/proof.sql" true "$scratch/dev-proof.json"');
  const afterDevSha=workflow.lastIndexOf('test "$GITHUB_SHA" = "$EXPECTED_SHA"');
  const prod=workflow.indexOf('query "$PROD_PROJECT" "$MIGRATION" false "$scratch/prod-applied.json"');
  assert.ok(skip>0&&apply>skip&&partial>apply&&proof>partial&&afterDevSha>proof&&prod>afterDevSha,
    'partial schema must halt and DEV full proof plus SHA check must precede PROD');
  assert.equal(count('query "$DEV_PROJECT" "$MIGRATION" false "$scratch/dev-applied.json"'),1);
  assert.equal(count('query "$PROD_PROJECT" "$MIGRATION" false "$scratch/prod-applied.json"'),1);
  assert.ok(workflow.includes('query "$PROD_PROJECT" "$scratch/proof.sql" true "$scratch/prod-proof.json"'));
});
