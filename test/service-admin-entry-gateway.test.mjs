import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../service-admin-entry-worker.js';

const expectedHosts = [
  'ekodi.kr/ai','ekodi.kr/auth','ekodi.kr/cloud','ekodi.kr/live','ekodi.kr/ekodibiz/live','ekodi.kr/ekodichurch/live','ekodi.kr/ekodilab/live',
  'ekodi.kr/ekodibiz/mail','ekodi.kr/ekodichurch/mail','ekodi.kr/pay','ekodi.kr/ekodibiz/pay','ekodi.kr/ekodibiz/trade','ekodi.kr/ekodibiz/trade',
  'ekodi.kr/invest','ekodi.kr/messenger','ekodi.kr/management','ekodi.kr/marketing-api'
];

test('broken production admin hosts are covered by the independent route gateway', () => {
  const config = fs.readFileSync('wrangler.service-admin-entry.toml', 'utf8');
  const manifest = JSON.parse(fs.readFileSync('deploy/manifests/service-admin-entry.worker.json', 'utf8'));
  for (const host of expectedHosts) {
    assert.match(config, new RegExp(`pattern = "${host.replaceAll('.', '\\.')}/admin\\*"`));
    assert.ok(manifest.worker.requests.some(item => item.url === `https://${host}/admin`), host);
  }
  assert.equal(manifest.worker.requests.length, expectedHosts.length);
});

test('admin root hands off to the central control plane without caching', async () => {
  const response = await worker.fetch(new Request('https://ekodi.kr/invest/admin'));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://ekodi.kr/admin/?source=ekodi.kr/invest');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-ekodi-admin-entry'), 'central-handoff-v1');
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
});

test('admin descendants hand off and mutations fail closed', async () => {
  const get = await worker.fetch(new Request('https://ekodi.kr/management/admin/settings'));
  assert.equal(get.status, 307);
  const post = await worker.fetch(new Request('https://ekodi.kr/management/admin', { method: 'POST' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('staging health is secret-free and non-cacheable', async () => {
  const response = await worker.fetch(new Request('https://staging.example/__health'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { ok: true, service: 'ekodi-service-admin-entry', mode: 'central-handoff-v1' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
