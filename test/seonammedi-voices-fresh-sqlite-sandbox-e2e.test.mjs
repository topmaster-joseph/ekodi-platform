/**
 * EKODI sandbox E2E contract: actual production API handlers + actual SQL migration
 * on in-memory SQLite. Identity proof is deliberately simulated for these tests:
 * it DOES NOT constitute live Google OAuth sign-in.
 * No production endpoint, account, or citizen data is accessed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {
  FRESH_QUEUE_KIND,FRESH_REPLY_QUEUE_KIND,
  handleFreshVoiceApi,consumeFreshVoiceQueue,consumeFreshVoiceReplyQueue
} from '../services/independent-board/voices-fresh/api.mjs';

async function createFixture(){
  const native=new DatabaseSync(':memory:');
  native.exec('PRAGMA foreign_keys=ON;');
  const migrations=['0006_fresh_voices.sql','0007_fresh_voice_title.sql','0008_fresh_voice_replies.sql'];
  for(const name of migrations){
    const source=await readFile(new URL('../services/independent-board/migrations/'+name,import.meta.url),'utf8');
    native.exec(source);
  }
  const db={
    prepare(sql){
      const statement=native.prepare(sql);let params=[];
      return {
        bind(...values){params=values;return this},
        async first(){return statement.get(...params)||null},
        async all(){return {results:statement.all(...params)}},
        async run(){const result=statement.run(...params);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}}}
      };
    }
  };
  let permitted=true;
  const queue=[];
  const env={BOARD_DB:db,BOARD_WRITE_QUEUE:{async send(item){queue.push(item)}}};
  const identities={'sandbox-alice':'alice','sandbox-bob':'bob','sandbox-moderator':'moderator'};
  const getId=(req)=>identities[String(req.headers.get('authorization')||'').replace(/^Bearer /,'')]||null;
  const deps={
    google:async req=>{const id=getId(req);return id?{id}:null},
    admin:async req=>getId(req)==='moderator'?{ok:true}:{ok:false,response:Response.json({ok:false,error:'forbidden'},{status:403})},
    limit:async()=>({available:true,allowed:permitted})
  };
  const route=async(tail='',method='GET',who='',data,origin='https://sandbox.seonammedi.test/board')=>{
    const options={method,headers:{...(who?{authorization:'Bearer sandbox-'+who}:{}),...(data!==undefined?{'content-type':'application/json'}:{})}};
    if(data!==undefined)options.body=JSON.stringify(data);
    const request=new Request(origin+'/api/voices-fresh'+tail,options);
    const response=await handleFreshVoiceApi(request,env,'/api/voices-fresh'+tail,deps);
    return {status:response.status,data:await response.json()};
  };
  const drain=async()=>{
    const records=queue.splice(0);
    for(const event of records){
      if(event.kind===FRESH_QUEUE_KIND)await consumeFreshVoiceQueue(env,event.payload);
      else if(event.kind===FRESH_REPLY_QUEUE_KIND)await consumeFreshVoiceReplyQueue(env,event.payload);
      else throw Error('unexpected sandbox queue kind');
    }
    return records;
  };
  return {native,route,drain,queue,env,db,get permitted(){return permitted},set permitted(x){permitted=x}};
}

test('in-memory D1-schema sandbox: guest denial, durable queue, ownership, admin and soft deletion',async t=>{
  const f=await createFixture();
  t.after(()=>f.native.close());
  const forbidden=await f.route('','POST','',{title:'나쁜 요청',message:'비로그인'});
  assert.equal(forbidden.status,401,'signed-out POST is blocked');
  assert.equal((await f.route('/8/replies','POST','',{message:'비로그인 답글'})).status,401);
  assert.equal((await f.route('/8/replies/1','DELETE')).status,401);
  assert.equal(f.queue.length,0);

  assert.equal((await f.route('','POST','alice',{message:'제목 없음'})).status,400,'title is mandatory');
  const create=await f.route('','POST','alice',{title:'EKODI 샌드박스 의견',message:'실제 SQL 통합 테스트'});
  assert.equal(create.status,202);
  assert.equal(create.data.queued,true);
  assert.equal((await f.route('/submissions/'+create.data.submissionId)).data.status,'pending');
  const [queuedPost]=await f.drain();
  assert.equal(queuedPost.kind,FRESH_QUEUE_KIND);
  assert.equal(queuedPost.payload.googleSubject,'alice');
  const published=await f.route('/submissions/'+create.data.submissionId);
  assert.equal(published.data.status,'published');
  const id=published.data.id;
  assert.ok(Number.isSafeInteger(id)&&id>0);
  assert.equal((await consumeFreshVoiceQueue(f.env,queuedPost.payload)),id,'duplicate queue event idempotent');
  assert.equal(f.native.prepare('SELECT count(*) AS n FROM citizen_voices_fresh').get().n,1);

  const guest=await f.route();
  assert.equal(guest.data.items[0].mine,false);
  assert.equal(guest.data.items[0].replies.length,0);
  assert.equal(JSON.stringify(guest.data).includes('google_subject'),false,'no identity leak to public response');
  assert.equal((await f.route('','GET','alice')).data.items[0].mine,true);
  assert.equal((await f.route('','GET','bob')).data.items[0].mine,false);

  f.permitted=false;
  assert.equal((await f.route('/'+id+'/replies','POST','bob',{message:'속도 제한'})).status,429);
  f.permitted=true;
  assert.equal((await f.route('/'+id+'/replies','POST','bob',{message:'   '})).status,400);
  assert.equal((await f.route('/'+id+'/replies','POST','bob',{message:'a'.repeat(1501)})).status,400);
  const reply=await f.route('/'+id+'/replies','POST','bob',{displayName:'시민',message:'첫 답글'});
  assert.equal(reply.status,202);
  assert.equal((await f.route('/replies/submissions/'+reply.data.submissionId)).data.status,'pending');
  const [queuedReply]=await f.drain();
  assert.equal(queuedReply.kind,FRESH_REPLY_QUEUE_KIND);
  assert.equal(queuedReply.payload.googleSubject,'bob');
  const replySaved=await f.route('/replies/submissions/'+reply.data.submissionId);
  assert.equal(replySaved.data.status,'published');
  const rid=replySaved.data.id;
  assert.ok(rid>0);
  assert.equal((await consumeFreshVoiceReplyQueue(f.env,queuedReply.payload)),rid,'duplicate reply event idempotent');
  assert.equal(f.native.prepare('SELECT count(*) AS n FROM citizen_voice_replies_fresh').get().n,1);

  const reading=(await f.route('','GET','bob','', 'https://sandbox.ekodi.test/seonammedi/board')).data;
  assert.equal(reading.items[0].replies[0].mine,true);
  assert.equal(reading.items[0].replies[0].role,'member');
  assert.equal(JSON.stringify(reading).includes('google_subject'),false);
  assert.equal((await f.route('','GET','alice')).data.items[0].replies[0].mine,false);

  const ownerNotReplyOwner=await f.route('/'+id+'/replies/'+rid,'DELETE','alice');
  assert.equal(ownerNotReplyOwner.status,403,'owning parent is insufficient to delete another member reply');
  assert.equal((await f.route('/'+id+'/replies/'+rid,'PUT','alice',{message:'침해'})).status,403);
  assert.equal((await f.route('/'+id,'PUT','bob',{message:'침해',title:'침해'})).status,403);
  assert.equal((await f.route('/'+id,'DELETE','bob')).status,403);

  assert.equal((await f.route('/'+id+'/replies/'+rid,'PUT','bob',{message:'수정한 답글'})).status,200);
  assert.equal((await f.route('','GET','bob')).data.items[0].replies[0].message,'수정한 답글');
  assert.equal((await f.route('/'+id+'/replies/'+rid,'PUT','moderator',{message:'관리자 정리'})).status,200);
  assert.equal((await f.route('','GET','bob')).data.items[0].replies[0].message,'관리자 정리');
  assert.equal((await f.route('/'+id+'/replies/'+rid,'DELETE','bob')).status,200);
  assert.equal((await f.route()).data.items[0].replies.length,0,'soft-deleted reply hidden');
  assert.equal(f.native.prepare('SELECT status FROM citizen_voice_replies_fresh WHERE id=?').get(rid).status,'deleted');

  assert.equal((await f.route('/'+id,'PUT','alice',{title:'의견 수정',message:'본문 수정'})).status,200);
  const edited=await f.route('','GET','alice');
  assert.equal(edited.data.items[0].message,'본문 수정');
  assert.equal(edited.data.items[0].title,'의견 수정');
  assert.equal((await f.route('/'+id,'DELETE','moderator')).status,200,'moderator can remove any user opinion');
  assert.equal((await f.route()).data.items.length,0);
  assert.equal(f.native.prepare('SELECT status FROM citizen_voices_fresh WHERE id=?').get(id).status,'deleted');
  assert.equal(f.native.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('board_posts','board_replies')").get().n,0,'legacy tables never touched');
});

test('sandbox calendar has Sunday-first dates with compact but touch-safe rows',async()=>{
  const js=await readFile(new URL('../sites/seonammedi/public/calendar-sidebar.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../sites/seonammedi/public/calendar-sidebar.css',import.meta.url),'utf8');
  assert.match(js,/\['일','월','화','수','목','금','토'\]/);
  assert.match(js,/getUTCDay\(\)/);
  assert.equal(new Date(Date.UTC(2026,9,1)).getUTCDay(),4);
  assert.match(css,/row-gap:4px/);
  assert.match(css,/min-height:44px/);
});

test('production Google token canary always supplies required title',async()=>{
  const flow=await readFile(new URL('../.github/workflows/deploy-independent-board.yml',import.meta.url),'utf8');
  assert.match(flow,/--arg message "\$marker" --arg title "EKODI 검증" '\{message:\$message,title:\$title\}'/);
  assert.match(flow,/Real Google post\/reply create\/update\/delete VERIFIED/);
  assert.match(flow,/Real Google writer test SKIPPED: no scoped test-account token/);
});
