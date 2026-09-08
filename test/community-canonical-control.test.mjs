import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Control API contains Community and Social as active services without legacy mission service', async () => {
  const api = await text('api-worker.js');
  assert.doesNotMatch(api, /id: 'mission'/);
  assert.doesNotMatch(api, /에코디선교회/);
  assert.match(api, /id: 'community'.*defaultState: 'active'.*defaultMonitor: true/);
  assert.match(api, /id: 'social'.*social\.ekodi\.kr\/health.*defaultState: 'active'.*defaultMonitor: true/);
});

test('Admin registry uses Community label instead of the retired mission organization label', async () => {
  const registry = await text('admin-menu-registry.js');
  assert.match(registry, /id: 'community'[\s\S]*en: 'Community'/);
  assert.doesNotMatch(registry, /id: 'mission'/);
});

test('platform boundaries declare the central Social registry dependency', async () => {
  const boundaries = JSON.parse(await text('platform-boundaries.json'));
  assert.ok(boundaries.platforms.social.sharedDependencies.includes('control-api Social registry'));
  assert.match(boundaries.platforms.social.database, /ekodi-auth D1/);
  assert.ok(boundaries.platforms['control-api'].source.includes('social-registry-api.js'));
  assert.ok(boundaries.platforms['admin-auth'].source.includes('social-admin*'));
});

test('legacy mission service database rows are explicitly retired', async () => {
  const migration = await text('migrations/0014_remove_legacy_mission_service.sql');
  assert.match(migration, /DELETE FROM service_checks WHERE service_id = 'mission'/);
  assert.match(migration, /DELETE FROM service_controls WHERE service_id = 'mission'/);
});


test('Community Admin has its own service surface after ministry reports moved to Church', async () => {
  const [loader, panel, build, site] = await Promise.all([
    text('admin-demand-loader.js'), text('community-admin.js'), text('scripts/build.mjs'), text('site-worker.js'),
  ]);
  assert.match(loader, /community:\s*\{[\s\S]*community-admin\.css[\s\S]*community-admin\.js[\s\S]*data-section=\"community\"/);
  assert.doesNotMatch(loader, /community-reports-admin\.js/);
  assert.match(panel, /dataset\.panel = 'community'/);
  assert.match(panel, /community\.ekodi\.kr/);
  assert.match(panel, /교회 사역보고는 교회 목회자 관리자/);
  assert.match(build, /community-admin\.css/);
  assert.match(build, /community-admin\.js/);
  assert.match(site, /'\/community-admin\.css'/);
  assert.match(site, /'\/community-admin\.js'/);
});