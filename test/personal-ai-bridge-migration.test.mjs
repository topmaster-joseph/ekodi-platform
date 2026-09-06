import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const identitySql=await readFile(new URL('../supabase/migrations/20260906007000_personal_ai_bridge_identity.sql',import.meta.url),'utf8');
const audienceSql=await readFile(new URL('../supabase/migrations/20260906008000_ekodi_mcp_oauth_audience.sql',import.meta.url),'utf8');
const resourceBoundSql=await readFile(new URL('../supabase/migrations/20260906009000_ekodi_mcp_resource_bound_audience.sql',import.meta.url),'utf8');
const activeConsentSql=await readFile(new URL('../supabase/migrations/20260906010000_ekodi_mcp_active_consent_audience.sql',import.meta.url),'utf8');
const leastPrivilegeSql=await readFile(new URL('../supabase/migrations/20260906011000_ekodi_oauth_least_privilege.sql',import.meta.url),'utf8');

test('canonical identity projection is authenticated-only and person based',()=>{
  assert.match(identitySql,/create or replace function public\.current_ekodi_identity\(\)/i);
  assert.match(identitySql,/join public\.people p on p\.id = li\.person_id/i);
  assert.match(identitySql,/where li\.auth_user_id = v_user_id/i);
  assert.match(identitySql,/revoke all on function public\.current_ekodi_identity\(\) from public, anon/i);
  assert.match(identitySql,/grant execute on function public\.current_ekodi_identity\(\) to authenticated/i);
  assert.doesNotMatch(identitySql,/where\s+.*email\s*=/i);
});

test('MCP token hook is narrowed to an active consent with an approved MCP resource request',()=>{
  assert.match(audienceSql,/claims->>'client_id'/i);
  assert.match(resourceBoundSql,/from auth\.oauth_authorizations oa/i);
  assert.match(activeConsentSql,/from auth\.oauth_consents c/i);
  assert.match(activeConsentSql,/c\.revoked_at is null/i);
  assert.match(activeConsentSql,/from auth\.oauth_authorizations oa/i);
  assert.match(activeConsentSql,/oa\.resource = 'https:\/\/api\.ekodi\.kr\/mcp'/i);
  assert.match(activeConsentSql,/oa\.status::text = 'approved'/i);
  assert.match(activeConsentSql,/if mcp_authorized then/i);
  assert.match(activeConsentSql,/claims->>'aud' = 'https:\/\/api\.ekodi\.kr\/mcp'/i);
  assert.match(activeConsentSql,/grant execute on function public\.ekodi_mcp_access_token_hook\(jsonb\) to supabase_auth_admin/i);
  assert.match(activeConsentSql,/revoke execute on function public\.ekodi_mcp_access_token_hook\(jsonb\) from authenticated, anon, public/i);
});

test('OAuth clients are isolated from the normal authenticated database role',()=>{
  assert.match(leastPrivilegeSql,/claims := jsonb_set\(claims, '\{role\}', to_jsonb\('anon'::text\)/i);
  assert.match(leastPrivilegeSql,/create or replace function public\.current_ekodi_mcp_identity\(\)/i);
  assert.match(leastPrivilegeSql,/v_jwt->>'client_id'/i);
  assert.match(leastPrivilegeSql,/v_jwt->>'aud'.*https:\/\/api\.ekodi\.kr\/mcp/i);
  assert.match(leastPrivilegeSql,/v_jwt->>'ekodi_ai_client'/i);
  assert.match(leastPrivilegeSql,/grant execute on function public\.current_ekodi_mcp_identity\(\) to anon/i);
  assert.match(leastPrivilegeSql,/revoke all on function public\.current_ekodi_mcp_identity\(\) from public, authenticated/i);
});
