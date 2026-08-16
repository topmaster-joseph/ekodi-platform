import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../marketing-admin-control.js', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8');

test('Marketing admin overview is admin-authenticated and read-only', () => {
  assert.match(source, /adminSession\(request, env\)/);
  assert.match(source, /EKODI 관리자 인증이 필요합니다/);
  assert.match(source, /request\.method === 'GET'/);
  assert.doesNotMatch(source, /request\.method === 'POST'/);
  assert.match(source, /readOnly:true/);
  assert.match(source, /customerPiiIncluded:false/);
  assert.match(source, /externalExecution:false/);
});

test('Marketing admin overview exposes aggregate operational sources without billing secrets', () => {
  assert.match(source, /service_subscriptions/);
  assert.match(source, /billing_charge_events/);
  assert.match(source, /marketing_store_workspaces/);
  assert.match(source, /dataContracts/);
  assert.doesNotMatch(source, /billing_key_cipher/);
  assert.doesNotMatch(source, /billing_key_iv/);
  assert.doesNotMatch(source, /provider_payment_key/);
});

test('Mission control entry routes Marketing admin control before shared customer entry', () => {
  assert.match(entry, /handleMarketingAdminControl/);
  assert.match(entry, /path\.startsWith\('\/api\/marketing\/admin\/'\)/);
  assert.ok(entry.indexOf("path.startsWith('/api/marketing/admin/')") < entry.indexOf('customerEntryWorker.fetch'));
});
