import test from 'node:test';
import assert from 'node:assert/strict';
import { handleUserTranslation, USER_TRANSLATION_CONTRACT } from '../user-translation-worker.js';

function request(body,origin='https://marketing.ekodi.kr'){
  return new Request('https://shell.ekodi.kr/translate',{
    method:'POST',
    headers:{'content-type':'application/json',origin},
    body:JSON.stringify(body)
  });
}

test('workspace UI translation stays uncached and uses the shared adapter',async()=>{
  const calls=[];
  const env={TRANSLATION_RATE_LIMITER:{limit:async()=>({success:true})},AI:{run:async(model,input)=>{calls.push({model,input});return {translated_text:`EN:${input.text}`};}}};
  const response=await handleUserTranslation(request({source:'ko-KR',target:'en',surface:'workspace',texts:['무료로 시작','오늘의 제안']}),env);
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control')||'',/private, no-store/);
  const data=await response.json();
  assert.deepEqual(data.translations,['EN:무료로 시작','EN:오늘의 제안']);
  assert.equal(calls.length,2);
  assert.equal(calls[0].input.source_lang,'ko');
  assert.equal(calls[0].input.target_lang,'en');
});
test('Kachin translation uses the isolated fallback model',async()=>{
  const seen=[];
  const env={TRANSLATION_RATE_LIMITER:{limit:async()=>({success:true})},AI:{run:async(model,input)=>{seen.push({model,input});return {response:'Jinghpaw hte'};}}};
  const response=await handleUserTranslation(request({source:'ko-KR',target:'kac',surface:'workspace',texts:['환영합니다']}),env);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).translations,['Jinghpaw hte']);
  assert.match(seen[0].model,/llama/);
});

test('translation endpoint fails closed when the cost limiter is unavailable or exceeded',async()=>{
  const unavailable={AI:{run:async()=>({translated_text:'x'})}};
  const missing=await handleUserTranslation(request({source:'ko-KR',target:'en',surface:'public',texts:['안내']}),unavailable);
  assert.equal(missing.status,503);
  const limited={TRANSLATION_RATE_LIMITER:{limit:async()=>({success:false})},AI:{run:async()=>({translated_text:'x'})}};
  const denied=await handleUserTranslation(request({source:'ko-KR',target:'en',surface:'public',texts:['안내']}),limited);
  assert.equal(denied.status,429);
});

test('translation endpoint rejects foreign origins and oversized batches',async()=>{
  const env={TRANSLATION_RATE_LIMITER:{limit:async()=>({success:true})},AI:{run:async()=>({translated_text:'x'})}};
  const denied=await handleUserTranslation(request({source:'ko-KR',target:'en',surface:'workspace',texts:['안내']},'https://example.com'),env);
  assert.equal(denied.status,403);
  const oversized=await handleUserTranslation(request({source:'ko-KR',target:'en',surface:'workspace',texts:Array(25).fill('안내')}),env);
  assert.equal(oversized.status,400);
  assert.equal(USER_TRANSLATION_CONTRACT.workspaceCache,false);
  assert.equal(USER_TRANSLATION_CONTRACT.maxTexts,24);
});
