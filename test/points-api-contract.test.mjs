import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../supabase/functions/points-api/index.ts', import.meta.url), 'utf8');
test('points endpoint is read only and rejects unauthenticated access', () => {
  assert.match(src, /req\.method !== "GET"/);
  assert.match(src, /bearer\.startsWith\("Bearer "\)/);
  assert.match(src, /db\.auth\.getUser\(jwt\)/);
  assert.doesNotMatch(src, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
test('points history is constrained to canonical EKODI person and enabled site', () => {
  assert.match(src, /from\("login_identities"\)/);
  assert.match(src, /eq\("auth_user_id", auth\.user\.id\)/);
  assert.match(src, /from\("people"\)/);
  assert.match(src, /eq\("status", "active"\)/);
  assert.match(src, /eq\("enabled", true\)/);
  assert.match(src, /eq\("user_id", personId\)/);
  assert.doesNotMatch(src, /\.eq\("email"/);
});
test('API does not return evidence metadata or private contact details', () => {
  assert.match(src, /select\("id,amount,event_kind,rule_id,created_at"\)/);
  assert.doesNotMatch(src, /select\("[^"]*metadata/);
  assert.match(src, /limit\(limit\)/);
  assert.match(src, /Math\.min\(50, limitRaw\)/);
});

test('sites discovery only returns enabled point sites to a verified member', () => {
  assert.match(src, /path === "\/sites"/);
  assert.match(src, /\.eq\("enabled", true\)/);
  assert.match(src, /resolvePerson\(bearer\.slice\(7\)\)/);
});

test('points API accepts only canonical apex and actual development staging origins', () => {
  assert.match(src, /"https:\/\/ekodi\.kr"/);
  assert.match(src, /"https:\/\/ekodi-my-staging\.ekodi-development\.workers\.dev"/);
  assert.doesNotMatch(src, /topmaster-joseph\.workers\.dev/);
  assert.match(src, /if \(!ORIGINS\.has\(req\.headers\.get\("Origin"\) \|\| ""\)\)/);
});

test('Supabase Edge Function exposes member history only; admin policy is EKODI-only', () => {
  assert.doesNotMatch(src, /\/admin\/overview|platform_admin|from\("profiles"\)/);
  assert.match(src, /resolvePerson\(bearer\.slice\(7\)\)/);
  assert.match(src, /path !== "\/" && path !== "\/me" && path !== "\/sites"/);
  assert.doesNotMatch(src, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
