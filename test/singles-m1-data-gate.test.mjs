import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const api=await readFile(new URL('../supabase/functions/singles-api/index.ts',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/20261009110011_singles_m1_enrollment_isolation_20261009.sql',import.meta.url),'utf8');
const worker=await readFile(new URL('../singles-surface.js',import.meta.url),'utf8');
test('two independent feature gates block unapproved enrollment and matching',()=>{
  assert.match(worker,/SINGLES_M1_ENABLED.*'true'/);
  assert.match(api,/SINGLES_ONBOARDING_ENABLED.*"true"/);
  assert.match(worker,/matching_enabled:false,messaging_enabled:false,paid_brokerage_enabled:false/);
  assert.match(worker,/if\(!isEnabled\(env\)\)return json\(\{error:'singles_enrollment_not_launched'\},503\)/);
  assert.match(api,/if \(!enabled\(\)\) return reply\(req, \{ error: "singles_enrollment_not_launched" \}, 503\)/);
});
test('development schema is server-only, RLS enabled, and public discovery forced false',()=>{
  for(const name of ['singles_memberships','singles_sensitive_profiles','singles_public_cards','singles_consent_receipts']){
    assert.match(sql,new RegExp('create table if not exists public\\\\.'+name));
    assert.match(sql,new RegExp('alter table public\\\\.'+name+' enable row level security'));
  }
  assert.match(sql,/revoke all on table[\s\S]*from PUBLIC,anon,authenticated/);
  assert.match(sql,/discoverable boolean not null default false check\(discoverable = false\)/);
  assert.match(sql,/visibility text not null default 'private' check\(visibility = 'private'\)/);
  assert.match(sql,/encrypted_payload bytea/);
  assert.doesNotMatch(sql,/grant (?:select|all) [^\n]*to authenticated/i);
});
test('sensitive disclosure, role checks and self-asserted age do not create matching access',()=>{
  assert.match(api,/\.auth\.getUser\(bearer\)/);
  assert.match(api,/from\("login_identities"\)/);
  assert.match(api,/eq\("auth_user_id", userId\)/);
  assert.match(api,/unknown_field/);
  assert.match(api,/religion_consent_required_for_marriage/);
  assert.match(api,/discoverable: false/);
  assert.match(api,/status: "withdrawn"/);
  assert.doesNotMatch(api,/api\.openai\.com|generativelanguage\.googleapis|anthropic\.com/);
});
