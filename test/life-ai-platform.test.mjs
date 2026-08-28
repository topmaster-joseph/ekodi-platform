import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LIFE_AI_CORE, buildLifeAiPrompt, buildLifeReflection, detectLifeTopic, lifeTopics, todayLifeQuestion } from '../life-core.js';

test('Life AI exposes eight shared topic subservices',()=>{
  const topics=lifeTopics();
  assert.equal(topics.length,8);
  assert.deepEqual(topics.map(x=>x.id),['relationship','money','work','family','heart','future','faith','meaning']);
  assert.equal(LIFE_AI_CORE.providerIndependent,true);
  assert.equal(LIFE_AI_CORE.aiOptional,true);
});

test('Life AI detects everyday topic and produces a Scripture bridge',()=>{
  const reflection=buildLifeReflection({message:'요즘 장사가 안돼서 돈과 앞으로가 걱정돼요'});
  assert.equal(reflection.topic.id,'money');
  assert.match(reflection.rootQuestion,/안전/);
  assert.ok(reflection.scriptures.includes('마태복음 6:25-34'));
  assert.ok(reflection.action.length>10);
});

test('Life AI safety path prioritizes human help',()=>{
  const reflection=buildLifeReflection({message:'죽고 싶고 사라지고 싶어요'});
  assert.equal(reflection.urgent,true);
  assert.equal(reflection.scriptures.length,0);
  assert.match(reflection.notice,/사람의 도움/);
});

test('Life AI prompt preserves user agency',()=>{
  const prompt=buildLifeAiPrompt({message:'가족과 갈등이 있어요',topic:'family'});
  assert.match(prompt,/종교적 설득이나 압박을 하지 마세요/);
  assert.match(prompt,/교회 참여나 신앙 고백을 강요하지 마세요/);
});

test('today question is deterministic for a Seoul date',()=>{
  const a=todayLifeQuestion(new Date('2026-08-27T00:00:00+09:00'));
  const b=todayLifeQuestion(new Date('2026-08-27T12:00:00+09:00'));
  assert.equal(a.date,b.date);
  assert.equal(a.question,b.question);
});

test('Life AI deployment contract is registered across shared boundaries',()=>{
  const manifest=fs.readFileSync(new URL('../ekodi-service-manifest.js',import.meta.url),'utf8');
  const boundaries=JSON.parse(fs.readFileSync(new URL('../platform-boundaries.json',import.meta.url),'utf8'));
  const registry=JSON.parse(fs.readFileSync(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));
  assert.match(manifest,/id:'life'/);
  assert.equal(boundaries.platforms.life.deployWorkflow,'.github/workflows/deploy-life-ai.yml');
  assert.ok(registry.services.some(x=>x.id==='life'));
});

test('guest-facing copy stays guide-first while member actions remain explicit',()=>{
  const html=fs.readFileSync(new URL('../life/index.html',import.meta.url),'utf8');
  const app=fs.readFileSync(new URL('../life/app.js',import.meta.url),'utf8');
  const worker=fs.readFileSync(new URL('../life-worker.js',import.meta.url),'utf8');
  assert.match(html,/오늘의 질문/);
  assert.match(html,/말씀대화로 깊이 보기/);
  assert.match(app,/Google 로그인한 무료회원부터 질문 대화를 이용할 수 있습니다/);
  assert.match(worker,/LIFE_AUTH_REQUIRED/);
});

test('production release guard only requires markers present in static Life HTML',()=>{
  const html=fs.readFileSync(new URL('../life/index.html',import.meta.url),'utf8');
  const release=JSON.parse(fs.readFileSync(new URL('../deploy/manifests/life.worker.json',import.meta.url),'utf8'));
  const root=release.worker.requests.find(request=>request.url==='https://life.ekodi.kr/');
  assert.ok(root);
  for(const marker of root.expect||[])assert.ok(html.includes(marker),`static Life HTML is missing release marker: ${marker}`);
});
