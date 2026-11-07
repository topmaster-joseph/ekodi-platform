import test from 'node:test';
import assert from 'node:assert/strict';
import { withHeaders } from '../space-worker.js';
import { renderBbqCheonggyePage } from '../bbq-cheonggye-site.js';

const html=(headers={})=>new Response('<h1>Store</h1>',{
  headers:{'content-type':'text/html; charset=utf-8',...headers}
});

test('space storefront must preserve a store-provided restrictive noindex',()=>{
  const response=withHeaders({},html({'x-robots-tag':'noindex, nofollow, noarchive','x-ekodi-workspace':'bbqcg'}),'space-storefront');
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  assert.equal(response.headers.get('x-ekodi-workspace'),'bbqcg');
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('space storefront keeps default searchable projection only when not restricted',()=>{
  const response=withHeaders({},html(),'space-storefront');
  assert.equal(response.headers.get('x-robots-tag'),'index, follow');
});
test('mission and organization public projections honor explicit noindex and default indexing',()=>{
  for(const kind of ['space-storefront','space-organization']){
    assert.equal(withHeaders({},html({'x-robots-tag':'noindex'}),kind).headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
    assert.equal(withHeaders({},html(),kind).headers.get('x-robots-tag'),'index, follow');
  }
});
test('private admin surfaces remain noindex even with explicit index from an inner renderer',()=>{
  const response=withHeaders({},html({'x-robots-tag':'index, follow'}),'space-admin');
  assert.equal(response.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
});
test('unverified BBQ landing stays noindex through shared Space response wrapper',async()=>{
  const request=new Request('https://ekodi.kr/bbqcg');
  const publicResponse=await renderBbqCheonggyePage(request,{},{name:'BBQ 무안청계점'});
  assert.match(publicResponse.headers.get('x-robots-tag'),/noindex/);
  const wrapped=withHeaders({},publicResponse,'space-storefront');
  assert.equal(wrapped.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');
  assert.match(await wrapped.text(),/data-store-entity="bbqcg"/);
});
