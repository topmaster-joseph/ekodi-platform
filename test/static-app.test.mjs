import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [portal, adminShell, handoff, authShell, demandLoader, financeJs, hub, registryText, ecosystemRegistryText, headers, build, siteToml, siteWorker, financeToml, proxy, proxyToml, bizLegacy, bizLegacyToml] = await Promise.all([
  read('../index.html'), read('../admin-shell.html'), read('../admin-central-handoff.js'), read('../admin-authenticated-shell.js'), read('../admin-demand-loader.js'),
  read('../finance-monitor.js'), read('../hub.html'), read('../service-registry.json'), read('../config/ecosystem-services.json'), read('../_headers'),
  read('../scripts/build.mjs'), read('../wrangler.site.toml'), read('../site-worker.js'), read('../wrangler.finance.toml'),
  read('../service-proxy.js'), read('../wrangler.service-proxy.toml'), read('../biz-legacy-redirect.js'), read('../wrangler.biz-legacy.toml')
]);

function uniqueIds(html, label) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate HTML id in ${label}`);
}
function hasDomain(text, domain) { assert.match(text, new RegExp(domain.replaceAll('.', '\\.'))); }
function hasRoute(toml, domain) {
  const expected = `pattern = "${domain}"`;
  const block = toml.split('[[routes]]').find(part => part.includes(expected));
  assert.ok(block, `missing custom-domain route for ${domain}`);
  assert.match(block, /custom_domain = true/);
}

test('root portal stays zero-JavaScript while verified public links remain registry-backed', () => {
  uniqueIds(portal, 'portal');
  assert.doesNotMatch(portal, /<script\b|\bfetch\s*\(/i);
  const ecosystem = JSON.parse(ecosystemRegistryText);
  for (const id of ['church','mall','lab','books']) {
    const service = ecosystem.services.find(item => item.id === id);
    assert.ok(service && service.homepage === true && service.productionVerified === true, `homepage registry contract missing: ${id}`);
    assert.ok(['live','beta'].includes(service.status));
    assert.match(service.url, /^https:\/\//);
  }
});

test('production build uses the current Admin Shell and runtime graph only', () => {
  for (const asset of ['admin-shell.html','admin-shell.css','admin-central-handoff.js','admin-authenticated-shell.js','admin-menu-layout.js','admin-demand-loader.js','finance-monitor.js']) {
    assert.ok(build.includes(`'${asset}'`), `missing current admin asset: ${asset}`);
  }
  assert.ok(!build.includes("'admin.html'"));
  assert.ok(!build.includes("'control-center-features.js'"));
  uniqueIds(adminShell, 'Admin Shell');
  uniqueIds(hub, 'hub');
  assert.match(adminShell, /admin-central-handoff\.js/);
  assert.match(build, /admin-authenticated-shell\.js/);
  assert.match(authShell, /admin-menu-layout\.js/);
  assert.match(authShell, /admin-demand-loader\.js/);
  assert.match(financeJs, /https:\/\/finance-api\.ekodi\.kr/);
});

test('unverified public services remain gated except explicit gateways', () => {
  const registry = JSON.parse(registryText);
  const gateways = new Set(['biz','admin']);
  for (const service of registry.services.filter(x => !x.qaVerified && !gateways.has(x.id))) {
    assert.doesNotMatch(portal, new RegExp(`href="https://${service.domain.replaceAll('.', '\\.')}`));
  }
});

test('admin routing serves the official shell and fails closed for retired entry paths', () => {
  assert.match(siteWorker, /const RETIRED_ADMIN_PATHS = new Set/);
  for (const retired of ['/admin.html','/control-center','/control-center.html','/control-center.js','/control-center-features.js']) assert.ok(siteWorker.includes(`'${retired}'`));
  assert.match(siteWorker, /function retiredAdminResponse/);
  assert.ok(siteWorker.includes("'admin-retired'"));
  assert.ok(siteWorker.includes("assetRequest(request, '/admin-shell')"));
  for (const d of ['admin.ekodi.kr','admin.biz.ekodi.kr','admin.church.ekodi.kr','admin.lab.ekodi.kr','admin.trade.ekodi.kr']) { hasDomain(siteWorker,d); hasRoute(siteToml,d); }
  assert.match(siteWorker, /frame-ancestors 'none'/);
  assert.match(siteWorker, /script-src 'self'/);
});

test('nested EKODI business service routes remain explicit compatibility boundaries', () => {
  for (const d of ['pay.ekodi.kr','pay.biz.ekodi.kr','mail.biz.ekodi.kr','live.biz.ekodi.kr']) { hasDomain(siteWorker,d); hasRoute(siteToml,d); }
  assert.match(hub, /pay\.ekodi\.kr/);
  assert.match(siteWorker, /TRADE_CANONICAL_HOST = 'trade\.biz\.ekodi\.kr'/);
  assert.match(siteWorker, /TRADE_LEGACY_HOSTS/);
  hasRoute(siteToml, 'trade.biz.ekodi.kr');
  hasRoute(siteToml, 'trade.ekodi.kr');
});

test('biz.ekodi.kr proxy remains independent while legacy external domain redirect stays dedicated', () => {
  hasRoute(proxyToml, 'biz.ekodi.kr');
  hasRoute(proxyToml, 'mall.biz.ekodi.kr');
  assert.match(proxy, /host === 'biz\.ekodi\.kr'/);
  assert.match(proxy, /requestHost\(request, env, incoming\)/);
  assert.doesNotMatch(proxy, /'biz\.ekodi\.kr': 'https:\/\/ekodibiz\.kr'/);
  assert.match(bizLegacy, /TARGET = 'https:\/\/biz\.ekodi\.kr'/);
  assert.match(bizLegacy, /Response\.redirect\(target\.toString\(\), 301\)/);
  for (const d of ['ekodibiz.kr','www.ekodibiz.kr']) hasRoute(bizLegacyToml,d);
});

test('finance and root custom-domain contracts remain intact', () => {
  assert.match(financeToml, /name = "ekodi-finance-api"/);
  hasRoute(financeToml, 'finance-api.ekodi.kr');
  assert.match(financeToml, /database_name = "ekodi-auth"/);
  hasRoute(siteToml, 'ekodi.kr');
  hasRoute(siteToml, 'www.ekodi.kr');
  const policy = headers.split('\n').find(line => line.includes('Content-Security-Policy')) || '';
  assert.match(policy, /script-src 'none'/);
  assert.doesNotMatch(policy, /connect-src/);
});
