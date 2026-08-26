import test from 'node:test';
import assert from 'node:assert/strict';
import { handleR2StorageControl } from '../r2-storage-control.js';

class MemoryR2Bucket {
  constructor(){this.objects=new Map();}
  async put(key,body,options={}){
    const bytes=new Uint8Array(await new Response(body || new Uint8Array()).arrayBuffer());
    const uploaded=new Date('2026-08-26T00:00:00Z');
    const item={key,size:bytes.byteLength,etag:`etag-${key}`,httpEtag:`"etag-${key}"`,uploaded,httpMetadata:options.httpMetadata||{},customMetadata:options.customMetadata||{},bytes};
    this.objects.set(key,item);
    return item;
  }
  async get(key){
    const item=this.objects.get(key);if(!item)return null;
    return {...item,body:new Response(item.bytes).body,writeHttpMetadata(headers){if(item.httpMetadata?.contentType)headers.set('content-type',item.httpMetadata.contentType);}};
  }
  async delete(key){this.objects.delete(key);}
  async list({prefix='',limit=100}={}){
    const objects=[...this.objects.values()].filter(item=>item.key.startsWith(prefix)).slice(0,limit);
    return {objects,truncated:false};
  }
}

function request(path,init={}){
  const headers=new Headers(init.headers||{});
  headers.set('cf-access-jwt-assertion','test-access-assertion');
  return new Request(`https://drive.ekodi.kr${path}`,{...init,headers});
}

test('R2 status requires Cloudflare Access context',async()=>{
  const env={R2_BUCKET:new MemoryR2Bucket()};
  const response=await handleR2StorageControl(new Request('https://drive.ekodi.kr/api/control/storage/r2/status'),env);
  assert.equal(response.status,401);
  assert.equal((await response.json()).code,'ACCESS_REQUIRED');
});

test('R2 status reports configured binding',async()=>{
  const response=await handleR2StorageControl(request('/api/control/storage/r2/status'),{R2_BUCKET:new MemoryR2Bucket()});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,provider:'r2',configured:true,binding:'R2_BUCKET'});
});

test('R2 object write, read, list and delete round trip',async()=>{
  const bucket=new MemoryR2Bucket();
  const env={R2_BUCKET:bucket};
  const key='private/tests/hello.txt';

  const create=await handleR2StorageControl(request(`/api/control/storage/r2/object?key=${encodeURIComponent(key)}`,{method:'POST',body:'hello r2',headers:{'content-type':'text/plain; charset=utf-8'}}),env);
  assert.equal(create.status,201);
  assert.equal((await create.json()).object.key,key);

  const read=await handleR2StorageControl(request(`/api/control/storage/r2/object?key=${encodeURIComponent(key)}`),env);
  assert.equal(read.status,200);
  assert.equal(read.headers.get('x-ekodi-storage-provider'),'r2');
  assert.equal(await read.text(),'hello r2');

  const list=await handleR2StorageControl(request('/api/control/storage/r2/list?prefix=private/tests/'),env);
  assert.equal(list.status,200);
  const listing=await list.json();
  assert.equal(listing.objects.length,1);
  assert.equal(listing.objects[0].key,key);

  const remove=await handleR2StorageControl(request(`/api/control/storage/r2/object?key=${encodeURIComponent(key)}`,{method:'DELETE'}),env);
  assert.equal(remove.status,200);
  assert.equal((await remove.json()).deleted,key);

  const missing=await handleR2StorageControl(request(`/api/control/storage/r2/object?key=${encodeURIComponent(key)}`),env);
  assert.equal(missing.status,404);
});

test('R2 object keys reject traversal and absolute paths',async()=>{
  const env={R2_BUCKET:new MemoryR2Bucket()};
  for(const key of ['../secret','private/../secret','/absolute','private//double']){
    const response=await handleR2StorageControl(request(`/api/control/storage/r2/object?key=${encodeURIComponent(key)}`,{method:'POST',body:'x'}),env);
    assert.equal(response.status,400,key);
  }
});

test('R2 control fails closed without bucket binding',async()=>{
  const response=await handleR2StorageControl(request('/api/control/storage/r2/status'),{});
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'R2_NOT_CONFIGURED');
});
