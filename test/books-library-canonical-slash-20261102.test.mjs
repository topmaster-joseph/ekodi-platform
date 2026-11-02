import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCanonicalSurface } from '../canonical-surface-router.js';

test('slashless /books/library canonically redirects to the same bookstore, not root /library', async () => {
  let called = 0;
  const env = {
    BOOKS: {
      async fetch() {
        called++;
        return new Response(null,{status:307,headers:{location:'/library/'}});
      }
    }
  };
  for (const method of ['GET','HEAD']) {
    const response = await routeCanonicalSurface(
      new Request('https://ekodi.kr/books/library?source=menu', {method}), env
    );
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), 'https://ekodi.kr/books/library/?source=menu');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(called, 0, 'canonical alias must be handled before upstream asset redirect');
  }
});

test('slash-suffixed /books/library/ still reaches Books service and remains identical', async () => {
  const paths=[];
  const env={
    BOOKS:{
      async fetch(req){
        paths.push(new URL(req.url).pathname);
        return new Response('<h1>내 서재</h1>',{headers:{'content-type':'text/html; charset=utf-8'}});
      }
    }
  };
  const response=await routeCanonicalSurface(new Request('https://ekodi.kr/books/library/'),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-canonical-surface'),'books');
  assert.equal(response.headers.get('x-ekodi-canonical-path'),'/books');
  assert.deepEqual(paths,['/library/']);
  assert.match(await response.text(),/내 서재/);
});

test('canonical books alias does not capture a library file or a different service',async()=>{
  const records=[];
  const env={
    BOOKS:{fetch:async req=>{records.push(new URL(req.url).pathname);return new Response('book asset')}},
    MY:{fetch:async()=>new Response('my asset')}
  };
  for(const path of ['/books/library/library.js','/books/library/extra']){
    const r=await routeCanonicalSurface(new Request('https://ekodi.kr'+path),env);
    assert.equal(r.status,200);
  }
  assert.deepEqual(records,['/library/library.js','/library/extra']);
});
