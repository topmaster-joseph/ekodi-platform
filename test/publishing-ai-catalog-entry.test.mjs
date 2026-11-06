import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { aiCatalogEntry } from '../scripts/publishing-ai-catalog-entry.mjs';

const catalog = JSON.parse(await readFile(new URL('../books/books.json', import.meta.url), 'utf8'));
const bookId = 'a2950cfc-e8b9-485a-ace1-c168580f3b92';
const digest = 'a'.repeat(64);
const payload = { kind: 'ai_collab_ebook', title: 'AI 활용 시작하기', subtitle: '일상에서 바로 쓰는', author: '정찬균', disclosure: 'AI 협업 초안 · 저자 감수', keywords: ['AI'], pitch: '오늘 바로 써먹는 AI.', genre: 'ai-practical', saleActivation: false };

test('AI handoff becomes a new catalog entry, listed but not for sale, with disclosure', () => {
  const before = JSON.stringify(catalog.books);
  const { entry, added } = aiCatalogEntry(catalog, { bookId, digest, payload, toc: ['1장', '2장'] });
  assert.equal(added, true);
  assert.equal(JSON.stringify(catalog.books), before, 'existing books untouched');
  assert.match(entry.id, /^BOOK-EKODI-\d{6}$/);
  assert.ok(!catalog.books.some(b => b.id === entry.id), 'fresh id');
  assert.equal(entry.listPrice.amount, null, 'price is the owner\'s decision');
  assert.equal(entry.directSale, undefined, 'no direct sale');
  assert.equal(entry.discipline, 'AI 활용 실용');
  assert.equal(entry.aiCollaboration.disclosure, 'AI 협업 초안 · 저자 감수');
  assert.match(entry.abstract, /AI 협업 초안/);
  assert.deepEqual(entry.toc, ['1장', '2장']);
});

test('same AI book is never listed twice; unsafe handoffs are refused', () => {
  const { entry } = aiCatalogEntry(catalog, { bookId, digest, payload });
  const again = aiCatalogEntry({ books: [...catalog.books, entry] }, { bookId, digest, payload });
  assert.equal(again.added, false);
  assert.throws(() => aiCatalogEntry(catalog, { bookId, digest, payload: { ...payload, saleActivation: true } }), /must not activate sales/);
  assert.throws(() => aiCatalogEntry(catalog, { bookId, digest: 'x', payload }), /digest/);
  assert.throws(() => aiCatalogEntry(catalog, { bookId, digest, payload: { ...payload, kind: 'other' } }), /not an AI/);
});
