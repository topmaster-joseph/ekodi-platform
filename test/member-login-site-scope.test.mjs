import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentityAdminHandler } from '../supabase/functions/identity-api/admin-persons.ts';

const ACTOR='11111111-1111-4111-8111-111111111111';
const OWNER='22222222-2222-4222-8222-222222222222';
const PERSON_A='33333333-3333-4333-8333-333333333333';
const PERSON_B='44444444-4444-4444-8444-444444444444';
const USER_A='55555555-5555-4555-8555-555555555555';
const USER_B='66666666-6666-4666-8666-666666666666';
const TENANT_A='77777777-7777-4777-8777-777777777777';
const TENANT_B='88888888-8888-4888-8888-888888888888';
const API='https://ekodi.kr/identity-api';

function makeFixture({grant='tenant',actorRole='tenant_admin'}={}){
  const rows={
    login_identities:[
      {id:'99999999-9999-4999-8999-999999999999',person_id:OWNER,auth_user_id:ACTOR,provider:'google',email:'site-owner@example.org',email_verified:true,status:'active',is_primary:true},
      {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',person_id:PERSON_A,auth_user_id:USER_A,provider:'google',email:'member-a@example.org',email_verified:true,status:'active',is_primary:true},
      {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',person_id:PERSON_B,auth_user_id:USER_B,provider:'google',email:'member-b@example.org',email_verified:true,status:'active',is_primary:true}
    ],
    people:[
      {id:PERSON_A,ekodi_id:'member-example-a',display_name:'Example A',status:'active'},
      {id:PERSON_B,ekodi_id:'member-example-b',display_name:'Example B',status:'active'}
    ],
    profiles:[],
    tenant_members:grant==='tenant'?[
      {user_id:ACTOR,tenant_id:TENANT_A,role:actorRole,status:'active'},
      {user_id:USER_A,tenant_id:TENANT_A,role:'member',status:'active'},
      {user_id:USER_B,tenant_id:TENANT_B,role:'member',status:'active'}
    ]:[],
    site_access_registry:grant==='site'?[
      {email:'site-owner@example.org',site_key:'site-a',tenant_id:TENANT_A,role:actorRole,status:'active'},
      {email:'member-a@example.org',site_key:'site-a',tenant_id:TENANT_A,role:'member',status:'active'},
      {email:'member-b@example.org',site_key:'site-b',tenant_id:TENANT_B,role:'member',status:'active'}
    ]:[]
  };
  const db={
    rpc:async function(name){
      if(name==='ekodi_account_for_auth_user')return {data:{person_id:OWNER,auth_user_ids:[ACTOR],verified_emails:['site-owner@example.org']},error:null};
      return {data:null,error:{message:'Unexpected RPC'}};
    },
    from(table){
      if(!(table in rows))throw Error('Unexpected table '+table);
      let values=[...rows[table]];
      const q={
        select(){return q;},
        eq(col,value){values=values.filter(r=>r[col]===value);return q;},
        in(col,allowed){values=values.filter(r=>allowed.includes(r[col]));return q;},
        ilike(col,pattern){const part=pattern.replaceAll('%','').toLowerCase();values=values.filter(r=>String(r[col]||'').toLowerCase().includes(part));return q;},
        limit(size){values=values.slice(0,size);return q;},
        order(){return q;},
        maybeSingle(){return Promise.resolve({data:values[0]||null,error:null});},
        then(done,fail){return Promise.resolve({data:values,error:null}).then(done,fail);}
      };
      return q;
    }
  };
  return createIdentityAdminHandler({
    db,json:(_req,body,status=200)=>Response.json(body,{status}),
    verifyGoogle:async()=>null,sha256:async()=>'',googleClientId:'unused'
  });
}
async function request(handler,path){
  const res=await handler(new Request(API+path),ACTOR,path.split('?')[0]);
  return {status:res.status,data:await res.json()};
}

for(const [grant,label] of [['tenant','tenant-membership'],['site','site-key-grant']]){
  test(label+': site admin sees member A but never member B',async()=>{
    const h=makeFixture({grant});
    const lookup=await request(h,'/admin/persons?query=Example');
    assert.equal(lookup.status,200);
    assert.equal(lookup.data.canManage,false);
    assert.deepEqual(lookup.data.people.map(x=>x.id),[PERSON_A]);
    const own=await request(h,'/admin/persons/'+PERSON_A+'/identities');
    assert.equal(own.status,200);
    assert.equal(own.data.canManage,false);
    assert.deepEqual(own.data.merges,[]);
    assert.ok(own.data.identities[0].email.includes('****'));
    assert.ok(!JSON.stringify(own.data).includes('member-a@example.org'));
    const cross=await request(h,'/admin/persons/'+PERSON_B+'/identities');
    assert.equal(cross.status,404);
    assert.equal(cross.data.error,'person_not_found');
  });
}
test('ordinary site member cannot search or read any identities',async()=>{
  const h=makeFixture({actorRole:'member'});
  const lookup=await request(h,'/admin/persons?query=Example');
  assert.equal(lookup.status,403);
  const detail=await request(h,'/admin/persons/'+PERSON_A+'/identities');
  assert.equal(detail.status,403);
});
