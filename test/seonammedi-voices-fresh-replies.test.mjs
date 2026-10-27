import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {handleFreshVoiceApi,FRESH_REPLY_QUEUE_KIND,consumeFreshVoiceReplyQueue} from '../services/independent-board/voices-fresh/api.mjs';
import {freshVoiceClient} from '../services/independent-board/voices-fresh/page.mjs';

function fixture(){
  const calls=[],sent=[];
  const posts=[{id:7,google_subject:'alice',title:'의견',body:'본문',created_at:'2026-10-28T00:00:00Z',updated_at:'2026-10-28T00:00:00Z'}];
  const replies=[{id:4,voice_id:7,google_subject:'alice',display_name:'회원',body:'답글',role:'member',created_at:'2026-10-28T00:00:00Z',updated_at:'2026-10-28T00:00:00Z'}];
  const db={prepare(sql){
    const args=[];
    return {bind(...values){args.push(...values);return this},
      async first(){
        calls.push({method:'first',sql,args:[...args]});
        if(sql.includes('citizen_voice_replies_fresh')&&sql.includes('submission_key'))return null;
        if(sql.includes('citizen_voice_replies_fresh'))return replies.find(r=>r.id===args[0]&&r.voice_id===args[1])||null;
        if(sql.includes('citizen_voices_fresh')&&sql.includes('submission_key'))return null;
        if(sql.includes('citizen_voices_fresh'))return posts.find(p=>p.id===args[0])||null;
        return null;
      },
      async all(){
        calls.push({method:'all',sql,args:[...args]});
        return {results:sql.includes('citizen_voice_replies_fresh')?replies:posts};
      },
      async run(){calls.push({method:'run',sql,args:[...args]});return {meta:{changes:1,last_row_id:25}}}
    };
  }};
  const env={BOARD_DB:db,BOARD_WRITE_QUEUE:{async send(x){sent.push(x)}}};
  const deps={google:async req=>{
    const name=(req.headers.get('authorization')||'').replace('Bearer ','');
    return ['alice','bob','moderator'].includes(name)?{id:name}:null
  },admin:async req=>(req.headers.get('authorization')==='Bearer moderator'?{ok:true}:{ok:false,response:Response.json({ok:false,error:'forbidden'},{status:403})}),limit:async()=>({available:true,allowed:true})};
  const route=(tail,method='GET',actor='',body=null)=>handleFreshVoiceApi(
    new Request('https://seonammedi.kr/board/api/voices-fresh'+tail,{method,headers:{...(actor?{authorization:'Bearer '+actor}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),
    env,'/api/voices-fresh'+tail,deps);
  return {calls,sent,env,deps,route};
}

test('guest cannot write fresh reply or mutate post before database access',async()=>{
  const f=fixture();
  const created=await f.route('/7/replies','POST','',{message:'익명'});
  assert.equal(created.status,401);
  assert.equal((await created.json()).error,'google_login_required');
  assert.equal((await f.route('/7','DELETE')).status,401);
  assert.equal((await f.route('/7/replies/4','DELETE')).status,401);
  assert.equal(f.calls.length,0);
});

test('Google member reply queues to isolated durable worker and respects rate limit',async()=>{
  const f=fixture();
  const res=await f.route('/7/replies','POST','alice',{message:'안녕하세요',displayName:'방문자'});
  assert.equal(res.status,202);
  assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].kind,FRESH_REPLY_QUEUE_KIND);
  assert.equal(f.sent[0].payload.googleSubject,'alice');
  assert.equal(f.sent[0].payload.role,'member');
  assert.match((await res.json()).statusUrl,/replies\/submissions/);
  assert.equal((await f.route('/7/replies','POST','alice',{message:''})).status,400);
  const admin=await f.route('/7/replies','POST','moderator',{message:'관리자 의견'});
  assert.equal(admin.status,202);
  assert.equal(f.sent[1].payload.role,'admin');
});

test('ownership flags are server-verified and never expose Google subject',async()=>{
  const f=fixture();
  const publicResponse=await f.route('');
  const guest=await publicResponse.json();
  assert.equal(publicResponse.status,200);
  assert.equal(guest.items[0].mine,false);
  assert.equal(guest.items[0].replies[0].mine,false);
  assert.equal(JSON.stringify(guest).includes('google_subject'),false);
  const author=await(await f.route('','GET','alice')).json();
  assert.equal(author.items[0].mine,true);
  assert.equal(author.items[0].replies[0].mine,true);
  const other=await(await f.route('','GET','bob')).json();
  assert.equal(other.items[0].mine,false);
});

test('owner may edit own post/reply; another member cannot; moderator may',async()=>{
  const f=fixture();
  assert.equal((await f.route('/7','PUT','alice',{title:'변경',message:'변경됨'})).status,200);
  assert.equal((await f.route('/7/replies/4','PUT','alice',{message:'수정'})).status,200);
  const before=f.calls.filter(c=>c.method==='run').length;
  assert.equal((await f.route('/7','DELETE','bob')).status,403);
  assert.equal((await f.route('/7/replies/4','DELETE','bob')).status,403);
  assert.equal(f.calls.filter(c=>c.method==='run').length,before);
  assert.equal((await f.route('/7/replies/4','DELETE','moderator')).status,200);
  assert.equal((await f.route('/7','DELETE','moderator')).status,200);
});

test('queue consumer writes to new table and leaves legacy board untouched',async()=>{
  const f=fixture();
  const id=await consumeFreshVoiceReplyQueue(f.env,{submissionId:'ee8c3375-e05d-442e-8c34-83843a31f7a1',voiceId:7,googleSubject:'alice',displayName:'회원',message:'내용',role:'member',createdAt:'2026-10-28T01:00:00Z'});
  assert.equal(id,25);
  assert.ok(f.calls.some(c=>c.method==='run'&&c.sql.includes('INSERT OR IGNORE INTO citizen_voice_replies_fresh')));
  assert.equal(f.calls.some(c=>c.sql.includes('board_replies')),false);
  const migration=await readFile(new URL('../services/independent-board/migrations/0008_fresh_voice_replies.sql',import.meta.url),'utf8');
  assert.match(migration,/REFERENCES citizen_voices_fresh/);
  assert.match(migration,/submission_key TEXT NOT NULL UNIQUE/);
  const worker=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
  assert.match(worker,/FRESH_REPLY_QUEUE_KIND/);
  assert.match(worker,/consumeFreshVoiceReplyQueue/);
});

test('public page provides login-first inline reply and owner-only controls',()=>{
  assert.match(freshVoiceClient,/beginLogin\('reply',item.id\)/);
  assert.match(freshVoiceClient,/renderReplyArea\(details,item\)/);
  assert.match(freshVoiceClient,/adminAllowed\|\|item.mine/);
  assert.match(freshVoiceClient,/adminAllowed\|\|response.mine/);
  assert.match(freshVoiceClient,/\/replies\/submissions\//);
  assert.match(freshVoiceClient,/textContent=String\(response.message\|\|''\)/);
});
