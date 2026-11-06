import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertPrivateBoardNoStore} from '../scripts/verify-independent-board-live.mjs';

const held=(cacheControl,status=404)=>new Response('서비스 비공개',{
  status,headers:cacheControl==null?{}:{'cache-control':cacheControl}
});

test('private board 404 accepts producer and edge no-store headers without depending on directive order',()=>{
  for(const value of [
    'private, no-store, max-age=0',
    'no-store',
    'no-store, private, max-age=0',
    'NO-STORE, max-age=0',
  ]) assert.doesNotThrow(()=>assertPrivateBoardNoStore(held(value),'/cheonggye/board/api/health'));
});

test('private board 404 rejects cacheable, public or non-404 responses',()=>{
  for(const value of [
    null,'', 'private', 'private, max-age=0', 'no-cache',
    'public, no-store','no-store-incorrect','max-age=60',
  ]) assert.throws(()=>assertPrivateBoardNoStore(held(value),'/cheonggye/board/api/health'),/no-store|public caching/);
  assert.throws(()=>assertPrivateBoardNoStore(held('no-store',200),'/cheonggye/board/api/health'),/remain 404/);
});

test('board verifier still enforces ownership, noindex and first-party read-only behavior',async()=>{
  const source=await readFile(new URL('../scripts/verify-independent-board-live.mjs',import.meta.url),'utf8');
  assert.match(source,/const held=await request\(path,\[404\]\)/);
  assert.match(source,/assert\.equal\(held\.headers\.get\('x-ekodi-route'\),'regional-private-hold'/);
  assert.match(source,/assert\.equal\(held\.headers\.get\('x-ekodi-region-publication'\),'private-owner-release-required'/);
  assert.match(source,/assert\.match\(held\.headers\.get\('x-robots-tag'\)\|\|'',\/noindex/i);
  assert.match(source,/method: 'GET'/);
  assert.match(source,/if \(response\.status === 429 \|\| response\.status === 1027\)/);
});
