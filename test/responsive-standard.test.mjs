import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [responsiveCss, buildScript, booksHtml, booksResponsiveCss] = await Promise.all([
  readFile(new URL('../responsive.css', import.meta.url), 'utf8'),
  readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../books/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../books/responsive.css', import.meta.url), 'utf8'),
]);

test('EKODI responsive standard keeps words intact and protects long identifiers', () => {
  assert.match(responsiveCss, /word-break:keep-all/);
  assert.match(responsiveCss, /overflow-wrap:break-word/);
  assert.match(responsiveCss, /overflow-wrap:anywhere/);
  assert.doesNotMatch(responsiveCss, /word-break:break-all/);
});

test('platform build injects the responsive standard into every HTML asset', () => {
  assert.match(buildScript, /responsive\.css/);
  assert.match(buildScript, /htmlAssets/);
  assert.match(buildScript, /data-ekodi-responsive/);
});

test('Books loads the same responsive standard', () => {
  assert.match(booksHtml, /\/responsive\.css/);
  assert.match(booksResponsiveCss, /word-break:keep-all/);
  assert.doesNotMatch(booksResponsiveCss, /word-break:break-all/);
});
