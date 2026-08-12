import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [portalHtml, adminHtml, controlHtml, controlJs, financeJs, hubHtml, registryText, headers, buildScript, wranglerSite, siteWorker, wranglerFinance] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../admin.html', import.meta.url), 'utf8'),
  readFile(new URL('../control-center.html', import.meta.url), 'utf8'),
  readFile(new URL('../control-center.js', import.meta.url), 'utf8'),
  readFile(new URL('../finance-monitor.js', import.meta.url), 'utf8'),
  readFile(new URL('../hub.html', import.meta.url), 'utf8'),
  readFile(new URL('../service-registry.json', import.meta.url), 'utf8'),
  readFile(new URL('../_headers', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8'),
  readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.finance.toml', import.meta.url), 'utf8')
]);

function assertUniqueIds(html, label) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate HTML id found in ${label}`);
}

test('root portal remains a zero-JavaScript shell', () => {
  assertUniqueIds(portalHtml, 'public portal');
  assert.doesNotMatch(portalHtml, /<script\b/i);
  assert.doesNotMatch(portalHtml, /<link[^>]+stylesheet/i);
  assert.doesNotMatch(portalHtml, /\bfetch\s*\(/i);
  assert.match(portalHtml, /<style>/);
});

test('Control Center finance assets are included in production build', () => {
  for (const asset of ['admin.html','control-center.html','control-center.css','control-center-ops.css','control-center-finance.css','control-center.js','finance-monitor.js','hub.html','styles.css','script.js','monitor-status.json']) {
    assert.match(buildScript, new RegExp(`'${asset.replaceAll('.', '\\.')}'`));
  }
  assertUniqueIds(controlHtml, 'Control Center');
  assertUniqueIds(hubHtml, 'service hub');
  assert.match(controlHtml, /<script src="control-center\.js"><\/script>/);
  assert.match(controlHtml, /<script src="finance-monitor\.js"><\/script>/);
  assert.match(controlJs, /https:\/\/api\.ekodi\.kr/);
  assert.match(financeJs, /https:\/\/finance-api\.ekodi\.kr/);
});

test('Control Center exposes service, finance and primary functional hubs', () => {
  for (const domain of ['pay.ekodi.kr','mail.ekodi.kr','live.ekodi.kr','cloud.ekodi.kr','biz.ekodi.kr','trade.ekodi.kr','church.ekodi.kr','lab.ekodi.kr']) {
    assert.match(controlHtml, new RegExp(`https://${domain.replaceAll('.', '\\.')}`));
  }
  assert.match(controlHtml, /결제 · 회계 관제/);
  assert.match(controlHtml, /조직 → 사업부 → 프로젝트/);
  assert.match(controlHtml, /finance-api\.ekodi\.kr/);
});

test('verified public services are direct static links', () => {
  for (const domain of ['church.ekodi.kr', 'mall.ekodi.kr', 'lab.ekodi.kr', 'books.ekodi.kr']) {
    assert.match(portalHtml, new RegExp(`href="https://${domain.replaceAll('.', '\\.')}`));
  }
});

test('unverified services stay non-clickable unless they are explicit gateway entry points', () => {
  const registry = JSON.parse(registryText);
  const explicitGateways = new Set(['biz', 'admin']);
  for (const service of registry.services.filter(item => !item.qaVerified && !explicitGateways.has(item.id))) {
    assert.doesNotMatch(portalHtml, new RegExp(`href="https://${service.domain.replaceAll('.', '\\.')}`));
  }
});

test('legacy admin console remains available with its existing external script', () => {
  assertUniqueIds(adminHtml, 'legacy admin console');
  assert.equal((adminHtml.match(/<script\b/g) || []).length, 1);
  assert.match(adminHtml, /<script src="script\.js"><\/script>/);
  assert.match(siteWorker, /LEGACY_ALIASES/);
  assert.match(siteWorker, /'\/legacy'/);
  assert.match(siteWorker, /'\/admin\.html'/);
});

test('admin hosts route the canonical root to Control Center', () => {
  for (const domain of ['admin.ekodi.kr','admin.biz.ekodi.kr','admin.church.ekodi.kr','admin.lab.ekodi.kr','admin.trade.ekodi.kr']) {
    assert.match(siteWorker, new RegExp(domain.replaceAll('.', '\\.')));
    assert.match(wranglerSite, new RegExp(`pattern = "${domain.replaceAll('.', '\\.')}"\\s+custom_domain = true`, 's'));
  }
  assert.match(siteWorker, /'\/control-center\.html'/);
});

test('site Worker routes pay and functional EKODI hubs by hostname', () => {
  for (const domain of ['pay.ekodi.kr','mail.ekodi.kr','live.ekodi.kr','cloud.ekodi.kr','auth.ekodi.kr']) {
    assert.match(siteWorker, new RegExp(domain.replaceAll('.', '\\.')));
    assert.match(wranglerSite, new RegExp(`pattern = "${domain.replaceAll('.', '\\.')}"\\s+custom_domain = true`, 's'));
  }
  assert.match(hubHtml, /host === 'pay\.ekodi\.kr'/);
  assert.match(hubHtml, /EKODI Pay/);
  assert.match(wranglerSite, /binding = "ASSETS"/);
  assert.match(wranglerSite, /run_worker_first = true/);
});

test('trade.ekodi.kr is canonical and the old nested address redirects', () => {
  assert.match(siteWorker, /TRADE_CANONICAL_HOST = 'trade\.ekodi\.kr'/);
  assert.match(siteWorker, /TRADE_LEGACY_HOSTS = new Set\(\['trade\.biz\.ekodi\.kr'\]\)/);
  for (const domain of ['trade.ekodi.kr','trade.biz.ekodi.kr']) {
    assert.match(wranglerSite, new RegExp(`pattern = "${domain.replaceAll('.', '\\.')}"\\s+custom_domain = true`, 's'));
  }
});

test('admin CSP allows separated service and finance APIs', () => {
  assert.match(siteWorker, /ADMIN_CSP/);
  assert.match(siteWorker, /connect-src 'self' https:\/\/api\.ekodi\.kr https:\/\/finance-api\.ekodi\.kr https:\/\/ekodi-auth-api\.topmaster-joseph\.workers\.dev/);
  assert.match(siteWorker, /script-src 'unsafe-inline'/);
  assert.match(siteWorker, /headers\.set\('Content-Security-Policy'/);
});

test('finance API has a dedicated custom domain and shared D1 session store', () => {
  assert.match(wranglerFinance, /name = "ekodi-finance-api"/);
  assert.match(wranglerFinance, /pattern = "finance-api\.ekodi\.kr"\s+custom_domain = true/s);
  assert.match(wranglerFinance, /database_name = "ekodi-auth"/);
});

test('root Worker uses direct Cloudflare custom domains', () => {
  assert.match(wranglerSite, /pattern = "ekodi\.kr"\s+custom_domain = true/s);
  assert.match(wranglerSite, /pattern = "www\.ekodi\.kr"\s+custom_domain = true/s);
  assert.match(wranglerSite, /workers_dev = false/);
});

test('root CSP forbids JavaScript and external runtime connections', () => {
  const policy = headers.split('\n').find(line => line.includes('Content-Security-Policy')) || '';
  assert.match(policy, /script-src 'none'/);
  assert.doesNotMatch(policy, /connect-src/);
});
