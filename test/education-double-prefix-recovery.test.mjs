import test from 'node:test';
import assert from 'node:assert/strict';
import {routeCanonicalSurface} from '../canonical-surface-router.js';

const root='https://ekodi.kr';
const locationOf=response=>new URL(response.headers.get('location'));

test('old /edu/edu/study bookmarks resolve to a single canonical Education mount',async()=>{
  for(const [source,target] of [
    ['/edu/edu/study/','/edu/study/'],
    ['/edu/edu/study/live/','/edu/study/live/'],
    ['/edu/edu/courses/','/edu/courses/'],
    ['/edu/edu/learn/foreign-worker-cold-safety-2026/','/edu/learn/foreign-worker-cold-safety-2026/'],
    ['/edu/edu/edu/study/','/edu/study/'],
    ['/edu/edu','/edu/'],
  ]){
    const result=await routeCanonicalSurface(new Request(root+source+'?utm_source=screenshot&course=2026'),{});
    assert.equal(result.status,308,source);
    const url=locationOf(result);
    assert.equal(url.origin,root,source);
    assert.equal(url.pathname,target,source);
    assert.equal(url.search,'?utm_source=screenshot&course=2026',source);
    assert.equal(result.headers.get('x-ekodi-route'),'edu-double-prefix-canonical',source);
    assert.equal(result.headers.get('cache-control'),'no-store',source);
    assert.match(result.headers.get('x-robots-tag'),/noindex/,source);
    assert.equal(await result.text(),'');
  }
});

test('HEAD recovers, but malformed non-read teacher APIs fail closed and do not redirect',async()=>{
  const head=await routeCanonicalSurface(new Request(root+'/edu/edu/study/',{method:'HEAD'}),{});
  assert.equal(head.status,308);
  assert.equal(locationOf(head).pathname,'/edu/study/');
  const actions=['POST','PUT','DELETE'];
  for(const method of actions){
    const res=await routeCanonicalSurface(new Request(root+'/edu/edu/teach/access',{method}),{});
    assert.equal(res.status,404,method);
    assert.equal(res.headers.get('location'),null,method);
    assert.equal(res.headers.get('x-ekodi-route'),'edu-double-prefix-rejected',method);
  }
});

test('partial path prefixes and other service hosts remain unchanged',async()=>{
  for(const target of [
    '/edu/educator/study/',
    '/edu/edu-other/study/',
    '/eduedu/study/',
    '/edu/study/',
  ]){
    const res=await routeCanonicalSurface(new Request(root+target),{});
    assert.notEqual(res?.headers?.get('x-ekodi-route'),'edu-double-prefix-canonical',target);
  }
  assert.equal(await routeCanonicalSurface(new Request('https://other.example/edu/edu/study/'),{}),null);
});
