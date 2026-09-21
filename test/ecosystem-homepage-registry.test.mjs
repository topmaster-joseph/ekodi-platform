import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CATEGORY_DEFINITIONS, STATUS_DEFINITIONS, loadHomepageServices, loadHomepageStatusCounts, renderServiceCards } from '../scripts/ecosystem-registry.mjs';

const homepage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const releaseManifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
const registry = JSON.parse(await readFile(new URL('../config/ecosystem-services.json', import.meta.url), 'utf8'));

const hiddenStatuses = new Set(['beta', 'preparing', 'planned']);

test('homepage registry exposes only production-verified live services with translation metadata', async () => {
  const services = await loadHomepageServices();
  assert.ok(services.length > 0);
  assert.ok(services.every(service => service.homepage === true));
  assert.ok(services.every(service => service.url.startsWith('https://')));
  assert.ok(services.every(service => !/staging|preview/i.test(new URL(service.url).hostname)));
  assert.ok(services.every(service => service.nameEn && service.descriptionKo && service.descriptionEn));
  assert.ok(services.every(service => service.status === 'live'));
  assert.ok(services.every(service => service.productionVerified === true));

  const ids = services.map(service => service.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const required of ['church', 'community', 'social', 'biz', 'mall', 'marketing', 'books', 'author', 'lab', 'work']) {
    assert.ok(ids.includes(required), `missing verified live homepage service: ${required}`);
  }
  for (const hidden of ['business', 'invest', 'energy', 'messenger']) {
    assert.ok(!ids.includes(hidden), `beta service must stay off the public root: ${hidden}`);
  }
  assert.ok(!ids.includes('mission'), 'legacy mission service must not be published separately');

  const categoryIds = new Set(CATEGORY_DEFINITIONS.map(category => category.id));
  assert.ok(services.every(service => categoryIds.has(service.category)), 'every homepage service must use a supported category');

  const community = services.find(service => service.id === 'community');
  assert.equal(community?.name, '커뮤니티');
  assert.equal(community?.nameEn, 'Community');
  assert.equal(community?.url, 'https://ekodi.kr/community');
  assert.equal(community?.category, 'community-ministry');
});

test('homepage static cards are Korean-first while preserving translation metadata', async () => {
  const services = await loadHomepageServices();
  const html = renderServiceCards(services);
  for (const service of services) {
    assert.match(html, new RegExp(`data-service-id="${service.id}"`));
    assert.ok(html.includes(service.name));
    assert.ok(html.includes(service.label));
    assert.ok(html.includes(`data-service-name-en="${service.nameEn.replaceAll('&','&amp;').replaceAll('"','&quot;')}"`));
    assert.match(html, /data-service-status="live"/);
    assert.ok(html.includes(STATUS_DEFINITIONS.live.label));
  }
  assert.doesNotMatch(html, /class="service-name-en"/);
  assert.doesNotMatch(html, /<span>Live<\/span>/);

  for (const category of CATEGORY_DEFINITIONS) {
    const categoryServices = services.filter(service => service.category === category.id);
    if (!categoryServices.length) continue;
    assert.match(html, new RegExp(`data-service-category="${category.id}"`));
    assert.ok(html.includes(category.label));
    assert.ok(html.includes(`data-category-label-en="${category.labelEn.replaceAll('&','&amp;').replaceAll('"','&quot;')}"`));
  }
});

test('beta and roadmap services remain in the registry but stay hidden from the public root', async () => {
  const services = await loadHomepageServices();
  const html = renderServiceCards(services);
  const hidden = registry.services.filter(service => hiddenStatuses.has(service.status));
  assert.ok(hidden.length > 0);
  for (const service of hidden) {
    assert.doesNotMatch(html, new RegExp(`data-service-id="${service.id}"`), `non-live service must stay hidden: ${service.id}`);
  }
});

test('homepage static fallback is Korean-first and intent-first without roadmap lifecycle filters', () => {
  for (const anchor of ['#about', '#start', '#services', '#connect', '#contact']) {
    assert.match(homepage, new RegExp(`href="${anchor}"`));
  }
  for (const id of ['about', 'start', 'services', 'connect', 'contact']) {
    assert.match(homepage, new RegExp(`id="${id}"`));
  }
  assert.match(homepage, /원하는 일, 바로 시작하세요/);
  assert.match(homepage, /무엇을 하시나요\?/);
  assert.match(homepage, /공동체 · 사역/);
  assert.match(homepage, /사업 · 성장/);
  assert.match(homepage, /글 · 콘텐츠/);
  assert.match(homepage, /연구 · 배움/);
  assert.match(homepage, /일 · 프로젝트/);
  assert.match(homepage, /내 활동/);
  assert.match(homepage, /class="ecosystem-pulse"/);
  assert.match(homepage, /class="service-grid"/);
  assert.match(homepage, /data-status="beta" hidden/);
  assert.doesNotMatch(homepage, />About<|>Platforms<|>Connect<|>Contact<|>Sign in</);
  assert.doesNotMatch(homepage, /data-status-filter=/);
});

test('guarded release smoke markers stay aligned with the actual EKODI homepage', () => {
  const rootCheck = releaseManifest.worker?.requests?.find(request => request.url === 'https://ekodi.kr/');
  assert.ok(rootCheck, 'shared-site release manifest must verify the EKODI root');
  assert.ok(Array.isArray(rootCheck.expect) && rootCheck.expect.length >= 2, 'EKODI root release check needs stable body markers');
  for (const marker of rootCheck.expect) {
    assert.ok(homepage.includes(marker), `release marker drifted from homepage: ${marker}`);
  }
  assert.ok(rootCheck.expect.includes('원하는 일, 바로 시작하세요'));
  assert.ok(rootCheck.expect.includes('필요한 길만 가볍게 연결합니다.'));
});

test('homepage status satellites count only services rendered by the static live homepage', async () => {
  const counts = await loadHomepageStatusCounts();
  const expectedLive = registry.services.filter(service => service.homepage === true && service.productionVerified === true && service.status === 'live').length;
  assert.equal(counts.live, expectedLive);
  assert.ok(counts.live > 0);
  assert.equal(counts.beta, 0);
  assert.equal(counts.preparing, 0);
  assert.equal(counts.planned, 0);
});
