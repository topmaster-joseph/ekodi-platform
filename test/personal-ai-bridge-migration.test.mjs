import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const identitySql=await readFile(new URL('../supabase/migrations/20260906007000_personal_ai_bridge_identity.sql',import.meta.url),'utf8');
const canonicalSql=await readFile(new URL('../supabase/migrations/20260920154500_retire_api_subdomain_mcp_resource.sql',import.meta.url),'utf8');

test('canonical identity projection is authenticated-only and person based',()=>{
  assert.match(identitySql,/create or replace function public\.current_ekodi_identity\(\)/i);
  assert.match(identitySql,/join public\.people p on p\.id = li\.person_id/i);
  assert.match(identitySql,/where li\.auth_user_id = v_user_id/i);
  assert.match(identitySql,/revoke all on function public\.current_ekodi_identity\(\) from public, anon/i);
  assert.match(identitySql,/grant execute on function public\.current_ekodi_identity\(\) to authenticated/i);
  assert.doesNotMatch(identitySql,/where\s+.*email\s*=/i);
});

test('MCP OAuth uses only the canonical apex resource and least-privilege role',()=>{
  assert.match(canonicalSql,/https:\/\/ekodi\.kr\/mcp/i);
  assert.match(canonicalSql,/claims := jsonb_set\(claims, '\{role\}', to_jsonb\('anon'::text\)/i);
  assert.match(canonicalSql,/from auth\.oauth_consents c/i);
  assert.match(canonicalSql,/from auth\.oauth_authorizations oa/i);
  assert.match(canonicalSql,/oa\.resource = 'https:\/\/ekodi\.kr\/mcp'/i);
  assert.match(canonicalSql,/claims := jsonb_set\(claims, '\{aud\}', to_jsonb\('https:\/\/ekodi\.kr\/mcp'::text\)/i);
  assert.match(canonicalSql,/grant execute on function public\.current_ekodi_mcp_identity\(\) to anon/i);
  assert.match(canonicalSql,/grant execute on function public\.ekodi_mcp_access_token_hook\(jsonb\) to supabase_auth_admin/i);
  assert.match(canonicalSql,/revoke execute on function public\.ekodi_mcp_access_token_hook\(jsonb\) from authenticated, anon, public/i);
});
