// MALL-BOOKSTORE-BRIDGE-001: every title in the EKODI bookstore catalog
// (books/books.json, the bookstore's source of truth) is listed in the mall's
// 책·배움 corner automatically. The bookstore stays the owner of each title;
// the mall only mirrors it and sends buyers to the real sale link.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const BOOKSTORE_STORE_ID = 'store-ekodi-books';
export const BOOKSTORE_CATEGORY = 'book';
const BOOKSTORE_BASE = 'https://ekodi.kr/books';

const slugFor = (book) => `book-${String(book.catalogNo || book.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
const absolute = (url) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${BOOKSTORE_BASE}${value}`;
  return '';
};

export function bookstoreProducts(catalog) {
  const books = Array.isArray(catalog?.books) ? catalog.books : [];
  return books.filter((book) => book?.id && book?.title).map((book) => {
    const saleUrl = absolute(book.links?.upaper || book.links?.korea || book.links?.google || book.links?.amazon);
    const price = Number(book.listPrice?.amount);
    const detailUrl = absolute(book.detailUrl) || `${BOOKSTORE_BASE}/#catalog`;
    return {
      id: `bookstore-${book.id}`,
      slug: slugFor(book),
      storeId: BOOKSTORE_STORE_ID,
      name: book.subtitle ? `${book.title} — ${book.subtitle}` : book.title,
      category: BOOKSTORE_CATEGORY,
      badge: '에코디서점',
      description: String(book.abstract || book.subtitle || `${book.author} 저 · 에코디서점 발행`).slice(0, 400),
      status: saleUrl ? '판매 중' : '판매처 등록 준비 중',
      saleType: 'publisher',
      published: true,
      featured: Boolean(saleUrl),
      price: Number.isFinite(price) && price > 0 ? price : null,
      author: book.author || '',
      image: absolute(book.coverImage) || '',
      source: { system: 'ekodi-bookstore', bookId: book.id, detailUrl },
      action: saleUrl
        ? { type: 'external', label: '전자책 구매하기', url: saleUrl }
        : { type: 'inquiry', label: '에코디서점에서 보기', url: detailUrl }
    };
  });
}

export async function loadBookstoreProducts(mallRoot) {
  const file = path.resolve(mallRoot, '..', '..', 'books', 'books.json');
  return bookstoreProducts(JSON.parse(await readFile(file, 'utf8')));
}

export function mergeBookstoreProducts(products, mirrored) {
  const ids = new Set(products.map((product) => product.id));
  const slugs = new Set(products.map((product) => product.slug));
  return [...products, ...mirrored.filter((product) => !ids.has(product.id) && !slugs.has(product.slug))];
}
