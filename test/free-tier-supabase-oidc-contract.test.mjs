import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edge=await readFile(new URL('../supabase/functions/free-tier-usage/index.ts',import.meta.url),'utf8');
const migration=await readFile(new URL('../migrations/0101_free_tier_usage_rpc.sql',import.meta.url),'utf8');
const config=JSON.parse(await readFile(new URL('../config/free-tier-supabase-oidc.json',import.meta.url),'utf8'));

test('Supabase telemetry edge function accepts only GitHub Actions main-branch OIDC',()=>{
  assert.match(edge,/token\.actions\.githubusercontent\.com/);
  assert.match(edge,/ekodi-free-tier-governor/);
  assert.match(edge,/topmaster-joseph\/ekodi-platform/);
  assert.match(edge,/refs\/heads\/main/);
  assert.match(edge,/\["push", "schedule", "workflow_dispatch"\]/);
  assert.match(edge,/jwtVerify\(/);
  assert.doesNotMatch(edge,/SUPABASE_ANON_KEY/);
});

test('quota telemetry RPC returns aggregates only and is service-role-only',()=>{
  assert.match(migration,/pg_database_size\(current_database\(\)\)/);
  assert.match(migration,/storage\.objects/);
  assert.match(migration,/revoke all on function public\.ekodi_free_tier_usage\(\) from anon/);
  assert.match(migration,/revoke all on function public\.ekodi_free_tier_usage\(\) from authenticated/);
  assert.match(migration,/grant execute on function public\.ekodi_free_tier_usage\(\) to service_role/);
  assert.doesNotMatch(migration,/email|user_id|tenant_id|person_id/i);
});

test('OIDC project registry contains only explicit public endpoint metadata',()=>{
  assert.equal(config.audience,'ekodi-free-tier-governor');
  assert.equal(config.repository,'topmaster-joseph/ekodi-platform');
  assert.equal(config.requiredRef,'refs/heads/main');
  assert.equal(config.projects.length,2);
  for(const project of config.projects){
    assert.match(project.ref,/^[a-z]{20}$/);
    assert.equal(project.usageEndpoint,`https://${project.ref}.supabase.co/functions/v1/free-tier-usage`);
  }
});
