import assert from 'node:assert/strict';
import test from 'node:test';
import { loadHomepageServices, renderServiceCards } from '../scripts/ecosystem-registry.mjs';

test('homepage registry publishes only verified production services', async () => {
  const services = await loadHomepageServices();
  assert.ok(services.length >= 8);
  assert.ok(services.every(service => service.homepage === true));
  assert.ok(services.every(service => service.productionVerified === true));
  assert.ok(services.every(service => service.url.startsWith('https://')));
  assert.ok(services.every(service => !/staging|preview/i.test(new URL(service.url).hostname)));

  const ids = services.map(service => service.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('community'));
  assert.ok(ids.includes('marketing'));
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
