import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../site-worker.js';

const siteOwnedPaths=['/auth','/cloud','/live','/pay','/ekodibiz/trade','/messenger','/invest'];
for(const path of siteOwnedPaths){
  test(`${path}/admin uses the canonical platform admin path`,async()=>{
    const response=await worker.fetch(new Request(`https://ekodi.kr${path}/admin`),{});
    assert.equal(response.status,307);
    const location=new URL(response.headers.get('location'));
    assert.equal(location.origin,'https://ekodi.kr');
    assert.equal(location.pathname,'/admin/');
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.match(response.headers.get('x-robots-tag')||'',/noindex/i);
  });
}
