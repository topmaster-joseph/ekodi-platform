import test from 'node:test';
import assert from 'node:assert/strict';
import legacy from '../biz-legacy-redirect.js';
import proxy from '../service-proxy.js';

const go = async (worker, url) => {
  const res = await worker.fetch(new Request(url), { ENVIRONMENT: 'production' });
  return { status: res.status, location: res.headers.get('location') };
};

test('ekodibiz.kr and www.ekodibiz.kr 301 to ekodi.kr/ekodibiz with path and query', async () => {
  assert.deepEqual(await go(legacy, 'https://ekodibiz.kr/'), { status: 301, location: 'https://ekodi.kr/ekodibiz' });
  assert.deepEqual(await go(legacy, 'https://www.ekodibiz.kr/'), { status: 301, location: 'https://ekodi.kr/ekodibiz' });
  assert.deepEqual(await go(legacy, 'https://ekodibiz.kr/trade?x=1'), { status: 301, location: 'https://ekodi.kr/ekodibiz/trade?x=1' });
});

test('legacy redirect never targets biz.ekodi.kr and refuses foreign hosts', async () => {
  const r = await go(legacy, 'https://ekodibiz.kr/a');
  assert.doesNotMatch(r.location, /biz\.ekodi\.kr/);
  assert.equal((await go(legacy, 'https://evil.example/')).status, 404);
});

test('retired biz.ekodi.kr 308s to ekodi.kr/ekodibiz instead of serving a lobby', async () => {
  assert.deepEqual(await go(proxy, 'https://biz.ekodi.kr/'), { status: 308, location: 'https://ekodi.kr/ekodibiz' });
  assert.deepEqual(await go(proxy, 'https://biz.ekodi.kr/index.html'), { status: 308, location: 'https://ekodi.kr/ekodibiz/index.html' });
  assert.deepEqual(await go(proxy, 'https://biz.ekodi.kr/admin'), { status: 308, location: 'https://ekodi.kr/ekodibiz/admin' });
});

test('sibling service subdomains keep their canonical ekodi.kr paths', async () => {
  assert.deepEqual(await go(proxy, 'https://mall.biz.ekodi.kr/'), { status: 308, location: 'https://ekodi.kr/ekodimall' });
  assert.deepEqual(await go(proxy, 'https://mall.ekodi.kr/x'), { status: 308, location: 'https://ekodi.kr/ekodimall/x' });
});
