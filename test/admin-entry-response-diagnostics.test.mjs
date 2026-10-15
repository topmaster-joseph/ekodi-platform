import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker=readFileSync(new URL('../scripts/admin-authenticated-e2e-menu-worker.mjs',import.meta.url),'utf8');

test('Admin isolated Chromium worker records safe response diagnostics for missing #app',()=>{
  assert.match(worker,/const entryResponse = await page\.goto\(authenticatedEntryUrl,/);
  assert.match(worker,/status: entryResponse\?\.status\(\) \?\? null/);
  assert.match(worker,/contentType: String\(entryHeaders\['content-type'\]/);
  assert.match(worker,/cfCacheStatus: String\(entryHeaders\['cf-cache-status'\]/);
  assert.match(worker,/transport:adminEntryTransport/);
  assert.match(worker,/failedAdminAssets, adminEntryTransport/);
});
test('Worker refuses 401/403 without bypassing issued production Admin session',()=>{
  assert.match(worker,/\[401, 403\]\.includes\(adminEntryTransport\.status\)/);
  assert.match(worker,/await waitForReady\(\)/);
  assert.doesNotMatch(worker,/adminEntryTransport\s*=\s*\{[^}]*authorization:/);
  assert.doesNotMatch(worker,/adminEntryTransport\s*=\s*\{[^}]*responseBody:/);
});
