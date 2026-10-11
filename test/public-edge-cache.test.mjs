import test from 'node:test';
import assert from 'node:assert/strict';
import { publicEdgeCacheProfile, withPublicEdgeCache } from '../public-edge-cache.js';

function memoryCache(){
  const values=new Map();
  const key=request=>request.url;
  return {
    async match(request){const value=values.get(key(request));return value?value.clone():undefined},
    async put(request,response){values.set(key(request),response.clone())},
  };
}

test('safe SeonamMedi public reads use bounded Cloudflare Cache API profiles',async()=>{
  const cache=memoryCache();
  const pending=[];
  const ctx={waitUntil(promise){pending.push(promise)}};
  let loads=0;
  const request=new Request('https://seonammedi.kr/api/seonammedi/timeline',{method:'GET'});
  const loader=async()=>{loads++;return new Response('{"ok":true,"items":[]}',{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})};
  const first=await withPublicEdgeCache(request,ctx,loader,cache);
  await Promise.all(pending);
  assert.equal(first.headers.get('x-ekodi-edge-cache'),'MISS');
  assert.match(first.headers.get('cache-control')||'',/max-age=60/);
  const second=await withPublicEdgeCache(request,{waitUntil(){}},loader,cache);
  assert.equal(second.headers.get('x-ekodi-edge-cache'),'HIT');
  assert.equal(loads,1);
});

test('credentials, writes and immediate citizen-voice routes never use public edge cache',()=>{
  assert.equal(publicEdgeCacheProfile(new Request('https://ekodi.kr/api/seonammedi/page-data',{headers:{authorization:'Bearer secret'}})),null);
  assert.equal(publicEdgeCacheProfile(new Request('https://ekodi.kr/api/seonammedi/channels',{headers:{cookie:'session=x'}})),null);
  assert.equal(publicEdgeCacheProfile(new Request('https://ekodi.kr/api/seonammedi/timeline',{method:'POST',body:'{}'})),null);
  assert.equal(publicEdgeCacheProfile(new Request('https://ekodi.kr/api/seonammedi/voices')),null);
  assert.equal(publicEdgeCacheProfile(new Request('https://ekodi.kr/api/seonammedi/page-data?_refresh=1')),null);
});

test('public channel previews and notice images have explicit short cache profiles',()=>{
  assert.equal(publicEdgeCacheProfile(new Request('https://ekodi.kr/api/seonammedi/channels/12/preview'))?.ttl,60);
  assert.equal(publicEdgeCacheProfile(new Request('https://ekodi.kr/api/seonammedi/notices/12/image/0'))?.ttl,60);
});
