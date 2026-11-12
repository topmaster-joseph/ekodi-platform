import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const yml = await readFile(new URL('../.github/workflows/verify-singles-native-browser.yml', import.meta.url), 'utf8');
const worker = await readFile(new URL('../.github/workflows/ekodi-background-browser-worker.yml', import.meta.url), 'utf8');
const batches = [...yml.matchAll(/^\s*surface_paths: '([^']+)'$/gm)].map(match => match[1].split(','));
const lanes = [...yml.matchAll(/^\s*verification_lane: ([\w-]+)$/gm)].map(match => match[1]);
const routes = [
  '/singles', '/singles/my', '/singles/groups', '/singles/events',
  '/singles/discover', '/singles/messages', '/singles/subscribe', '/singles/admin',
  '/singles/api/status', '/auth/?site=singles&return_to=https%3A%2F%2Fekodi.kr%2Fsingles%2Fmy',
  '/singles/privacy', '/singles/terms', '/singles/verify',
];

test('Donghaeng acceptance only runs after a successful guarded Site Core release, or an explicit dispatch', () => {
  assert.match(yml, /workflow_run:\s*\n\s*workflows: \["Deploy EKODI Shared Site Core"\]/);
  assert.equal((yml.match(/github\.event\.workflow_run\.conclusion == 'success'/g) || []).length, 2);
  assert.equal((yml.match(/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/g) || []).length, 2);
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /cancel-in-progress: false/);
});

test('two browser lanes cover all thirteen distinct routes while preserving the native worker twelve-path cap', () => {
  assert.equal((yml.match(/uses: \.\/\.github\/workflows\/ekodi-background-browser-worker\.yml/g) || []).length, 2);
  assert.match(worker, /const maxPaths=Math\.min\(12,registryMaxPaths\)/);
  assert.equal(batches.length, 2);
  for (const batch of batches) {
    assert.ok(batch.length >= 1 && batch.length <= 12, 'bounded worker rejects >12 paths');
    assert.equal(new Set(batch).size, batch.length, 'a lane must not waste budget on duplicates');
    assert.ok(batch.every(route => route.startsWith('/')), 'all routes must be canonical root-relative');
  }
  assert.deepEqual([...new Set(batches.flat())].sort(), [...routes].sort());
  assert.equal(batches.flat().length, routes.length, 'each route should have exactly one lane');
});

test('member and legal lanes execute on both devices without cross-cancelling their jobs', () => {
  assert.equal((yml.match(/matrix:\s*\n\s*device_profile: \[desktop, mobile-portrait\]/g) || []).length, 2);
  assert.equal((yml.match(/device_profile: \$\{\{ matrix\.device_profile \}\}/g) || []).length, 2);
  assert.equal((yml.match(/fail-fast: false/g) || []).length, 2);
  assert.deepEqual(lanes.sort(), ['singles-legal', 'singles-member']);
  assert.equal(new Set(lanes).size, 2, 'worker cancel-in-progress must have independent lane keys');
  assert.match(worker, /inputs\.verification_lane \|\| 'generic'/);
  assert.ok(batches.some(batch => ['/singles/privacy','/singles/terms','/singles/verify'].every(route => batch.includes(route))));
});

test('native acceptance is read-only and preserves login, payment, age and PII boundaries', () => {
  assert.doesNotMatch(yml, /use_vault|external\.browser|tinyfish|E2E_ADMIN_TOKEN/i);
  assert.doesNotMatch(yml, /SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN|SINGLES_M1_ENABLED:\s*true|SINGLES_PAID_ACTIONS_ENABLED:\s*true/);
  assert.ok(!/\b(secrets:|write-all|POST|DELETE|PATCH|PUT)\b/i.test(yml), 'no live mutation or privileged secret injection');
});
