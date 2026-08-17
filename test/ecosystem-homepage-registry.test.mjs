import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CATEGORY_DEFINITIONS, STATUS_DEFINITIONS, loadHomepageServices, renderServiceCards } from '../scripts/ecosystem-registry.mjs';

const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');

const clickableStatuses = new Set(['live', 'beta']);
const roadmapStatuses = new Set(['preparing', 'planned']);

test('homepage registry exposes a bilingual lifecycle catalog without opening unverified services', async () => {
  const services = await loadHomepageServices();
  assert.ok(services.length >= 20);
  assert.ok(services.every(service => service.homepage === true));
  assert.ok(services.every(service => service.url.startsWith('https://')));
  assert.ok(services.every(service => !/staging|preview/i.test(new URL(service.url).hostname)));
  assert.ok(services.every(service => service.nameEn && service.descriptionKo && service.descriptionEn));
  assert.ok(services.every(service => STATUS_DEFINITIONS[service.status]));

  const clickable = services.filter(service => clickableStatuses.has(service.status));
  assert.ok(clickable.length > 0);
  assert.ok(clickable.every(service => service.productionVerified === true));

  const roadmap = services.filter(service => roadmapStatuses.has(service.status));
  assert.ok(roadmap.length > 0);
  assert.ok(roadmap.every(service => service.productionVerified !== true));

  const ids = services.map(service => service.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ['church', 'biz', 'books', 'lab', 'community', 'mall', 'marketing', 'work']) {
    assert.ok(ids.includes(required), `missing public homepage service: ${required}`);
  }
  for (const upcoming of ['trade', 'pay', 'edu', 'my', 'insurance', 'mail', 'live', 'cloud', 'media']) {
    assert.ok(ids.includes(upcoming), `missing roadmap service: ${upcoming}`);
  }
  assert.ok(!ids.includes('mission'), 'legacy mission service must not be published separately');

  const categoryIds = new Set(CATEGORY_DEFINITIONS.map(category => category.id));
  assert.ok(services.every(service => categoryIds.has(service.category)), 'every homepage service must use a supported category');

  const community = services.find(service => service.id === 'community');
  assert.equal(community?.name, '에코디커뮤니티');
  assert.equal(community?.nameEn, 'EKODI Community');
  assert.equal(community?.url, 'https://community.ekodi.kr');
  assert.equal(community?.category, 'community-ministry');
});

test('homepage cards render Korean and English together with lifecycle badges', async () => {
  const services = await loadHomepageServices();
  const html = renderServiceCards(services);
  for (const service of services) {
    assert.match(html, new RegExp(`data-service-id="${service.id}"`));
    assert.ok(html.includes(service.name));
    assert.ok(html.includes(service.nameEn));
    assert.ok(html.includes(service.label));
    assert.match(html, new RegExp(`data-service-status="${service.status}"`));
    assert.ok(html.includes(STATUS_DEFINITIONS[service.status].label));
    assert.ok(html.includes(STATUS_DEFINITIONS[service.status].labelEn));
  }

  for (const category of CATEGORY_DEFINITIONS) {
    const categoryServices = services.filter(service => service.category === category.id);
    if (!categoryServices.length) continue;
    assert.match(html, new RegExp(`data-service-category="${category.id}"`));
    assert.ok(html.includes(category.label));
    assert.ok(html.includes(category.labelEn.replace('&', '&amp;')) || html.includes(category.labelEn));
  }
});

test('roadmap cards are visible but never become dead public links', async () => {
  const services = await loadHomepageServices();
  const html = renderServiceCards(services);
  for (const service of services.filter(item => roadmapStatuses.has(item.status))) {
    const match = html.match(new RegExp(`<article[^>]*data-service-id="${service.id}"[^>]*>[\\s\\S]*?</article>`));
    assert.ok(match, `roadmap service must render as a non-link article: ${service.id}`);
    assert.doesNotMatch(match[0], /\shref=/, `roadmap service must not expose a clickable URL: ${service.id}`);
  }
  for (const service of services.filter(item => clickableStatuses.has(item.status))) {
    assert.match(html, new RegExp(`<a[^>]*data-service-id="${service.id}"[^>]*href="${service.url.replaceAll('.', '\\.')}"`));
  }
});

test('homepage navigation, bilingual hero and lifecycle filters remain compact and real', () => {
  for (const anchor of ['#about', '#services', '#connect', '#contact']) {
    assert.match(homepage, new RegExp(`href="${anchor}"`));
  }
  for (const id of ['about', 'services', 'connect', 'contact']) {
    assert.match(homepage, new RegExp(`id="${id}"`));
  }
  assert.match(homepage, /에코디의 모든 길을 한눈에/);
  assert.match(homepage, /One ecosystem\. Many ways to connect\./);
  assert.match(homepage, /class="ecosystem-pulse"/);
  assert.match(homepage, /class="service-grid"/);
  for (const status of ['all', 'live', 'beta', 'preparing', 'planned']) {
    assert.match(homepage, new RegExp(`data-status-filter="${status}"`));
  }
  assert.doesNotMatch(homepage, /class="[^"]*orbit|ecosystem-orbit|network-orbit/i);
});
