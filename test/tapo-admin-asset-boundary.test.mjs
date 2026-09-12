import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [worker, wrangler, manifestText, deviceAdmin] = await Promise.all([
  readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.site.toml', import.meta.url), 'utf8'),
  readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'),
  readFile(new URL('../device-control-admin.js', import.meta.url), 'utf8'),
]);
const manifest = JSON.parse(manifestText);

test('Tapo admin assets stay behind the Admin Worker boundary', () => {
  for (const asset of ['/tapo-device-admin.js', '/tapo-device-admin.css']) {
    assert.match(worker, new RegExp(`'${asset.replaceAll('/', '\\/')}'`));
    assert.ok(wrangler.includes(`"${asset}"`));
    const request = manifest.worker.requests.find(item => item.url === `https://admin.ekodi.kr${asset}`);
    assert.ok(request);
    assert.ok(request.headerExpect?.includes('x-ekodi-route: admin-asset'));
    assert.ok(request.headerExpect?.includes('x-content-type-options: nosniff'));
  }
});

test('Device Control accepts readable and compact demand-loader APIs', () => {
  assert.match(deviceAdmin, /demandLoader\?\.loadScript\|\|demandLoader\?\.loadJs/);
  assert.match(deviceAdmin, /loadTapoScript\.call\(demandLoader,'tapo-device-admin\.js'\)/);
});
