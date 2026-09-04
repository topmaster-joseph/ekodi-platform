import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import siteWorker from '../site-worker.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy EKODIBIZ paths are sent through the shared worker', async () => {
  const wrangler = await read('wrangler.site.toml');
  assert.ok(wrangler.includes('"/mall*"'));
  assert.ok(wrangler.includes('"/org/ekodibiz*"'));
});

test('legacy Mall and EKODIBIZ paths redirect to canonical apex paths', async () => {
  for (const [from,to,route] of [
    ['https://ekodi.kr/mall?ref=legacy','https://ekodi.kr/ekodibiz/mall?ref=legacy','mall-legacy-canonical-redirect'],
    ['https://ekodi.kr/mall/admin/publishing','https://ekodi.kr/ekodibiz/mall/admin/publishing','mall-legacy-canonical-redirect'],
    ['https://ekodi.kr/org/ekodibiz','https://ekodi.kr/ekodibiz','ekodibiz-legacy-canonical-redirect'],
    ['https://ekodi.kr/org/ekodibiz/trade?x=1','https://ekodi.kr/ekodibiz/trade?x=1','ekodibiz-legacy-canonical-redirect'],
  ]) {
    const response = await siteWorker.fetch(new Request(from), {}, {});
    assert.equal(response.status, 308, from);
    assert.equal(response.headers.get('location'), to, from);
    assert.equal(response.headers.get('cache-control'), 'no-store', from);
    assert.equal(response.headers.get('x-ekodi-route'), route, from);
  }
});