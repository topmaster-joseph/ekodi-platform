import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../legacy-redirect.js';

const FILE = '/naver85321326d5553a0caa3a944158fc2969.html';
const BODY = 'naver-site-verification: naver85321326d5553a0caa3a944158fc2969.html';

test('ekodichurch.kr serves the Naver ownership file at its own root (200, no redirect)', async () => {
  const res = await worker.fetch(new Request('https://ekodichurch.kr' + FILE));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('location'), null);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(await res.text(), BODY);
  const head = await worker.fetch(new Request('https://ekodichurch.kr' + FILE, { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('other legacy paths still redirect permanently, unknown verification files are not answered', async () => {
  const home = await worker.fetch(new Request('https://ekodichurch.kr/'));
  assert.equal(home.status, 301);
  const fake = await worker.fetch(new Request('https://ekodichurch.kr/naver00000000000000000000000000000000.html'));
  assert.equal(fake.status, 301);
  const post = await worker.fetch(new Request('https://ekodichurch.kr' + FILE, { method: 'POST', body: 'x' }));
  assert.equal(post.status, 301);
  const nested = await worker.fetch(new Request('https://ekodichurch.kr/sub' + FILE));
  assert.equal(nested.status, 301);
});
