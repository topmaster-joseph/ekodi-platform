import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStoreSlug } from './storefront.js';

test('store slug accepts only stable public path characters', () => {
  assert.equal(normalizeStoreSlug('cheonggye-store'), 'cheonggye-store');
  assert.equal(normalizeStoreSlug('Store-01'), 'store-01');
  assert.equal(normalizeStoreSlug('a'), '');
  assert.equal(normalizeStoreSlug('../admin'), '');
  assert.equal(normalizeStoreSlug('한글스토어'), '');
});

test('public Storefront exposes published products only and owner listing stays seller-scoped', async () => {
  const source = await readFile(new URL('./storefront.js', import.meta.url), 'utf8');
  assert.match(source, /p\.status='published'/);
  assert.match(source, /WHERE s\.seller_id=\?/);
  assert.match(source, /publishedCount/);
  assert.match(source, /Storefront 탐색은 Mall 경로/);
  assert.doesNotMatch(source, /email AS/);
  assert.doesNotMatch(source, /visitor_id AS/);
});
