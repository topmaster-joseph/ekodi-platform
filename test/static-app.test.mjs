import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [portal, adminShell, handoff, authShell, demandLoader, financeJs, hub, registryText, ecosystemRegistryText, headers, build, siteToml, siteWorker, financeToml, platformRouter, proxy, proxyToml, lifecycleText, serviceUrlsText] = await Promise.all([
  read('../index.html'), read('../admin-shell.html'), read('../admin-central-handoff.js'), read('../admin-authenticated-shell.js'), read('../admin-demand-loader.js'),
  read('../finance-monitor.js'), read('../hub.html'), read('../service-registry.json'), read('../config/ecosystem-services.json'), read('../_headers'),
  read('../scripts/build.mjs'), read('../wrangler.site.toml'), read('../site-worker.js'), read('../wrangler.finance.toml'), read('../platform-router-entry-worker.js'),
  read('../service-proxy.js'), read('../wrangler.service-proxy.toml'), read('../config/site-lifecycle-registry.json'), read('../config/ekodi-service-urls.json')
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
  assert.match(financeJs, /const FINANCE_API = 'https:\/\/ekodi\.kr'/);
  assert.match(financeJs, /const POLICY_FUND_API = '\/api\/finance\/policy-funds'/);
});

test('unverified public services remain gated except explicit gateways', () => {
  const registry = JSON.parse(registryText);
  const gateways = new Set(['biz','admin']);
  for (const service of registry.services.filter(x => !x.qaVerified && !gateways.has(x.id))) {
    assert.doesNotMatch(portal, new RegExp(`href="https://${service.domain.replaceAll('.', '\\.')}`));
  }
});

test('admin routing serves the official apex-path shell and fails closed for retired entry paths', () => {
  assert.match(siteWorker, /const RETIRED_ADMIN_PATHS = new Set/);
  for (const retired of ['/admin.html','/control-center','/control-center.html','/control-center.js','/control-center-features.js']) assert.ok(siteWorker.includes(`'${retired}'`));
  assert.match(siteWorker, /function retiredAdminResponse/);
  assert.ok(siteWorker.includes("'admin-retired'"));
  assert.ok(siteWorker.includes("assetRequest(request, '/admin-shell')"));
  assert.match(siteToml, /"\/admin"/);
  assert.match(siteToml, /"\/admin\/\*"/);
  assert.match(siteWorker, /frame-ancestors 'none'/);
  assert.match(siteWorker, /script-src 'self'/);
});

test('nested EKODI business services remain explicit apex-path boundaries', () => {
  assert.match(platformRouter, /routeCanonicalSurface/);
  assert.match(siteToml, /pattern = "ekodi\.kr\/ekodibiz\/trade\*"/);
  assert.match(siteToml, /"\/mail\*"/);
  assert.match(siteToml, /"\/messenger\*"/);
  assert.doesNotMatch(siteWorker, /TRADE_LEGACY_HOSTS|redirectToTradeCanonical/);
});

test('redirect-only subdomains are forbidden and public-domain policy stays apex-only', () => {
  const proxyCustomDomains = proxyToml.split('[[routes]]').slice(1)
    .filter(block => /custom_domain\s*=\s*true/.test(block))
    .map(block => block.match(/pattern\s*=\s*"([^"]+)"/)?.[1])
    .filter(Boolean);
  assert.equal(proxyCustomDomains.length, 1);
  assert.doesNotMatch(proxy, /CANONICAL_REDIRECTS|const REDIRECTS|Response\.redirect/);
  assert.doesNotMatch(siteWorker, /PUBLIC_ALIAS_HOSTS|redirectToPublicCanonical|TRADE_LEGACY_HOSTS|redirectToTradeCanonical/);
  const lifecycle = JSON.parse(lifecycleText);
  const serviceUrls = JSON.parse(serviceUrlsText);
  assert.equal(lifecycle.legacyPolicy.subdomainRedirectsAllowed, false);
  assert.equal(lifecycle.legacyPolicy.redirectOnlyCompatibilityAliasesAllowed, false);
  assert.equal(lifecycle.legacyPolicy.publicSubdomainsAllowed, false);
  assert.equal(lifecycle.legacyPolicy.directServiceSubdomainsAllowed, false);
  assert.equal(serviceUrls.policy.subdomainRedirectsAllowed, false);
  assert.equal(serviceUrls.policy.publicSubdomainsAllowed, false);
  for (const site of lifecycle.existingWorkspaceSites || []) {
    for (const alias of site.legacyAliases || []) {
      assert.equal(new URL(alias).hostname.endsWith('.' + ['ekodi','kr'].join('.')), false, `redirect-only subdomain alias leaked: ${alias}`);
    }
  }
});

test('finance and root custom-domain contracts remain intact', () => {
  assert.match(financeToml, /name = "ekodi-finance-api"/);
  assert.doesNotMatch(financeToml, /finance-api\.ekodi\.kr/);
  assert.match(financeToml, /ALLOWED_ORIGINS = "https:\/\/ekodi\.kr"/);
  assert.match(siteToml, /binding = "FINANCE"[\s\S]*service = "ekodi-finance-api"/);
  assert.match(platformRouter, /url\.pathname==='\/api\/finance'\|\|url\.pathname\.startsWith\('\/api\/finance\/'\)/);
  assert.match(platformRouter, /env\.FINANCE\.fetch\(request\)/);
  assert.match(financeToml, /database_name = "ekodi-auth"/);
  const sharedCustomDomains = siteToml.split('[[routes]]').slice(1)
    .filter(block => /custom_domain\s*=\s*true/.test(block))
    .map(block => block.match(/pattern\s*=\s*"([^"]+)"/)?.[1])
    .filter(Boolean);
  assert.deepEqual(sharedCustomDomains, ['ekodi.kr']);
  const policy = headers.split('\n').find(line => line.includes('Content-Security-Policy')) || '';
  assert.match(policy, /script-src 'none'/);
  assert.doesNotMatch(policy, /connect-src/);
});
