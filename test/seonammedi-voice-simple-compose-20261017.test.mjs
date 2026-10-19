import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import board from '../services/independent-board/worker.js';

test('fresh citizen opinion is one simple Google protected message form on both hosts',async()=>{
 for(const uri of ['https://seonammedi.kr/board/voices','https://ekodi.kr/seonammedi/board/voices']){
  const res=await board.fetch(new Request(uri),{});assert.equal(res.status,200);
  const html=await res.text();
  for(const id of ['freshWrite','freshForm','freshMessage','freshSearch'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/maxlength="12000"/);
  assert.match(html,/waitUntilPublished\(saved\)/);
  assert.doesNotMatch(html,/id="writeToggle"|id="voiceManageToggle"|id="voiceAdminLogin"|name="images"|name="contact"/);
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0][1]));
 }
});
test('new admin controls appear only after server permission gate',async()=>{
 const html=await(await board.fetch(new Request('https://seonammedi.kr/board/voices'),{})).text();
 assert.match(html,/request\('\/admin',\{headers:\{authorization:'Bearer '\+token\}\}\)/);
 assert.match(html,/adminAllowed=Array\.isArray\(r\.items\)/);
 assert.match(html,/if\(adminAllowed\)/);
 assert.match(html,/adminEdit\(item\.id,next,nextTitle\)/);
 assert.match(html,/adminDelete\(item\.id\)/);
 assert.match(html,/url\.searchParams\.set\('select_account','1'\)/);
});
test('visitors cannot become writers or moderators through old endpoints',async()=>{
 const env={BOARD_DB:{prepare(){throw Error('anonymous must not access db')}}};
 for(const [path,status] of [['/board/api/auth/session',401],['/board/api/voices-fresh/admin',403],['/board/api/admin/posts',410]]){
  const response=await board.fetch(new Request('https://seonammedi.kr'+path),env);
  assert.equal(response.status,status,path);
 }
});
