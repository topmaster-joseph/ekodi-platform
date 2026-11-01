import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SEONAMMEDI_CANONICAL_ORIGIN,
  SEONAMMEDI_REQUIRED_PUBLIC_PATHS,
  canonicalIndexNowUrlsFromSitemap,
} from '../scripts/seonammedi-indexnow-public-sitemap.mjs';

const home = SEONAMMEDI_CANONICAL_ORIGIN;
const sitemap = paths => '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  paths.map(path => '<url><loc>' + path + '</loc></url>').join('') + '</urlset>';
const roots = SEONAMMEDI_REQUIRED_PUBLIC_PATHS.map(path => home + path);

test('IndexNow submits all published details from sitemap, not just three static pages', () => {
  const entries = [...roots, home + '/board/notices/26', home + '/board/notices/24', home + '/board/notices/3'];
  assert.deepEqual(canonicalIndexNowUrlsFromSitemap(sitemap(entries)),entries);
  assert.deepEqual(canonicalIndexNowUrlsFromSitemap(sitemap([...entries, entries[3]])),entries);
});

test('IndexNow may never publish private, draft, fake or cross-site links', () => {
  const invalid = [
    'https://seonammedi.kr/',
    'https://ekodi.kr/admin/',
    home + '/admin/',
    home + '/board/api/notices',
    home + '/board/notices/-4',
    home + '/board/voices/1',
    home + '/board/notices/1?private=true',
    home + '/board/notices/1#secret',
    'http://xn--3e0b8b58jw4co4mnpll3k.kr/',
    home + '/notices/26',
    'https://xn--3e0b8b58jw4co4mnpll3k.kr.evil.example/',
  ];
  for(const url of invalid) assert.throws(() => canonicalIndexNowUrlsFromSitemap(sitemap([...roots,url])), /Disallowed|Unexpected/, url);
});

test('IndexNow fails closed on malformed or incomplete live sitemap', () => {
  assert.throws(() => canonicalIndexNowUrlsFromSitemap(''), /Invalid/);
  assert.throws(() => canonicalIndexNowUrlsFromSitemap(sitemap([roots[0]])),/Required public URL missing/);
  assert.throws(() => canonicalIndexNowUrlsFromSitemap(sitemap([...roots,home+'/board/notices/1&amp;x'])),/Unexpected/);
  assert.throws(() => canonicalIndexNowUrlsFromSitemap(sitemap([...roots,home+'/board/notices/2']),{limit:3}),/URL count/);
});

test('production submission code uses live sitemap not a static page list', async () => {
  const code = await readFile(new URL('../scripts/ekodi-search-index-submit.mjs', import.meta.url),'utf8');
  assert.match(code, /canonicalIndexNowUrlsFromSitemap\(await sitemapResponse\.text\(\)\)/);
  assert.match(code, /sitemapUrl = SEONAMMEDI_CANONICAL_ORIGIN \+ '\/sitemap\.xml'/);
  assert.match(code, /AbortSignal\.timeout\(25000\)/);
  assert.match(code, /submitIndexNowBatches/);
  assert.doesNotMatch(code, /playwright|chromium/);
  assert.doesNotMatch(code,/SEONAMMEDI_SITEMAP_PATHS/);
});
