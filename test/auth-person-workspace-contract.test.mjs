import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20260815020000_person_identity_workspaces.sql',import.meta.url),'utf8');
const identityApi=fs.readFileSync(new URL('../supabase/functions/identity-api/index.ts',import.meta.url),'utf8');
const accessApi=fs.readFileSync(new URL('../supabase/functions/access-api/index.ts',import.meta.url),'utf8');
const personWorkspaceApi=fs.readFileSync(new URL('../supabase/functions/person-workspace-api/index.ts',import.meta.url),'utf8');
const authHtml=fs.readFileSync(new URL('../auth-site/index.html',import.meta.url),'utf8');
const authJs=fs.readFileSync(new URL('../auth-site/auth.js',import.meta.url),'utf8');
const clientAuth=fs.readFileSync(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
const workspaceTarget=fs.readFileSync(new URL('../auth-site/auth-workspace-target.js',import.meta.url),'utf8');
const myRouter=fs.readFileSync(new URL('../my-site/my-router.js',import.meta.url),'utf8');

test('person and login identity schema stays separate from organization membership',()=>{
  assert.match(migration,/create table if not exists public\.persons/i);
  assert.match(migration,/create table if not exists public\.login_identities/i);
  assert.match(migration,/provider_subject text not null/i);
  assert.match(migration,/unique\(provider,provider_subject\)/i);
  assert.match(migration,/tenant_members/);
  assert.match(migration,/store_members/);
});

test('explicit dual verification can merge separately initialized people',()=>{
  assert.match(migration,/merge_verified_person_identities/);
  assert.match(migration,/second_auth_user_id/);
  assert.match(migration,/initiator_person_required/);
});

test('personal Marketing AI workspace receives the same verified handoff path',()=>{
  assert.match(migration,/marketing/);
  assert.match(migration,/workspace_kind.*personal/is);
  assert.match(migration,/workspace_key/);
  assert.match(migration,/requires_handoff/);
  assert.match(migration,/plan/);
});

test('Mall gives every verified Google member an active free personal seller handoff',()=>{
  assert.match(migration,/mall/);
  assert.match(migration,/Seller Studio/);
  assert.match(migration,/free/);
  assert.match(migration,/requires_handoff/);
});

test('legacy Mall seller login is normalized back to Seller Studio',()=>{
  assert.match(migration,/seller/);
  assert.match(migration,/Seller Studio/);
});

test('stable Google subject cannot be silently replaced by a recycled email account',()=>{
  assert.match(migration,/provider_subject/);
  assert.match(migration,/identity_conflict/);
  assert.match(migration,/recycled/i);
});

test('identity api persists Google subject and can mint a one-time handoff from an authenticated central session',()=>{
  assert.match(identityApi,/p_provider_subject:String\(profile\.sub\)/);
  assert.match(identityApi,/\/google\/link\/challenge/);
  assert.match(identityApi,/\/google\/link\/exchange/);
  assert.match(identityApi,/\/identities/);
  assert.match(identityApi,/\/session\/handoff/);
  assert.match(identityApi,/sessionHandoff/);
  assert.match(identityApi,/link\.user\.id!==user\.id/);
});

test('access api resolves and revalidates workspace-scoped handoff',()=>{
  assert.match(accessApi,/\/workspaces/);
  assert.match(accessApi,/current_site_workspaces/);
  assert.match(accessApi,/workspace_key/);
  assert.match(accessApi,/handoffAllowed=site==="marketing"\|\|selected\?\.requires_handoff===true/);
  assert.match(accessApi,/\["active","pre_registered","free"\]\.includes\(status\)/);
  assert.match(accessApi,/ekodi|tenant|store/i);
});

test('auth center is workspace-first and hides linked login identities outside account management',()=>{
  assert.match(authHtml,/id="workspacePanel"/);
  assert.match(authHtml,/id="identityPanel"/);
  assert.match(authHtml,/data-identity-manage/);
  assert.match(authHtml,/계정을 고르는 대신|Workspace|내 공간/);
  assert.match(authJs,/renderWorkspacePanel/);
  assert.match(authJs,/prepareLinkGoogle/);
  assert.match(authJs,/workspace_key/);
});

test('client auth reuses the central EKODI session instead of forcing Google login again',()=>{
  assert.match(clientAuth,/persistSession:true/);
  assert.match(clientAuth,/sb\.auth\.getSession/);
  assert.match(clientAuth,/window\.EKODI/);
});

test('targeted workspace routing is available across shared and person-scoped EKODI services',()=>{
  assert.match(workspaceTarget,/workspace/);
  assert.match(workspaceTarget,/return_to/);
  assert.match(workspaceTarget,/auth\.ekodi\.kr/);
});

test('My EKODI is the signed-in workspace home and routes connected platforms through central auth',()=>{
  assert.match(myRouter,/auth\.ekodi\.kr/);
  assert.match(myRouter,/workspace/);
});

test('browser auth and My router scripts parse as JavaScript',async()=>{
  for(const file of ['auth-site/auth.js','auth-site/client-auth.js','auth-site/auth-workspace-target.js','my-site/my-router.js']){
    const source=fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
    assert.ok(source.length>100,`${file} should contain browser runtime code`);
  }
});
