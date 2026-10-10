import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import worker from '../cgma-board-service-worker.js';

// Entire suite uses an ephemeral in-memory SQLite database. It never calls the
// real EKODI API, Cloudflare, Supabase, or the production board endpoint.
function mockD1() {
  const sqlite=new DatabaseSync(':memory:');
  // D1 prepares statements lazily; compile each SQLite statement only after
  // schema batch execution begins, so CREATE INDEX sees its preceding table.
  const prepare=sql=>{
    const bound=(args=[])=>({
      bind:(...next)=>bound(next),
      first:async()=>sqlite.prepare(sql).get(...args)??null,
      all:async()=>({results:sqlite.prepare(sql).all(...args)}),
      run:async()=>{const result=sqlite.prepare(sql).run(...args);return {meta:{last_row_id:Number(result.lastInsertRowid),changes:Number(result.changes)}};},
    });
    return bound();
  };
  return { DB:{prepare,batch:async statements=>Promise.all(statements.map(statement=>statement.run()))},close:()=>sqlite.close()};
}
const BASE='https://board.internal.ekodi/cgma/board';
const bearer=(id)=>'Bearer verified-'+id;
function request(path,method='GET',token='',body,proof=''){
  const headers=new Headers();
  if(token)headers.set('authorization',bearer(token));
  if(proof)headers.set('x-ekodi-reauth-proof',proof);
  if(body!==undefined)headers.set('content-type','application/json');
  return new Request(BASE+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
}
function fixture(){
  const db=mockD1();
  const validated=[];
  const env={
    DB:db.DB,
    CONTROL_API:{
      fetch:async req=>{
        const url=new URL(req.url);
        if(url.pathname==='/api/session'){
          const auth=req.headers.get('authorization');
          validated.push({kind:'session',auth:auth?'<redacted>':null});
          if(auth===bearer('admin1'))return Response.json({authenticated:true,role:'super_admin',email:'admin1@example.invalid'});
          if(auth===bearer('admin2'))return Response.json({authenticated:true,role:'admin',email:'admin2@example.invalid'});
          if(auth===bearer('viewer'))return Response.json({authenticated:true,role:'viewer',email:'viewer@example.invalid'});
          return Response.json({authenticated:false},{status:401});
        }
        if(url.pathname==='/api/reauth/verify'){
          validated.push({kind:'reauth',method:req.method,proof:req.headers.get('x-ekodi-reauth-proof')==='reauth-ok'});
          return req.headers.get('x-ekodi-reauth-proof')==='reauth-ok'
            ? Response.json({verified:true,actor:'admin:admin1@example.invalid'})
            : Response.json({verified:false,error:'reauth_failed'},{status:403});
        }
        throw new Error('Unexpected internal route');
      },
    },
  };
  return {env,db,validated};
}

test('independent board: verified admin session permits own create/edit/soft-delete and public visibility follows',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    assert.ok(String(url).includes('/auth/v1/user'),'only Supabase identity check may be mocked');
    return Response.json({message:'unauthorized'},{status:401});
  };
  const {env,db,validated}=fixture();
  try{
    const health=await worker.fetch(request('/api/health'),env);
    assert.equal(health.status,200);
    assert.equal(health.headers.get('x-ekodi-board-id'),'site:cgma:main');
    assert.equal((await health.json()).independent,true);
    const anonymous=await worker.fetch(request('/api/posts','POST','',{title:'untrusted',body:'blocked'}),env);
    assert.equal(anonymous.status,401);
    const forged=request('/api/posts','POST','',{title:'forged identity',body:'blocked'});
    forged.headers.set('x-ekodi-admin-email','admin1@example.invalid');
    forged.headers.set('x-ekodi-admin-role','super_admin');
    assert.equal((await worker.fetch(forged,env)).status,401,
      'unverified email or role headers never become an authenticated board principal');
    const invalid=await worker.fetch(request('/api/posts','POST','viewer',{title:'not admin',body:'blocked'}),env);
    assert.equal(invalid.status,401);
    const create=await worker.fetch(request('/api/posts','POST','admin1',{title:'CGMA test post',body:'test-only'}),env);
    assert.equal(create.status,201);
    const created=await create.json();
    assert.ok(Number(created.id)>0);
    let publicList=await (await worker.fetch(request('/api/posts'),env)).json();
    assert.equal(publicList.items.length,1);
    assert.equal(publicList.items[0].title,'CGMA test post');
    const otherEdit=await worker.fetch(request('/api/posts/'+created.id,'PATCH','admin2',{title:'cross-site',body:'not allowed'}),env);
    assert.equal(otherEdit.status,403);
    const edit=await worker.fetch(request('/api/posts/'+created.id,'PATCH','admin1',{title:'updated local test',body:'updated'}),env);
    assert.equal(edit.status,200);
    publicList=await (await worker.fetch(request('/api/posts'),env)).json();
    assert.equal(publicList.items[0].title,'updated local test');
    const otherDelete=await worker.fetch(request('/api/posts/'+created.id,'DELETE','admin2'),env);
    assert.equal(otherDelete.status,403);
    const deleted=await worker.fetch(request('/api/posts/'+created.id,'DELETE','admin1'),env);
    assert.equal(deleted.status,200);
    publicList=await (await worker.fetch(request('/api/posts'),env)).json();
    assert.deepEqual(publicList.items,[]);
    const hidden=await db.DB.prepare('SELECT status FROM ekodi_board_posts WHERE id=?').bind(created.id).first();
    assert.equal(hidden.status,'deleted');
    const audit=await db.DB.prepare('SELECT action FROM ekodi_board_audit ORDER BY id').all();
    assert.deepEqual(audit.results.map(x=>x.action),['post.create','post.edit','post.delete']);
    assert.ok(validated.some(x=>x.kind==='session'));
  } finally {globalThis.fetch=originalFetch;db.close();}
});

test('independent board: platform admin has no implicit board manage right; bootstrap needs real reauthentication',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({message:'untrusted'},{status:401});
  const {env,db,validated}=fixture();
  try{
    await worker.fetch(request('/api/health'),env);
    assert.equal((await worker.fetch(request('/api/memberships','GET','admin1'),env)).status,403);
    const bootstrapWithoutProof=await worker.fetch(request('/api/memberships/bootstrap','POST','admin1'),env);
    assert.equal(bootstrapWithoutProof.status,401);
    const bootstrap=await worker.fetch(request('/api/memberships/bootstrap','POST','admin1',undefined,'reauth-ok'),env);
    assert.equal(bootstrap.status,201);
    const memberships=await worker.fetch(request('/api/memberships','GET','admin1'),env);
    assert.equal(memberships.status,200);
    const members=(await memberships.json()).items;
    assert.equal(members.length,1);
    assert.equal(members[0].role,'owner');
    assert.equal(members[0].person_id,'admin:admin1@example.invalid');
    assert.equal((await worker.fetch(request('/api/memberships','GET','admin2'),env)).status,403);
    assert.equal((await worker.fetch(request('/api/memberships','GET','viewer'),env)).status,403);
    assert.equal((await worker.fetch(request('/api/memberships','GET'),env)).status,403);
    assert.equal((await worker.fetch(request('/api/memberships/bootstrap','POST','admin2',undefined,'reauth-ok'),env)).status,409);
    assert.equal((await worker.fetch(request('/api/memberships','DELETE','admin1',{personId:'admin:admin1@example.invalid'}),env)).status,409);
    assert.ok(validated.some(x=>x.kind==='reauth'&&x.proof));
  } finally {globalThis.fetch=originalFetch;db.close();}
});

test('board internal Worker rejects untrusted host and unrelated path',async()=>{
  const {env,db}=fixture();
  try {
    assert.equal((await worker.fetch(new Request('https://ekodi.kr/cgma/board'),env)).status,404);
    assert.equal((await worker.fetch(new Request('https://board.internal.ekodi/ekodimission/board'),env)).status,404);
  }finally{db.close();}
});
