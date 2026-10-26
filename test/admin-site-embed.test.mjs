import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyPlatformSecurityHeaders, sameOriginFrameCsp, SITE_ADMIN_FRAME_ROOT } from '../platform-security-policy.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const IFRAME = { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'same-origin' };
function secured(path, headers = {}, { type = 'text/html; charset=utf-8', method = 'GET', host = 'ekodi.kr' } = {}) {
  const response = new Response('x', { headers: { 'content-type': type, 'content-security-policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'self'", 'x-frame-options': 'DENY' } });
  const result = applyPlatformSecurityHeaders(response, new Request(`https://${host}${path}`, { method, headers }));
  return { xfo: result.headers.get('x-frame-options'), csp: result.headers.get('content-security-policy') };
}

// ADMIN-SITE-EMBED-001 (owner decision 2026-10-26): ekodi.kr/admin › 사이트관리 shows the
// selected site's own admin page below the site strip in a same-origin frame.
test('a registered site admin page is frameable only by a same-origin iframe navigation', () => {
  for (const path of ['/ekodichurch/admin', '/ekodichurch/admin/members', '/ekodibiz/trade/admin', '/cmpmyi/admin/']) {
    const { xfo, csp } = secured(path, IFRAME);
    assert.equal(xfo, 'SAMEORIGIN', path);
    assert.match(csp, /frame-ancestors 'self'/, path);
    assert.doesNotMatch(csp, /frame-ancestors 'none'/, path);
  }
});

test('every other case keeps the platform framing ban', () => {
  const denied = [
    ['/ekodichurch/admin', { 'sec-fetch-dest': 'iframe', 'sec-fetch-site': 'cross-site' }, {}],
    ['/ekodichurch/admin', { 'sec-fetch-dest': 'document', 'sec-fetch-site': 'same-origin' }, {}],
    ['/ekodichurch/admin', {}, {}],
    ['/admin', IFRAME, {}],
    ['/auth/login', IFRAME, {}],
    ['/unknown/admin', IFRAME, {}],
    ['/x/ekodichurch/admin', IFRAME, {}],
    ['/ekodichurch/admin', IFRAME, { type: 'application/json' }],
    ['/ekodichurch/admin', IFRAME, { method: 'POST' }],
    ['/ekodichurch/admin', IFRAME, { host: 'evil.example' }],
  ];
  for (const [path, headers, options] of denied) {
    const { xfo, csp } = secured(path, headers, options);
    assert.equal(xfo, 'DENY', `${path} ${JSON.stringify(headers)} ${JSON.stringify(options)}`);
    assert.match(csp, /frame-ancestors 'none'/);
  }
});

test('the frame root allowlist mirrors the registered site admin roots', async () => {
  const hierarchy = JSON.parse(await read('config/admin-site-hierarchy.json'));
  for (const site of hierarchy.sites) assert.ok(SITE_ADMIN_FRAME_ROOT.test(site.adminPath), site.adminPath);
  assert.equal(sameOriginFrameCsp(''), "frame-ancestors 'self'");
  assert.equal(sameOriginFrameCsp("default-src 'self'"), "default-src 'self'; frame-ancestors 'self'");
});

test('사이트관리 opens the selected site admin below the strip and falls back to menu links when refused', async () => {
  const campus = await read('campus-actions.js');
  assert.match(campus, /box\.replaceChildren\(head, siteAdminFrame\(site, target => renderSiteAdminLinks\(site, target, template\)\)\)/);
  assert.match(campus, /src\.searchParams\.set\('embedded', 'admin'\)/);
  assert.match(campus, /if \(!readable\) return refuse\(\);/);
  assert.match(campus, /setTimeout\(\(\) => \{ if \(!settled && wrap\.isConnected\) refuse\(\); \}, 15000\)/);
  // Strip labels are the user-facing site names; the unregistered note moves to the accessible label.
  assert.match(campus, /label: site\.name, state, stateLabel: site\.adminRoot \? stateLabel : `\$\{stateLabel\} · 관리자 주소 미등록`/);
  assert.doesNotMatch(campus, /note: site\.adminRoot \? '' : '주소 미등록'/);
});
