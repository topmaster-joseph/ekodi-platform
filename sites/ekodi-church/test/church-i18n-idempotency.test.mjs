import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const extended=await readFile(new URL('../church-i18n-extended.js',import.meta.url),'utf8');

test('every extended-locale DOM write is idempotent under the document MutationObserver',()=>{
  const guards=[
    "if(document.title!==meta.title)document.title=meta.title;",
    "description.getAttribute('content')!==meta.description",
    "if(text&&text.textContent!==",
    "if(ref&&ref.textContent!==entry.ref)",
    "if(box.title!==nextTitle)box.title=nextTitle;",
    "if(box.getAttribute('aria-label')!==nextAria)",
    "if(document.documentElement.lang!==desired)document.documentElement.lang=desired;",
    "if(document.documentElement.dataset.ekodiLocale!==desired)document.documentElement.dataset.ekodiLocale=desired;",
    "if(translated===source)continue;"
  ];
  for(const guard of guards)assert.ok(extended.includes(guard),'missing no-op guard '+guard);
  assert.match(extended,/new MutationObserver\(schedule\)\.observe/);
});

test('five extended languages retain their document metadata and life hub translation',()=>{
  for(const locale of ['my','kac','vi','mn','id']){
    assert.match(extended,new RegExp('^\\s*'+locale+':\\{title:','m'));
  }
  assert.match(extended,/add\('예배자료 관리'/);
});
