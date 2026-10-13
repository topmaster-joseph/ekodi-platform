import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const yml = await readFile(new URL('../.github/workflows/verify-singles-native-browser.yml', import.meta.url), 'utf8');

test('Donghaeng acceptance is scheduled ONLY after a successful guarded production Site Core release', () => {
  assert.match(yml, /workflow_run:\s*\n\s*workflows: \["Deploy EKODI Shared Site Core"\]/);
  assert.match(yml, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(yml, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
});

test('EKODI-owned Chromium independently visits all member/admin shells, auth entry and read-only status on desktop/mobile', () => {
  assert.match(yml, /uses: \.\/\.github\/workflows\/ekodi-background-browser-worker\.yml/g);
  for (const name of ['desktop','mobile-portrait']) assert.ok(yml.includes('device_profile: '+name));
  for (const route of ['/singles','/singles/my','/singles/groups','/singles/events','/singles/discover',
      '/singles/messages','/singles/subscribe','/singles/admin','/singles/api/status',
      '/auth/?site=singles&return_to=']) assert.ok(yml.includes(route), route);
  assert.doesNotMatch(yml, /use_vault|external\.browser|tinyfish|E2E_ADMIN_TOKEN/i);
});

test('native acceptance is read-only and preserves login, payment, age and PII boundaries', () => {
  assert.equal((yml.match(/ekodi-background-browser-worker\.yml/g)||[]).length,2);
  assert.doesNotMatch(yml, /SUPABASE_SERVICE_ROLE_KEY|CLOUDFLARE_API_TOKEN|SINGLES_M1_ENABLED:\s*true|SINGLES_PAID_ACTIONS_ENABLED:\s*true/);
});
