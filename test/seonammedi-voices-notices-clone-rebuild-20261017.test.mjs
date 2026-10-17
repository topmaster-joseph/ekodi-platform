import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';
const source=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
const api=await readFile(new URL('../services/independent-board/voices-fresh/api.mjs',import.meta.url),'utf8');

test('the canonical citizen page is the new standalone notices-style board on both hosts',async()=>{
 for(const url of ['https://seonammedi.kr/board/voices?compose=1','https://ekodi.kr/seonammedi/board/voices?compose=1']){
  const response=await board.fetch(new Request(url),{});assert.equal(response.status,200);
  const html=await response.text();
  assert.match(html,/id="freshSearch"/);
  assert.match(html,/id="freshForm"/);
  assert.match(html,/id="freshMessage"/);
  assert.match(html,/id="freshList"/);
  assert.match(html,/if\(await session\(\)\)/);
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0][1]));
 }
});
test('new board prevents forced authentication loops and verifies Google session before write',()=>{
 assert.match(source,/renderFreshVoicePage\(req,shell\)/);
 assert.match(source,/legacy_citizen_board_retired/);
 assert.match(api,/const identity=await google\(req\)/);
 assert.match(api,/if\(!identity\)return invalid\('google_login_required',401\)/);
 assert.match(api,/producer\.send\(\{kind:FRESH_QUEUE_KIND/);
 assert.match(api,/consumeFreshVoiceQueue\(env,payload\)/);
 assert.match(api,/const gate=await admin\(req\)/);
});
