// BOOKS-SOCIAL-PROMOTION-001
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bookCandidatesFromCatalog, directContent } from '../mall-promotion-automation.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../books/books.json', import.meta.url), 'utf8'));

test('every direct-sale title with a raster cover becomes a promotion candidate', () => {
  const list = bookCandidatesFromCatalog(catalog);
  assert.equal(list.length, catalog.books.filter(b => b.directSale?.enabled && b.socialImage).length);
  for (const c of list) {
    assert.match(c.imageUrl, /^https:\/\/ekodi\.kr\/books\/assets\/.+\.jpg$/);
    assert.match(c.publicUrl, /^https:\/\/ekodi\.kr\/books\/buy\/\?book=/);
    assert.ok(fs.existsSync(new URL(`../books${new URL(c.imageUrl).pathname.replace('/books', '')}`, import.meta.url)), 'cover file exists');
  }
});

test('book posts link to the bookstore checkout with UTM and bookstore hashtags', () => {
  const [c] = bookCandidatesFromCatalog(catalog);
  const post = directContent(c, 'instagram', '2026-10-27');
  assert.match(post.linkUrl, /utm_source=instagram/);
  assert.match(post.linkUrl, /utm_campaign=book-20261027/);
  assert.match(post.caption, /#에코디서점/);
  assert.doesNotMatch(post.caption, /배송/);
});

test('titles without direct sale or raster cover are never promoted', () => {
  assert.equal(bookCandidatesFromCatalog({ books: [{ id: 'A', title: 'A', directSale: { enabled: false }, socialImage: '/a.jpg' }, { id: 'B', title: 'B', directSale: { enabled: true } }] }).length, 0);
});
