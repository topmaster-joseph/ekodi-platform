import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

execFileSync(process.execPath, ['scripts/generate-user-service-registry.mjs'], { stdio: 'ignore' });

const registry = JSON.parse(fs.readFileSync(new URL('../config/ecosystem-services.json', import.meta.url), 'utf8'));
const { loadHomepageServices, renderServiceCards } = await import('../scripts/ecosystem-registry.mjs');
const { handleHomepagePresentation } = await import('../homepage-presentation-control.js');
const { USER_SERVICES } = await import('../generated/user-services.js');
const { mountHomepageAdmin } = await import('../homepage-admin.js');

test('homepage admin stays an import-safe on-demand module', () => {
  assert.equal(typeof mountHomepageAdmin, 'function');
});

test('public homepage candidates are production-verified live services only', async () => {
  const candidates = await loadHomepageServices();
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(service => service.productionVerified === true && service.status === 'live'));

  const expected = registry.services
    .filter(service => service.productionVerified === true && service.status === 'live')
    .map(service => service.id)
    .sort();
  assert.deepEqual(candidates.map(service => service.id).sort(), expected);
});

test('rendered homepage candidates keep static defaults without exposing unsafe services', async () => {
  const candidates = await loadHomepageServices();
  const html = renderServiceCards(candidates);
  for (const service of candidates) {
    assert.match(html, new RegExp(`data-service-id="${service.id}"`));
    assert.match(html, new RegExp(`data-homepage-default="${service.homepage === true ? 'normal' : 'hidden'}"`));
  }
  for (const service of registry.services.filter(service => service.productionVerified !== true || service.status !== 'live')) {
    assert.doesNotMatch(html, new RegExp(`data-service-id="${service.id}"`));
  }
});

test('public presentation endpoint emits only eligible services and honors stored visibility', async () => {
  const eligible = USER_SERVICES.filter(service => service.homepageEligible);
  assert.ok(eligible.length > 0);
  const target = eligible[0];
  const DB = {
    prepare(sql) {
      assert.match(sql, /homepage_presentation_controls/);
      return {
        async all() {
          return { results: [{ service_id: target.id, visibility: 'featured', display_order: 7, updated_at: new Date().toISOString() }] };
        },
      };
    },
  };

  const request = new Request('https://api.ekodi.kr/api/homepage/presentation', {
    headers: { origin: 'https://ekodi.kr' },
  });
  const response = await handleHomepagePresentation(request, { DB, ALLOWED_ORIGINS: 'https://ekodi.kr,https://admin.ekodi.kr' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://ekodi.kr');
  const payload = await response.json();
  assert.ok(payload.services.every(item => eligible.some(service => service.id === item.id)));
  const changed = payload.services.find(item => item.id === target.id);
  assert.deepEqual(changed, { id: target.id, visibility: 'featured', order: 7 });
});