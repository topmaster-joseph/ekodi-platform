import assert from 'node:assert/strict';
import test from 'node:test';
import { loadHomepageServices, renderServiceCards } from '../scripts/ecosystem-registry.mjs';

test('homepage registry publishes only verified production services', async () => {
  const services = await loadHomepageServices();
  assert.ok(services.length > 0);
  assert.ok(services.every(service => service.homepage === true));
  assert.ok(services.every(service => service.productionVerified === true));
  assert.ok(services.every(service => service.url.startsWith('https://')));
  assert.ok(services.every(service => !/staging|preview/i.test(new URL(service.url).hostname)));

  const ids = services.map(service => service.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ['church', 'biz', 'books', 'lab', 'community', 'mall', 'marketing']) {
    assert.ok(ids.includes(required), `missing verified homepage service: ${required}`);
  }
  assert.ok(!ids.includes('mission'), 'legacy mission service must not be published separately');

  const community = services.find(service => service.id === 'community');
  assert.equal(community?.name, '에코디커뮤니티');
  assert.equal(community?.url, 'https://community.ekodi.kr');
});

test('homepage cards are rendered from the registry', async () => {
  const services = await loadHomepageServices();
  const html = renderServiceCards(services);
  for (const service of services) {
    assert.match(html, new RegExp(`data-service-id="${service.id}"`));
    assert.ok(html.includes(service.url));
    assert.ok(html.includes(service.name));
  }
});
