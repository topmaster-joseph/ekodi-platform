import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('My EKODI is a unified private-first hub, not a second source of truth',async()=>{
  const [html,app]=await Promise.all([read('my/index.html'),read('my/app.js')]);
  assert.match(html,/MY PLATFORMS/);
  assert.match(html,/MY WORKSPACES/);
  assert.match(html,/PRIVATE FIRST/);
  assert.match(html,/NO DATA MONOLITH/);
  assert.match(app,/current_site_access/);
  assert.match(app,/current_site_workspaces/);
  assert.match(app,/creator_portfolio_items/);
  assert.doesNotMatch(app,/\.update\(\{visibility:/);
});

test('My EKODI reuses central identity and consumes one-time auth handoff',async()=>{
  const [app,auth,router]=await Promise.all([read('my/app.js'),read('auth-site/client-auth.js'),read('auth-site/auth-router.js')]);
  assert.match(app,/ekodi_token/);
  assert.match(app,/verifyOtp/);
  assert.match(auth,/'my':\{name:'My EKODI'/);
  assert.match(auth,/returnTo:'https:\/\/my\.ekodi\.kr\/'/);
  assert.match(router,/site==='my'/);
});

test('My workspace selection enters a linked workspace instead of only changing local state',async()=>{
  const app=await read('my/app.js');
  assert.match(app,/function workspaceDestination\(workspace\)/);
  assert.match(app,/requires_handoff/);
  assert.match(app,/function enterWorkspace\(key\)/);
  assert.match(app,/location\.assign\(serviceRoute\(destination\.id,destination\.url\)\)/);
  assert.match(app,/workspaceSwitcher.*enterWorkspace/s);
  assert.match(app,/data-workspace-key[\s\S]*enterWorkspace/);
  assert.match(app,/return_to/);
  assert.match(app,/new URL\(url\)\.origin===target\.origin/);
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
  assert.match(manifest,/x-ekodi-service: my-ekodi/);
});

test('Creator portfolio stays person-scoped and private by default',async()=>{
  const [migration,privateHelper,optimized]=await Promise.all([
    read('supabase/migrations/20260816155146_creator_ai_my_ekodi.sql'),
    read('supabase/migrations/20260816155454_creator_portfolio_private_person_helper.sql'),
    read('supabase/migrations/20260816155749_creator_portfolio_rls_initplan_optimization.sql')
  ]);
  assert.match(migration,/visibility text not null default 'private'/);
  assert.match(migration,/workspace_key text not null/);
  assert.match(privateHelper,/private\.current_person_id/);
  assert.match(optimized,/\(select private\.current_person_id\(\)\)/);
});

test('Production rollout migrates legacy My EKODI before future guarded promotions',async()=>{
  const workflow=await read('.github/workflows/deploy-my.yml');
  assert.match(workflow,/has no deployments/);
  assert.match(workflow,/my\.ekodi\.kr\/health/);
  assert.match(workflow,/MY PLATFORMS/);
  assert.match(workflow,/one-time direct migration from staging-validated source/);
  assert.match(workflow,/Existing production already satisfies the current My EKODI hub contract/);
  assert.match(workflow,/guarded-worker-release\.mjs/);
});
