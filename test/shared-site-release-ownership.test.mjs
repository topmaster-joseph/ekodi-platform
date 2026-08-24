import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../deploy/manifests/shared-site.worker.json', import.meta.url), 'utf8'));
const worker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');

const urls = manifest.worker.requests.map(item => item.url);

test('shared-site guarded release verifies only domains owned by the shared Worker', () => {
  assert.equal(urls.some(url => url.startsWith('https://invest.ekodi.kr/')), false,
    'Independent Investment service must not block shared Admin/Auth promotion');
  assert.match(worker, /const AUTH_HOST = 'auth\.ekodi\.kr'/);
  assert.match(worker, /const ADMIN_HOSTS = new Set/);
});
