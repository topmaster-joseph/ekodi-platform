import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const workflow=await readFile(new URL('../.github/workflows/deploy-independent-board.yml',import.meta.url),'utf8');
test('release checks current notices-clone UI instead of removed search button',()=>{
  assert.match(workflow,/verify_contains "voices search control" 'id="voiceSearch"'/);
  assert.doesNotMatch(workflow,/verify_contains "voices search control" 'id="searchToggle"'/);
  for(const label of ['account verification before composer','account verification before post submit','re-login loop circuit breaker','post persisted before success','administrator permission-gated inline list']){
    assert.ok(workflow.includes(label),label);
  }
  assert.match(workflow,/grep -Pzq 'byId/);
  assert.match(workflow,/grep -Pzq 'write\\.onsubmit/);
  assert.match(workflow,/verify_contains "authenticated session endpoint"/);
  assert.match(workflow,/Verify production Google login-first API without credentials/);
  assert.match(workflow,/Production queue-create-list-reply canary and cleanup/);
});
test('both publicly mounted pages implement guarded compose and durable write confirmation',async()=>{
  for(const url of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
    const response=await board.fetch(new Request(url),{});
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/id="voiceSearch"/);
    assert.match(html,/id="writeToggle"/);
    assert.match(html,/id="voiceAuthStatus"/);
    assert.match(html,/byId\("writeToggle"\)\.onclick=async\(\)=>\{\s*if\(!await requireVoiceAccount\(\)\)return/);
    assert.match(html,/write\.onsubmit=async event=>\{[\s\S]{0,400}if\(!await requireVoiceAccount\(\)\)return/);
    assert.match(html,/allowed=await verifyVoiceAccount\(\)/);
    assert.match(html,/if\(!params\.has\("auth_attempt"\)\)\{voiceLogin\(\);return\}/);
    assert.match(html,/const published=await awaitVoicePublication\(saved\)/);
    assert.match(html,/adminItems=data\.items\|\|\[\];admin=true;render\(adminItems,true\)/);
    assert.doesNotMatch(html,/id="searchToggle"/);
  }
});
