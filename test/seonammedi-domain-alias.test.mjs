import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import legacyRedirect from '../legacy-redirect.js';

test('SeonamMedi standalone domains redirect to the canonical EKODI path', async () => {
  const cases = [
    ['https://seonammedi.kr/', 'https://ekodi.kr/seonammedi/'],
    ['https://seonammedi.kr/admin?from=domain', 'https://ekodi.kr/seonammedi/admin?from=domain'],
    ['https://seonammedi.kr/seonammedi/notice?id=1', 'https://ekodi.kr/seonammedi/notice?id=1'],
    ['https://서남권국립의대.kr/', 'https://ekodi.kr/seonammedi/'],
    ['https://서남권국립의대.kr/admin/', 'https://ekodi.kr/seonammedi/admin/']
  ];

  for (const [source, expected] of cases) {
    const response = await legacyRedirect.fetch(new Request(source));
    assert.equal(response.status, 301, source);
    assert.equal(response.headers.get('location'), expected, source);
  }
});

test('SeonamMedi Cloudflare custom domains are declared in punycode-safe form', async () => {
  const wrangler = await readFile(new URL('../wrangler.seonammedi-redirect.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /pattern = "seonammedi\.kr"[\s\S]*zone_name = "seonammedi\.kr"/);
  assert.match(wrangler, /pattern = "xn--3e0b8b58jw4co4mnpll3k\.kr"[\s\S]*zone_name = "xn--3e0b8b58jw4co4mnpll3k\.kr"/);
});

// HOST-PRESERVING-LINKS-20261105: 한글 도메인은 한글 도메인으로, 영어 도메인은 영어 도메인으로.
import hostWorker from '../seonammedi-domain-gateway.js';
test('each customer domain keeps menu and content links on its own host; canonical follows the host', async () => {
  const IDN = 'xn--3e0b8b58jw4co4mnpll3k.kr';
  const page = '<html><head><link rel="canonical" href="https://seonammedi.kr/"><meta property="og:url" content="https://xn--3e0b8b58jw4co4mnpll3k.kr/"></head><body><a href="https://seonammedi.kr/board/notices">공지</a><a href="https://xn--3e0b8b58jw4co4mnpll3k.kr/board/voices">시민의견</a><a href="https://seonammedi.kr.example.com/">x</a></body></html>';
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(page, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  try {
    for (const [host, other] of [[IDN, 'seonammedi.kr'], ['seonammedi.kr', IDN]]) {
      const html = await (await hostWorker.fetch(new Request(`https://${host}/`))).text();
      assert.ok(html.includes(`href="https://${host}/board/notices"`), host);
      assert.ok(html.includes(`href="https://${host}/board/voices"`), host);
      assert.ok(html.includes(`og:url" content="https://${host}/"`), host);
      assert.ok(!html.includes(`href="https://${other}/board`), host);
      assert.ok(html.includes(`<link rel="canonical" href="https://${host}/">`), host);
      assert.ok(html.includes('https://seonammedi.kr.example.com/'), 'unrelated hosts are untouched');
    }
  } finally { globalThis.fetch = original; }
});
