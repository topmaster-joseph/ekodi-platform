import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

const migration=read('supabase/migrations/20260815020000_person_identity_workspaces.sql');
const mergeMigration=read('supabase/migrations/20260815021000_explicit_identity_merge.sql');
const personalHandoffMigration=read('supabase/migrations/20260815022000_personal_marketing_handoff.sql');
const takeoverGuardMigration=read('supabase/migrations/20260815023000_identity_subject_takeover_guard.sql');
const mallHandoffMigration=read('supabase/migrations/20260815030000_mall_free_personal_workspace.sql');
const identityApi=read('supabase/functions/identity-api/index.ts');
const accessApi=read('supabase/functions/access-api/index.ts');
const workspaceApi=read('supabase/functions/workspace-api/index.ts');
const authJs=read('auth-site/auth.js');
const clientAuth=read('auth-site/client-auth.js');
const authTarget=read('auth-site/auth-workspace-target.js');
const authRouter=read('auth-site/auth-router.js');
const authHtml=read('auth-site/index.html');
const marketingOnboarding=read('auth-site/marketing-onboarding.js');
const myHtml=read('my/index.html');
const myApp=read('my/app.js');

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

test('Mall gives every verified Google member an active free personal seller handoff',()=>{
  assert.match(mallHandoffMigration,/p_site_key = 'mall'/i);
  assert.match(mallHandoffMigration,/'개인 판매자'/i);
  assert.match(mallHandoffMigration,/'member'[\s\S]*'active'[\s\S]*'free'/i);
  assert.match(mallHandoffMigration,/true,[\s\S]*'synthetic'/i);
});

test('legacy Mall seller login is normalized back to Seller Studio',()=>{
  assert.match(authRouter,/'mall-seller':'mall'/);
  assert.match(authRouter,/requestedSite==='mall-seller'/);
  assert.match(authRouter,/https:\/\/mall\.ekodi\.kr\/seller\//);
  assert.match(authHtml,/auth-router\.js\?v=20260815-mall-seller-return-1&cb=20260816-admin-fedcm-button-1&workspace=20260817-sso-1&entry=20260817-workspace-entry-1/);
});

test('stable Google subject cannot be silently replaced by a recycled email account',()=>{
  assert.match(takeoverGuardMigration,/identity_subject_conflict/i);
  assert.match(takeoverGuardMigration,/identity_subject_requires_relink/i);
  assert.match(takeoverGuardMigration,/target_identity_subject_conflict/i);
  assert.match(takeoverGuardMigration,/login_identities_one_active_primary_idx/i);
  assert.match(takeoverGuardMigration,/revoke all on table public\.people, public\.login_identities from anon, authenticated/i);
  assert.match(takeoverGuardMigration,/comment on function public\.link_person_identity\(uuid,uuid,text,text,text,text\)/i);
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
  assert.match(accessApi,/selected\.requires_handoff/);
  assert.match(accessApi,/ekodi|tenant|store/i);
});

test('person workspace api aggregates verified workspaces for open SSO services',()=>{
  assert.match(workspaceApi,/OPEN_SSO_ORIGINS/);
  assert.match(workspaceApi,/social:\["https:\/\/social\.ekodi\.kr"\]/);
  assert.match(workspaceApi,/energy:\["https:\/\/energy\.ekodi\.kr"\]/);
  assert.match(workspaceApi,/PERSON_WORKSPACE_SITES/);
  assert.match(workspaceApi,/current_site_workspaces/);
  assert.match(workspaceApi,/workspace_scope:"person"/);
  assert.match(workspaceApi,/workspace_access_required/);
  assert.match(workspaceApi,/identity-api/);
  assert.doesNotMatch(workspaceApi,/SUPABASE_SERVICE_ROLE_KEY/);
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

test('Marketing workspace labels are separated and stale assets are force-refreshed',()=>{
  assert.match(authHtml,/auth-workspaces\.css\?v=20260817-workspace-label-1/);
  assert.match(authHtml,/entry=20260817-workspace-entry-1/);
  assert.match(authRouter,/marketing-auth-hotfix\.js\?v=20260817-workspace-entry-1/);
  assert.match(authRouter,/marketing-onboarding\.js\?v=20260817-workspace-label-1/);
  assert.match(marketingOnboarding,/parts\.slice\(0,2\)/);
  assert.match(marketingOnboarding,/workspace-name/);
});

test('central auth directly honors a requested verified Social or Energy workspace',()=>{
  assert.match(authJs,/social:\{name:'EKODI Social'/);
  assert.match(authJs,/energy:\{name:'EKODI Energy AI'/);
  assert.match(authJs,/PERSON_SCOPED_SITES=new Set\(\['social','energy'\]\)/);
  assert.match(authJs,/SERVICE_API=PERSON_SCOPED_SITES\.has\(site\)\?PERSON_WORKSPACE:ACCESS/);
  assert.match(authJs,/requestedWorkspace=String\(params\.get\('workspace'\)/);
  assert.match(authJs,/authorized\.find\(item=>item\.workspace_key===requestedWorkspace\)/);
  assert.match(authJs,/window\.__EKODI_WORKSPACE_ROUTING=true/);
  assert.match(authTarget,/window\.__EKODI_WORKSPACE_ROUTING/);
});

test('client auth reuses the central EKODI session instead of forcing Google login again',()=>{
  assert.match(clientAuth,/persistSession:true/);
  assert.match(clientAuth,/sb\.auth\.getSession/);
  assert.match(clientAuth,/\/session\/handoff/);
  assert.match(clientAuth,/sb\.auth\.verifyOtp/);
  assert.match(clientAuth,/handoffExistingSession/);
});

test('targeted workspace routing is available across shared and person-scoped EKODI services',()=>{
  for(const site of ['marketing','biz','books','church','lab','mall','social','energy'])assert.match(authTarget,new RegExp(`${site}:`));
  assert.match(authRouter,/targetableWorkspaceSites/);
  assert.match(authRouter,/auth-workspace-target\.js\?v=20260817-all-sites-1/);
  assert.match(authTarget,/PERSON_WORKSPACE/);
  assert.match(authTarget,/PERSON_SCOPED_SITES/);
  assert.match(authTarget,/workspace_key:requested/);
});

test('My EKODI is the signed-in workspace home and routes connected platforms through central auth',()=>{
  assert.match(myHtml,/SIGNED-IN HOME · WORKSPACE ROUTER/);
  assert.match(myHtml,/id="workspaceSwitcher"/);
  assert.match(myHtml,/id="recommendationList"/);
  assert.match(myApp,/ekodi_my_active_workspace/);
  assert.match(myApp,/https:\/\/auth\.ekodi\.kr\//);
  assert.match(myApp,/searchParams\.set\('workspace'/);
  assert.match(myApp,/setActiveWorkspace/);
  assert.match(myApp,/recommendationUi/);
});

test('browser auth and My router scripts parse as JavaScript',()=>{
  for(const path of ['auth-site/auth.js','auth-site/client-auth.js','auth-site/auth-router.js','auth-site/auth-workspace-target.js','auth-site/marketing-onboarding.js','my/app.js']){
    const result=spawnSync(process.execPath,['--check',new URL(`../${path}`,import.meta.url).pathname],{encoding:'utf8'});
    assert.equal(result.status,0,`${path}\n${result.stderr||result.stdout}`);
  }
});
