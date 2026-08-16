import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DEFAULT_REGISTRY, normalizeRegistry } from '../social-registry-api.js';

test('Social registry normalizes the canonical EKODI organizations', () => {
  const registry = normalizeRegistry(DEFAULT_REGISTRY);
  assert.equal(registry.version, 3);
  assert.ok(registry.organizations.some(org => org.id === 'community' && org.name === '에코디커뮤니티'));
  assert.ok(registry.organizations.some(org => org.id === 'church'));
  assert.ok(registry.organizations.every(org => org.website.startsWith('https://')));
  assert.ok(registry.organizations.flatMap(org => org.channels).every(channel => channel.id && channel.url.startsWith('https://')));
});

test('Social registry rejects insecure channel URLs and duplicate organizations', () => {
  assert.throws(() => normalizeRegistry({ organizations: [{ id:'x', name:'X', website:'https://x.example', channels:[{ provider:'other', label:'X', url:'http://x.example' }] }] }), /https/);
  assert.throws(() => normalizeRegistry({ organizations: [
    { id:'same', name:'A', website:'https://a.example', channels:[] },
    { id:'same', name:'B', website:'https://b.example', channels:[] }
  ] }), /duplicate organization id/);
});

test('Social registry rejects the retired EKODI mission organization label', () => {
  assert.throws(() => normalizeRegistry({ organizations: [{ id:'mission', name:'에코디선교회', website:'https://community.ekodi.kr', channels:[] }] }), /legacy EKODI mission/);
});

test('Control Center lazy-loads Social Channels while security-wrapped Mission Control preserves the canonical API entry', async () => {
  const [features, build, admin, entry, missionEntry, wrangler] = await Promise.all([
    readFile(new URL('../control-center-features.js', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../social-admin.js', import.meta.url), 'utf8'),
    readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8'),
  ]);
  assert.match(features, /placeholder\('social', '◉', 'Social'\)/);
  assert.match(features, /social-admin\.js/);
  assert.match(build, /social-admin\.css/);
  assert.match(build, /social-admin\.js/);
  assert.match(admin, /\/api\/control\/social\/registry/);
  assert.match(entry, /handleSocialRegistry/);
  assert.match(entry, /\/api\/social\/registry/);
  assert.match(entry, /return apiWorker\.fetch\(request, env, ctx\)/);
  assert.match(entry, /return apiWorker\.scheduled\(controller, env, ctx\)/);
  assert.match(wrangler, /main = "mission-control-entry-worker\.js"/);
  assert.match(missionEntry, /const response = await customerEntryWorker\.fetch\(request, env, ctx\)/);
  assert.match(missionEntry, /return applyApiSecurityHeaders\(response\)/);
  assert.match(missionEntry, /const guard = await enforceEdgeSecurity\(request, env\)/);
  assert.match(missionEntry, /return customerEntryWorker\.scheduled\(controller, env, ctx\)/);
});
