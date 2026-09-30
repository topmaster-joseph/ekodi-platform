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
  const wrangler = await readFile(new URL('../wrangler.legacy-redirect.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /pattern = "seonammedi\.kr"[\s\S]*zone_name = "seonammedi\.kr"/);
  assert.match(wrangler, /pattern = "xn--3e0b8b58jw4co4mnpll3k\.kr"[\s\S]*zone_name = "xn--3e0b8b58jw4co4mnpll3k\.kr"/);
});
