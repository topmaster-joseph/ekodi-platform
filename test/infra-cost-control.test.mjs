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

test('infra cost UI expands only visible finance panel and adapts to narrow screens',()=>{
  const css=read('infra-cost-admin.css');
  const js=read('infra-cost-admin.js');
  assert.match(css,/\.app>main:has\(#ekodiInfraCosts:not\(\[hidden\]\):not\(\.hidden-panel\)\)/);
  assert.match(css,/max-width:none!important/);
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(js,/data-infra-open-invoice/);
  assert.match(js,/data-infra-jump="infra-billing"/);
  assert.match(js,/data-infra-invoice-search/);
  assert.match(js,/data-infra-invoice-filter/);
  assert.match(js,/matched=all\.filter/);
  assert.match(js,/if\(current\)renderInvoices\(current\)/);
  assert.match(js,/사용량 연동 필요/);
  assert.match(js,/청구서 직접 등록/);
});

test('infra cost navigation resets inherited workbench scroll and production browser checks real viewport',()=>{
  const module=read('infra-cost-admin.js'),e2e=read('scripts/verify-admin-production-ui-e2e.mjs');
  assert.match(module,/active&&!costPanelWasActive/);
  assert.match(module,/workspace\.scrollTop=0/);
  assert.match(e2e,/INFRA_COST_VISIBLE_VIEWPORT_E2E/);
  assert.match(e2e,/INFRA_COST_SEARCH_E2E/);
  assert.match(e2e,/INFRA_COST_FILTER_RESET_E2E/);
  assert.match(e2e,/INFRA_COST_INVOICE_EDITOR_E2E/);
  assert.match(e2e,/INFRA_COST_MOBILE_LAYOUT_E2E/);
  assert.match(e2e,/Synthetic cost UI must not mutate production billing records/);
});

test('infra cost mobile title has no desktop 500px flex-basis whitespace',()=>{
  const css=read('infra-cost-admin.css');
  const desktop=css.match(/#ekodiInfraCosts \.infra-page-heading>div:first-child\{([^}]+)\}/);
  assert.ok(desktop&&desktop[1].includes('flex:1 1 500px'));
  const mobile=css.match(/@media\(max-width:900px\)\{([\s\S]*?)@media\(max-width:640px\)/);
  assert.ok(mobile,'900px reflow rules must exist');
  assert.match(mobile[1],/#ekodiInfraCosts \.infra-page-heading\{align-items:flex-start;flex-direction:column\}/);
  assert.match(mobile[1],/#ekodiInfraCosts \.infra-page-heading>div:first-child\{flex:0 0 auto;width:100%;min-height:0\}/);
});
