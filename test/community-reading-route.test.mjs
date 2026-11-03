import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../community-worker.js';

// Node tests do not implement Cloudflare HTMLRewriter; this test covers asset routing only.
globalThis.HTMLRewriter ??= class {
  on() { return this; }
  transform(response) { return response; }
};

test('Community worker resolves canonical reading entry and nested assets without redirecting off apex', async () => {
  const visited = [];
  const observedQueries = [];
  const env = { ASSETS: { fetch: async request => {
    const path = new URL(request.url).pathname;
    visited.push(path);
    observedQueries.push(new URL(request.url).search);
    if(path==='/reading/index.html')return new Response(null,{status:307,headers:{location:'/reading/'}});
    return new Response(
      path === '/reading/' ? '<!doctype html><html lang="ko"><head></head><body><main><h1>함께읽기</h1></main></body></html>' : 'export const ready=true;',
      { headers: { 'content-type': path === '/reading/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' } }
    );
  }}};
  const page = await worker.fetch(new Request('https://ekodi.kr/community/reading'), env);
  assert.equal(page.status, 200);
  assert.equal(visited[0], '/reading/');
  assert.match(await page.text(), /함께읽기/);
  const asset = await worker.fetch(new Request('https://ekodi.kr/community/reading/topics.js'), env);
  assert.equal(asset.status, 200);
  assert.equal(visited[1], '/reading/topics.js');
  assert.match(await asset.text(), /ready=true/);
  const slash = await worker.fetch(new Request('https://ekodi.kr/community/reading/'), env);
  assert.equal(slash.status, 200);
  assert.equal(visited[2], '/reading/');
  assert.equal(slash.headers.get('location'), null);
  for (const assetName of ['app.js', 'topics.js']) {
    const response = await worker.fetch(new Request('https://ekodi.kr/community/reading/' + assetName + '?rv=meeting-20261103-b'), env);
    assert.equal(response.status, 200, assetName);
    assert.equal(visited.at(-1), '/reading/' + assetName);
    assert.equal(observedQueries.at(-1), '?rv=meeting-20261103-b');
    assert.match(await response.text(), /ready=true/);
  }
});
