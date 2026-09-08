import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../bible-worker.js';

const env = { DATA_ENABLED:'false', DATA_MODE:'test' };

test('legacy Bible host permanently redirects to the constitutional canonical path', async () => {
  const response = await worker.fetch(new Request('https://bible.ekodi.kr/reader?provider=KRV1961'), env);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://ekodi.kr/bible/reader?provider=KRV1961');
});

test('canonical Bible health route is path-scoped on ekodi.kr', async () => {
  const response = await worker.fetch(new Request('https://ekodi.kr/bible/health'), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.canonicalPath, '/bible');
  assert.equal(body.legacyAlias, 'bible.ekodi.kr');
});

test('canonical Bible provider API works beneath the path prefix', async () => {
  const response = await worker.fetch(new Request('https://ekodi.kr/bible/api/bible/providers'), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.policy.defaultProvider, 'KRV1961');
  assert.equal(body.policy.aiMayAlterScripture, false);
});

test('canonical asset requests strip the /bible prefix before asset lookup', async () => {
  let seenPath = '';
  const assetEnv = { ...env, ASSETS:{ async fetch(input) {
    seenPath = new URL(input.url).pathname;
    return new Response('body{}', { status:200, headers:{ 'content-type':'text/css' } });
  } } };
  const response = await worker.fetch(new Request('https://ekodi.kr/bible/styles.css'), assetEnv);
  assert.equal(response.status, 200);
  assert.equal(seenPath, '/styles.css');
});
