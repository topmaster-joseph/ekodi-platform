// BOOKS-COVER-MOUNT-001 — catalogue covers must resolve to /books/assets/* exactly once after the /books gateway rewrite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

const served = async (path, file, type) => {
  const body = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const env = { BOOKS: { fetch: async () => new Response(body, { headers: { 'content-type': type } }) } };
  return (await routeCanonicalSurface(new Request(`https://ekodi.kr/books${path}`), env, { legacyFetch: async () => new Response('', { status: 599 }) })).text();
};

test('storefront cover src and JSON-LD image are mounted exactly once', async () => {
  const js = await served('/app.js', 'books/app.js', 'application/javascript');
  const catalog = JSON.parse(await served('/books.json', 'books/books.json', 'application/json'));
  const lines = js.split('\n').filter(l => /^function (catalogBase|underBase|absoluteUrl)\(/.test(l));
  assert.equal(lines.length, 3);
  for (const pathname of ['/books/', '/']) {
    const ctx = { location: { pathname }, URL };
    vm.runInNewContext(lines.join('\n') + ';this.u=underBase;this.a=absoluteUrl;', ctx);
    for (const b of catalog.books) {
      const src = ctx.u(b.coverImage);
      assert.doesNotMatch(src, /\/books\/books\//, `${b.id} ${pathname}`);
      assert.match(ctx.a(b.coverImage), /^https:\/\/ekodi\.kr\/books\/assets\/[^/]+$/);
    }
  }
  assert.match(js, /img\.src=underBase\(book\.coverImage\)/);
});

test('both catalogue covers are real raster files', () => {
  const catalog = JSON.parse(readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));
  for (const b of catalog.books) {
    assert.match(b.coverImage, /\.jpg$/);
    assert.ok(existsSync(new URL(`../books${b.coverImage}`, import.meta.url)), b.coverImage);
  }
});

test('ekodian is presented as a Korean edition; English is a separate Amazon edition', () => {
  const catalog = JSON.parse(readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));
  const b = catalog.books.find(x => x.id === 'BOOK-EKODI-000001');
  assert.equal(b.language, 'ko');
  assert.doesNotMatch(JSON.stringify(b.languageLabel) + b.abstract, /병기/);
  assert.equal(b.editions.amazonEnglish.language, 'en');
  assert.equal(b.links.upaper, 'https://ekodi.upaper.kr/content/1223429');
  const html = readFileSync(new URL('../books/ekodian/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /병기/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld.inLanguage, 'ko');
  assert.equal(ld.alternateName, undefined);
  assert.equal(ld.workTranslation.inLanguage, 'en');
});
