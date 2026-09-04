import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('canonical public workspace paths use the isolated Space service binding',async()=>{
  const [router,wrangler,manifestText,stageWorkflow,stageWrangler]=await Promise.all([
    read('platform-router-entry-worker.js'),
    read('wrangler.site.toml'),
    read('deploy/manifests/shared-site.worker.json'),
    read('.github/workflows/stage-shared-site-shell.yml'),
    read('wrangler.site-staging.toml'),
  ]);
  assert.ok(router.includes("import { isPublicWorkspacePath } from './workspace-route-policy.js'"));
  assert.match(router,/env\?\.SPACE\?\.fetch/);
  assert.ok(router.includes("routed.headers.set('x-ekodi-workspace-gateway','space-service-binding')"));
  assert.ok(router.includes("injectEkodiShell(rewriteWorkspaceShellAssets(routed),'space','workspace')"));
  assert.match(router,/safeWorkspaceReturnTo/);
  assert.ok(router.includes("const DEPLOYMENT_PROBE_PATH='/deployment-probe'"));
  assert.match(router,/routeDeploymentProbe[\s\S]*workspaceUpstreamRequest\(request,'\/'\)/);
  assert.ok(router.includes('isWorkspaceAdminPath(url.pathname)&&!isEkodiBizInvestAdminPath(url.pathname)'));
  assert.match(wrangler,/binding = "SPACE"[\s\S]*service = "ekodi-space"/);
  for(const route of ['/deployment-probe','/_ekodi/space/*','/auth/start']){
    assert.ok(wrangler.includes(`"${route}"`),route);
  }
  const manifest=JSON.parse(manifestText);
  assert.ok(!manifest.worker.requests.some(item=>item.url==='https://ekodi.kr/deployment-probe'));
  const spaceConfig=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/_ekodi/space/config.js');
  assert.ok(spaceConfig);
  assert.ok(spaceConfig.headerExpect.includes('x-ekodi-workspace-gateway: space-service-binding'));
  const trade=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/ekodibiz/trade');
  assert.equal(trade?.rollbackVerify,false);
  assert.ok(stageWorkflow.includes("- 'platform-router-entry-worker.js'"));
  assert.ok(stageWorkflow.includes("- 'deploy/manifests/shared-site.worker.json'"));
  assert.ok(stageWorkflow.includes('node --check platform-router-entry-worker.js'));
  assert.ok(stageWrangler.includes('binding = "SPACE"'));
  assert.ok(stageWrangler.includes('service = "ekodi-space-staging"'));
  assert.ok(stageWrangler.includes('binding = "EKODIBIZ"'));
  assert.ok(stageWrangler.includes('service = "ekodibiz-revenue-os-staging"'));
  assert.ok(stageWorkflow.includes("verify_public_path '/deployment-probe'"));
  assert.ok(stageWorkflow.includes("verify_public_path '/ekodibiz/invest'"));
  assert.ok(stageWorkflow.includes("verify_public_path '/ekodibiz/invest/admin'"));
  for(const retiredKind of ['personal','o'+'rg','group','project']) assert.ok(!wrangler.includes(`\"/${retiredKind}/*\"`),retiredKind);
});
test('workspace shell assets and auth handoff stay inside the apex gateway',async()=>{
  const router=await read('platform-router-entry-worker.js');
  assert.ok(router.includes("const WORKSPACE_ASSET_PREFIX='/_ekodi/space/'"));
  assert.ok(router.includes("const WORKSPACE_ASSETS=new Set(['style.css','config.js','app.js'])"));
  assert.match(router,/rewriteWorkspaceShellAssets/);
  assert.match(router,/workspaceAuthRedirect/);
  assert.ok(router.includes("target.origin!=='https://ekodi.kr'"));
});
