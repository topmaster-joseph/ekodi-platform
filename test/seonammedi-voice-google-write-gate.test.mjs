import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import board from '../services/independent-board/worker.js';

const worker=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
const fresh=await readFile(new URL('../services/independent-board/voices-fresh/api.mjs',import.meta.url),'utf8');
test('old citizen writers are retired and new citizen posts require Google before D1 access',async()=>{
 for(const route of ['/board/api/posts','/board/api/posts/1/replies']){
  const res=await board.fetch(new Request('https://seonammedi.kr'+route,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),{});
  assert.equal(res.status,410);assert.equal((await res.json()).error,'legacy_citizen_board_retired');
 }
 const next=await board.fetch(new Request('https://seonammedi.kr/board/api/voices-fresh',{method:'POST',headers:{'content-type':'application/json'},body:'{"message":"anonymous"}'}),{BOARD_DB:{prepare(){throw Error('anonymous must not hit DB')}}});
 assert.equal(next.status,401);assert.equal((await next.json()).error,'google_login_required');
 assert.match(fresh,/const identity=await google\(req\)/);
 assert.match(fresh,/if\(!identity\)return invalid\('google_login_required',401\)/);
 assert.match(fresh,/const limiter=await limit\(req,env,'citizen-fresh'\)/);
});
test('public reading is independent and owner-only mutations remain protected',async()=>{
 const external=await board.fetch(new Request('https://seonammedi.kr/board/voices'),{});
 assert.equal(external.status,200);
 const html=await external.text();
 assert.match(html,/id="freshList"/);
 assert.match(html,/\/api\/voices-fresh/);
 assert.match(html,/authorization:'Bearer '\+t/);
 assert.match(html,/await session\(\)/);
 assert.doesNotMatch(html,/id="voiceMessage"|id="writeToggle"/);
 assert.match(worker,/requirePermission\(req,'finance'\)/);
 assert.match(worker,/requirePermission\(req,'notices'\)/);
 assert.match(worker,/admin:requireVoiceAdmin/);
});
