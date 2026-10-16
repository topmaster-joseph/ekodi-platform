import test from 'node:test';
import assert from 'node:assert/strict';
import board from '../services/independent-board/worker.js';

function fakeBoardStore(){
  const posts=[],replies=[],queued=[],attempts=[];
  let lastPost=0,lastReply=0;
  const prepare=sql=>({
    args:[],
    bind(...args){this.args=args;return this;},
    async first(){
      const a=this.args;
      if(sql.includes('FROM board_posts WHERE submission_key=?')){
        const row=posts.find(p=>p.submission_key===a[0]);
        return row?{id:row.id,status:row.status}:null;
      }
      if(sql.includes('FROM board_replies WHERE submission_key=?')){
        const row=replies.find(p=>p.submission_key===a[0]);
        return row?{id:row.id,status:row.status}:null;
      }
      if(sql.includes("FROM board_posts WHERE id=? AND status='published'")){
        const row=posts.find(p=>p.id===a[0]&&p.status==='published');
        return row?{id:row.id}:null;
      }
      throw new Error('unexpected DB first: '+sql);
    },
    async run(){
      const a=this.args;
      if(sql.startsWith('INSERT INTO board_posts')){
        const [author_name,category,private_contact,title,body,image_keys,submission_key,created_at,updated_at]=a;
        posts.push({id:++lastPost,author_name,category,private_contact,title,body,image_keys,submission_key,created_at,updated_at,status:'published'});
        return {meta:{last_row_id:lastPost}};
      }
      if(sql.startsWith('INSERT INTO board_replies')){
        const [post_id,author_name,body,submission_key,created_at]=a;
        replies.push({id:++lastReply,post_id,author_name,body,submission_key,created_at,status:'published'});
        return {meta:{last_row_id:lastReply}};
      }
      throw new Error('unexpected DB run: '+sql);
    },
    async all(){
      if(sql.includes('FROM board_posts WHERE status='))return {results:posts.map(p=>({...p}))};
      if(sql.includes('FROM board_replies WHERE status='))return {results:replies.map(p=>({...p}))};
      throw new Error('unexpected DB all: '+sql);
    }
  });
  const env={
    ENVIRONMENT:'production',
    BOARD_ID:'seonammedi.citizen_voice',
    BOARD_DB:{prepare},
    BOARD_PUBLIC_WRITE_RATE_LIMITER:{async limit({key}){attempts.push(key);return {success:true}}},
    BOARD_WRITE_QUEUE:{async send(entry){queued.push(entry)}}
  };
  return {env,posts,replies,queued,attempts};
}
function request(path,method='GET',payload,token=''){
  return new Request('https://seonammedi.kr'+path,{
    method,headers:{
      ...(method==='POST'?{'content-type':'application/json'}:{}),
      ...(token?{authorization:'Bearer '+token}:{})
    },
    ...(method==='POST'?{body:JSON.stringify(payload||{})}:{})
  });
}
function fakeGoogleUser(){
  return {id:'test-verified-google-account',email:'test-writer@example.test',
    email_confirmed_at:'2026-01-01T00:00:00Z',
    app_metadata:{provider:'google',providers:['google']}};
}
test('authenticated synthetic Google account can submit post, consume queue, publish, then reply',async()=>{
  const original=globalThis.fetch;
  let checkCount=0;
  globalThis.fetch=async (input,init)=>{
    assert.equal(new URL(input).pathname,'/auth/v1/user');
    assert.equal(init.headers.authorization,'Bearer scoped-test-identity');
    checkCount++;
    return Response.json(fakeGoogleUser());
  };
  try{
    const {env,queued,posts,replies,attempts}=fakeBoardStore();
    const before=await board.fetch(request('/board/api/posts','POST',{message:'should not publish'}),env);
    assert.equal(before.status,401);
    assert.equal(queued.length,0,'anonymous writes never reach the queue');
    const login=await board.fetch(request('/board/api/auth/session','GET',null,'scoped-test-identity'),env);
    assert.equal(login.status,200);
    assert.equal((await login.json()).email,'test-writer@example.test');
    const create=await board.fetch(request('/board/api/posts','POST',{
      category:'question',name:'Test Citizen',message:'Queue-backed synthetic test',images:[]
    },'scoped-test-identity'),env);
    assert.equal(create.status,202);
    const data=await create.json();
    assert.equal(data.queued,true);
    assert.equal(data.ok,true);
    assert.equal(queued.length,1);
    assert.equal(queued[0].kind,'independent-board.post.v1');
    assert.equal(posts.length,0,'no premature published state prior to queue consumer');
    const pending=await board.fetch(request(data.statusUrl),env);
    assert.equal((await pending.json()).status,'pending');
    let ackCount=0;
    await board.queue({messages:[{body:queued.shift(),ack(){ackCount++},retry(){throw new Error('unnecessary retry')}}]},env);
    assert.equal(ackCount,1);
    assert.equal(posts.length,1);
    const published=await board.fetch(request(data.statusUrl),env);
    const status=await published.json();
    assert.equal(status.status,'published');
    assert.equal(status.id,posts[0].id);
    const publicList=await board.fetch(request('/board/api/posts'),env);
    assert.equal(publicList.status,200);
    const visible=await publicList.json();
    assert.equal(visible.items[0].message,'Queue-backed synthetic test');
    const createReply=await board.fetch(request('/board/api/posts/'+status.id+'/replies','POST',{
      name:'Test Reply',message:'Synthetic reply'
    },'scoped-test-identity'),env);
    assert.equal(createReply.status,202);
    const replyData=await createReply.json();
    assert.equal(queued.length,1);
    assert.equal(queued[0].kind,'independent-board.reply.v1');
    const replyPending=await board.fetch(request(replyData.statusUrl),env);
    assert.equal((await replyPending.json()).status,'pending');
    await board.queue({messages:[{body:queued.shift(),ack(){ackCount++},retry(){throw new Error('unnecessary retry')}}]},env);
    assert.equal(ackCount,2);
    assert.equal(replies.length,1);
    const replyPublished=await board.fetch(request(replyData.statusUrl),env);
    assert.equal((await replyPublished.json()).status,'published');
    const listAgain=await board.fetch(request('/board/api/posts'),env);
    const all=await listAgain.json();
    assert.equal(all.items[0].replies[0].message,'Synthetic reply');
    assert.equal(checkCount,3,'session, post and reply must each verify the Google account');
    assert.equal(attempts.length,2,'rate limiter must apply to both authenticated mutations');
  }finally{globalThis.fetch=original}
});

test('email-only synthetic identity fails closed without queue inserts',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({
    ...fakeGoogleUser(),app_metadata:{provider:'email',providers:['email']}
  });
  try{
    const {env,queued,posts}=fakeBoardStore();
    const result=await board.fetch(request('/board/api/posts','POST',{message:'invalid provider'},'invalid-test-token'),env);
    assert.equal(result.status,401);
    assert.equal((await result.json()).error,'google_login_required');
    assert.deepEqual(queued,[]);
    assert.deepEqual(posts,[]);
  }finally{globalThis.fetch=original}
});

test('stale token refresh network failure is handled and falls back to normal Google login',async()=>{
  const response=await board.fetch(request('/board/voices'),{});
  const html=await response.text();
  assert.match(html,/async function refreshVoiceToken\(\)/);
  assert.match(html,/catch\{return false;\}/);
  assert.match(html,/if\(allowRefresh&&await refreshVoiceToken\(\)\)return verifyVoiceAccount\(false\)/);
  assert.match(html,/voiceLogin\(\);return false;/);
  assert.match(html,/auth.searchParams.set\("site","seonammedi"\)/);
});
