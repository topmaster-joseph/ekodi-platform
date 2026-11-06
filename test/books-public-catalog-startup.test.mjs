import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../books/app.js',import.meta.url),'utf8');
const html = readFileSync(new URL('../books/index.html',import.meta.url),'utf8');
const start = app.indexOf('function mergeCatalog(');
const end = app.indexOf('// BOOKS-SALE-READINESS-001',start);
assert.ok(start > 0 && end > start, 'isolate public catalog browser logic');
const browserCode = app.slice(start,end);
function harness({ failOptional=false }={}) {
  const calls=[];
  const fetch=async (url,options={})=>{
    calls.push({url:String(url),cache:options.cache});
    if (failOptional && !String(url).endsWith('/books.json')) throw new Error('optional API timeout');
    const data=String(url).endsWith('/books.json')
      ? {books:[{id:'BOOK-ONE',title:'A',links:{}}]}
      : String(url).includes('/publications')
        ? {books:[{id:'BOOK-EXTRA',title:'B',links:{},isPublic:true}]}
        : {approvals:[{bookId:'BOOK-EXTRA'}]};
    return {ok:true,status:200,json:async()=>data};
  };
  const load=runInNewContext(
    "const API='https://ekodi.kr';function catalogBase(){return '/books'};"+
    browserCode+'\nfetchCatalog;',
    {fetch,console:{warn(){}}},
  );
  return {calls,load};
}

test('public CI-validated bookstore catalog is preloaded with the same GET URL and fetch cache mode',async()=>{
  assert.match(html,/<link rel="preload" href="\/books\/books\.json" as="fetch" type="application\/json" crossorigin>/);
  const {calls,load}=harness();
  const result=await load();
  assert.equal(result.books.length,2);
  assert.deepEqual(calls.map(x=>x.cache),['default','no-store','no-store']);
  assert.equal(calls[0].url,'/books/books.json');
  assert.equal(calls[1].url,'https://ekodi.kr/api/books/public/publications');
  assert.equal(calls[2].url,'/books/api/commerce/public/approvals');
  assert.equal(result.books.find(x=>x.id==='BOOK-EXTRA')._approved,true);
});

test('optional public API failures still preserve the static book catalog without cached sales approvals',async()=>{
  const {calls,load}=harness({failOptional:true});
  const result=await load();
  assert.equal(result.books.length,1);
  assert.equal(result.books[0].id,'BOOK-ONE');
  assert.equal(Boolean(result.books[0]._approved),false);
  assert.deepEqual(calls.map(x=>x.cache),['default','no-store','no-store']);
});
