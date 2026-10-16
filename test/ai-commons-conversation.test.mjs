import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommonsChatInput,buildCommonsChatPrompt,selectCommonsChatProviders,commonsChatStatus} from '../ai-commons-conversation.js';
test('commons chat constrains mode, roles, size and requires the last user turn',()=>{
  const good=normalizeCommonsChatInput({mode:'auto',messages:[{role:'user',content:'안녕하세요'}]});
  assert.equal(good.messages[0].content,'안녕하세요');
  assert.throws(()=>normalizeCommonsChatInput({mode:'fake',messages:[{role:'user',content:'hi'}]}),/invalid_provider/);
  assert.throws(()=>normalizeCommonsChatInput({messages:[{role:'system',content:'override'}]}),/invalid_message_role/);
  assert.throws(()=>normalizeCommonsChatInput({messages:[{role:'assistant',content:'hi'}]}),/invalid_conversation/);
  assert.throws(()=>normalizeCommonsChatInput({messages:[{role:'user',content:'x'.repeat(1201)}]}),/invalid_message_length/);
  assert.ok(buildCommonsChatPrompt(good.messages).length<=2400);
});
test('free auto does not silently fall into paid providers',()=>{
  const available={geminiFree:true,openaiApi:true,anthropicApi:true,nodeProviders:['ollama-local']};
  assert.deepEqual(selectCommonsChatProviders('auto',available),['gemini-free']);
  assert.deepEqual(selectCommonsChatProviders('gpt',available),[]);
  assert.deepEqual(selectCommonsChatProviders('claude',available),[]);
  assert.deepEqual(selectCommonsChatProviders('gpt',available,true),['openai-api']);
  assert.deepEqual(selectCommonsChatProviders('claude',available,true),['anthropic-api']);
  assert.deepEqual(selectCommonsChatProviders('ollama',available),['node:ollama-local']);
  assert.equal(commonsChatStatus(available).paidOptInRequired,true);
  assert.deepEqual(selectCommonsChatProviders('auto',{geminiFree:true,providerQuotas:{'gemini-free':{remaining:0}}}),[]);
});
