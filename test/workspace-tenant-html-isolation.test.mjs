import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import spaceWorker from '../space-worker.js';

const shell=await readFile(new URL('../space/index.html',import.meta.url),'utf8');
const env={
  DATA_ENABLED:'false',
  ASSETS:{fetch:async()=>new Response(shell,{headers:{'content-type':'text/html; charset=utf-8'}})}
};

test('unrelated trade and generic operating-space pages never include hidden Yogurt tenant DOM',async()=>{
  for(const path of ['/ekoditrade','/ekoditrade/','/ekodicafe','/ekodicafe/','/']){
    const response=await spaceWorker.fetch(new Request('https://ekodi.kr'+path),env);
    const html=await response.text();
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('x-ekodi-route'),path==='/'?'space-home':'space-workspace',path);
    assert.match(html,/id="internalShell"/,path);
    assert.doesNotMatch(html,/id="publicStorefront"|YOGURT PURPLE|yogurtpurple\.com|요거트퍼플 목포대점/,path);
    assert.doesNotMatch(html,/__SPACE_(?:PUBLIC|INTERNAL)_CLASS__/,path);
    assert.match(html,/운영공간 · EKODI/,path);
  }
});

test('canonical Yogurt storefront remains available and is not replaced by generic trade shell',async()=>{
  const response=await spaceWorker.fetch(new Request('https://ekodi.kr/yogurt'),env);
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(html,/요거트퍼플 목포대점/);
  assert.match(html,/data-store-page="yogurt"/);
  assert.equal(response.headers.get('x-ekodi-route'),'space-storefront');
});

test('retired YogurtPurple alias remains 410 rather than silently serving an unrelated workspace',async()=>{
  const response=await spaceWorker.fetch(new Request('https://ekodi.kr/yogurtpurple'),env);
  assert.equal(response.status,410);
  assert.match(await response.text(),/삭제된 주소/);
});
