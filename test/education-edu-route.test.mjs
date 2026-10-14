import test from 'node:test';
import assert from 'node:assert/strict';
import {routeCanonicalSurface} from '../canonical-surface-router.js';
import {platformExecutionSurfaceForPath,isReservedPlatformRoot} from '../platform-route-registry.js';
const origin='https://ekodi.kr';
test('new /edu apex root is a reversible alias, not a new Worker',async()=>{
  assert.equal(isReservedPlatformRoot('edu'),true);
  const spec=platformExecutionSurfaceForPath('/edu/study/ai-bootcamp/studio/');
  assert.ok(spec);
  assert.equal(spec.binding,'EDUCATION');assert.equal(spec.prefix,'/edu');
  assert.equal(platformExecutionSurfaceForPath('/education/study').binding,'EDUCATION');
  const slash=await routeCanonicalSurface(new Request(origin+'/edu'),{});
  assert.equal(slash.status,308);assert.equal(slash.headers.get('location'),origin+'/edu/');
  assert.equal((await routeCanonicalSurface(new Request(origin+'/edu/study/'),{})).status,503);
});
test('Education service binding receives stripped deep path with asset links rewritten to /edu',async()=>{
  let received;
  const service={fetch:async request=>{
    received=new URL(request.url);
    return new Response('<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><a href="/study/">Study</a><script src="/app.js"></script><a href="./studio/">Studio</a></body></html>',{status:200,headers:{'content-type':'text/html','content-security-policy':"default-src 'self'"}});
  }};
  const response=await routeCanonicalSurface(new Request(origin+'/edu/study/ai-bootcamp/'),{EDUCATION:service});
  assert.equal(received.pathname,'/study/ai-bootcamp/');
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-canonical-path'),'/edu');
  assert.equal(response.headers.get('content-security-policy'),"default-src 'self'");
  const page=await response.text();
  assert.match(page,/href="\/edu\/styles.css"/);
  assert.match(page,/href="\/edu\/study\/"/);
  assert.match(page,/src="\/edu\/app.js"/);
  assert.match(page,/href="\.\/studio\/"/);
  const studio=await routeCanonicalSurface(new Request(origin+'/edu/study/ai-bootcamp/studio/'),{EDUCATION:service});
  assert.equal(studio.status,200);
  assert.equal(received.pathname,'/study/ai-bootcamp/studio/');
});
test('existing /education and /auth are not shadowed',()=>{
  assert.equal(platformExecutionSurfaceForPath('/education/study').prefix,'/education');
  assert.equal(platformExecutionSurfaceForPath('/auth/'),null);
  assert.equal(platformExecutionSurfaceForPath('/edu-staff/'),null);
});
