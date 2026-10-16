import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const workflow=read('.github/workflows/deploy-presence.yml');
const edge=read('supabase/functions/presence-attendance-api/index.ts');
const schema=read('supabase/migrations/20261011150000_presence_offline_core.sql');
const rpc=read('supabase/migrations/20261011150100_presence_api_functions.sql');

test('only a verified Orchestrator release may update production',()=>{
  assert.match(workflow,/node scripts\/validate-ekodi-ai-change-orchestration\.mjs --release/);
  assert.match(workflow,/node scripts\/validate-deployment-guardrails\.mjs/);
  assert.match(workflow,/merge_commit_sha == \$sha/);
  assert.match(workflow,/Release branch and task do not match/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/concurrency:/);
  assert.match(workflow,/cancel-in-progress: false/);
});
test('staging negative auth and migration proofs are before production write',()=>{
  const staging=workflow.indexOf('Apply and verify staged Presence schema');
  const canary=workflow.indexOf('Stage negative-auth canary');
  const preflight=workflow.indexOf('Verify both production tenant slugs');
  const write=workflow.indexOf('Apply approved additive schema to production');
  assert.ok(staging>0 && canary>staging && preflight>canary && write>preflight);
  assert.match(workflow,/raise exception 'presence table RLS missing'/);
  assert.match(workflow,/raise exception 'required production tenant slugs missing'/);
  assert.match(workflow,/guest.*== 401/);
});
test('self-managed EKODI release does not bypass auth or branch protection',()=>{
  assert.match(workflow,/gh workflow run deploy-ekodi-church-homepage.yml/);
  assert.match(workflow,/EKODI_RELEASE_TASK_ID/);
  assert.doesNotMatch(workflow,/functions deploy presence-attendance-api[^\n]*--no-verify-jwt/);
  assert.match(edge,/AUTH_REQUIRED/);
  assert.match(edge,/TENANT_NOT_ALLOWED/);
  assert.match(edge,/new Set\(\['ekodi-church','ekodimission'\]\)/);
  assert.match(schema,/enable row level security/);
  assert.match(rpc,/revoke all on function public\.presence_apply/);
});
test('client never receives service-role key and anonymous count cannot become identity',()=>{
  assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(read('space/ekodimission-presence.js'),/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(schema,/No biometric templates/);
  assert.match(read('space/ekodimission-presence.page'),/noindex,nofollow,noarchive/);
});
