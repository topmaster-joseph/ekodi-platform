import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DISCOVERY_PRIVATE_PREFIXES, DISCOVERY_PUBLIC_ROUTES, renderSitemapXml } from '../discovery-layer.js';

test('SeonamMedi is a first-class public discovery route', async () => {
  const route = DISCOVERY_PUBLIC_ROUTES.find(item => item.path === '/seonammedi');
  assert.ok(route);
  assert.equal(route.priority, '0.9');
  assert.ok(DISCOVERY_PRIVATE_PREFIXES.includes('/seonammedi/admin'));
  assert.ok(DISCOVERY_PRIVATE_PREFIXES.includes('/api/seonammedi/'));
  assert.match(renderSitemapXml(), /<loc>https:\/\/ekodi\.kr\/seonammedi<\/loc>/);
});

test('SeonamMedi public page carries explicit search metadata', async () => {
  const html = await readFile(new URL('../sites/seonammedi/public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/seonammedi\.kr\/">/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /seonammedi\.kr/);
  assert.match(html, /서남권국립의대\.kr/);
});

test('SeonamMedi is findable by the compound query 서남권국립의대', async () => {
  const html = await readFile(new URL('../sites/seonammedi/public/index.html', import.meta.url), 'utf8');
  assert.match(html, /<title>서남권국립의대 소통센터[^<]*<\/title>/);
  assert.match(html, /<meta name="description" content="서남권국립의대\(서남권 국립의대\)/);
  assert.match(html, /"alternateName":\["서남권국립의대"/);
  assert.match(html, /<meta name="keywords" content="서남권국립의대,/);
  const notices = await readFile(new URL('../sites/seonammedi/public/notices/index.html', import.meta.url), 'utf8');
  assert.match(notices, /<title>공지 · 서남권국립의대 소통센터<\/title>/);
});
