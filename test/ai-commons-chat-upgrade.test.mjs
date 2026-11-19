import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {normalizeCommonsChatInput,buildCommonsChatPrompt,commonsChatSystemPrompt,COMMONS_CHAT_TASKS} from '../ai-commons-conversation.js';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('purpose presets are allow-listed and default to general',()=>{
  assert.equal(normalizeCommonsChatInput({messages:[{role:'user',content:'안녕'}]}).task,'general');
  assert.equal(normalizeCommonsChatInput({task:'SUMMARY',messages:[{role:'user',content:'요약'}]}).task,'summary');
  assert.throws(()=>normalizeCommonsChatInput({task:'__proto__',messages:[{role:'user',content:'x'}]}),/invalid_task/);
  assert.throws(()=>normalizeCommonsChatInput({task:'jailbreak',messages:[{role:'user',content:'x'}]}),/invalid_task/);
  for(const key of Object.keys(COMMONS_CHAT_TASKS))assert.match(commonsChatSystemPrompt(key),new RegExp(COMMONS_CHAT_TASKS[key].label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('system prompt carries real newlines, the Korea date and the honesty rule',()=>{
  const prompt=commonsChatSystemPrompt('general',new Date('2026-11-17T15:30:00Z'));
  assert.ok(!prompt.includes('\\n'),'no literal backslash-n');
  assert.match(prompt,/2026년 11월 18일/);
  assert.match(prompt,/확인필요/);
});

test('long conversations drop the oldest turns but never cut the latest question',()=>{
  const messages=[];
  for(let i=0;i<7;i++)messages.push({role:i%2?'assistant':'user',content:'"줄\n'.repeat(70)});
  messages.push({role:'user',content:'마지막 질문: 오늘 할 일은?'});
  const input=normalizeCommonsChatInput({messages});
  const prompt=buildCommonsChatPrompt(input.messages,{task:'general'});
  assert.ok(prompt.length<=2400);
  assert.match(prompt,/마지막 질문: 오늘 할 일은\?"\}\]$/);
  const records=JSON.parse(prompt.slice(prompt.indexOf('\n[')+1));
  assert.equal(records[0].role,'user');
});

test('a single maximal message still fits the local prompt budget',()=>{
  const input=normalizeCommonsChatInput({messages:[{role:'user',content:'"'.repeat(1200)}]});
  const prompt=buildCommonsChatPrompt(input.messages);
  assert.ok(prompt.length<=2400);
  assert.doesNotThrow(()=>JSON.parse(prompt.slice(prompt.indexOf('\n[')+1)));
});

test('worker forwards the purpose preset to the prompt builder',()=>{
  assert.match(read("ai-control-worker.js"),/buildCommonsChatPrompt\(input\.messages,\{task:input\.task,webContext:commonsWebContext\(sources\)\}\)/);
});

test('chat client renders model output without innerHTML and offers modern chat controls',()=>{
  const client=read('ai-control/commons.js'),html=read('ai-control/commons.html');
  const chat=client.slice(client.indexOf('const CHAT_STORE_KEY'),client.indexOf('// Official public notices'));
  assert.doesNotMatch(chat,/innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(chat,/function renderMarkdown\(source\)/);
  assert.match(chat,/url\.protocol==='https:'/);
  assert.match(chat,/event\.isComposing/);
  assert.match(chat,/sessionStorage/);
  assert.match(chat,/다시 보내기/);
  assert.match(chat,/답변 복사/);
  for(const id of ['chatTask','chatReset','chatCounter'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/data-chat-prompt=/);
  assert.equal((html.match(/무엇을 하고 싶으세요\?/g)||[]).length,1,'headline is not duplicated');
});
