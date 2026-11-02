import test from 'node:test';
import assert from 'node:assert/strict';
import {createIdentityAdminHandler} from '../supabase/functions/identity-api/admin-persons.ts';

const ACTOR='11111111-1111-4111-8111-111111111111';
const PERSON='22222222-2222-4222-8222-222222222222';
const IDENTITY='33333333-3333-4333-8333-333333333333';
const URL='https://renzehysxirjilvdxacv.supabase.co/functions/v1/identity-api';

function makeDb({platform=true,site=false,count=2,isPrimary=false,proof=true}={}){
  const db={
    rpc:(fn)=>Promise.resolve({data:fn==='ekodi_account_for_auth_user'?{
      person_id:PERSON,auth_user_ids:[ACTOR],verified_emails:['authority@gmail.com']
    }:null,error:null}),
    from(table){
      const fields={};
      const q={
        select(_cols,opts){fields.opts=opts;return q;},
        eq(k,v){fields[k]=v;return q;},
        in(k,v){fields[k]=v;return q;},
        gt(k,v){fields[k]=v;return q;},
        limit(){return q;},
        order(){return q;},
        maybeSingle(){const r=resolve();return Promise.resolve({...r,data:Array.isArray(r.data)?(r.data[0]||null):r.data});},
        then(ok,bad){return Promise.resolve(resolve()).then(ok,bad);}
      };
      function resolve(){
        if(table==='login_identities'){
          if(fields.opts?.head)return {data:null,count,error:null};
          if(fields.id===IDENTITY)return {data:[{id:IDENTITY,person_id:PERSON,is_primary:isPrimary,status:'active'}],error:null};
          return {data:[{email:'authority@gmail.com',email_verified:true,provider:'google',status:'active',person_id:PERSON}],error:null};
        }
        if(table==='profiles')return {data:platform?[{platform_admin:true}]:[],error:null};
        if(table==='tenant_members')return {data:site?[{tenant_id:'44444444-4444-4444-8444-444444444444',role:'tenant_admin',status:'active'}]:[],error:null};
        if(table==='site_access_registry')return {data:[],error:null};
        if(table==='identity_admin_step_ups')return {data:proof?[{verified_at:new Date().toISOString(),verified_person_id:PERSON,session_hash:'TEST_HASH'}]:null,error:null};
        return {data:[],error:null};
      }
      return q;
    }
  };
  return db;
}
function handler(opts={}){
  return createIdentityAdminHandler({
    db:makeDb(opts),
    json:(_req,body,status=200)=>Response.json(body,{status}),
    sha256:async()=> 'TEST_HASH',
    verifyGoogle:async()=>({}),
    googleClientId:'not-used'
  });
}
async function execute(opts,reason='관리 요청에 따른 해제'){
  const req=new Request(URL+'/admin/identities/'+IDENTITY,{
    method:'DELETE',headers:{Authorization:'Bearer representative-session'},
    body:JSON.stringify({reason})
  });
  return handler(opts)(req,ACTOR,'/admin/identities/'+IDENTITY);
}
test('HTTP 403: anonymous/non-admin has no access',async()=>{
  const response=await execute({platform:false,site:false});
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,'admin_access_required');
});
test('HTTP 403: tenant-admin only has read permission, never mutation permission',async()=>{
  const response=await execute({platform:false,site:true});
  assert.equal(response.status,403);
  assert.equal((await response.json()).error,'platform_admin_required');
});
test('HTTP 400: mutation requires five-character reason',async()=>{
  const response=await execute({platform:true},'');
  assert.equal(response.status,400);
  assert.equal((await response.json()).error,'reason_required');
});
test('HTTP 401: fresh Google proof is required by server, not client claim',async()=>{
  const response=await execute({platform:true,proof:false});
  assert.equal(response.status,401);
  assert.equal((await response.json()).error,'google_step_up_required');
});
test('HTTP 409: cannot detach last active identity',async()=>{
  const response=await execute({platform:true,count:1});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'last_identity_cannot_disconnect');
});
test('HTTP 409: cannot detach primary login',async()=>{
  const response=await execute({platform:true,isPrimary:true,count:2});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error,'primary_identity_cannot_disconnect');
});
