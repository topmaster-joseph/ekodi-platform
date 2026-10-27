import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleFreshVoiceApi,consumeFreshVoiceQueue,consumeFreshReplyQueue,FRESH_REPLY_QUEUE_KIND} from '../services/independent-board/voices-fresh/api.mjs';
import {freshVoiceClient} from '../services/independent-board/voices-fresh/page.mjs';

// Synthetic D1 with the two fresh tables only. No live data.
function fakeDb(){
  const voices=[],replies=[];let nextVoice=1,nextReply=1;const queries=[];
  return {voices,replies,queries,prepare(sql){
    queries.push(sql);let args=[];
    return {
      bind(...a){args=a;return this},
      async first(){
        if(sql.includes('FROM citizen_voice_replies_fresh WHERE submission_key=?'))return replies.find(r=>r.submission_key===args[0]&&(!sql.includes("status='published'")||r.status==='published'))||null;
        if(sql.includes('FROM citizen_voice_replies_fresh WHERE id=?'))return replies.find(r=>r.id===Number(args[0])&&r.status==='published')||null;
        if(sql.includes('FROM citizen_voices_fresh WHERE submission_key=?'))return voices.find(v=>v.submission_key===args[0])||null;
        if(sql.includes('FROM citizen_voices_fresh WHERE id=?'))return voices.find(v=>v.id===Number(args[0])&&v.status==='published')||null;
        throw Error('unexpected_first:'+sql);
      },
      async all(){
        if(sql.includes('FROM citizen_voice_replies_fresh'))return {results:replies.filter(r=>r.status==='published'&&args.includes(r.voice_id)).sort((a,b)=>a.id-b.id)};
        return {results:voices.filter(v=>v.status==='published').sort((a,b)=>b.id-a.id)};
      },
      async run(){
        if(sql.startsWith('INSERT INTO citizen_voices_fresh')){const [google_subject,submission_key,title,body,created_at,updated_at]=args;const id=nextVoice++;voices.push({id,google_subject,submission_key,title,body,created_at,updated_at,status:'published'});return {meta:{last_row_id:id}}}
        if(sql.startsWith('INSERT INTO citizen_voice_replies_fresh')){const [voice_id,google_subject,submission_key,body,created_at,updated_at]=args;const id=nextReply++;replies.push({id,voice_id,google_subject,submission_key,body,created_at,updated_at,status:'published'});return {meta:{last_row_id:id}}}
        if(sql.startsWith("UPDATE citizen_voice_replies_fresh SET status='deleted'")){const r=replies.find(x=>x.id===Number(args[1]));if(r)r.status='deleted';return {success:true}}
        if(sql.startsWith("UPDATE citizen_voices_fresh SET status='deleted'")){const v=voices.find(x=>x.id===Number(args[1]));if(v)v.status='deleted';return {success:true}}
        throw Error('unexpected_run:'+sql);
      }
    };
  }};
}
function setup({signedIn=true,isAdmin=false,limited=false}={}){
  const db=fakeDb(),sent=[];
  const env={BOARD_DB:db,BOARD_WRITE_QUEUE:{async send(body){sent.push(body)}}};
  const deps={
    google:async()=>signedIn?{id:'synthetic-google'}:null,
    admin:async()=>isAdmin?{ok:true}:{ok:false,response:new Response(JSON.stringify({ok:false,error:'forbidden'}),{status:403})},
    limit:async()=>({available:true,allowed:!limited})
  };
  const call=(method,path,body)=>handleFreshVoiceApi(new Request('https://ekodi.kr/board'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env,path,deps);
  return {db,env,sent,call};
}
async function seedVoice(env,n=1){
  await consumeFreshVoiceQueue(env,{submissionId:`00000000-0000-4000-8000-00000000000${n}`,googleSubject:'w',title:'제목'+n,message:'본문'+n,createdAt:'2026-10-27T00:00:00Z'});
}

test('signed-in reader can reply; reply travels the durable queue and is listed under its voice',async()=>{
  const {env,sent,call}=setup();
  await seedVoice(env,1);await seedVoice(env,2);
  const res=await call('POST','/api/voices-fresh/1/replies',{message:'  좋은 의견입니다 https://a.com  '});
  assert.equal(res.status,202);
  const queued=await res.json();
  assert.equal(sent.length,1);
  assert.equal(sent[0].kind,FRESH_REPLY_QUEUE_KIND);
  assert.equal(sent[0].payload.voiceId,1);
  assert.equal(sent[0].payload.message,'좋은 의견입니다 https://a.com');
  const pending=await (await call('GET','/api/voices-fresh/replies/submissions/'+queued.submissionId)).json();
  assert.equal(pending.status,'pending');
  const id=await consumeFreshReplyQueue(env,sent[0].payload);
  assert.equal(await consumeFreshReplyQueue(env,sent[0].payload),id,'queue redelivery is idempotent');
  const done=await (await call('GET','/api/voices-fresh/replies/submissions/'+queued.submissionId)).json();
  assert.deepEqual([done.status,done.id],['published',id]);
  const list=await (await call('GET','/api/voices-fresh')).json();
  const v1=list.items.find(v=>v.id===1),v2=list.items.find(v=>v.id===2);
  assert.equal(v1.replies.length,1);
  assert.equal(v1.replies[0].message,'좋은 의견입니다 https://a.com');
  assert.deepEqual(v2.replies,[]);
  assert.ok(!('google_subject' in v1.replies[0])&&!('googleSubject' in v1.replies[0]),'reply author identity is never exposed');
});

test('reply writes are refused without login, over limits, for bad input or missing voices',async()=>{
  assert.equal((await setup({signedIn:false}).call('POST','/api/voices-fresh/1/replies',{message:'x'})).status,401);
  const limited=setup({limited:true});await seedVoice(limited.env);
  assert.equal((await limited.call('POST','/api/voices-fresh/1/replies',{message:'x'})).status,429);
  const s=setup();await seedVoice(s.env);
  assert.equal((await s.call('POST','/api/voices-fresh/1/replies',{message:'   '})).status,400);
  assert.equal((await s.call('POST','/api/voices-fresh/1/replies',{message:'가'.repeat(2001)})).status,400);
  assert.equal((await s.call('POST','/api/voices-fresh/99/replies',{message:'x'})).status,404);
  assert.equal(s.sent.length,0,'nothing is queued for refused replies');
});

test('a reply whose voice was deleted before consumption is dropped, not written',async()=>{
  const {env,db}=setup();await seedVoice(env);
  db.voices[0].status='deleted';
  assert.equal(await consumeFreshReplyQueue(env,{submissionId:'11111111-1111-4111-8111-111111111111',voiceId:1,googleSubject:'g',message:'늦은 답글'}),0);
  assert.equal(db.replies.length,0);
  await assert.rejects(consumeFreshReplyQueue(env,{submissionId:'bad',voiceId:1,message:'x'}),/invalid_fresh_reply/);
});

test('only a verified admin can delete a reply',async()=>{
  const reader=setup();await seedVoice(reader.env);
  await consumeFreshReplyQueue(reader.env,{submissionId:'22222222-2222-4222-8222-222222222222',voiceId:1,googleSubject:'g',message:'답글'});
  assert.equal((await reader.call('DELETE','/api/voices-fresh/replies/1')).status,403);
  assert.equal(reader.db.replies[0].status,'published');
  const admin=setup({isAdmin:true});await seedVoice(admin.env);
  await consumeFreshReplyQueue(admin.env,{submissionId:'33333333-3333-4333-8333-333333333333',voiceId:1,googleSubject:'g',message:'답글'});
  assert.equal((await admin.call('DELETE','/api/voices-fresh/replies/1')).status,200);
  assert.equal(admin.db.replies[0].status,'deleted');
  assert.equal((await admin.call('DELETE','/api/voices-fresh/replies/1')).status,404);
  const list=await (await admin.call('GET','/api/voices-fresh')).json();
  assert.deepEqual(list.items[0].replies,[]);
});

test('voices are still listed if the replies table is unavailable',async()=>{
  const s=setup();await seedVoice(s.env);
  const prepare=s.db.prepare.bind(s.db);
  s.db.prepare=sql=>{if(sql.includes('citizen_voice_replies_fresh'))return {bind(){return this},async all(){throw Error('no such table')}};return prepare(sql)};
  const list=await (await s.call('GET','/api/voices-fresh')).json();
  assert.equal(list.items.length,1);
  assert.deepEqual(list.items[0].replies,[]);
});

test('replies are isolated from legacy tables; migration is additive',async()=>{
  const s=setup();await seedVoice(s.env);
  await s.call('POST','/api/voices-fresh/1/replies',{message:'x'});
  await consumeFreshReplyQueue(s.env,s.sent[0].payload);
  await s.call('GET','/api/voices-fresh');
  assert.ok(s.db.queries.every(q=>!/\bboard_posts\b|\bboard_replies\b/.test(q)));
  const sql=await readFile(new URL('../services/independent-board/migrations/0008_fresh_voice_replies.sql',import.meta.url),'utf8');
  const code=sql.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n');
  assert.match(code,/CREATE TABLE IF NOT EXISTS citizen_voice_replies_fresh/);
  assert.doesNotMatch(code,/\b(DROP|DELETE|UPDATE|ALTER)\b|board_replies/i);
});

test('client keeps 답글 · 공유 · 수정 · 삭제 in one row and renders replies as text',()=>{
  assert.match(freshVoiceClient,/actions\.className='voice-actions'/);
  assert.match(freshVoiceClient,/actions\.append\(replyBtn,share\)/);
  assert.match(freshVoiceClient,/actions\.append\(edit,remove\)/);
  assert.doesNotMatch(freshVoiceClient,/\.innerHTML\s*=|insertAdjacentHTML/);
  assert.match(freshVoiceClient,/appendLinkedText\(text,String\(r\.message\|\|''\)\)/);
});
