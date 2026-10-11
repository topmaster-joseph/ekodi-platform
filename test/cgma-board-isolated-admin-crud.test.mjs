import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSiteBoardRequest } from '../site-board-control.js';

const BOARD='site:cgma:main';
const email={
  owner:'owner@fixture.invalid',
  moderator:'moderator@fixture.invalid',
  writer:'writer@fixture.invalid',
  outsider:'outsider@fixture.invalid',
};
function makeDatabase() {
  const posts=new Map();
  const audits=[];
  const memberships=new Map([
    ['admin:'+email.owner,{role:'owner',status:'active'}],
    ['admin:'+email.moderator,{role:'moderator',status:'active'}],
    ['admin:'+email.writer,{role:'member',status:'active'}],
  ]);
  const instance={board_id:BOARD,site_id:'cgma',tenant_slug:'cheonggye',
    status:'active',visibility:'public',allow_anonymous_write:0,comments_enabled:1,config_json:'{}'};
  let nextId=1;
  const DB={
    batch:async()=>[],
    prepare(sql){
      let args=[];
      return {
        bind(...values){args=values;return this;},
        async first(){
          if(sql.includes('SELECT * FROM ekodi_board_instances'))return instance;
          if(sql.includes('SELECT role,status FROM ekodi_board_memberships'))return memberships.get(args[1])||null;
          if(sql.includes('SELECT role FROM ekodi_board_memberships'))return memberships.get(args[1])||null;
          if(sql.includes('SELECT COUNT(*) AS n FROM ekodi_board_memberships'))
            return {n:[...memberships.values()].filter(m=>m.role==='owner'&&m.status==='active').length};
          if(sql.includes('SELECT * FROM ekodi_board_posts'))return posts.get(Number(args[1]))||null;
          if(sql.includes('SELECT p.*,'))return posts.get(Number(args[1]))?.status==='published' ? posts.get(Number(args[1])) : null;
          return null;
        },
        async all(){
          if(sql.includes('FROM ekodi_board_posts p') && sql.includes("p.status='published'"))
            return {results:[...posts.values()].filter(p=>p.status==='published').sort((a,b)=>b.id-a.id)};
          if(sql.includes('FROM ekodi_board_memberships'))return {results:[...memberships].map(([person_id,m])=>({person_id,...m}))};
          return {results:[]};
        },
        async run(){
          if(sql.includes('INSERT INTO ekodi_board_posts')) {
            const [board_id,author_person_id,author_email,title,body,created_at,updated_at]=args;
            const id=nextId++;
            posts.set(id,{id,board_id,author_person_id,author_email,title,body,created_at,updated_at,status:'published'});
            return {success:true,meta:{last_row_id:id}};
          }
          if(sql.includes("UPDATE ekodi_board_posts SET status='deleted'")) {
            const id=Number(args[2]); const post=posts.get(id);
            if(post){post.status='deleted';post.updated_at=args[0];}
          }
          if(sql.includes('UPDATE ekodi_board_posts SET title=')){
            const [title,body,updated_at,,id]=args;
            const post=posts.get(Number(id));
            if(post){post.title=title;post.body=body;post.updated_at=updated_at;}
          }
          if(sql.includes('INSERT INTO ekodi_board_audit')){
            audits.push({board_id:args[0],actor_person_id:args[1],action:args[2],target_type:args[3],target_id:args[4]});
          }
          return {success:true,meta:{last_row_id:0}};
        },
      };
    },
  };
  const CONTROL_API={
    async fetch(request){
      const url=new URL(request.url);
      if(url.pathname==='/api/session'){
        const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
        const principal=email[token];
        return principal
          ? Response.json({authenticated:true,email:principal,role:'admin'})
          : Response.json({authenticated:false},{status:401});
      }
      if(url.pathname==='/api/reauth/verify')
        return Response.json({verified:request.headers.get('x-ekodi-reauth-proof')==='fixture-reauthed'},
          {status:request.headers.get('x-ekodi-reauth-proof')==='fixture-reauthed'?200:403});
      return Response.json({error:'not_found'},{status:404});
    },
  };
  return {env:{DB,CONTROL_API},posts,memberships,audits};
}
async function request(env,path,method='GET',actor='',body,extra={}) {
  const headers={...extra};
  if(actor) headers.authorization='Bearer '+actor;
  if(body!==undefined) headers['content-type']='application/json';
  const r=await handleSiteBoardRequest(new Request('https://board.internal.ekodi/cgma/board'+path,
    {method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  assert.equal(r.headers.get('x-ekodi-board-id'),BOARD);
  assert.equal(r.headers.get('x-ekodi-board-independent'),'true');
  return {status:r.status,body:await r.json()};
}
test('CGMA independent board: owner creates, moderator edits, owner soft-deletes, public listing updates',async()=>{
  const fixture=makeDatabase();
  const created=await request(fixture.env,'/api/posts','POST','owner',{title:'fixture post',body:'fixture body'});
  assert.equal(created.status,201);
  const id=created.body.id;
  assert.ok(id>0);
  assert.equal(fixture.posts.get(id).author_person_id,'admin:'+email.owner);
  const before=await request(fixture.env,'/api/posts');
  assert.equal(before.body.items.length,1);
  const edited=await request(fixture.env,'/api/posts/'+id,'PATCH','moderator',{title:'updated fixture',body:'new fixture body'});
  assert.equal(edited.status,200);
  assert.equal(fixture.posts.get(id).title,'updated fixture');
  const deleted=await request(fixture.env,'/api/posts/'+id,'DELETE','owner');
  assert.equal(deleted.status,200);
  assert.equal(fixture.posts.get(id).status,'deleted');
  const after=await request(fixture.env,'/api/posts');
  assert.deepEqual(after.body.items,[]);
  assert.deepEqual(fixture.audits.map(x=>x.action),['post.create','post.edit','post.delete']);
});
test('CGMA independent board: anonymous cannot create, edit or delete',async()=>{
  const f=makeDatabase();
  const valid=await request(f.env,'/api/posts','POST','owner',{title:'created',body:'created'});
  const id=valid.body.id;
  for(const [path,method,body] of [['/api/posts','POST',{title:'bad',body:'bad'}],['/api/posts/'+id,'PATCH',{title:'bad'}],['/api/posts/'+id,'DELETE',undefined]]){
    const r=await request(f.env,path,method,'',body);
    assert.equal(r.status,401);
  }
  assert.equal(f.posts.size,1);
  assert.equal(f.posts.get(id).title,'created');
  assert.equal(f.posts.get(id).status,'published');
});
test('CGMA independent board: nonmember writer cannot edit or delete someone else’s post',async()=>{
  const f=makeDatabase();
  const p=await request(f.env,'/api/posts','POST','owner',{title:'owner title',body:'owner body'});
  const id=p.body.id;
  for(const [token,method] of [['writer','PATCH'],['outsider','DELETE']]){
    const r=await request(f.env,'/api/posts/'+id,method,token,method==='PATCH'?{title:'hijacked'}:undefined);
    assert.equal(r.status,403);
  }
  assert.equal(f.posts.get(id).title,'owner title');
  assert.equal(f.posts.get(id).status,'published');
});
test('CGMA independent board: private membership listing forbids nonmanager or anonymous',async()=>{
  const f=makeDatabase();
  for(const actor of ['', 'writer', 'outsider']) {
    const r=await request(f.env,'/api/memberships','GET',actor);
    assert.equal(r.status,403);
  }
  const owner=await request(f.env,'/api/memberships','GET','owner');
  assert.equal(owner.status,200);
  assert.equal(owner.body.items.length,3);
});
test('CGMA independent board: last-owner removal and destructive lifecycle require explicit protections',async()=>{
  const f=makeDatabase();
  const attempt=await request(f.env,'/api/memberships','DELETE','owner',{personId:'admin:'+email.owner});
  assert.equal(attempt.status,409);
  assert.equal(attempt.body.error,'last_owner_cannot_be_removed');
  assert.equal(f.memberships.get('admin:'+email.owner).status,'active');
  const cancel=await request(f.env,'/api/lifecycle/cancel','POST','owner',{});
  assert.equal(cancel.status,401);
  assert.equal(cancel.body.error,'super_admin_reauthentication_required');
  assert.deepEqual(f.audits,[]);
});
