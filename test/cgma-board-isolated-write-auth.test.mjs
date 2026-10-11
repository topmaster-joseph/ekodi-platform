import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSiteBoardRequest } from '../site-board-control.js';

const BOARD='site:cgma:main';
const URL='https://board.internal.ekodi/cgma/board';

function fixture(){
  const instance={board_id:BOARD,site_id:'cgma',tenant_slug:'cheonggye',status:'active',
    visibility:'public',allow_anonymous_write:0,comments_enabled:1,config_json:'{}'};
  const posts=new Map();
  const members=new Map([
    ['admin:owner@local.invalid',{role:'owner',status:'active'}],
    ['admin:member@local.invalid',{role:'member',status:'active'}],
    ['admin:other@local.invalid',{role:'member',status:'active'}],
  ]);
  const mutations=[];
  let authCalls=0;
  let lastAuthRequest=null;
  const db={
    async batch(){return [];},
    prepare(sql){
      const normalized=sql.replace(/\s+/g,' ').trim().toUpperCase();
      return {
        bind(...params){
          return {
            async first(){
              if(normalized.includes('FROM EKODI_BOARD_INSTANCES'))return instance;
              if(normalized.includes('SELECT ROLE,STATUS FROM EKODI_BOARD_MEMBERSHIPS'))return members.get(params[1])||null;
              if(normalized.includes('SELECT ROLE FROM EKODI_BOARD_MEMBERSHIPS'))return members.get(params[1])||null;
              if(normalized.includes('SELECT COUNT(*) AS N FROM EKODI_BOARD_MEMBERSHIPS'))return {
                n:[...members.values()].filter(m=>m.status==='active'&&m.role==='owner').length
              };
              if(normalized.includes('SELECT * FROM EKODI_BOARD_POSTS')&&normalized.includes('WHERE BOARD_ID=? AND ID=?'))return posts.get(Number(params[1]))||null;
              return null;
            },
            async all(){
              if(normalized.includes('FROM EKODI_BOARD_POSTS P WHERE P.BOARD_ID=?')){
                return {results:[...posts.values()].filter(p=>p.status==='published')
                  .sort((a,b)=>b.id-a.id).map(p=>({...p,category_id:null}))};
              }
              if(normalized.includes('FROM EKODI_BOARD_MEMBERSHIPS'))return {
                results:[...members].map(([person_id,record])=>({person_id,...record}))
              };
              return {results:[]};
            },
            async run(){
              mutations.push({sql:normalized,params});
              if(normalized.startsWith('INSERT INTO EKODI_BOARD_POSTS')){
                const id=posts.size+1;
                const [board_id,author_person_id,author_email,title,body,created_at,updated_at]=params;
                posts.set(id,{id,board_id,author_person_id,author_email,title,body,created_at,updated_at,status:'published'});
                return {meta:{last_row_id:id}};
              }
              if(normalized.startsWith('UPDATE EKODI_BOARD_POSTS SET TITLE=')){
                const post=posts.get(Number(params[4]));if(post){post.title=params[0];post.body=params[1];post.updated_at=params[2];}
              }
              if(normalized.startsWith("UPDATE EKODI_BOARD_POSTS SET STATUS='DELETED'")){
                const post=posts.get(Number(params[2]));if(post){post.status='deleted';post.updated_at=params[0];}
              }
              if(normalized.startsWith("UPDATE EKODI_BOARD_MEMBERSHIPS SET STATUS='REVOKED'")){
                const rec=members.get(params[2]);if(rec)rec.status='revoked';
              }
              return {meta:{last_row_id:0}};
            },
          };
        },
      };
    },
  };
  const env={
    DB:db,
    CONTROL_API:{
      async fetch(request){
        authCalls++;
        const path=new URL(request.url).pathname;
        if(path==='/api/reauth/verify')return Response.json({verified:false},{status:403});
        if(path!=='/api/session')return new Response('not found',{status:404});
        const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
        // Test-only diagnostic: never print bearer values or real account details.
        lastAuthRequest={sessionPath:path,bearerPresent:!!token,recognized:['owner','member','other','outsider'].includes(token),method:request.method};
        if(!['owner','member','other','outsider'].includes(token))return Response.json({authenticated:false},{status:401});
        return Response.json({authenticated:true,role:'admin',email:token+'@local.invalid'});
      },
    },
  };
  async function call(method,path='',{token,body,headers={}}={}){
    const h={'content-type':'application/json',...headers};
    if(token)h.authorization='Bearer '+token;
    const request=new Request(URL+path,{method,headers:h,
      ...(['GET','HEAD'].includes(method)?{}:{body:JSON.stringify(body??{})})});
    const response=await handleSiteBoardRequest(request,env);
    const data=await response.json();
    return {status:response.status,body:data,headers:response.headers,debug:{bearerPresent:request.headers.has('authorization'),authCalls,lastAuthRequest}};
  }
  return {call,posts,members,mutations,env};
}

test('anonymous cannot create posts and cannot gain board manager role by forged headers',async()=>{
  const f=fixture();
  const anonymous=await f.call('POST','/api/posts',{body:{title:'anonymous',body:'must be rejected'}});
  assert.equal(anonymous.status,401);
  assert.equal(anonymous.body.error,'authentication_required');
  const spoof=await f.call('PUT','/api/memberships',{headers:{'x-ekodi-admin-email':'owner@local.invalid'},body:{personId:'forged',role:'owner'}});
  assert.equal(spoof.status,403);
  assert.equal(f.posts.size,0);
  assert.equal(f.mutations.filter(m=>m.sql.includes('INSERT INTO EKODI_BOARD_POSTS')).length,0);
});

test('member creates and edits own isolated post; non-owner cannot edit another user post',async()=>{
  const f=fixture();
  const create=await f.call('POST','/api/posts',{token:'member',body:{title:'fixture-only',body:'original'}});
  assert.equal(create.status,201,JSON.stringify({response:create.body,debug:create.debug}));
  assert.equal(create.body.id,1);
  assert.equal(create.headers.get('x-ekodi-board-id'),BOARD);
  const blocked=await f.call('PATCH','/api/posts/1',{token:'other',body:{title:'tamper'}});
  assert.equal(blocked.status,403);
  assert.equal(f.posts.get(1).title,'fixture-only');
  const edited=await f.call('PATCH','/api/posts/1',{token:'member',body:{title:'fixture-updated',body:'changed'}});
  assert.equal(edited.status,200);
  assert.equal(f.posts.get(1).title,'fixture-updated');
  assert.equal(f.posts.get(1).body,'changed');
});

test('board owner may edit another member post, and delete is soft-delete with audit',async()=>{
  const f=fixture();
  await f.call('POST','/api/posts',{token:'member',body:{title:'temporary',body:'write-isolation-test'}});
  const edit=await f.call('PATCH','/api/posts/1',{token:'owner',body:{title:'owner-edited'}});
  assert.equal(edit.status,200);
  const deleted=await f.call('DELETE','/api/posts/1',{token:'owner'});
  assert.equal(deleted.status,200);
  assert.equal(f.posts.get(1).status,'deleted');
  assert.ok(f.mutations.some(x=>x.sql.includes('INSERT INTO EKODI_BOARD_AUDIT')&&x.params[2]==='post.delete'));
  const published=await f.call('GET','/api/posts');
  assert.equal(published.status,200);
  assert.deepEqual(published.body.items,[]);
});

test('role-restricted membership mutations, last owner retention and reauthentication gate',async()=>{
  const f=fixture();
  const denied=await f.call('PUT','/api/memberships',{token:'member',body:{personId:'admin:outsider@local.invalid',role:'admin'}});
  assert.equal(denied.status,403);
  const outsider=await f.call('GET','/api/memberships',{token:'outsider'});
  assert.equal(outsider.status,403);
  const list=await f.call('GET','/api/memberships',{token:'owner'});
  assert.equal(list.status,200);
  assert.equal(list.body.items.length,3);
  const revokeOwner=await f.call('DELETE','/api/memberships',{token:'owner',body:{personId:'admin:owner@local.invalid'}});
  assert.equal(revokeOwner.status,409);
  assert.equal(revokeOwner.body.error,'last_owner_cannot_be_removed');
  assert.equal(f.members.get('admin:owner@local.invalid').status,'active');
  const lifecycle=await f.call('POST','/api/lifecycle/cancel',{token:'owner'});
  assert.equal(lifecycle.status,401);
  assert.equal(lifecycle.body.error,'super_admin_reauthentication_required');
  assert.equal(f.env.DB!==undefined,true);
});

test('an EKODI platform administrator without board membership cannot manage CGMA',async()=>{
  const f=fixture();
  const denied=await f.call('PATCH','/api/config',{token:'outsider',body:{allowAnonymousWrite:true}});
  assert.equal(denied.status,403);
  const deniedList=await f.call('GET','/api/export',{token:'outsider'});
  assert.equal(deniedList.status,403);
  const noWrite=await f.call('DELETE','/api/posts/999',{token:'outsider'});
  assert.equal(noWrite.status,404);
  assert.equal(f.posts.size,0);
});
