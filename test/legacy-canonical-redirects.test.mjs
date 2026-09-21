import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import siteWorker from '../site-worker.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('legacy EKODIBIZ and child-admin aliases are sent through the shared worker', async () => {
  const wrangler = await read('wrangler.site.toml');
  for(const route of ['"/mall*"','"/ekodibiz*"','"/jadam/admin*"','"/pizzamaru/admin*"','"/yogurt/admin*"']) assert.ok(wrangler.includes(route),route);
});

test('guarded release defers nested Mall admin redirects until promoted routing is active', async () => {
  const release = JSON.parse(await read('deploy/manifests/shared-site.worker.json'));
  for (const [url,location] of [
    ['https://ekodi.kr/ekodibiz/ekodimall/admin/','https://ekodi.kr/ekodimall/admin/'],
    ['https://ekodi.kr/ekodibiz/ekodimall/admin/channel-settings','https://ekodi.kr/ekodimall/admin/channel-settings'],
  ]) {
    const request = release.worker.requests.find(item => item.url === url);
    assert.ok(request, url);
    assert.equal(request.candidateVerify, false, url);
    assert.match(request.candidateVerifyReason, /promoted run_worker_first routing table/, url);
    assert.deepEqual(request.statuses, [308], url);
    assert.ok(request.headerExpect.includes(`location: ${location}`), url);
    assert.ok(request.headerExpect.includes('cache-control: no-store'), url);
    assert.ok(request.headerExpect.includes('x-ekodi-route: mall-nested-canonical-redirect'), url);
  }
});

test('legacy and aggregate Mall admin paths redirect to the unique site-owned admin', async () => {
  for (const [from,to,route] of [
    ['https://ekodi.kr/mall?ref=legacy','https://ekodi.kr/ekodimall?ref=legacy','mall-legacy-canonical-redirect'],
    ['https://ekodi.kr/mall/admin/publishing','https://ekodi.kr/ekodimall/admin/publishing','admin-canonical-handoff'],
    ['https://ekodi.kr/ekodibiz/mall?ref=former','https://ekodi.kr/ekodimall?ref=former','mall-former-canonical-redirect'],
    ['https://ekodi.kr/ekodibiz/ekodimall?ref=nested','https://ekodi.kr/ekodimall?ref=nested','mall-nested-canonical-redirect'],
    ['https://ekodi.kr/ekodibiz/mall/admin/channels','https://ekodi.kr/ekodimall/admin/channel-settings','admin-canonical-handoff'],
    ['https://ekodi.kr/admin/ekodimall/channel-settings','https://ekodi.kr/ekodimall/admin/channel-settings','admin-canonical-handoff'],
    ['https://ekodi.kr/ekodibiz/ekodimall/admin/marketing/channels','https://ekodi.kr/ekodimall/admin/channel-settings','admin-canonical-handoff'],
    ['https://ekodi.kr/org/ekodibiz','https://ekodi.kr/ekodibiz','ekodibiz-legacy-canonical-redirect'],
  ]) {
    const response = await siteWorker.fetch(new Request(from), {}, {});
    assert.equal(response.status, 308, from);
    assert.equal(response.headers.get('location'), to, from);
    assert.equal(response.headers.get('cache-control'), 'no-store', from);
    assert.equal(response.headers.get('x-ekodi-route'), route, from);
  }
});
