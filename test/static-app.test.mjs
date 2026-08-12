import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [portalHtml, adminHtml, hubHtml, registryText, headers, buildScript, wranglerSite, siteWorker] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../admin.html', import.meta.url), 'utf8'),
  readFile(new URL('../hub.html', import.meta.url), 'utf8'),
  readFile(new URL('../service-registry.json', import.meta.url), 'utf8'),
  readFile(new URL('../_headers', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8'),
  readFile(new URL('../site-worker.js', import.meta.url), 'utf8')
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
  assert.match(buildScript, /'index\.html'/);
  assert.match(buildScript, /'_headers'/);
});

test('hub and admin assets are included in the production build', () => {
  for (const asset of ['admin.html', 'hub.html', 'styles.css', 'script.js', 'monitor-status.json']) {
    assert.match(buildScript, new RegExp(`'${asset.replaceAll('.', '\\.')}'`));
  }
  assertUniqueIds(hubHtml, 'service hub');
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
  assert.match(portalHtml, /href="https:\/\/biz\.ekodi\.kr/);
  assert.match(portalHtml, /href="https:\/\/admin\.ekodi\.kr/);
});

test('admin console keeps its existing external script', () => {
  assertUniqueIds(adminHtml, 'admin console');
  assert.equal((adminHtml.match(/<script\b/g) || []).length, 1);
  assert.match(adminHtml, /<script src="script\.js"><\/script>/);
});

test('site Worker routes primary EKODI hubs by hostname', () => {
  for (const domain of ['admin.ekodi.kr', 'mail.ekodi.kr', 'live.ekodi.kr', 'cloud.ekodi.kr', 'auth.ekodi.kr']) {
    assert.match(siteWorker, new RegExp(domain.replaceAll('.', '\\.')));
    assert.match(wranglerSite, new RegExp(`pattern = "${domain.replaceAll('.', '\\.')}"\\s+custom_domain = true`, 's'));
  }
  assert.match(wranglerSite, /binding = "ASSETS"/);
  assert.match(wranglerSite, /run_worker_first = true/);
});

test('admin and lobby hosts override the root CSP safely', () => {
  assert.match(siteWorker, /ADMIN_CSP/);
  assert.match(siteWorker, /HUB_CSP/);
  assert.match(siteWorker, /connect-src 'self' https:\/\/api\.ekodi\.kr https:\/\/ekodi-auth-api\.topmaster-joseph\.workers\.dev/);
  assert.match(siteWorker, /script-src 'unsafe-inline'/);
  assert.match(siteWorker, /headers\.set\('Content-Security-Policy'/);
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
