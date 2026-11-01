import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveAdminE2EMenus, isAdminEntryQuotaCircuit } from '../scripts/lib/admin-e2e-menu-scope.mjs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('full Admin E2E remains default; only explicit social diagnostic can narrow scope', () => {
  const all = ['platform-overview', 'sites-all', 'social-accounts', 'finance'];
  assert.deepEqual(resolveAdminE2EMenus(all), all);
  assert.deepEqual(resolveAdminE2EMenus(all, ''), all);
  assert.deepEqual(resolveAdminE2EMenus(all, 'all'), all);
  assert.deepEqual(resolveAdminE2EMenus(all, 'social-accounts'), ['social-accounts']);
  assert.throws(() => resolveAdminE2EMenus(all, 'finance'), /Unsupported/);
  assert.throws(() => resolveAdminE2EMenus(all, 'not-a-menu'), /Unsupported/);
  assert.throws(() => resolveAdminE2EMenus(['platform-overview'], 'social-accounts'), /canonical/);
  assert.throws(() => resolveAdminE2EMenus([]), /empty/);
});

test('Cloudflare 429 is a hard stop, never an automatic retry or a PASS', () => {
  assert.equal(isAdminEntryQuotaCircuit({diagnostics:{adminEntryTransport:{status:429}}}), true);
  assert.equal(isAdminEntryQuotaCircuit({error:'CF-QUOTA-001 circuit open'}), true);
  assert.equal(isAdminEntryQuotaCircuit({diagnostics:{adminEntryTransport:{status:401}}}), false);
  assert.equal(isAdminEntryQuotaCircuit(null), false);
  const client = read('scripts/admin-authenticated-e2e-menu-worker.mjs');
  const runner = read('scripts/admin-authenticated-e2e-retry.mjs');
  assert.match(client, /adminEntryTransport\.status === 429/);
  assert.match(runner, /isAdminEntryQuotaCircuit\(report\)/);
  assert.match(runner, /CF-QUOTA-001.*no retry/);
});

test('focused production probe retains genuine super-admin session and full-suite defaults', () => {
  const workflow=read('.github/workflows/verify-admin-authenticated-production-e2e.yml');
  const runner=read('scripts/admin-authenticated-e2e-retry.mjs');
  assert.match(workflow, /focus_menu:/);
  assert.match(workflow, /E2E_MENU_FOCUS:.*inputs\.focus_menu/);
  assert.match(workflow, /role == "super_admin"/);
  assert.match(workflow, /Issue short-lived genuine super-admin session/);
  assert.match(workflow, /Short-lived E2E session revoked/);
  assert.match(runner, /resolveAdminE2EMenus\(allMenuIds, process\.env\.E2E_MENU_FOCUS\)/);
  assert.match(runner, /mode: focusOnly \? \(menuIds\[0\]==='architecture' \? 'focused-architecture' : 'focused-social-inventory'\)/);
  assert.match(runner, /aggregate\.assistProbe\?\.passed === true/);
});
