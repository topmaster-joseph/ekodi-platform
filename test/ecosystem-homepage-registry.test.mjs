import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CATEGORY_DEFINITIONS, loadHomepageServices, renderServiceCards } from '../scripts/ecosystem-registry.mjs';

const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');

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

  const categoryIds = new Set(CATEGORY_DEFINITIONS.map(category => category.id));
  assert.ok(services.every(service => categoryIds.has(service.category)), 'every homepage service must use a supported category');

  const community = services.find(service => service.id === 'community');
  assert.equal(community?.name, '에코디커뮤니티');
  assert.equal(community?.url, 'https://community.ekodi.kr');
  assert.equal(community?.category, 'community-ministry');
});

test('homepage cards are rendered from the registry and grouped by category', async () => {
  const services = await loadHomepageServices();
  const html = renderServiceCards(services);
  for (const service of services) {
    assert.match(html, new RegExp(`data-service-id="${service.id}"`));
    assert.ok(html.includes(service.url));
    assert.ok(html.includes(service.name));
  }

  for (const category of CATEGORY_DEFINITIONS) {
    const categoryServices = services.filter(service => service.category === category.id);
    if (!categoryServices.length) continue;
    assert.match(html, new RegExp(`data-service-category="${category.id}"`));
    assert.ok(html.includes(category.label));
  }
});

test('homepage navigation lands on real compact sections without the legacy orbit graphic', () => {
  for (const anchor of ['#about', '#services', '#connect', '#contact']) {
    assert.match(homepage, new RegExp(`href="${anchor}"`));
  }
  for (const id of ['about', 'services', 'connect', 'contact']) {
    assert.match(homepage, new RegExp(`id="${id}"`));
  }
  assert.match(homepage, /class="service-grid"/);
  assert.match(homepage, /class="service-group"/);
  assert.doesNotMatch(homepage, /class="[^"]*orbit|ecosystem-orbit|network-orbit/i);
});
