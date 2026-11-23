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

test('final-slash routing of education and management uses the shared pure canonical normalizer', async () => {
  const {normalizeCanonical,TRAILING_SLASH_CANONICAL_PATHS,
    buildEkodiPublicRegistry,ekodiDynamicSitemapResponse}=await import('../public-discovery-registry.js');
  for (const raw of ['/edu','/management']) {
    assert.equal(TRAILING_SLASH_CANONICAL_PATHS.has(raw),true,raw);
    assert.equal(isPublicDiscoveryPath(raw),true,raw);
    const old='https://ekodi.kr'+raw;
    const final=old+'/';
    assert.equal(normalizeCanonical(old,raw),final);
    assert.equal(normalizeCanonical(final,raw),final);
    assert.equal(normalizeCanonical(old+'?utm_source=old',raw),final);
  }
  // The static test catalog does not promise production DB publication rows.
  // If a row is present, it must be final-canonical; never require it to exist.
  const registry=await buildEkodiPublicRegistry({});
  const sitemap=await (await ekodiDynamicSitemapResponse({})).text();
  for(const raw of ['/edu','/management']){
    const old='https://ekodi.kr'+raw,final=old+'/';
    assert.equal(registry.urls.includes(old),false,'old redirect source in registry');
    assert.equal(sitemap.includes('<loc>'+old+'</loc>'),false,'old redirect source in sitemap');
    if(registry.urls.includes(final))
      assert.ok(sitemap.includes('<loc>'+final+'</loc>'),'registered canonical absent from sitemap');
  }
});
