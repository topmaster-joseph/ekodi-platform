import test from 'node:test';
import assert from 'node:assert/strict';
import board from '../services/independent-board/worker.js';

const ROOT='https://seonammedi.kr/board';
const request=(suffix,method='GET',token='',data)=>new Request(ROOT+suffix,{
  method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(data?{'content-type':'application/json'}:{})},
  ...(data?{body:JSON.stringify(data)}:{})
});
const withFetch=async (handler,run)=>{
  const original=globalThis.fetch;
  globalThis.fetch=handler;
  try{return await run()}finally{globalThis.fetch=original}
};
const user={id:'member-1',email:'member@example.org',email_confirmed_at:'2026-10-09T11:00:00Z',app_metadata:{provider:'google'}};

test('guest reads and shares, but cannot publish a voice or a reply',async()=>{
  const html=await (await board.fetch(request('/voices'),{})).text();
  assert.match(html,/로그인 후 의견 등록/);
  assert.match(html,/data-share/);
  assert.match(html,/data-reply-edit/);
  assert.match(html,/로그인 없이 열람·공유/);
  assert.match(html,/답글은 로그인 후 작성/);
  const script=Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).at(-1)?.[1];
  assert.ok(script,'board client script must be present');
  assert.doesNotThrow(()=>new Function(script),'board client script must parse');
  const me=await board.fetch(request('/api/auth/me'),{});
  assert.deepEqual(await me.json(),{ok:true,authenticated:false});
  const voice=await board.fetch(request('/api/posts','POST','',{name:'visitor',message:'should fail'}),{});
  assert.equal(voice.status,401);
  assert.equal((await voice.json()).error,'login_required');
  const reply=await board.fetch(request('/api/posts/1/replies','POST','',{message:'should fail'}),{});
  assert.equal(reply.status,401);
  assert.equal((await reply.json()).error,'login_required');
});

test('invalid or anonymous session cannot write regardless of displayed button',async()=>{
  await withFetch(async()=>new Response('{}',{status:401,headers:{'content-type':'application/json'}}),async()=>{
    const result=await board.fetch(request('/api/posts','POST','forged-token',{message:'blocked'}),{});
    assert.equal(result.status,401);
    const status=await board.fetch(request('/api/auth/me','GET','forged-token'),{});
    assert.equal((await status.json()).authenticated,false);
  });
  await withFetch(async()=>new Response(JSON.stringify({...user,is_anonymous:true}),{headers:{'content-type':'application/json'}}),async()=>{
    const result=await board.fetch(request('/api/posts','POST','anonymous-session',{message:'blocked'}),{});
    assert.equal(result.status,401);
  });
});

test('confirmed EKODI member can queue new citizen opinion and reply, without admin access',async()=>{
  const queued=[];
  const env={ENVIRONMENT:'production',BOARD_PUBLIC_WRITE_RATE_LIMITER:{limit:async()=>({success:true})},BOARD_WRITE_QUEUE:{send:async data=>queued.push(data)},BOARD_DB:{prepare:()=>({bind:()=>({first:async()=>({id:42})})})}};
  await withFetch(async(url)=>{
    if(String(url).endsWith('/auth/v1/user'))return new Response(JSON.stringify(user),{headers:{'content-type':'application/json'}});
    if(String(url).includes('/api/seonammedi/admin/me'))return new Response(JSON.stringify({ok:true,permissions:{voices:false},platform:false}),{headers:{'content-type':'application/json'}});
    throw Error('unexpected upstream '+url);
  },async()=>{
    const state=await board.fetch(request('/api/auth/me','GET','member-token'),env);
    assert.equal((await state.json()).authenticated,true);
    const post=await board.fetch(request('/api/posts','POST','member-token',{name:'민원인',category:'proposal',message:'시민의견'}),env);
    assert.equal(post.status,202);
    const reply=await board.fetch(request('/api/posts/42/replies','POST','member-token',{name:'민원인',message:'답글'}),env);
    assert.equal(reply.status,202);
    const edit=await board.fetch(request('/api/admin/posts/42','PUT','member-token',{message:'not mine'}),env);
    assert.equal(edit.status,403);
    const replyEdit=await board.fetch(request('/api/admin/posts/42/replies/3','PUT','member-token',{message:'member cannot edit'}),env);
    assert.equal(replyEdit.status,403);
  });
  assert.deepEqual(queued.map(x=>x.kind),['independent-board.post.v1','independent-board.reply.v1']);
});

test('only registered voice admin can update and delete existing opinions',async()=>{
  const statements=[];
  const env={BOARD_DB:{prepare(sql){return{bind(...params){return{first:async()=>({id:42,status:'published',image_keys:'[]'}),run:async()=>{statements.push({sql,params});return{}}}}}}}};
  await withFetch(async(url)=>{
    assert.match(String(url),/\/api\/seonammedi\/admin\/me$/);
    return new Response(JSON.stringify({ok:true,platform:false,permissions:{voices:true}}),{headers:{'content-type':'application/json'}});
  },async()=>{
    const updated=await board.fetch(request('/api/admin/posts/42','PUT','admin-token',{displayName:'관리자',category:'proposal',message:'수정 내용'}),env);
    assert.equal(updated.status,200);
    const replyEdited=await board.fetch(request('/api/admin/posts/42/replies/3','PUT','admin-token',{message:'관리자가 수정한 답글'}),env);
    assert.equal(replyEdited.status,200);
    const replyDeleted=await board.fetch(request('/api/admin/posts/42/replies/3','DELETE','admin-token'),env);
    assert.equal(replyDeleted.status,200);
    const deleted=await board.fetch(request('/api/admin/posts/42','DELETE','admin-token'),env);
    assert.equal(deleted.status,200);
  });
  assert.ok(statements.some(s=>s.sql.startsWith('UPDATE board_posts SET author_name=')));
  assert.ok(statements.some(s=>s.sql.startsWith('UPDATE board_replies SET body=')));
  assert.ok(statements.some(s=>s.sql.includes("status='deleted'")));
});
