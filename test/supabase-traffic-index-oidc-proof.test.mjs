import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edge=await readFile(new URL('../supabase/functions/free-tier-usage/index.ts',import.meta.url),'utf8');
const proofMigration=await readFile(new URL('../supabase/migrations/20261003141307_supabase_traffic_index_oidc_proof.sql',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/deploy-supabase-traffic-index.yml',import.meta.url),'utf8');

test('traffic index proof stays service-role-only',()=>{
  assert.match(proofMigration,/ekodi_supabase_traffic_index_ready/);
  assert.match(proofMigration,/pg_catalog\.pg_indexes/);
  assert.match(proofMigration,/revoke all on function public\.ekodi_supabase_traffic_index_ready\(\) from public/);
  assert.match(proofMigration,/revoke all on function public\.ekodi_supabase_traffic_index_ready\(\) from anon/);
  assert.match(proofMigration,/revoke all on function public\.ekodi_supabase_traffic_index_ready\(\) from authenticated/);
  assert.match(proofMigration,/grant execute on function public\.ekodi_supabase_traffic_index_ready\(\) to service_role/);
});

test('GitHub OIDC edge endpoint exposes only the boolean traffic-index proof',()=>{
  assert.match(edge,/proof !== "traffic-index"/);
  assert.match(edge,/admin\.rpc\("ekodi_supabase_traffic_index_ready"\)/);
  assert.match(edge,/index_ready: indexReady/);
  assert.match(edge,/activity_message_campaigns_created_by_idx/);
  assert.doesNotMatch(edge,/database\/query/);
});

test('traffic index deployment uses OIDC proof when long-lived Supabase credentials are absent',()=>{
  assert.match(workflow,/id-token: write/);
  assert.match(workflow,/SUPABASE_DEPLOY_MODE=oidc-proof/);
  assert.match(workflow,/ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(workflow,/ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(workflow,/\?proof=traffic-index/);
  assert.match(workflow,/"index_ready":true/);
  assert.match(workflow,/SUPABASE_DEPLOY_MODE=management/);
});
