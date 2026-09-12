import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const retrySource = await fs.readFile(new URL('../scripts/admin-authenticated-e2e-retry.mjs', import.meta.url), 'utf8');
const taxSource = await fs.readFile(new URL('../scripts/admin-authenticated-tax-surface-e2e.mjs', import.meta.url), 'utf8');

 test('Tax protocol fallback is narrow and preserves authenticated production verification', () => {
  assert.match(retrySource, /lastStage === 'tax-handoff'/);
  assert.match(retrySource, /ERR_\(\?:HTTP2_PROTOCOL_ERROR\|ABORTED\)/);
  assert.match(retrySource, /adminHandoffRequestVerified: true/);
  assert.match(retrySource, /strict-isolated-tax-surface/);
  assert.match(retrySource, /scripts\/admin-authenticated-tax-surface-e2e\.mjs/);

  assert.match(taxSource, /https:\/\/tax\.ekodi\.kr\/#ekodi_admin_token=/);
  assert.match(taxSource, /sessionStorage\.getItem\('ekodi-auth-token'\)/);
  assert.match(taxSource, /\/api\/finance\/tax-profiles\?organizationId=EKODIBIZ/);
  assert.match(taxSource, /response\.request\(\)\.method\(\) === 'PUT'/);
  assert.match(taxSource, /value-preserving save changed fields/);
  assert.match(taxSource, /persistenceVerified: true/);
});
