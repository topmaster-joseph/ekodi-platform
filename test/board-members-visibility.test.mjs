import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSiteBoardRequest } from '../site-board-control.js';

function fakeDb(visibility='public',membership=null){
  const instance={board_id:'site:cgma:main',site_id:'cgma',tenant_slug:'cheonggye',
    status:'active',visibility,allow_anonymous_write:0,comments_enabled:1,config_json:'{}'};
  return {
    batch:async()=>[],
    prepare(sql){
      return {
        bind(){return this;},
        async run(){return {success:true,meta:{last_row_id:1}};},
        async first(){
          if(sql.includes('SELECT * FROM ekodi_board_instances'))return instance;
          if(sql.includes('FROM ekodi_board_memberships'))return membership;
          return null;
        },
        async all(){return {results:[]};},
      };
    },
  };
}
function req(path,method='GET',token=''){
  const headers=token?{authorization:'Bearer '+token}:{};
  return new Request('https://ekodi.kr/cgma/board'+path,{method,headers});
}
async function call(db,path,method='GET',token=''){
  return handleSiteBoardRequest(req(path,method,token),{DB:db});
}
function mockedVerifiedIdentity(t){
  t.mock.method(globalThis,'fetch',async url=>{
    assert.match(String(url),/\/auth\/v1\/user$/);
    return new Response(JSON.stringify({id:'person-test-1',email:'example@nonexistent.invalid',
      email_confirmed_at:'2026-01-01T00:00:00Z'}),{
      status:200,headers:{'content-type':'application/json'},
    });
  });
}
test('members-only board blocks anonymous HTML, posts, details, search and categories',async()=>{
  const db=fakeDb('members');
  for(const path of ['/','/post/1234','/api/posts','/api/posts/1234',
    '/api/posts/1234/comments','/api/posts/1234/attachments',
    '/api/search?q=hidden','/api/categories']){
    const r=await call(db,path);
    assert.equal(r.status,401,path);
    assert.equal((await r.json()).error,'authentication_required',path);
    assert.equal(r.headers.get('x-ekodi-board-id'),'site:cgma:main');
  }
});
test('membership-gated boards keep non-sensitive health and visibility configuration accessible',async()=>{
  const db=fakeDb('members');
  const h=await call(db,'/api/health');
  assert.equal(h.status,200);
  assert.equal((await h.json()).independent,true);
  const c=await call(db,'/api/config');
  assert.equal(c.status,200);
  assert.equal((await c.json()).visibility,'members');
});
test('authenticated nonmember cannot read or write members-only board',async t=>{
  mockedVerifiedIdentity(t);
  const db=fakeDb('members',null);
  for(const path of ['/','/api/posts','/api/search?q=a']){
    const r=await call(db,path,'GET','fake-unit-test-token');
    assert.equal(r.status,403,path);
    assert.equal((await r.json()).error,'board_membership_required');
  }
  const post=await call(db,'/api/posts','POST','fake-unit-test-token');
  assert.equal(post.status,403);
});
test('revoked membership does not grant access',async t=>{
  mockedVerifiedIdentity(t);
  const db=fakeDb('members',{role:'member',status:'revoked'});
  const r=await call(db,'/api/posts','GET','fake-unit-test-token');
  assert.equal(r.status,403);
});
test('active local board membership grants private read but not manager-only export',async t=>{
  mockedVerifiedIdentity(t);
  const db=fakeDb('members',{role:'member',status:'active'});
  const r=await call(db,'/api/posts','GET','fake-unit-test-token');
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).items,[]);
  const exp=await call(db,'/api/export','GET','fake-unit-test-token');
  assert.equal(exp.status,403);
});
test('public board retains anonymous read and denies anonymous posting',async()=>{
  const db=fakeDb('public');
  const r=await call(db,'/');
  assert.equal(r.status,200);
  assert.match(await r.text(),/게시판/);
  const list=await call(db,'/api/posts');
  assert.equal(list.status,200);
  const create=await call(db,'/api/posts','POST');
  assert.equal(create.status,401);
});
