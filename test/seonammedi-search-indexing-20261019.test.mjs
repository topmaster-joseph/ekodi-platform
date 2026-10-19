import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { SEONAMMEDI_SITEMAP_PATHS, SEONAMMEDI_ROBOTS_DISALLOW } from '../seonammedi-domain-gateway.js';
import { EKODI_INDEXNOW_KEY, EKODI_INDEXNOW_KEY_PATH } from '../platform-indexnow.js';

const HOSTS = ['seonammedi.kr', 'xn--3e0b8b58jw4co4mnpll3k.kr'];

function noUpstream() {
  const original = globalThis.fetch;
  globalThis.fetch = async request => { throw new Error('unexpected upstream fetch ' + request.url); };
  return () => { globalThis.fetch = original; };
}

for (const host of HOSTS) {
  test(`${host} serves robots.txt pointing at the canonical sitemap`, async () => {
    const restore = noUpstream();
    try {
      const res = await worker.fetch(new Request(`https://${host}/robots.txt`));
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/plain/);
      const body = await res.text();
      assert.match(body, /^User-agent: \*$/m);
      assert.match(body, /^Allow: \/$/m);
      assert.match(body, /^Sitemap: https:\/\/seonammedi\.kr\/sitemap\.xml$/m);
      for (const path of SEONAMMEDI_ROBOTS_DISALLOW) assert.ok(body.includes('Disallow: ' + path));
      assert.doesNotMatch(body, /^Disallow: \/$/m, 'site root must stay crawlable');
    } finally { restore(); }
  });

  test(`${host} serves a valid sitemap of canonical public pages`, async () => {
    const restore = noUpstream();
    try {
      const res = await worker.fetch(new Request(`https://${host}/sitemap.xml`));
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /application\/xml/);
      const xml = await res.text();
      assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
      assert.deepEqual(locs, SEONAMMEDI_SITEMAP_PATHS.map(p => 'https://seonammedi.kr' + p));
      for (const loc of locs) assert.doesNotMatch(loc, /admin|minutes|api|ekodi\.kr/);
    } finally { restore(); }
  });

  test(`${host} serves the IndexNow key file`, async () => {
    const restore = noUpstream();
    try {
      const res = await worker.fetch(new Request(`https://${host}${EKODI_INDEXNOW_KEY_PATH}`));
      assert.equal(res.status, 200);
      assert.equal(await res.text(), EKODI_INDEXNOW_KEY);
    } finally { restore(); }
  });
}

test('HEAD sitemap returns headers without body', async () => {
  const restore = noUpstream();
  try {
    const res = await worker.fetch(new Request('https://seonammedi.kr/sitemap.xml', { method: 'HEAD' }));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '');
  } finally { restore(); }
});

test('non-read methods and other paths still proxy upstream (no regression)', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async request => {
    seen.push(request.method + ' ' + new URL(request.url).pathname);
    return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
  };
  try {
    await worker.fetch(new Request('https://seonammedi.kr/sitemap.xml', { method: 'OPTIONS' }));
    await worker.fetch(new Request('https://seonammedi.kr/'));
    await worker.fetch(new Request('https://seonammedi.kr/sitemap.xml.bak'));
    assert.deepEqual(seen, ['OPTIONS /seonammedi/sitemap.xml', 'GET /seonammedi/', 'GET /seonammedi/sitemap.xml.bak']);
  } finally { globalThis.fetch = original; }
});

test('unknown hosts are still rejected before discovery routes', async () => {
  const restore = noUpstream();
  try {
    const res = await worker.fetch(new Request('https://evil.example/robots.txt'));
    assert.equal(res.status, 404);
  } finally { restore(); }
});
