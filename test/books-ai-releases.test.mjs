import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiReleaseBooks, isVerifiedAiRelease, mergeAiReleases, aiReleaseSaleReady, validAiReleaseEntry, __resetAiReleaseCacheForTests } from '../books-ai-releases.js';
import { loadCatalog, authorizedPublicSaleBook } from '../books-commerce.js';
import { effectiveSaleReadiness } from '../books-edition-approval.js';

const SHA = 'c'.repeat(64);
const entry = (o = {}) => ({ id: 'BOOK-EKODI-AI-A2950CFC', title: 'AI 활용 시작하기', author: '정찬균', catalogNo: 'EB-AIC-A2950CFC',
  directSale: { enabled: true, fileKey: 'BOOK-EKODI-AI-A2950CFC/ebook.epub', format: 'EPUB 3', edition: 'AI 협업 1판' },
  listPrice: { currency: 'KRW', amount: 6900, label: '6,900원' }, aiCollaboration: { disclosure: 'AI 협업 초안 · 저자 감수', epubSha256: SHA }, ...o });
const catalogJson = readFileSync(new URL('../books/books.json', import.meta.url), 'utf8');
function env({ books = [entry()], ok = true, sha = SHA } = {}) {
  return {
    PUBLISHING: { fetch: async req => { assert.match(new URL(req.url).pathname, /^\/api\/workflow\/public\/ai-releases$/); return ok ? Response.json({ ok: true, books }) : new Response('x', { status: 503 }); } },
    ASSETS: { fetch: async () => new Response(catalogJson, { headers: { 'content-type': 'application/json' } }) },
    BOOK_FILES: { head: async key => key === 'BOOK-EKODI-AI-A2950CFC/ebook.epub' ? { customMetadata: { sha256: sha }, size: 10 } : null },
  };
}

test('released AI books join the catalog and existing books stay first and unchanged', async () => {
  __resetAiReleaseCacheForTests();
  const base = JSON.parse(catalogJson);
  const merged = await loadCatalog(env());
  assert.deepEqual(merged.books.slice(0, base.books.length), base.books);
  assert.equal(merged.books.at(-1).id, 'BOOK-EKODI-AI-A2950CFC');
  assert.equal(isVerifiedAiRelease(merged.books.at(-1)), true);
});

test('only binding-verified entries can sell; the same JSON from anywhere else cannot', async () => {
  __resetAiReleaseCacheForTests();
  const e = env();
  const merged = await loadCatalog(e);
  assert.equal((await authorizedPublicSaleBook(e, merged, 'BOOK-EKODI-AI-A2950CFC'))?.id, 'BOOK-EKODI-AI-A2950CFC');
  const forged = { books: [...JSON.parse(catalogJson).books, entry()] };
  assert.equal(isVerifiedAiRelease(forged.books.at(-1)), false);
  assert.equal(await authorizedPublicSaleBook({}, forged, 'BOOK-EKODI-AI-A2950CFC'), null);
});

test('sale readiness requires the stored EPUB fingerprint to match the release record', async () => {
  __resetAiReleaseCacheForTests();
  const good = env(); const book = (await loadCatalog(good)).books.at(-1);
  assert.equal((await effectiveSaleReadiness(good, book)).source, 'ai_release');
  assert.equal(await aiReleaseSaleReady({ ...good, BOOK_FILES: { head: async () => ({ customMetadata: { sha256: 'd'.repeat(64) } }) } }, book), false);
  assert.equal(await aiReleaseSaleReady({ ...good, BOOK_FILES: { head: async () => null } }, book), false);
});

test('invalid feed entries are dropped; feed failure keeps the store working; id collisions keep the existing book', async () => {
  assert.equal(validAiReleaseEntry(entry({ listPrice: { currency: 'KRW', amount: 0 } })), false);
  assert.equal(validAiReleaseEntry(entry({ directSale: { enabled: true, fileKey: 'BOOK-EKODI-000001/ebook.epub' } })), false);
  assert.equal(validAiReleaseEntry(entry({ id: 'BOOK-EKODI-000001' })), false);
  __resetAiReleaseCacheForTests();
  const down = await loadCatalog(env({ ok: false }));
  assert.equal(down.books.length, JSON.parse(catalogJson).books.length);
  const m = mergeAiReleases({ books: [{ id: 'X', title: 'old' }] }, [{ id: 'X', title: 'new' }]);
  assert.deepEqual(m.books, [{ id: 'X', title: 'old' }]);
  __resetAiReleaseCacheForTests();
  assert.deepEqual(await aiReleaseBooks({}), []);
});
