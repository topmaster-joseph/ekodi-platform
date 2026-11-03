import test from 'node:test';
import assert from 'node:assert/strict';
import {handleReading} from '../supabase/functions/community-api/reading.ts';

const circleId='11111111-1111-4111-8111-111111111111';
const owner='22222222-2222-4222-8222-222222222222';
const member='33333333-3333-4333-8333-333333333333';
const outsider='44444444-4444-4444-8444-444444444444';
const meeting='55555555-5555-4555-8555-555555555555';
const cid='66666666-6666-4666-8666-666666666666';
const seed={
  community_circles:[{id:circleId,owner_user_id:owner,workspace_tenant_id:cid,status:'active',capacity:8,name:'테스트 Circle'}],
  community_circle_members:[
    {circle_id:circleId,user_id:owner,role:'owner',status:'active'},
    {circle_id:circleId,user_id:member,role:'member',status:'active'},
    {circle_id:circleId,user_id:outsider,role:'member',status:'pending'}],
  community_reading_meetings:[{id:meeting,circle_id:circleId,status:'planned',title:'첫 모임'}],
  community_reading_entries:[
    {id:'77777777-7777-4777-8777-777777777777',circle_id:circleId,meeting_id:meeting,author_user_id:owner,scope:'private',deleted_at:null,content:'운영자만 보는 내용'},
    {id:'88888888-8888-4888-8888-888888888888',circle_id:circleId,meeting_id:meeting,author_user_id:member,scope:'private',deleted_at:null,content:'회원만 보는 내용'},
    {id:'99999999-9999-4999-8999-999999999999',circle_id:circleId,meeting_id:meeting,author_user_id:owner,scope:'circle',deleted_at:null,content:'모임에 공개한 내용'}],
  community_profiles:[{user_id:owner,display_name:'진행자'}, {user_id:member,display_name:'회원'}],
};
function fakeAdmin(store=seed, log=[]){
  return {from(table){
    log.push(table);
    const filters=[];
    let orFilter=null;
    const query={
      select(){return this;},
      eq(column,value){filters.push(row=>row[column]===value);return this;},
      is(column,value){filters.push(row=>row[column]==null&&value===null);return this;},
      in(column,values){filters.push(row=>values.includes(row[column]));return this;},
      or(value){const [_,user]=value.split(',author_user_id.eq.');orFilter=row=>row.scope==='circle'||row.author_user_id===user;return this;},
      order(){return this;},
      limit(count){this.limitValue=count;return this;},
      async maybeSingle(){const data=(store[table]||[]).filter(row=>filters.every(f=>f(row))&&(!orFilter||orFilter(row)));return{data:data[0]||null,error:null};},
      then(resolve,reject){const rows=(store[table]||[]).filter(row=>filters.every(f=>f(row))&&(!orFilter||orFilter(row)));return Promise.resolve({data:rows.slice(0,this.limitValue||rows.length),error:null}).then(resolve,reject);}
    };
    return query;
  }};
}
const ctx=(userId,workspace,admin)=>({userId,workspace,admin,json:(req,body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})});
const call=async(userId,workspace,tail,store=seed,log=[])=>{
  const req=new Request('https://example.invalid/community-api/circles/'+circleId+'/reading'+tail);
  const res=await handleReading(req,'/circles/'+circleId+'/reading'+tail,ctx(userId,workspace,fakeAdmin(store,log)));
  return {status:res.status,body:await res.json(),log};
};

test('tenant isolation and active member checks happen before any private reading query',async()=>{
  const l=[];
  const wrong=await call(owner,{tenantId:null,member:true},'/meetings',seed,l);
  assert.equal(wrong.status,404);
  assert.equal(l.includes('community_reading_meetings'),false);
  const pending=await call(outsider,{tenantId:cid,member:true},'/meetings');
  assert.equal(pending.status,403);
  const excluded=await call(member,{tenantId:cid,member:false},'/meetings');
  assert.equal(excluded.status,403);
});

test('private notes are excluded server-side even for a valid Circle owner',async()=>{
  const res=await call(owner,{tenantId:cid,member:true},'/meetings/'+meeting+'/entries');
  assert.equal(res.status,200);
  assert.equal(res.body.entries.length,2);
  assert.ok(res.body.entries.some(e=>e.content==='운영자만 보는 내용'));
  assert.ok(res.body.entries.some(e=>e.content==='모임에 공개한 내용'));
  assert.ok(!res.body.entries.some(e=>e.content==='회원만 보는 내용'));
  const other=await call(member,{tenantId:cid,member:true},'/meetings/'+meeting+'/entries');
  assert.equal(other.status,200);
  assert.ok(!other.body.entries.some(e=>e.content==='운영자만 보는 내용'));
});

test('member review list is restricted to managers and contains no contact or notes',async()=>{
  const denied=await call(member,{tenantId:cid,member:true},'/members');
  assert.equal(denied.status,403);
  const allowed=await call(owner,{tenantId:cid,member:true},'/members');
  assert.equal(allowed.status,200);
  assert.equal(allowed.body.members.length,3);
  assert.equal(allowed.body.members[0].display_name,'진행자');
  assert.ok(allowed.body.members.every(m=>!('email'in m)&&!('note'in m)&&!('phone'in m)));
});
