import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getAdminMenuLabel } from '../admin-menu-registry.js';

const manifest = JSON.parse(await readFile(
  new URL('../deploy/manifests/shared-site.worker.json', import.meta.url),
  'utf8',
));

function adminDemandRequest() {
  return manifest.worker.requests.find(request =>
    String(request.url || '').includes('/admin-demand-loader.js'),
  );
}

test('guarded release verifies the canonical execution infrastructure label', () => {
  const request = adminDemandRequest();
  assert.ok(request, 'admin demand-loader release check must exist');
  const canonical = `label: '${getAdminMenuLabel('devices', 'ko')}'`;
  assert.ok(request.expect.includes(canonical));
  assert.ok(!request.expect.includes("label: '원격 작업'"));
});
