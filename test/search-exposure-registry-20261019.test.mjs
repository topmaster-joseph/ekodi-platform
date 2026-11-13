import test from 'node:test';
import assert from 'node:assert/strict';
import { registeredTenantPath } from '../site-publication-runtime.js';
import { isPublicDiscoveryPath } from '../public-discovery-registry.js';
test('tenant canonical path follows its registered ekodi.kr address', () => {
  assert.equal(registeredTenantPath('cheonggye-pass', 'ekodi.kr/cheonggye/pass'), '/cgpass');
  assert.equal(registeredTenantPath('cheonggye-local', 'ekodi.kr/cheonggye'), '/cheonggye');
  assert.equal(registeredTenantPath('mnubiz', 'ekodi.kr/mnubiz'), '/mnubiz');
  assert.equal(registeredTenantPath('ekoditrade', 'ekodi.kr/ekodibiz/trade'), '/ekodibiz/trade');
  assert.equal(registeredTenantPath('x', 'ekodi.kr/x/admin'), '/x');
  assert.equal(registeredTenantPath('yogurt', 'other.example/y'), '/yogurt');
  assert.equal(registeredTenantPath('mnubiz', ''), '/mnubiz');
});
test('page-owned noindex portal stays out of discovery', () => {
  assert.equal(isPublicDiscoveryPath('/ekodibiz/trade'), false);
  assert.equal(isPublicDiscoveryPath('/ekodibiz/trade/products/a'), true);
  assert.equal(isPublicDiscoveryPath('/mnubiz'), true);
});

import { TRAILING_SLASH_CANONICAL_PATHS } from '../public-discovery-registry.js';
test('slash-canonical sites are known and remain discoverable', () => {
  for (const path of ['/bible', '/ekodichurch', '/pyeonggongmok']) {
    assert.ok(TRAILING_SLASH_CANONICAL_PATHS.has(path));
    assert.equal(isPublicDiscoveryPath(path), true);
  }
});

test('legacy church live studio is not advertised', () => {
  assert.equal(isPublicDiscoveryPath('/ekodichurch/live'), false);
  assert.equal(isPublicDiscoveryPath('/live/church'), true);
});

test('documented operator-space noindex landing is absent from public sitemap inventory', () => {
  // /mokdaehumun is an operator landing, not the public tenant home.
  // Preserve its noindex and access; do not hide distinct tenant content.
  assert.equal(isPublicDiscoveryPath('/mokdaehumun'), false);
  assert.equal(isPublicDiscoveryPath('/mokdaehumun/'), false);
  assert.equal(isPublicDiscoveryPath('/mokdaehumun?tracking=1'), false);
  assert.equal(isPublicDiscoveryPath('/mokdaehumun/live/'), true);
  assert.equal(isPublicDiscoveryPath('/mokdaehumun/live'), true);
  assert.equal(isPublicDiscoveryPath('/cgmurrc'), true,
    'other tenant discovery must not inherit an unapproved policy exclusion');
  assert.equal(isPublicDiscoveryPath('/cgma'), true);
  assert.equal(isPublicDiscoveryPath('/ekodibiz/trade'), false);
});

test('public sitemap advertises final /edu/ and /management/ canonical URLs, not 308 entry URLs', async () => {
  for (const path of ['/edu', '/management']) {
    assert.equal(TRAILING_SLASH_CANONICAL_PATHS.has(path), true, path);
    assert.equal(isPublicDiscoveryPath(path), true, path);
  }
  const {buildEkodiPublicRegistry, ekodiDynamicSitemapResponse} = await import('../public-discovery-registry.js');
  const registry=await buildEkodiPublicRegistry({});
  const expected=['https://ekodi.kr/edu/','https://ekodi.kr/management/'];
  for(const canonical of expected) {
    assert.ok(registry.urls.includes(canonical),'missing final canonical '+canonical);
    assert.ok(!registry.urls.includes(canonical.slice(0,-1)),'must omit the 308 source '+canonical);
  }
  const sitemap=await (await ekodiDynamicSitemapResponse({})).text();
  for(const canonical of expected) {
    assert.ok(sitemap.includes('<loc>'+canonical+'</loc>'),canonical);
    assert.ok(!sitemap.includes('<loc>'+canonical.slice(0,-1)+'</loc>'),'redirect source in sitemap');
  }
});
