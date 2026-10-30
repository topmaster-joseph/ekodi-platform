import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const wf = read('.github/workflows/deploy-human-author-schema.yml');
const migration = read('supabase/migrations/20261028010000_human_author_membership_writing.sql');
const pre = read('scripts/sql/human-author-release-preflight.sql');
const post = read('scripts/sql/human-author-release-postflight.sql');

test('Human Author release never runs on a plain push or an unreviewed PR',()=>{
  assert.match(wf,/workflow_dispatch:/);
  assert.match(wf,/if: github\.event_name == 'workflow_dispatch'/);
  assert.match(wf,/environment: production/);
  assert.match(wf,/permissions:\s*\n  contents: read/);
  assert.doesNotMatch(wf,/^  push:/m);
  assert.match(wf,/release_branch_ref:\s*\n[^]*?required: true/);
  assert.match(wf,/release_task_id:\s*\n[^]*?required: true/);
  assert.match(wf,/expected_main_sha:\s*\n[^]*?required: true/);
});

test('Exact main SHA, receipt, restricted project and dev security gate precede writes',()=>{
  const security = [
    'test "$GITHUB_REF" = "refs/heads/main"',
    'test "$GITHUB_SHA" = "$EXPECTED_SHA"',
    'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
    'git merge-base --is-ancestor f9f0a95170090648c620b97dba30a5e0867160df "$EXPECTED_SHA"',
    'fetch-depth: 0',
    'b3cdf0e9296ac7c4ac402d7fa0d56ced88ab3761',
    'test "${RELEASE_BRANCH##*/}" = "$RELEASE_TASK"',
    'release-receipt?taskId=',
    '.authorized == true',
    '.authority == "ekodi-orchestrator"',
    'Production Supabase token missing',
    'Development security baseline passed',
    'already_installed=false',
    'Verify production privacy, RLS, entitlements and owner-only RPC',
  ];
  for(const fragment of security)assert.ok(wf.includes(fragment),fragment);
  assert.ok(wf.indexOf('Verify development schema is secured') < wf.indexOf('Apply the one reviewed'));
  assert.ok(wf.indexOf('Detect existing production state') < wf.indexOf('Apply the one reviewed'));
  assert.ok(wf.indexOf('Apply the one reviewed') < wf.indexOf('Verify production privacy'));
  assert.ok(wf.includes('jq -Rs'), 'only files from checked-out protected revision are executed');
  assert.ok(!wf.includes('--no-verify-jwt'));
});

test('Signed orchestrator receipt GET uses valid curl fail-with-body arguments',()=>{
  const receiptLine=wf.split('\n').find(line=>line.includes('release-receipt?taskId='));
  assert.ok(receiptLine, 'signed receipt endpoint must be used');
  assert.match(wf,/curl --fail-with-body -sS --max-time 20/);
  assert.doesNotMatch(wf,/curl --fail-with-body\s+-[^\n]*f/, 'curl -f conflicts with --fail-with-body');
  assert.match(wf,/\.authorized == true and \.authority == "ekodi-orchestrator"/);
});

test('Migration is additive, paid entitlements fail closed, and interview records are private',()=>{
  assert.doesNotMatch(migration,/\b(?:drop\s+table|truncate\s+table|alter\s+table\s+[^;]*drop\s+column)\b/i);
  for (const term of ['enable row level security','human_author_subscriptions','human_author_enrollments',
  'human_author_interview_turns','verified_paid_human_subscription_required',
  'pg_advisory_xact_lock','human_author_reserve_project','revoke all on public.human_author_subscriptions',
  'revoke all on public.human_author_enrollments'])assert.ok(migration.includes(term),term);
  assert.match(migration,/revoke all on function public\.human_author_reserve_project/);
});

test('Preflight rejects partial migrations and postflight checks actual ACL / RLS',()=>{
  for(const term of ['author_projects','author_chapters','author_memberships','fresh','already_installed'])assert.ok(pre.includes(term),term);
  for(const term of ['all_rls','owner_policies','subscriptions_write_denied','enrollments_write_denied','anon_read_denied',
  'anon_rpc_denied','paid_proof_required','user_owner_enforced'])assert.ok(post.includes(term),term);
  assert.match(wf,/\.\[0\]\.fresh == true or \.\[0\]\.already_installed == true/);
  assert.match(wf,/all\(\.\[\]; \. == true\)/);
});
