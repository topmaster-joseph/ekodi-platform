import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [portal, admin, layout, demand, financeJs, hub, registryText, ecosystemRegistryText] = await Promise.all([
  read('../index.html'), read('../admin-shell.html'), read('../admin-menu-layout.js'), read('../admin-demand-loader.js'),
  read('../finance-monitor.js'), read('../hub.html'), read('../service-registry.json'), read('../config/ecosystem-services.json')
]);
const [headers, build, siteToml, siteWorker, financeToml, proxy, proxyToml, bizLegacy, bizLegacyToml] = await Promise.all([
  read('../_headers'), read('../scripts/build.mjs'), read('../wrangler.site.toml'), read('../site-worker.js'),
  read('../wrangler.finance.toml'), read('../service-proxy.js'), read('../wrangler.service-proxy.toml'),
  read('../biz-legacy-redirect.js'), read('../wrangler.biz-legacy.toml')
]);

function uniqueIds(html, label) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate HTML id in ${label}`);
}
function hasDomain(text, domain) { assert.match(text, new RegExp(domain.replaceAll('.', '\\.'))); }
function hasRoute(toml, domain) {
  const block = toml.split('[[routes]]').find(part => part.includes(`pattern = "${domain}"`));
  assert.ok(block, `missing custom-domain route for ${domain}`);
  assert.match(block, /custom_domain = true/);
}
test('root portal source stays lightweight while verified public links remain registry-backed', () => {
  uniqueIds(portal, 'portal');
  assert.doesNotMatch(portal, /\bfetch\s*\(/i);
  const ecosystem = JSON.parse(ecosystemRegistryText);
  for (const id of ['church', 'mall', 'lab', 'books']) {
    const service = ecosystem.services.find(item => item.id === id);
    assert.ok(service, `missing service registry entry: ${id}`);
    assert.equal(service.homepage, true);
    assert.equal(service.productionVerified, true);
    assert.ok(['live', 'beta'].includes(service.status));
    assert.match(service.url, /^https:\/\//);
  }
});

test('production build ships the canonical Admin shell and lazy operational assets', () => {
  for (const asset of ['admin-shell.html','admin-shell.css','admin-authenticated-shell.js','admin-demand-loader.js','admin-menu-layout.js','finance-monitor.js','hub.html','styles.css','script.js','monitor-status.json']) {
    assert.match(build, new RegExp(`'${asset.replaceAll('.', '\\.')}'`));
  }
  uniqueIds(admin, 'Admin shell');
  uniqueIds(hub, 'hub');
  assert.match(layout, /requestDemand/);
  assert.match(demand, /loadScript\('finance-monitor\.js'\)/);
  assert.match(financeJs, /https:\/\/finance-api\.ekodi\.kr/);
});
test('unverified public services remain gated except explicit gateways', () => {
  const registry = JSON.parse(registryText);
  const gateways = new Set(['biz','admin']);
  for (const service of registry.services.filter(x => !x.qaVerified && !gateways.has(x.id))) {
    assert.doesNotMatch(portal, new RegExp(`href="https://${service.domain.replaceAll('.', '\\.')}`));
  }
});

test('Admin routing retires legacy entry files and serves one secured shell', () => {
  assert.match(siteWorker, /RETIRED_ADMIN_PATHS[\s\S]*'\/control-center'/);
  assert.match(siteWorker, /assetRequest\(request, '\/admin-shell'\)/);
  assert.doesNotMatch(siteWorker, /assetRequest\(request, '\/control-center\.html'\)|assetRequest\(request, '\/admin\.html'\)/);
  for (const d of ['admin.ekodi.kr','admin.biz.ekodi.kr','admin.church.ekodi.kr','admin.lab.ekodi.kr','admin.trade.ekodi.kr']) {
    hasDomain(siteWorker, d); hasRoute(siteToml, d);
  }
  assert.match(siteWorker, /frame-ancestors 'none'/);
  assert.match(siteWorker, /script-src 'self'/);
});

test('nested EKODI BIZ service domains follow the organization hierarchy', () => {
  for (const d of ['pay.ekodi.kr','pay.biz.ekodi.kr','mail.biz.ekodi.kr','live.biz.ekodi.kr']) {
    hasDomain(siteWorker, d); hasRoute(siteToml, d);
  }
  assert.match(siteWorker, /TRADE_CANONICAL_HOST = 'trade\.biz\.ekodi\.kr'/);
  hasRoute(siteToml, 'trade.biz.ekodi.kr');
});
test('biz.ekodi.kr is independent and links business services', () => {
  hasRoute(proxyToml, 'biz.ekodi.kr');
  hasRoute(proxyToml, 'mall.biz.ekodi.kr');
  assert.match(proxy, /host === 'biz\.ekodi\.kr'/);
  assert.doesNotMatch(proxy, /'biz\.ekodi\.kr': 'https:\/\/ekodibiz\.kr'/);
  for (const d of ['trade.biz.ekodi.kr','mall.biz.ekodi.kr','pay.biz.ekodi.kr','mail.biz.ekodi.kr','live.biz.ekodi.kr']) hasDomain(proxy, d);
});

test('ekodibiz.kr permanently redirects through its dedicated Worker', () => {
  assert.match(bizLegacy, /TARGET = 'https:\/\/biz\.ekodi\.kr'/);
  assert.match(bizLegacy, /Response\.redirect\(target\.toString\(\), 301\)/);
  for (const d of ['ekodibiz.kr','www.ekodibiz.kr']) { hasDomain(bizLegacy, d); hasRoute(bizLegacyToml, d); }
});

test('finance and root custom-domain contracts remain intact', () => {
  assert.match(financeToml, /name = "ekodi-finance-api"/);
  hasRoute(financeToml, 'finance-api.ekodi.kr');
  assert.match(financeToml, /database_name = "ekodi-auth"/);
  hasRoute(siteToml, 'ekodi.kr');
  hasRoute(siteToml, 'www.ekodi.kr');
  const policy = headers.split(/\r?\n/).find(line => line.includes('Content-Security-Policy')) || '';
  assert.match(policy, /script-src 'none'/);
  assert.doesNotMatch(policy, /connect-src/);
});
