import test from 'node:test';
import assert from 'node:assert/strict';
import legacy from '../biz-legacy-redirect.js';

async function lookup(url) {
  const response = await legacy.fetch(new Request(url));
  return { status: response.status, location: response.headers.get('location') };
}

test('apex and www legacy hosts permanently redirect to canonical EKODIBIZ', async () => {
  for (const host of ['ekodibiz.kr', 'www.ekodibiz.kr']) {
    assert.deepEqual(await lookup('https://' + host + '/'), {
      status: 301, location: 'https://ekodi.kr/ekodibiz'
    });
  }
});

test('child paths and query string are preserved', async () => {
  assert.deepEqual(await lookup('https://ekodibiz.kr/trade?source=old&x=1'), {
    status: 301, location: 'https://ekodi.kr/ekodibiz/trade?source=old&x=1'
  });
  assert.deepEqual(await lookup('https://www.ekodibiz.kr/a%20b?q=hello%20world'), {
    status: 301, location: 'https://ekodi.kr/ekodibiz/a%20b?q=hello%20world'
  });
});

test('unexpected host does not redirect', async () => {
  assert.equal((await lookup('https://example.invalid/trade')).status, 404);
});

test('legacy redirect never chains through retired biz.ekodi.kr', async () => {
  assert.doesNotMatch((await lookup('https://ekodibiz.kr/')).location, /^https:\/\/biz\.ekodi\.kr/);
});
