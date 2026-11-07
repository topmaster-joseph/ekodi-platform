import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicEdgeCacheProfile } from '../public-edge-cache.js';

const html=readFileSync(new URL('../sites/seonammedi/public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../sites/seonammedi/public/app.js',import.meta.url),'utf8');

test('public SeonamMedi home feeds are uniquely preloaded from their canonical mount',()=>{
  for(const path of ['/seonammedi/data.json','/api/seonammedi/page-data']){
    const tag='<link rel="preload" href="'+path+'" as="fetch" type="application/json" crossorigin>';
    assert.equal(html.split(tag).length-1,1,path);
    assert.ok(html.indexOf(tag)<html.indexOf('src="/seonammedi/app.js'),path);
  }
  assert.match(html,/fetchpriority="high" decoding="async"/);
});

test('the two public home fetches use response Cache-Control, private/admin requests retain no-store',()=>{
  assert.match(js,/fetch\('\/seonammedi\/data\.json',\{cache:'default'\}\)/);
  assert.match(js,/fetch\('\/api\/seonammedi\/page-data',\{cache:'default'\}\)/);
  assert.match(js,/fetch\('\/api\/seonammedi\/timeline',\{cache:'no-store'\}\)/);
  assert.match(js,/fetch\('\/api\/seonammedi\/admin\/auth\/exchange',\{method:'POST'/);
  assert.match(js,/cache:'no-store'\}\);/);
});

test('anonymous edge cache stays 30 seconds and protected requests bypass it',()=>{
  const publicReq=new Request('https://ekodi.kr/api/seonammedi/page-data');
  const profile=publicEdgeCacheProfile(publicReq);
  assert.equal(profile?.ttl,30);
  assert.equal(profile?.stale,120);
  assert.equal(publicEdgeCacheProfile(new Request(publicReq.url,{headers:{cookie:'session=example'}})),null);
  assert.equal(publicEdgeCacheProfile(new Request(publicReq.url,{headers:{authorization:'Bearer example'}})),null);
  assert.equal(publicEdgeCacheProfile(new Request('https://ekodi.kr/api/seonammedi/admin/finance')),null);
  assert.equal(publicEdgeCacheProfile(new Request(publicReq.url,{method:'POST'})),null);
});
