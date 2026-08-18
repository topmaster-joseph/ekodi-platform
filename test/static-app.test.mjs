import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [portal, admin, control, controlJs, controlFeatures, financeJs, hub, registryText, ecosystemRegistryText, headers, build, siteToml, siteWorker, financeToml, proxy, proxyToml, bizLegacy, bizLegacyToml] = await Promise.all([
  read('../index.html'), read('../admin.html'), read('../control-center.html'), read('../control-center.js'), read('../control-center-features.js'),
  read('../finance-monitor.js'), read('../hub.html'), read('../service-registry.json'), read('../config/ecosystem-services.json'), read('../_headers'),
  read('../scripts/build.mjs'), read('../wrangler.site.toml'), read('../site-worker.js'), read('../wrangler.finance.toml'),
  read('../service-proxy.js'), read('../wrangler.service-proxy.toml'), read('../biz-legacy-redirect.js'), read('../wrangler.biz-legacy.toml')
]);

function uniqueIds(html, label) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate HTML id in ${label}`);
}
function hasDomain(text, domain) {
  assert.match(text, new RegExp(domain.replaceAll('.', '\\.')));
}
function hasRoute(toml, domain) {
  const expected = `pattern = "${domain}"`;
  const block = toml.split('[[routes]]').find(part => part.includes(expected));
  assert.ok(block, `missing custom-domain route for ${domain}`);
  assert.match(block, /custom_domain = true/, `${domain} route must be a custom domain`);
}

test('root portal stays zero-JavaScript while verified public links remain registry-backed', () => {
  uniqueIds(portal, 'portal');
  assert.doesNotMatch(portal, /<script\b|\bfetch\s*\(/i);
  assert.match(portal, /<style>/);
  const ecosystem = JSON.parse(ecosystemRegistryText);
  for (const id of ['church', 'mall', 'lab', 'books']) {
    const service = ecosystem.services.find(item => item.id === id);
    assert.ok(service, `missing service registry entry: ${id}`);
    assert.equal(service.homepage, true, `${id} must remain eligible for the public homepage`);
    assert.equal(service.productionVerified, true, `${id} must be production verified`);
    assert.ok(['live', 'beta'].includes(service.status), `${id} must be usable before homepage exposure`);
    assert.match(service.url, /^https:\/\//);
  }
});

test('production build and Control Center retain required assets and APIs', () => {
  for (const asset of ['admin.html','control-center.html','control-center.css','control-center-ops.css','control-center-finance.css','control-center.js','finance-monitor.js','hub.html','styles.css','script.js','monitor-status.json']) {
    assert.match(build, new RegExp(`'${asset.replaceAll('.', '\\.')}'`));
  }
  uniqueIds(control, 'Control Center');
  uniqueIds(hub, 'hub');
  assert.match(control, /control-center\.js/);
  assert.doesNotMatch(control, /<script src="finance-monitor\.js"><\/script>/);
  assert.match(controlFeatures, /loadModule\('finance-monitor\.js'\)/);
  assert.match(controlJs, /https:\/\/api\.ekodi\.kr/);
  assert.match(financeJs, /https:\/\/finance-api\.ekodi\.kr/);
});

test('unverified public services remain gated except explicit gateways', () => {
  const registry = JSON.parse(registryText);
  const gateways = new Set(['biz','admin']);
  for (const service of registry.services.filter(x => !x.qaVerified && !gateways.has(x.id))) {
    assert.doesNotMatch(portal, new RegExp(`href="https://${service.domain.replaceAll('.', '\\.')}`));
  }
});

test('admin routing stays loop-free and secured', () => {
  assert.equal((admin.match(/<script\b/g) || []).length, 1);
  assert.match(admin, /script\.js/);
  assert.match(siteWorker, /assetRequest\(request, '\/control-center'\)/);
  assert.doesNotMatch(siteWorker, /assetRequest\(request, '\/control-center\.html'\)/);
  for (const d of ['admin.ekodi.kr','admin.biz.ekodi.kr','admin.church.ekodi.kr','admin.lab.ekodi.kr','admin.trade.ekodi.kr']) {
    hasDomain(siteWorker, d); hasRoute(siteToml, d);
  }
  assert.match(siteWorker, /connect-src 'self' https:\/\/api\.ekodi\.kr https:\/\/finance-api\.ekodi\.kr/);
  assert.match(siteWorker, /frame-ancestors 'none'/);
  assert.match(siteWorker, /script-src 'self'/);
});

test('nested EKODI BIZ service domains follow the organization hierarchy', () => {
  for (const d of ['pay.ekodi.kr','pay.biz.ekodi.kr','mail.biz.ekodi.kr','live.biz.ekodi.kr']) {
    hasDomain(siteWorker, d); hasRoute(siteToml, d);
  }
  assert.match(hub, /host === 'pay\.ekodi\.kr' \|\| host === 'pay\.biz\.ekodi\.kr'/);
  assert.match(siteWorker, /TRADE_CANONICAL_HOST = 'trade\.biz\.ekodi\.kr'/);
  assert.match(siteWorker, /TRADE_LEGACY_HOSTS = new Set\(\['trade\.ekodi\.kr'\]\)/);
  hasRoute(siteToml, 'trade.biz.ekodi.kr');
  hasRoute(siteToml, 'trade.ekodi.kr');
});

test('biz.ekodi.kr is independent and links all business services', () => {
  hasRoute(proxyToml, 'biz.ekodi.kr');
  hasRoute(proxyToml, 'mall.biz.ekodi.kr');
  assert.match(proxy, /host === 'biz\.ekodi\.kr'/);
  assert.match(proxy, /requestHost\(request, env, incoming\)/);
  assert.doesNotMatch(proxy, /'biz\.ekodi\.kr': 'https:\/\/ekodibiz\.kr'/);
  for (const d of ['trade.biz.ekodi.kr','mall.biz.ekodi.kr','pay.biz.ekodi.kr','mail.biz.ekodi.kr','live.biz.ekodi.kr']) hasDomain(proxy, d);
});

test('ekodibiz.kr permanently redirects through a dedicated Worker', () => {
  assert.match(bizLegacy, /TARGET = 'https:\/\/biz\.ekodi\.kr'/);
  assert.match(bizLegacy, /Response\.redirect\(target\.toString\(\), 301\)/);
  for (const d of ['ekodibiz.kr','www.ekodibiz.kr']) {
    hasDomain(bizLegacy, d);
    hasRoute(bizLegacyToml, d);
  }
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