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
  const [build, homepage] = await Promise.all([
    read('scripts/build.mjs'),
    read('index.html'),
  ]);

  assert.match(build, /'history\.html'/);
  assert.match(homepage, /href="\/history"/);
  assert.match(homepage, />역사<\/a>/);
  assert.match(homepage, /id="contact"/);
});
