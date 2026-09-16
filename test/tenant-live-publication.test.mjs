import test from 'node:test';
import assert from 'node:assert/strict';
import { realtimeTenant } from '../realtime-tenant-registry.js';
import { tenantLivePage } from '../tenant-live-page.js';

test('published EKODI Mission LIVE emits publication and indexing headers at the shared-site edge', async () => {
  const tenant = realtimeTenant('ekodimission');
  assert.ok(tenant);
  const response = tenantLivePage(tenant);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-ekodi-route'), 'ekodimission-public');
  assert.equal(response.headers.get('x-ekodi-publication-status'), 'published');
  assert.equal(response.headers.get('x-ekodi-independent-site'), 'true');
  assert.equal(response.headers.get('x-robots-tag'), 'index,follow');
  assert.match(await response.text(), /meta name="robots" content="index,follow"/i);
});
