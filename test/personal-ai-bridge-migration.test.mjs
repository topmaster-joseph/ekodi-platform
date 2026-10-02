import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const identitySql=await readFile(new URL('../supabase/migrations/20260906007000_personal_ai_bridge_identity.sql',import.meta.url),'utf8');
const audienceSql=await readFile(new URL('../supabase/migrations/20260906008000_ekodi_mcp_oauth_audience.sql',import.meta.url),'utf8');
const resourceBoundSql=await readFile(new URL('../supabase/migrations/20260906009000_ekodi_mcp_resource_bound_audience.sql',import.meta.url),'utf8');
const activeConsentSql=await readFile(new URL('../supabase/migrations/20260906010000_ekodi_mcp_active_consent_audience.sql',import.meta.url),'utf8');
const leastPrivilegeSql=await readFile(new URL('../supabase/migrations/20260906011000_ekodi_oauth_least_privilege.sql',import.meta.url),'utf8');
const canonicalResourceSql=await readFile(new URL('../supabase/migrations/20260908193000_ekodi_mcp_canonical_resource.sql',import.meta.url),'utf8');
const durableGrantSql=await readFile(new URL('../supabase/migrations/20261002043000_ekodi_mcp_durable_resource_grant.sql',import.meta.url),'utf8');
const consentFallbackSql=await readFile(new URL('../supabase/migrations/20261002211500_ekodi_mcp_consent_fallback_identity.sql',import.meta.url),'utf8');

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

test('canonical MCP resource migration preserves approved legacy consent but emits only the apex audience',()=>{
  assert.match(canonicalResourceSql,/oa\.resource in \('https:\/\/ekodi\.kr\/mcp', 'https:\/\/api\.ekodi\.kr\/mcp'\)/i);
  assert.match(canonicalResourceSql,/claims := jsonb_set\(claims, '\{aud\}', to_jsonb\('https:\/\/ekodi\.kr\/mcp'::text\)/i);
  assert.match(canonicalResourceSql,/v_jwt->>'aud'.*https:\/\/ekodi\.kr\/mcp.*https:\/\/api\.ekodi\.kr\/mcp/is);
  assert.match(canonicalResourceSql,/revoke execute on function public\.ekodi_mcp_access_token_hook\(jsonb\) from authenticated, anon, public/i);
});

test('MCP OAuth resource grant survives authorization-code consumption without broadening consent',()=>{
  assert.match(durableGrantSql,/create table if not exists public\.ekodi_mcp_oauth_grants/i);
  assert.match(durableGrantSql,/check \(resource = 'https:\/\/ekodi\.kr\/mcp'\)/i);
  assert.match(durableGrantSql,/create trigger ekodi_capture_mcp_oauth_consent/i);
  assert.match(durableGrantSql,/after insert or update of revoked_at or delete on auth\.oauth_consents/i);
  assert.match(durableGrantSql,/from auth\.oauth_authorizations oa/i);
  assert.match(durableGrantSql,/oa\.resource = 'https:\/\/ekodi\.kr\/mcp'/i);
  assert.match(durableGrantSql,/oa\.expires_at > now\(\)/i);
  assert.match(durableGrantSql,/from public\.ekodi_mcp_oauth_grants g/i);
  assert.match(durableGrantSql,/from auth\.oauth_consents c/i);
  assert.match(durableGrantSql,/g\.revoked_at is null/i);
  assert.match(durableGrantSql,/c\.revoked_at is null/i);
  assert.match(durableGrantSql,/claims := jsonb_set\(claims, '\{aud\}', to_jsonb\('https:\/\/ekodi\.kr\/mcp'::text\)/i);
  assert.match(durableGrantSql,/revoke all on table public\.ekodi_mcp_oauth_grants from public, anon, authenticated/i);
  assert.match(durableGrantSql,/revoke execute on function public\.capture_ekodi_mcp_oauth_consent\(\) from authenticated, anon, public/i);
});


test('MCP identity fallback authorizes only active consent bound to durable canonical grant',()=>{
  assert.match(consentFallbackSql,/create or replace function public\.current_ekodi_mcp_identity\(\)/i);
  assert.match(consentFallbackSql,/from public\.ekodi_mcp_oauth_grants g/i);
  assert.match(consentFallbackSql,/join auth\.oauth_consents c/i);
  assert.match(consentFallbackSql,/g\.resource = 'https:\/\/ekodi\.kr\/mcp'/i);
  assert.match(consentFallbackSql,/g\.revoked_at is null/i);
  assert.match(consentFallbackSql,/c\.revoked_at is null/i);
  assert.match(consentFallbackSql,/g\.user_id = v_user_id/i);
  assert.match(consentFallbackSql,/g\.client_id = v_client_id/i);
  assert.match(consentFallbackSql,/grant execute on function public\.current_ekodi_mcp_identity\(\) to anon, authenticated/i);
});
