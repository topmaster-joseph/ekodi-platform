import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('infrastructure billing is a platform-super-admin finance menu with canonical routing',()=>{
  const registry=read('admin-menu-registry.js');
  assert.match(registry,/id: 'infrastructure-costs'.*group: 'finance'/);
  assert.match(registry,/id: 'infra-costs'.*superAdminOnly: true/);
  assert.match(read('admin-canonical-routes.js'),/'infra-costs':'finance'/);
  assert.match(read('admin-menu-layout.js'),/\['infra-costs','infra-costs'\]/);
  assert.match(read('admin-demand-loader.js'),/'infra-costs':\{label:/);
});
test('infrastructure billing assets and Control API route participate in normal build',()=>{
  const build=read('scripts/build.mjs'),site=read('site-worker.js'),api=read('mission-control-entry-worker.js');
  for(const asset of ['infra-cost-admin.js','infra-cost-admin.css']){
    assert.ok(build.includes("'"+asset+"'"));
    assert.ok(site.includes("'/" + asset + "'"));
  }
  assert.match(api,/handleInfraCostControl/);
  assert.match(api,/path\.startsWith\('\/api\/control\/infra-costs'\)/);
});
test('backend guards financial records and does not infer bill payment from telemetry',()=>{
  const code=read('infra-cost-control.js');
  assert.match(code,/session\.role!=='super_admin'/);
  assert.match(code,/UNIQUE\(provider,invoice_number\)/);
  assert.match(code,/status TEXT NOT NULL DEFAULT/);
  assert.match(code,/user-screenshot/);
  assert.match(code,/source TEXT NOT NULL DEFAULT/);
  assert.match(code,/infra_cost_audit/);
  assert.match(code,/checkOrigin\(request\)/);
  assert.match(code,/provider_quota_snapshots/);
  assert.doesNotMatch(code,/service_role.*=|secret.*=\s*['"]/i);
});
