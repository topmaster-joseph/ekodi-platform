import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('EKODI History is a canonical public page with responsive timeline semantics', async () => {
  const html = await read('history.html');

  assert.match(html, /<link rel="canonical" href="https:\/\/ekodi\.kr\/history">/);
  assert.match(html, /EKODI HISTORY/);
  assert.match(html, /Ecclesia/);
  assert.match(html, /Koinonia/);
  assert.match(html, /Diaspora/);
  assert.match(html, /Jubilee/);
  assert.match(html, /<details/);
  assert.match(html, /@media\(max-width:/);
  assert.match(html, /position:sticky/);
});

test('site build publishes History and homepage exposes the entry point', async () => {
  const [build, ambient] = await Promise.all([
    read('scripts/build.mjs'),
    read('homepage-ambient.js'),
  ]);

  assert.match(build, /'history\.html'/);
  assert.match(ambient, /href = '\/history'/);
  assert.match(ambient, /data\.ekodiHistoryLink|dataset\.ekodiHistoryLink/);
  assert.match(ambient, /역사 <span>History<\/span>/);
});
