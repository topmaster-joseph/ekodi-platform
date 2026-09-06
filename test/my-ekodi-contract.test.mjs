import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('My EKODI is a unified private-first USER UI hub, not a second source of truth',async()=>{
  const [html,app,userAi]=await Promise.all([read('my/index.html'),read('my/app.js'),read('my/user-ai.js')]);
  assert.match(html,/data-ekodi-ui="USER"/);
  assert.match(html,/EKODI USER AI/);
  assert.match(html,/MY PLATFORMS/);
  assert.match(html,/MY SPACES/);
  assert.match(html,/내 선택이 우선/);
  assert.match(html,/공간별 데이터/);
  assert.match(app,/current_site_access/);
  assert.match(app,/current_site_workspaces/);
  assert.match(app,/creator_portfolio_items/);
  assert.doesNotMatch(app,/\.update\(\{visibility:/);
  assert.match(userAi,/boundary:'suggest-and-handoff'/);
  assert.match(userAi,/dependsOnExternalAI:false/);
  assert.match(userAi,/specialistDirectControl:false/);
});

test('My EKODI has one visible workspace selector path and no dead hidden controls',async()=>{
  const [html,app]=await Promise.all([read('my/index.html'),read('my/app.js')]);
  assert.match(html,/id="workspaceList"/);
  assert.doesNotMatch(html,/workspaceSwitcher|workspaceControl|refreshButton/);
  assert.doesNotMatch(app,/workspaceSwitcher|workspaceControl|refreshButton|function refresh\(/);
  assert.doesNotMatch(app,/function recommendationUi\(/);
});

test('My EKODI reuses central identity and inherits registry-driven one-login handoff',async()=>{
  const [app,auth,router]=await Promise.all([read('my/app.js'),read('auth-site/client-auth.js'),read('auth-site/auth-router.js')]);
  assert.match(app,/ekodi_token/);
  assert.match(app,/verifyOtp/);
  assert.match(auth,/'my':\{name:'My EKODI'/);
  assert.match(auth,/returnTo:'https:\/\/my\.ekodi\.kr\/'/);
  assert.match(auth,/\/session\/handoff/);
  assert.match(router,/isRegistryUserService/);
  assert.match(router,/site==='portal'\|\|isRegistryUserService/);
  assert.match(router,/loadClientAuth/);
});

test('My workspace selection updates context without forcing service navigation',async()=>{
  const app=await read('my/app.js');
  assert.match(app,/function workspaceDestination\(workspace\)/);
  assert.match(app,/requires_handoff/);
  assert.match(app,/function enterWorkspace\(key\)\{\s*setActiveWorkspace\(key\);\s*\}/);
  assert.doesNotMatch(app,/function enterWorkspace\(key\)\{[\s\S]{0,180}location\.assign/);
  assert.match(app,/data-workspace-key[\s\S]*enterWorkspace/);
  assert.match(app,/action=active/);
});

test('My keeps the active workspace when opening Social or Energy and when returning from their switchers',async()=>{
  const app=await read('my/app.js');
  assert.match(app,/OPEN_SSO_SITES=new Set\(\['social','energy'\]\)/);
  assert.match(app,/TARGETABLE_WORKSPACE_SITES=new Set\(\[[^\]]*'social','energy'/);
  assert.match(app,/\(!connected\(id\)&&!open\)/);
  assert.match(app,/current\.services\?\.includes\(id\)\|\|open/);
  assert.match(app,/workspace\.services\?\.includes\(contextual\.id\)\|\|OPEN_SSO_SITES\.has\(contextual\.id\)/);
  assert.match(app,/open\?'현재 Workspace를 유지한 채 바로 열 수 있는 공용 서비스입니다.'/);
});

test('Logged-out My EKODI reports zero connected platforms and does not count open SSO services as connected',async()=>{
  const app=await read('my/app.js');
  assert.match(app,/const connectedCount=session\?SERVICES\.filter\(\(\[id\]\)=>connected\(id\)\)\.length:0/);
  assert.match(app,/serviceCount'\)\.textContent=String\(connectedCount\)/);
  assert.doesNotMatch(app,/serviceCount'\)\.textContent=String\(SERVICES\.filter\(\(\[id\]\)=>connected\(id\)\|\|OPEN_SSO_SITES\.has\(id\)\)/);
});

test('My account center edits canonical person name and keeps linked Google identities separate',async()=>{
  const [html,app,profileApi]=await Promise.all([read('my/index.html'),read('my/app.js'),read('supabase/functions/profile-api/index.ts')]);
  assert.match(html,/id="profileForm"/);
  assert.match(html,/id="displayName"/);
  assert.match(html,/id="linkedIdentityList"/);
  assert.match(html,/manage=1/);
  assert.match(app,/functions\/v1\/profile-api/);
  assert.match(app,/callProfileApi\('PATCH',\{display_name:name\}\)/);
  assert.match(app,/profile\?\.display_name/);
  assert.match(profileApi,/admin\.from\("people"\)\.update\(\{display_name:name\}\)/);
  assert.match(profileApi,/admin\.from\("login_identities"\)/);
  assert.match(profileApi,/ALLOWED_ORIGINS/);
  assert.match(profileApi,/https:\/\/my\.ekodi\.kr/);
  assert.match(profileApi,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(app,/SUPABASE_SERVICE_ROLE_KEY/);
});

test('profile API accepts only a bounded personal display name and does not edit workspace names',async()=>{
  const profileApi=await read('supabase/functions/profile-api/index.ts');
  assert.match(profileApi,/name\.length<1\|\|name\.length>120/);
  assert.match(profileApi,/req\.method==="PATCH"/);
  assert.doesNotMatch(profileApi,/workspace_name/);
  assert.doesNotMatch(profileApi,/stores"\)\.update/);
  assert.doesNotMatch(profileApi,/tenants"\)\.update/);
});

test('My EKODI staging is isolated from production personal data',async()=>{
  const [prod,staging,worker]=await Promise.all([read('wrangler.my.toml'),read('wrangler.my.staging.toml'),read('my-worker.js')]);
  assert.match(prod,/DATA_ENABLED = "true"/);
  assert.match(prod,/my\.ekodi\.kr/);
  assert.match(staging,/DATA_ENABLED = "false"/);
  assert.doesNotMatch(staging,/my\.ekodi\.kr/);
  assert.match(worker,/dataEnabled/);
  assert.match(worker,/person-scoped/);
});

test('My EKODI security middleware runs before static assets in staging and production',async()=>{
  const [prod,staging,worker,manifest]=await Promise.all([
    read('wrangler.my.toml'),
    read('wrangler.my.staging.toml'),
    read('my-worker.js'),
    read('deploy/manifests/my.worker.json')
  ]);
  assert.match(prod,/run_worker_first = true/);
  assert.match(staging,/run_worker_first = true/);
  assert.match(worker,/'x-ekodi-service':'my-ekodi'/);
  assert.match(worker,/x-robots-tag','noindex, nofollow, noarchive/);
  assert.match(worker,/contentType\.includes\('text\/html'\)/);
  assert.match(manifest,/x-ekodi-service: my-ekodi/);
});

test('My EKODI rejects recursive or foreign return targets and private pages opt out of indexing',async()=>{
  const [home,journey,device,app]=await Promise.all([
    read('my/index.html'),read('my/journey/index.html'),read('my/device-care/index.html'),read('my/app.js')
  ]);
  for(const html of [home,journey,device])assert.match(html,/noindex,nofollow,noarchive/);
  assert.match(app,/function discardUnsafeReturnTarget\(\)/);
  assert.match(app,/if\(!params\.has\('return_to'\)\|\|requestedReturnTarget\(\)\)return/);
  assert.match(app,/params\.delete\('return_to'\)/);
});

test('Creator portfolio stays person-scoped and private by default',async()=>{
  const [migration,privateHelper,optimized]=await Promise.all([
    read('supabase/migrations/20260816155146_creator_ai_my_ekodi.sql'),
    read('supabase/migrations/20260816155454_creator_portfolio_private_person_helper.sql'),
    read('supabase/migrations/20260816155749_creator_portfolio_rls_initplan_optimization.sql')
  ]);
  assert.match(migration,/visibility text not null default 'private'/);
  assert.match(privateHelper,/private\.current_person_id/);
  assert.match(optimized,/\(select private\.current_person_id\(\)\)/);
});

test('Personal users can enter personal-brand Marketing without a tenant or store workspace',async()=>{
  const [html,worker]=await Promise.all([read('my/index.html'),read('my-worker.js')]);
  assert.match(html,/PERSONAL BRAND MARKETING/);
  assert.match(html,/나도 하나의 브랜드/);
  assert.match(html,/mode%3Dpersonal-brand/);
  assert.match(worker,/personalBrandMarketing:true/);
  assert.match(worker,/pathname==='\/personal-brand'/);
  assert.match(worker,/site=marketing/);
  assert.match(worker,/mode=personal-brand/);
});

test('Production rollout migrates legacy My EKODI before future guarded promotions',async()=>{
  const workflow=await read('.github/workflows/deploy-my.yml');
  assert.match(workflow,/has no deployments/);
  assert.match(workflow,/my\.ekodi\.kr\/health/);
  assert.match(workflow,/MY PLATFORMS/);
  assert.match(workflow,/one-time direct migration from staging-validated source/);
  assert.match(workflow,/Existing production .*satisfies.*My EKODI hub contract/);
  assert.match(workflow,/guarded-worker-release\.mjs/);
});


test('My EKODI approval hub keeps unified visibility and person-scoped decision authority',async()=>{
  const [home,approvalHtml,approvalApp,worker,migration]=await Promise.all([
    read('my/index.html'),
    read('my/approvals/index.html'),
    read('my/approvals/app.js'),
    read('my-worker.js'),
    read('supabase/migrations/20260904150000_approval_core.sql')
  ]);
  assert.match(home,/approval-brief\.js/);
  assert.match(approvalHtml,/MY APPROVAL · DECISION INBOX/);
  assert.match(approvalHtml,/data-ekodi-ui="USER"/);
  assert.match(approvalApp,/my_approval_person_id/);
  assert.match(approvalApp,/decide_approval/);
  assert.match(approvalApp,/cancel_approval/);
  assert.match(approvalApp,/AI 참고 요약 · 결재 판단 아님/);
  assert.match(worker,/approvalHub:true/);
  assert.match(worker,/pathname==='\/approvals'/);
  assert.match(migration,/requester_person_id = \(select private\.current_person_id\(\)\)/);
  assert.match(migration,/assignee_person_id = \(select private\.current_person_id\(\)\)/);
  assert.match(migration,/create table if not exists public\.approval_events/);
  assert.match(migration,/create table if not exists public\.approval_executions/);
  assert.match(migration,/approval_not_assignee/);
  assert.doesNotMatch(approvalApp,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test('My staging verification preserves Cloudflare Access instead of weakening it',async()=>{
  const workflow=await read('.github/workflows/deploy-my.yml');
  assert.match(workflow,/Cloudflare Access/);
  assert.match(workflow,/deployments status --config wrangler\.my\.staging\.toml --json/);
  assert.match(workflow,/my-stage-approvals\.html/);
  assert.match(workflow,/correctly protected by Cloudflare Access/);
});
test('My deployment verification derives Trade route from the live service manifest',async()=>{
  const workflow=await read('.github/workflows/deploy-my.yml');
  assert.doesNotMatch(workflow,/https:\/\/trade\.ekodi\.kr\//);
  assert.equal((workflow.match(/m\.services\.find\(v=>v\.id===\"trade\"\)/g)||[]).length,2);
  assert.equal((workflow.match(/JSON\.stringify\(\[s\.id,s\.name,s\.url\]\)/g)||[]).length,2);
});

test('My EKODI keeps the guest entry sparse and turns the signed-in root into a contextual home',async()=>{
  const [html,app,css,userAi]=await Promise.all([read('my/index.html'),read('my/app.js'),read('my/comfort-ui.css'),read('my/user-ai-ui.js')]);
  assert.match(html,/data-auth-state="guest"/);
  assert.match(html,/id="memberHome"/);
  assert.match(html,/data-focus-surface="recommendations"/);
  assert.match(html,/data-focus-surface="workspaces"/);
  assert.match(app,/FOCUS_HASHES/);
  assert.match(app,/function syncSurfaceState/);
  assert.match(app,/function memberHomeUi/);
  assert.match(app,/document\.body\.dataset\.homeMode/);
  assert.match(app,/cards\.slice\(0,3\)/);
  assert.match(css,/body\[data-auth-state="guest"\] main>:not\(\.comfort-hero\)/);
  assert.match(css,/\.member-focus-grid/);
  assert.match(css,/body\[data-auth-state="member"\]\[data-home-mode="focus"\]/);
  assert.match(userAi,/내 에코디,<br>필요한 것만\./);
});
