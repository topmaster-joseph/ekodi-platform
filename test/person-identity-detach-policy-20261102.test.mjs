import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {auditMigrationText} from '../scripts/validate-supabase-public-grants.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const MIGRATION='supabase/migrations/20261102010000_person_identity_detach.sql';

// Rehearsed on PGlite (PostgreSQL 17): bare/spoofed/reused guard settings refused,
// policy, owner, current, primary, last-login and financial refusals, exact move, audit, anon denied.

test('detach migration: service_role only, guard extended by an approved detachment row only',async()=>{
  const sql=await read(MIGRATION);
  assert.deepEqual(auditMigrationText(sql,MIGRATION),[]);
  assert.match(sql,/alter table public\.person_identity_detachments enable row level security/);
  const guard=sql.slice(sql.indexOf('create or replace function public.block_unreviewed_person_reparent'),sql.indexOf('revoke all on function public.block_unreviewed_person_reparent'));
  assert.match(guard,/d\.status = 'approved'\s+and d\.identity_id = old\.id\s+and d\.person_id = old\.person_id\s+and d\.new_person_id = new\.person_id/);
  assert.match(guard,/r\.status = 'approved'/,'merge path kept');
  for(const name of ['person_identity_detach','person_identity_detach_preview']){
    assert.match(sql,new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated`));
    assert.match(sql,new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to service_role`));
  }
  const fn=sql.slice(sql.indexOf('create or replace function public.person_identity_detach(p_identity uuid, p_actor uuid'));
  for(const code of ['policy_acknowledgement_required','detach_owner_required','detach_current_login','detach_primary_login','detach_last_login','detach_financial_records'])
    assert.match(fn,new RegExp(`'${code}'`));
});

test('policy v1 is acknowledged before merge and detach, server-side',async()=>{
  const fedSrc=await read('auth-site/federated-login.js');
  assert.match(fedSrc,/export const MERGE_POLICY_VERSION = 'merge-policy-v1'/);
  assert.match(fedSrc,/자동 해지·환불·분할하지 않습니다/);
  const api=await read('supabase/functions/identity-api/index.ts');
  assert.match(api,/const MERGE_POLICY_VERSION="merge-policy-v1"/);
  const exec=api.slice(api.indexOf('async function executeMergeRequest'),api.indexOf('async function ownIdentity'));
  assert.ok(exec.indexOf('policyAcknowledged')<exec.indexOf('person_merge_execute'));
  assert.match(api,/admin\.rpc\("person_identity_detach",\{p_identity:identityId,p_actor:userId,p_policy:MERGE_POLICY_VERSION\}\)/);
  const fed=await read('auth-site/federated-login.js');
  assert.match(fed,/body: JSON\.stringify\(\{ policy: MERGE_POLICY_VERSION \}\)/);
  assert.match(fed,/merge\.disabled = !policy\.check\.checked/);
  const hub=await read('auth-site/auth.js');
  assert.match(hub,/\/detach-preview`/);
  assert.match(hub,/if\(!item\.is_current&&!item\.is_primary\)/);
  assert.doesNotMatch(hub.slice(hub.indexOf('async function openDetach')),/innerHTML/);
});
