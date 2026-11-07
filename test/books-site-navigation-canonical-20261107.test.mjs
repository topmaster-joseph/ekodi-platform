import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pages=[
 'books/buy/index.html',
 'books/buy/success/index.html',
 'books/buy/fail/index.html',
 'books/ekodian/index.html',
 'books/series/index.html',
 'books/research/index.html',
 'books/notes/index.html',
 'books/publishing/index.html',
 'books/publishing/studio/index.html',
];
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('all bookstore navigation labels stay within canonical /books/ site',()=>{
  for(const path of pages){
    const src=read(path);
    const anchors=[...src.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map(m=>m[1]);
    for(const target of ['/', '/#catalog', '/library/', '/series/', '/research/', '/notes/', '/ekodian/']){
      assert.ok(!anchors.includes(target),path+' unexpectedly leaves Books via '+target);
    }
  }
});

test('checkout success, failure and already-owned paths return to correct library/catalog',()=>{
  const purchase=read('books/buy/index.html');
  const success=read('books/buy/success/index.html');
  const fail=read('books/buy/fail/index.html');
  assert.match(purchase,/id="ownedBox" href="https:\/\/ekodi\.kr\/books\/library\//);
  assert.match(purchase,/href="https:\/\/ekodi\.kr\/books\/#catalog"/);
  assert.match(success,/href="https:\/\/ekodi\.kr\/books\/library\//);
  assert.match(success,/href="https:\/\/ekodi\.kr\/books\/#catalog"/);
  assert.match(fail,/id="retry" href="https:\/\/ekodi\.kr\/books\/#catalog"/);
  const result=read('books/buy/result.js');
  assert.match(result,/document\.getElementById\('retry'\)\.href = `\$\{C\.BASE\}\/buy\/\?book=\$\{encodeURIComponent\(last\.bookId\)\}`/);
});

test('bookstore-to-publishing links retain separate Publishing service boundary',()=>{
  assert.match(read('books/publishing/studio/index.html'),/href="\/publishing\//);
  assert.match(read('books/publishing/index.html'),/href="\/publishing\//);
  assert.match(read('books/series/index.html'),/href="https:\/\/ekodi\.kr\/books\/ekodian\//);
});
