import test from 'node:test';
import assert from 'node:assert/strict';
import board from '../services/independent-board/worker.js';

const origin='https://seonammedi.kr/board';
test('retired citizen queue never writes old posts/replies after clean cutover',async()=>{
 const acks=[];let writes=0;
 const env={BOARD_DB:{prepare(){writes++;throw Error('old queue must not write')}}};
 await board.queue({messages:[
  {body:{kind:'independent-board.post.v1',payload:{content:'synthetic'}},ack(){acks.push('post')},retry(){throw Error('unexpected retry')}},
  {body:{kind:'independent-board.reply.v1',payload:{content:'synthetic'}},ack(){acks.push('reply')},retry(){throw Error('unexpected retry')}}
 ]},env);
 assert.deepEqual(acks,['post','reply']);assert.equal(writes,0);
});
test('old API cannot read or restore old citizen records',async()=>{
 for(const route of ['/api/posts','/api/submissions/01234567-89ab-cdef-0123-456789abcdef','/api/admin/posts','/api/posts/1/replies']){
  const res=await board.fetch(new Request(origin+route),{});
  assert.equal(res.status,410,route);
  assert.equal((await res.json()).error,'legacy_citizen_board_retired');
 }
});
test('a verified Google identity is mandatory for the fresh write API',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({id:'synthetic-email',email_confirmed_at:'2026-01-01',app_metadata:{provider:'email',providers:['email']}});
 try{
  const response=await board.fetch(new Request(origin+'/api/voices-fresh',{method:'POST',headers:{authorization:'Bearer synthetic', 'content-type':'application/json'},body:'{"message":"synthetic"}'}),{BOARD_DB:{prepare(){throw Error('email identity must not write')}}});
  assert.equal(response.status,401);
 }finally{globalThis.fetch=old}
});
test('new board cannot silently fall back to queue or old post APIs',async()=>{
 const res=await board.fetch(new Request(origin+'/voices'),{});
 const html=await res.text();
 assert.match(html,/api=root\+'\/api\/voices-fresh'/);
 assert.match(html,/saved\.published!==true/);
 assert.doesNotMatch(html,/awaitVoicePublication|POST_QUEUE_KIND|board\/api\/posts/);
});
