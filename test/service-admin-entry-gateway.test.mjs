import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../service-admin-entry-worker.js';

const expectedHosts = [
  'ai.ekodi.kr','auth.ekodi.kr','cloud.ekodi.kr','live.ekodi.kr','live.biz.ekodi.kr','live.church.ekodi.kr','live.lab.ekodi.kr',
  'mail.biz.ekodi.kr','mail.church.ekodi.kr','pay.ekodi.kr','pay.biz.ekodi.kr','trade.ekodi.kr','trade.biz.ekodi.kr',
  'invest.ekodi.kr','messenger.ekodi.kr','tax.ekodi.kr','management.ekodi.kr','marketing-api.ekodi.kr'
];

test('broken production admin hosts are covered by the independent route gateway', () => {
  const config = fs.readFileSync('wrangler.service-admin-entry.toml', 'utf8');
  const manifest = JSON.parse(fs.readFileSync('deploy/manifests/service-admin-entry.worker.json', 'utf8'));
  for (const host of expectedHosts) {
    assert.match(config, new RegExp(`pattern = "${host.replaceAll('.', '\\.')}/admin\\*"`));
    assert.ok(manifest.worker.requests.some(item => item.url === `https://${host}/admin`), host);
  }
  assert.match(config, /pattern = "admin\.ekodi\.kr\/experience"/);
  assert.match(config, /pattern = "admin\.ekodi\.kr\/experience\/\*"/);
  assert.ok(manifest.worker.requests.some(item => item.url === 'https://admin.ekodi.kr/experience'));
  assert.equal(manifest.worker.requests.length, expectedHosts.length + 1);
});

test('legacy Experience admin path heals through the isolated gateway', async () => {
  const response = await worker.fetch(new Request('https://admin.ekodi.kr/experience'));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://admin.ekodi.kr/?route=campus&source=try.ekodi.kr');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-ekodi-admin-entry'), 'central-handoff-v1');
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);

  const descendant = await worker.fetch(new Request('https://admin.ekodi.kr/experience/overview'));
  assert.equal(descendant.status, 307);
  assert.equal(descendant.headers.get('location'), 'https://admin.ekodi.kr/?route=campus&source=try.ekodi.kr');

  const post = await worker.fetch(new Request('https://admin.ekodi.kr/experience', { method: 'POST' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});
test('admin root hands off to the central control plane without caching', async () => {
  const response = await worker.fetch(new Request('https://invest.ekodi.kr/admin'));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), 'https://admin.ekodi.kr/?source=invest.ekodi.kr');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-ekodi-admin-entry'), 'central-handoff-v1');
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
});

test('admin descendants hand off and mutations fail closed', async () => {
  const get = await worker.fetch(new Request('https://management.ekodi.kr/admin/settings'));
  assert.equal(get.status, 307);
  const post = await worker.fetch(new Request('https://management.ekodi.kr/admin', { method: 'POST' }));
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
