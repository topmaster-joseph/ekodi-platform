import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [api, ui] = await Promise.all([
  readFile(new URL('../customer-google-prereg.js', import.meta.url), 'utf8'),
  readFile(new URL('../client-access.js', import.meta.url), 'utf8'),
]);

test('Clients directory UI and API share one authenticated directory contract', () => {
  assert.match(ui, /request\('\/api\/customers\/directory'\)/);
  assert.match(api, /path === '\/api\/customers\/directory'/);
  assert.match(api, /uniqueGoogleAccounts/);
  assert.match(api, /memberships/);
  assert.match(api, /tenants,/);
  assert.match(api, /roles,/);
  assert.match(api, /members,/);
});

test('directory is sourced from tenant-scoped Google access grants', () => {
  assert.match(api, /customer_access_grants/);
  assert.match(api, /last_verified_at/);
  assert.match(api, /pre_registered/);
  assert.match(api, /COUNT\(a\.email\) AS members/);
});
