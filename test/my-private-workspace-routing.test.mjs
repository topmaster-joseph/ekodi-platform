import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('My Worker exposes only bounded private workspace route shapes and never caches them',async()=>{
  const worker=await read('my-worker.js');
  assert.match(worker,/WORKSPACE_KEY_RE=\/\^\[a-z\]\+:/);
  assert.match(worker,/SERVICE_ID_RE=\/\^\[a-z\]\[a-z0-9-\]\*\$/);
  assert.match(worker,/parsePrivateWorkspacePath/);
  assert.match(worker,/parts\.length<2\|\|parts\.length>3/);
  assert.match(worker,/workspaceKey\.length>180/);
  assert.match(worker,/x-ekodi-private-workspace','v1/);
  assert.match(worker,/x-robots-tag','noindex, nofollow, noarchive/);
  assert.match(worker,/headers\.set\('cache-control','no-store'\)/);
  assert.match(worker,/privateWorkspaceRouting:true/);
  assert.match(worker,/privateWorkspacePath:'\/w\/\{workspace_key\}\/\{service\}'/);
});

test('private workspace routes serve the My shell rather than exposing workspace data at the edge',async()=>{
  const worker=await read('my-worker.js');
  assert.match(worker,/target\.pathname='\/'/);
  assert.match(worker,/env\.ASSETS\.fetch\(new Request\(target\.toString\(\),request\)\)/);
  assert.match(worker,/PRIVATE_ROUTER_TAG/);
  assert.match(worker,/private-workspace-router\.js/);
  assert.doesNotMatch(worker,/workspace_name|workspace_owner|display_name/);
});

test('browser router keeps workspace keys private-first and launches services through existing verified handoff links',async()=>{
  const router=await read('my/private-workspace-router.js');
  assert.match(router,/STORAGE_KEY='ekodi_my_active_workspace'/);
  assert.match(router,/\/w\/\$\{encodeURIComponent\(workspaceKey\)\}/);
  assert.match(router,/data-workspace-key/);
  assert.match(router,/event\.stopImmediatePropagation\(\)/);
  assert.match(router,/dataset\.ekodiServiceTarget/);
  assert.match(router,/service-manifest\.json/);
  assert.match(router,/https:\/\/auth\.ekodi\.kr\//);
  assert.match(router,/target\.searchParams\.set\('site','my'\)/);
  assert.match(router,/target\.searchParams\.set\('return_to',returnTo\.href\)/);
  assert.doesNotMatch(router,/workspace_name|workspace_owner|display_name/);
});

test('friendly /{space} aliases never invent workspace keys and keep the private workspace router authoritative',async()=>{
  const worker=await read('my-worker.js');
  assert.match(worker,/SPACE_SLUGS=new Set\(\['church','biz','lab','jadam','pizzamaru','yogurt','cgma'\]\)/);
  assert.match(worker,/parseSpaceAlias/);
  assert.match(worker,/x-ekodi-space-slug/);
  assert.match(worker,/spaceAliasRouting:true/);
  assert.match(worker,/spaceAliasPath:'\/\{space\}'/);
  assert.doesNotMatch(worker,/workspaceKey=`space:/);
});
