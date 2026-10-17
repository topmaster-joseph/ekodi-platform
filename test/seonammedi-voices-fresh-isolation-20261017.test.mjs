import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {handleFreshVoiceApi} from '../services/independent-board/voices-fresh/api.mjs';
import {renderFreshVoicePage} from '../services/independent-board/voices-fresh/page.mjs';
import worker from '../services/independent-board/worker.js';

function fakeDb(){
  const state={posts:[],queries:[]};let next=1;
  return {state,prepare(sql){
    state.queries.push(sql);
    let args=[];
    return {
      bind(...values){args=values;return this},
      async all(){
        const items=state.posts.filter(p=>p.status==='published').filter(p=>!sql.includes('LIKE')||p.body.includes(String(args[0]).replaceAll('%','')));
        return {results:items.slice().sort((a,b)=>b.id-a.id).slice(0,100)}
      },
      async first(){
        return state.posts.find(p=>p.id===Number(args[0])&&p.status==='published')||null;
      },
      async run(){
        if(sql.startsWith('INSERT INTO citizen_voices_fresh')){
          const [subject,body,created_at,updated_at]=args;
          const id=next++;state.posts.push({id,google_subject:subject,body,status:'published',created_at,updated_at});
          return {meta:{last_row_id:id}};
        }
        if(sql.startsWith("UPDATE citizen_voices_fresh SET status='deleted'")){
          const p=state.posts.find(x=>x.id===Number(args[1]));if(p)p.status='deleted';
        }else if(sql.startsWith('UPDATE citizen_voices_fresh SET body=')){
          const p=state.posts.find(x=>x.id===Number(args[2]));if(p)p.body=args[0];
        }else throw Error('unexpected_statement:'+sql);
        return {success:true};
      }
    }
  }}
}
const base='https://seonammedi.kr/board/api/voices-fresh';
const jsonRequest=(path,method,message)=>new Request(base+path,{method,headers:{'content-type':'application/json'},body:JSON.stringify({message})});
const fakeAuth={
  google:async()=>({id:'synthetic-google-user'}),
  admin:async()=>({ok:true}),
  limit:async()=>({available:true,allowed:true})
};

test('fresh board rejects public writes and unauthorized administrator actions',async()=>{
 const env={BOARD_DB:fakeDb()};
 const denial={google:async()=>null,admin:async()=>({ok:false,response:new Response('denied',{status:403})}),limit:fakeAuth.limit};
 assert.equal((await handleFreshVoiceApi(jsonRequest('','POST','text'),env, '/api/voices-fresh',denial)).status,401);
 assert.equal((await handleFreshVoiceApi(new Request(base+'/admin'),env,'/api/voices-fresh/admin',denial)).status,403);
 assert.equal((await handleFreshVoiceApi(jsonRequest('/1','DELETE','text'),env,'/api/voices-fresh/1',denial)).status,403);
 assert.equal(env.BOARD_DB.state.posts.length,0);
});

test('fresh API inserts, confirms, reads, updates and soft-deletes only the isolated table',async()=>{
 const db=fakeDb(),env={BOARD_DB:db};
 const created=await handleFreshVoiceApi(jsonRequest('','POST','새로운 시민의견'),env,'/api/voices-fresh',fakeAuth);
 assert.equal(created.status,201);
 const saved=await created.json();assert.equal(saved.published,true);assert.equal(saved.id,1);
 const listed=await handleFreshVoiceApi(new Request(base),env,'/api/voices-fresh',fakeAuth);
 assert.equal((await listed.json()).items[0].message,'새로운 시민의견');
 const edited=await handleFreshVoiceApi(jsonRequest('/1','PUT','수정 의견'),env,'/api/voices-fresh/1',fakeAuth);
 assert.equal(edited.status,200);
 assert.equal(db.state.posts[0].body,'수정 의견');
 const removed=await handleFreshVoiceApi(new Request(base+'/1',{method:'DELETE'}),env,'/api/voices-fresh/1',fakeAuth);
 assert.equal(removed.status,200);
 const after=await handleFreshVoiceApi(new Request(base),env,'/api/voices-fresh',fakeAuth);
 assert.equal((await after.json()).items.length,0);
 assert.ok(db.state.queries.every(q=>!/\bboard_posts\b|\bboard_replies\b|\bnotice_posts\b|\bfinance_posts\b/.test(q)));
});

test('new preview page has its own controls and compiles under both domains',async()=>{
 for(const host of ['https://seonammedi.kr/board/voices-fresh','https://ekodi.kr/seonammedi/board/voices-fresh']){
  const response=await worker.fetch(new Request(host),{});
  assert.equal(response.status,200);
  const html=await response.text();
  for(const id of ['freshSearch','freshForm','freshMessage','freshList','freshWrite'])assert.ok(html.includes('id="'+id+'"'),id);
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Script(scripts[0][1]));
  assert.match(html,/voices-fresh/);
  assert.doesNotMatch(html,/id="writeToggle"|id="voiceMessage"/);
 }
});
