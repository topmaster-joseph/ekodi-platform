import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('모두의 통역 is a direct-launch AI Commons execution service',()=>{
  const catalog=JSON.parse(read('config/ai-execution-services.json'));
  const registry=JSON.parse(read('config/capability-registry.json'));
  const service=catalog.services.find(item=>item.id==='everyone-interpreter');
  assert.equal(service?.label,'모두의 통역');
  assert.equal(service?.launchUrl,'https://ekodi.kr/ai/interpreter/');
  assert.equal(service?.capabilityId,'core.interpreter');
  const capability=registry.capabilities.find(item=>item.id==='core.interpreter');
  assert.equal(capability?.maturity,'service-backed');
  assert.equal(capability?.provider?.contract,'ekodi.interpreter.v1');
});

test('interpreter surface supports microphone, speech output and provider-neutral translation fallback',()=>{
  const html=read('ai-control/interpreter.html');
  const client=read('ai-control/interpreter.js');
  const worker=read('ai-control-worker.js');
  assert.match(html,/모두의 통역/);
  assert.match(client,/SpeechRecognition\|\|window\.webkitSpeechRecognition/);
  assert.match(client,/speechSynthesis/);
  assert.match(client,/globalThis\.Translator/);
  assert.match(client,/capability:'translation'/);
  assert.match(client,/\/api\/ai-modules\/v1\/providers\/generate/);
  assert.match(worker,/microphone=\(self\)/);
  assert.match(worker,/\/interpreter\//);
  assert.match(worker,/api\/interpreter\/client/);
});
