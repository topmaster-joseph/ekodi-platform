import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CATEGORY_DEFINITIONS, STATUS_DEFINITIONS, loadHomepageServices, renderServiceCards } from '../scripts/ecosystem-registry.mjs';

const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const releaseManifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
const registry = JSON.parse(await readFile(new URL('../config/ecosystem-services.json', import.meta.url), 'utf8'));

const clickableStatuses = new Set(['live', 'beta']);
const roadmapStatuses = new Set(['preparing', 'planned']);

test('homepage registry exposes only production-verified bilingual usable services', async () => {
  const services = await loadHomepageServices();
  assert.ok(services.length > 0);
  assert.ok(services.every(service => service.homepage === true));
  assert.ok(services.every(service => service.url.startsWith('https://')));
  assert.ok(services.every(service => !/staging|preview/i.test(new URL(service.url).hostname)));
  assert.ok(services.every(service => service.nameEn && service.descriptionKo && service.descriptionEn));
  assert.ok(services.every(service => STATUS_DEFINITIONS[service.status]));
  assert.ok(services.every(service => clickableStatuses.has(service.status)));
  assert.ok(services.every(service => service.productionVerified === true));

  const ids = services.map(service => service.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ['church', 'community', 'social', 'biz', 'business', 'mall', 'marketing', 'books', 'author', 'lab', 'work', 'energy']) {
    assert.ok(ids.includes(required), `missing verified homepage service: ${required}`);
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

test('homepage cards render Korean and English together with live or beta badges', async () => {
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

test('preparing and planned services remain in the registry but stay hidden from the public root', async () => {
  const services = await loadHomepageServices();
  const html = renderServiceCards(services);
  const roadmap = registry.services.filter(service => roadmapStatuses.has(service.status));
  assert.ok(roadmap.length > 0);
  assert.ok(roadmap.every(service => service.homepage === false));
  assert.ok(roadmap.every(service => service.productionVerified !== true));
  for (const service of roadmap) {
    assert.doesNotMatch(html, new RegExp(`data-service-id="${service.id}"`), `roadmap service must stay hidden: ${service.id}`);
  }
});

test('homepage navigation and bilingual hero remain compact without roadmap lifecycle filters', () => {
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
  assert.doesNotMatch(homepage, /data-status-filter=/);
  assert.doesNotMatch(homepage, /class="[^"]*orbit|ecosystem-orbit|network-orbit/i);
});

test('guarded release smoke markers stay aligned with the actual EKODI homepage', () => {
  const rootCheck = releaseManifest.worker?.requests?.find(request => request.url === 'https://ekodi.kr/');
  assert.ok(rootCheck, 'shared-site release manifest must verify the EKODI root');
  assert.ok(Array.isArray(rootCheck.expect) && rootCheck.expect.length >= 2, 'EKODI root release check needs stable body markers');
  for (const marker of rootCheck.expect) {
    assert.ok(homepage.includes(marker), `release marker drifted from homepage: ${marker}`);
  }
  assert.ok(rootCheck.expect.includes('에코디의 모든 길을 한눈에'));
  assert.ok(rootCheck.expect.includes('One ecosystem. Many ways to connect.'));
});
