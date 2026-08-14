import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const migration=read('supabase/migrations/20260815020000_person_identity_workspaces.sql');
const mergeMigration=read('supabase/migrations/20260815021000_explicit_identity_merge.sql');
const personalHandoffMigration=read('supabase/migrations/20260815022000_personal_marketing_handoff.sql');
const takeoverGuardMigration=read('supabase/migrations/20260815023000_identity_subject_takeover_guard.sql');
const identityApi=read('supabase/functions/identity-api/index.ts');
const accessApi=read('supabase/functions/access-api/index.ts');
const authJs=read('auth-site/auth.js');
const authHtml=read('auth-site/index.html');

test('person and login identity schema stays separate from organization membership',()=>{
  assert.match(migration,/create table if not exists public\.people/i);
  assert.match(migration,/create table if not exists public\.login_identities/i);
  assert.match(migration,/unique \(provider, provider_subject\)/i);
  assert.match(migration,/unique \(auth_user_id\)/i);
  assert.doesNotMatch(migration,/unique \(email\)/i);
  assert.match(migration,/current_site_workspaces/i);
  assert.match(migration,/current_site_access/i);
});

test('explicit dual verification can merge separately initialized people',()=>{
  assert.match(mergeMigration,/update public\.login_identities\s+set person_id = v_person_id/is);
  assert.match(mergeMigration,/status = 'merged'/i);
  assert.match(mergeMigration,/p_initiator_user_id/i);
  assert.match(mergeMigration,/p_provider_subject/i);
});

test('personal Marketing AI workspace receives the same verified handoff path',()=>{
  assert.match(personalHandoffMigration,/current_site_workspaces_base/i);
  assert.match(personalHandoffMigration,/workspace_kind' = 'personal'/i);
  assert.match(personalHandoffMigration,/'requires_handoff', true/i);
  assert.match(personalHandoffMigration,/'status', 'active'/i);
});

test('stable Google subject cannot be silently replaced by a recycled email account',()=>{
  assert.match(takeoverGuardMigration,/identity_subject_conflict/i);
  assert.match(takeoverGuardMigration,/identity_subject_requires_relink/i);
  assert.match(takeoverGuardMigration,/target_identity_subject_conflict/i);
  assert.match(takeoverGuardMigration,/login_identities_one_active_primary_idx/i);
  assert.match(takeoverGuardMigration,/revoke all on table public\.people, public\.login_identities from anon, authenticated/i);
  assert.match(takeoverGuardMigration,/comment on function public\.link_person_identity\(uuid,uuid,text,text,text,text\)/i);
});

test('identity api persists Google subject and supports linked Google accounts',()=>{
  assert.match(identityApi,/p_provider_subject:String\(profile\.sub\)/);
  assert.match(identityApi,/\/google\/link\/challenge/);
  assert.match(identityApi,/\/google\/link\/exchange/);
  assert.match(identityApi,/\/identities/);
  assert.match(identityApi,/Authorization/);
});

test('access api resolves and revalidates workspace-scoped handoff',()=>{
  assert.match(accessApi,/\/workspaces/);
  assert.match(accessApi,/current_site_workspaces/);
  assert.match(accessApi,/workspace_key/);
  assert.match(accessApi,/selected\.requires_handoff/);
  assert.match(accessApi,/ekodi|tenant|store/i);
});

test('auth center exposes workspace selection and account linking UI',()=>{
  assert.match(authHtml,/id="workspacePanel"/);
  assert.match(authHtml,/id="identityPanel"/);
  assert.match(authHtml,/Google 계정 추가/);
  assert.match(authJs,/renderWorkspacePanel/);
  assert.match(authJs,/prepareLinkGoogle/);
  assert.match(authJs,/workspace_key/);
});

test('auth center browser script parses as JavaScript',()=>{
  const result=spawnSync(process.execPath,['--check',new URL('../auth-site/auth.js',import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
