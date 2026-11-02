import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [index,source,i18n,css]=await Promise.all([
  readFile(new URL('../index.html',import.meta.url),'utf8'),
  readFile(new URL('../church-header-controls.js',import.meta.url),'utf8'),
  readFile(new URL('../church-i18n.js',import.meta.url),'utf8'),
  readFile(new URL('../styles.css',import.meta.url),'utf8'),
]);

test('church declares the shared local top-link contract',()=>{
  assert.match(index,/data-ekodi-home-anchor="#top"/);
  assert.match(index,/class="brand" href="#top"/);
  assert.match(source,/brand\.setAttribute\('href','#top'\)/);
  assert.match(source,/attributeFilter:\['aria-pressed'\]/);
  assert.match(source,/window\.scrollTo\(\{top:0,left:0,behavior\}\)/);
  assert.doesNotMatch(index,/data-ekodi-operating-space-label|>운영공간<\/em>/);
  assert.doesNotMatch(i18n,/'운영공간':\{en:'Operating Space','zh-CN':'运营空间',ja:'運営スペース'\}/);
  assert.doesNotMatch(css,/\.site-header \.brand \.operating-space-label/);
});
