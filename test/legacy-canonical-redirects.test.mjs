import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import siteWorker from '../site-worker.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy EKODIBIZ and child-admin aliases are sent through the shared worker', async () => {
  const wrangler = await read('wrangler.site.toml');
  for(const route of ['"/mall*"','"/ekodibiz*"','"/jadam/admin*"','"/pizzamaru/admin*"','"/yogurt/admin*"']) assert.ok(wrangler.includes(route),route);
});

test('legacy and aggregate Mall admin paths redirect to the unique site-owned admin', async () => {
  for (const [from,to,route] of [
    ['https://ekodi.kr/mall?ref=legacy','https://ekodi.kr/ekodibiz/ekodimall?ref=legacy','mall-legacy-canonical-redirect'],
    ['https://ekodi.kr/mall/admin/publishing','https://ekodi.kr/ekodibiz/ekodimall/admin/publishing','admin-canonical-handoff'],
    ['https://ekodi.kr/ekodibiz/mall?ref=former','https://ekodi.kr/ekodibiz/ekodimall?ref=former','mall-former-canonical-redirect'],
    ['https://ekodi.kr/ekodibiz/mall/admin/channels','https://ekodi.kr/ekodibiz/ekodimall/admin/channel-settings','admin-canonical-handoff'],
    ['https://ekodi.kr/admin/ekodimall/channel-settings','https://ekodi.kr/ekodibiz/ekodimall/admin/channel-settings','admin-canonical-handoff'],
    ['https://ekodi.kr/ekodibiz/ekodimall/admin/marketing/channels','https://ekodi.kr/ekodibiz/ekodimall/admin/channel-settings','admin-canonical-handoff'],
    ['https://ekodi.kr/org/ekodibiz','https://ekodi.kr/ekodibiz','ekodibiz-legacy-canonical-redirect'],
  ]) {
    const response = await siteWorker.fetch(new Request(from), {}, {});
    assert.equal(response.status, 308, from);
    assert.equal(response.headers.get('location'), to, from);
    assert.equal(response.headers.get('cache-control'), 'no-store', from);
    assert.equal(response.headers.get('x-ekodi-route'), route, from);
  }
});
