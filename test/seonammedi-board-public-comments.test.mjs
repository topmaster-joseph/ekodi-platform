import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import board from '../services/independent-board/worker.js';

const migrations=path.join(path.dirname(fileURLToPath(import.meta.url)),'../services/independent-board/migrations');
const origin='https://seonammedi.kr/board';
function database(){
  const db=new DatabaseSync(':memory:');
  for(const name of readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(path.join(migrations,name),'utf8').replace(/^\uFEFF/,''));
  const seededAt='2026-10-09T10:00:00Z';
  db.prepare("INSERT INTO finance_posts(entry_date,entry_type,amount,purpose,related_event,evidence_status,public_note,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run('2026-10-09','income',50000,'후원 수입','활동비','verified','누구나 보는 내역','published','secret@example.com',seededAt,seededAt);
  db.prepare("INSERT INTO finance_posts(entry_date,entry_type,amount,purpose,related_event,evidence_status,public_note,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run('2026-10-09','expense',12000,'비공개 기록','','held','내부 메모','draft','private@example.com',seededAt,seededAt);
  db.prepare("INSERT INTO notice_posts(title,body,pinned,image_keys,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run('공개 공지','공지내용',1,'[]','published','private@example.com',seededAt,seededAt);
  db.prepare("INSERT INTO notice_posts(title,body,pinned,image_keys,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run('비공개 공지','작성중',0,'[]','draft','private@example.com',seededAt,seededAt);
  return {raw:db,api:{
    prepare(sql){return{all:async()=>({results:db.prepare(sql).all()}),bind(...params){const statement=db.prepare(sql);return{
      first:async()=>statement.get(...params)||null,
      all:async()=>({results:statement.all(...params)}),
      run:async()=>{const r=statement.run(...params);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}
    }}}}
  }};
}
const member={id:'member-one',email:'person@example.org',email_confirmed_at:'2026-10-09T11:00:00Z',app_metadata:{provider:'google'},user_metadata:{name:'등록회원'}};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const request=(suffix,{method='GET',token='',body}={})=>new Request(origin+suffix,{
  method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
});
async function mockAuth(run){
  const prev=globalThis.fetch;
  globalThis.fetch=async (url,options={})=>{
    if(String(url).includes('/auth/v1/user'))return response(member);
    if(String(url).endsWith('/api/seonammedi/admin/me')){
      if(options.headers?.authorization==='Bearer admin-token')return response({ok:true,permissions:{finance:true,notices:true,voices:true},platform:false});
      return response({ok:false},403);
    }
    throw Error('unexpected upstream '+url);
  };
  try{return await run()}finally{globalThis.fetch=prev}
}
function envWith(db){
  const accepted=[];
  return {ENVIRONMENT:'production',BOARD_DB:db.api,BOARD_ID:'seonammedi',BOARD_PUBLIC_WRITE_RATE_LIMITER:{limit:async()=>({success:true})},BOARD_WRITE_QUEUE:{send:async value=>accepted.push(value)},accepted};
}


test('health gate requires the discussion migration before promoting the board worker',async()=>{
  const db=database(),env=envWith(db);
  const healthy=await board.fetch(request('/health'),env);
  assert.equal(healthy.status,200);
  assert.equal((await healthy.json()).discussionComments,true);
  db.raw.exec('DROP TABLE board_discussion_comments');
  const broken=await board.fetch(request('/health'),env);
  assert.equal(broken.status,503);
  assert.equal((await broken.json()).discussionComments,false);
  db.raw.close();
});

test('finance and notices public APIs show published entries and private audit fields stay private',async()=>{
  const db=database(),env=envWith(db);
  const [summary,finance,notices]=await Promise.all([
    board.fetch(request('/api/finance/summary'),env),
    board.fetch(request('/api/finance'),env),
    board.fetch(request('/api/notices'),env)
  ]);
  assert.equal(summary.status,200);assert.equal(finance.status,200);assert.equal(notices.status,200);
  assert.deepEqual((await summary.json()).summary,{raised:50000,spent:0,balance:50000});
  const f=await finance.json(),n=await notices.json();
  assert.deepEqual(f.summary,{raised:50000,spent:0,balance:50000});
  assert.equal(f.items.length,1);assert.equal(f.items[0].purpose,'후원 수입');
  assert.equal('createdBy' in f.items[0],false);
  assert.equal('evidenceStatus' in f.items[0],false);
  assert.equal(n.items.length,1);
  assert.equal(n.items[0].title,'공개 공지');
  assert.equal('createdBy' in n.items[0],false);
  db.raw.close();
});

test('public pages share links and contain valid guest/login scripts on both domains',async()=>{
  for(const p of ['finance','notices']){
    for(const domain of ['https://seonammedi.kr/board','https://ekodi.kr/seonammedi/board']){
      const r=await board.fetch(new Request(domain+'/'+p),{});
      assert.equal(r.status,200);
      const html=await r.text();
      assert.match(html,/data-share/);
      assert.match(html,/data-comment/);
      assert.match(html,/댓글은 로그인 후 작성할 수 있습니다/);
      const script=Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).at(-1)?.[1];
      assert.ok(script);
      assert.doesNotThrow(()=>new Function(script));
    }
  }
});

test('guest cannot comment, confirmed member queues comments, and consumer publishes without duplicates',async()=>{
  const db=database(),env=envWith(db);
  for(const k of ['finance','notices']){
    const denied=await board.fetch(request('/api/'+k+'/1/comments',{method:'POST',body:{message:'anonymous'}}),env);
    assert.equal(denied.status,401);
  }
  await mockAuth(async()=>{
    for(const k of ['finance','notices']){
      const ok=await board.fetch(request('/api/'+k+'/1/comments',{method:'POST',token:'member-token',body:{message:'공개 댓글 '+k}}),env);
      assert.equal(ok.status,202);
      const body=await ok.json();assert.equal(body.queued,true);
      assert.match(body.submissionId,/^[\da-f-]{36}$/i);
      assert.equal(env.accepted.at(-1).payload.authorId,member.id);
      assert.equal(env.accepted.at(-1).payload.authorName,'등록회원');
    }
  });
  const messages=env.accepted.map(body=>({body,acked:0,retried:0,ack(){this.acked++},retry(){this.retried++}}));
  await board.queue({messages},env);
  await board.queue({messages},env);
  for(const m of messages){assert.equal(m.retried,0);assert.equal(m.acked,2)}
  assert.equal(db.raw.prepare('SELECT count(*) AS count FROM board_discussion_comments').get().count,2);
  const f=await (await board.fetch(request('/api/finance'),env)).json();
  const n=await (await board.fetch(request('/api/notices'),env)).json();
  assert.equal(f.items[0].comments[0].message,'공개 댓글 finance');
  assert.equal(n.items[0].comments[0].message,'공개 댓글 notices');
  assert.equal('author_id' in f.items[0].comments[0],false);
  db.raw.close();
});

test('only registered finance/notice administrator may edit or delete any comment',async()=>{
  const db=database(),env=envWith(db);
  const t='2026-10-09T10:00:00Z';
  db.raw.prepare('INSERT INTO board_discussion_comments(board_kind,post_id,author_id,author_name,body,submission_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('finance',1,'member-1','회원','처음 글','test-fin',t,t);
  db.raw.prepare('INSERT INTO board_discussion_comments(board_kind,post_id,author_id,author_name,body,submission_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('notices',1,'member-2','회원','다른 댓글','test-notice',t,t);
  await mockAuth(async()=>{
    for(const k of ['finance','notices']){
      const denied=await board.fetch(request('/api/admin/'+k+'/1/comments/1',{method:'PUT',token:'member-token',body:{message:'변경 시도'}}),env);
      assert.equal(denied.status,403);
      const id=k==='finance'?1:2;
      const edit=await board.fetch(request('/api/admin/'+k+'/1/comments/'+id,{method:'PUT',token:'admin-token',body:{message:'관리자 수정'}}),env);
      assert.equal(edit.status,200);
      assert.equal(db.raw.prepare('SELECT body FROM board_discussion_comments WHERE id=?').get(id).body,'관리자 수정');
      const del=await board.fetch(request('/api/admin/'+k+'/1/comments/'+id,{method:'DELETE',token:'admin-token'}),env);
      assert.equal(del.status,200);
      const visible=await (await board.fetch(request('/api/'+k),env)).json();
      assert.equal(visible.items[0].comments.length,0);
    }
  });
  db.raw.close();
});

test('admin finance/notice edits are still inaccessible to authenticated non-admin users',async()=>{
  const db=database(),env=envWith(db);
  await mockAuth(async()=>{
    for(const k of ['finance','notices']){
      const refused=await board.fetch(request('/api/admin/'+k+'/1',{method:'DELETE',token:'member-token'}),env);
      assert.equal(refused.status,403);
      const show=await board.fetch(request('/api/admin/'+k,{token:'admin-token'}),env);
      assert.equal(show.status,200);
    }
  });
  db.raw.close();
});
