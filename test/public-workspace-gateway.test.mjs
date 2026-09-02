import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('canonical public workspace paths use the isolated Space service binding',async()=>{
  const [router,wrangler,manifestText]=await Promise.all([
    read('platform-router-entry-worker.js'),
    read('wrangler.site.toml'),
    read('deploy/manifests/shared-site.worker.json'),
  ]);
  assert.match(router,/PUBLIC_WORKSPACE_ROUTE/);
  assert.match(router,/env\?\.SPACE\?\.fetch/);
  assert.ok(router.includes("routed.headers.set('x-ekodi-workspace-gateway','space-service-binding')"));
  assert.ok(router.includes("injectEkodiShell(rewriteWorkspaceShellAssets(routed),'space','workspace')"));
  assert.match(router,/safeWorkspaceReturnTo/);
  assert.match(wrangler,/binding = "SPACE"[\s\S]*service = "ekodi-space"/);
  for(const route of ['/personal/*','/org/*','/group/*','/project/*','/_ekodi/space/*','/auth/start']){
    assert.ok(wrangler.includes(`"${route}"`),route);
  }
  const manifest=JSON.parse(manifestText);
  const probe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/org/deployment-probe');
  assert.ok(probe);
  assert.ok(probe.headerExpect.includes('x-ekodi-workspace-gateway: space-service-binding'));
});

test('workspace shell assets and auth handoff stay inside the apex gateway',async()=>{
  const router=await read('platform-router-entry-worker.js');
  assert.ok(router.includes("const WORKSPACE_ASSET_PREFIX='/_ekodi/space/'"));
  assert.ok(router.includes("const WORKSPACE_ASSETS=new Set(['style.css','config.js','app.js'])"));
  assert.match(router,/rewriteWorkspaceShellAssets/);
  assert.match(router,/workspaceAuthRedirect/);
  assert.ok(router.includes("target.origin!=='https://ekodi.kr'"));
});
