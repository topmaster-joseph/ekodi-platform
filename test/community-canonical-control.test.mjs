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

test('Campus uses Community label instead of the retired mission organization label', async () => {
  const campus = await text('compact-control-center.js');
  assert.match(campus, /key: 'community', label: '커뮤니티', name: '에코디커뮤니티'/);
  assert.doesNotMatch(campus, /key: 'community', label: '선교회'/);
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
