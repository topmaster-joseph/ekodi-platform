import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const edge = await readFile(new URL('../supabase/functions/identity-api/index.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260829010000_modular_ekodi_identity.sql', import.meta.url), 'utf8');

test('identity gateway keeps legacy Google routes while exposing provider-neutral routes', () => {
  assert.match(edge, /path==="\/challenge"/);
  assert.match(edge, /path==="\/google\/exchange"/);
  assert.match(edge, /\/providers\/\(\[a-z0-9_-\]\+\)/);
  assert.match(edge, /GET"&&path==="\/providers"/);
  assert.match(edge, /enabledProvider\(provider\)/);
});

test('EKODI ID is stable, opaque and separate from provider identity', () => {
  assert.match(migration, /add column if not exists ekodi_id text/i);
  assert.match(migration, /'EKD-' \|\| upper\(replace\(id::text, '-', ''\)\)/i);
  assert.match(migration, /people_ekodi_id_uidx/i);
  assert.match(edge, /ekodiIdForPerson/);
  assert.doesNotMatch(migration, /ekodi_id[^\n]*(email|provider_subject)/i);
});

test('provider registry is modular but only Google is enabled by default', () => {
  assert.match(migration, /create table if not exists public\.identity_providers/i);
  assert.match(migration, /\('google', 'Google', 'google_identity_services', true/i);
  for (const provider of ['kakao', 'naver', 'apple', 'microsoft', 'passkey']) {
    assert.match(migration, new RegExp(`\\('${provider}',[^\\n]+ false, true, true`, 'i'));
  }
});

test('disconnect guard preserves at least one login identity and blocks current identity removal', () => {
  assert.match(migration, /last_identity_cannot_disconnect/);
  assert.match(migration, /current_identity_cannot_disconnect/);
  assert.match(edge, /disconnect_person_identity/);
  assert.match(edge, /req\.method==="DELETE"/);
});

test('identity challenges are provider-scoped and audit events are private', () => {
  assert.match(migration, /add column if not exists provider text not null default 'google'/i);
  assert.match(migration, /identity_audit_logs/i);
  assert.match(migration, /revoke all on table public\.identity_audit_logs from anon, authenticated/i);
  assert.match(edge, /\.eq\("provider",provider\)/);
  assert.match(edge, /identity\.login/);
  assert.match(edge, /identity\.linked/);
});
