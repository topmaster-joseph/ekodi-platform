import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSinglesSocial } from '../supabase/functions/singles-api/social.ts';
const uid='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const reply=(_req,body,status=200)=>new Response(JSON.stringify(body),{status});
const settings={SINGLES_SOCIAL_ENABLED:'true',SINGLES_BANK_TRANSFER_ENABLED:'false'};
globalThis.Deno={env:{get:key=>settings[key]||undefined}};
function db({verified=true,accepted=false,grant=false}={}){
 const writes=[];
 const rows={singles_memberships:{status:'active',base_consent:true,age_19_confirmed:true,adult_verified_at:verified?'2026-10-09T00:00:00Z':null,religion_consent:true,discoverable:verified},
  singles_interests:accepted?{from_user_id:other,to_user_id:uid,status:'accepted'}:null,
  singles_events:{id,starts_at:'2027-05-01T09:00:00Z'},
  singles_bank_grants:grant?{expires_at:grant==='expired'?'2020-01-01T00:00:00Z':'2030-01-01T00:00:00Z'}:null};
 const make=(name)=>{
  const query={
   filters:[],
   select(){return this},eq(key,value){this.filters.push([key,value]);return this},
   neq(){return this},gte(){return this},not(){return this},or(){return this},
   in(){return this},order(){return this},limit(){return this},
   insert(row){writes.push({name,kind:'insert',row});this.kind='insert';return this},
   update(row){writes.push({name,kind:'update',row});this.kind='update';return this},
   upsert(row){writes.push({name,kind:'upsert',row});this.kind='upsert';return this},
   single:async()=>({data:{id},error:null}),
   maybeSingle:async()=>{
    if(query.kind)return {data:{id},error:null};
    let record=rows[name]??null;
    if(name==='singles_interests'&&!accepted)record=null;
    return {data:record,error:null};
   },
   then(ok,fail){return Promise.resolve({data:[],error:null}).then(ok,fail)}
  };
  return query;
 };
 return {from:make,writes};
}
test('logged-in event summaries are readable without subscription',async()=>{
 const admin=db({verified:false});
 const res=await handleSinglesSocial(new Request('https://ekodi.kr/events'),'/events',admin,uid,reply);
 assert.equal(res.status,200);assert.deepEqual((await res.json()).events,[]);
});
test('event participation still requires a confirmed bank community grant',async()=>{
 const admin=db({verified:true});
 const req=new Request('https://ekodi.kr/events/'+id+'/rsvp',{method:'POST',body:'{}'});
 const res=await handleSinglesSocial(req,'/events/'+id+'/rsvp',admin,uid,reply);
 assert.equal(res.status,402);assert.equal((await res.json()).error,'community_subscription_required');
 assert.equal(admin.writes.length,0);
});
test('mutual consent never bypasses active subscription for sending a message',async()=>{
 settings.SINGLES_BANK_TRANSFER_ENABLED='false';
 const admin=db({verified:true,accepted:true});
 const req=new Request('https://ekodi.kr/messages/'+id,{method:'POST',body:JSON.stringify({text:'안녕하세요'})});
 const res=await handleSinglesSocial(req,'/messages/'+id,admin,uid,reply);
 assert.equal(res.status,402);
 assert.equal((await res.json()).error,'community_subscription_required');
 assert.equal(admin.writes.length,0);
});
test('an expired or absent payment entitlement prevents send and reply',async()=>{
 settings.SINGLES_BANK_TRANSFER_ENABLED='true';
 const admin=db({verified:true,accepted:true,grant:false});
 const req=new Request('https://ekodi.kr/messages/'+id,{method:'POST',body:JSON.stringify({text:'답장입니다'})});
 const res=await handleSinglesSocial(req,'/messages/'+id,admin,uid,reply);
 assert.equal(res.status,402);
 assert.equal((await res.json()).error,'community_subscription_required');
 assert.equal(admin.writes.length,0);
 settings.SINGLES_BANK_TRANSFER_ENABLED='false';
});
test('expired community subscription does not unlock outgoing messages',async()=>{
 settings.SINGLES_BANK_TRANSFER_ENABLED='true';
 const admin=db({verified:true,accepted:true,grant:'expired'});
 const req=new Request('https://ekodi.kr/messages/'+id,{method:'POST',body:JSON.stringify({text:'답장'})});
 const res=await handleSinglesSocial(req,'/messages/'+id,admin,uid,reply);
 assert.equal(res.status,402);
 assert.equal((await res.json()).error,'community_subscription_required');
 assert.equal(admin.writes.length,0);
 settings.SINGLES_BANK_TRANSFER_ENABLED='false';
});
test('verified subscriber can send a message after mutual consent',async()=>{
 settings.SINGLES_BANK_TRANSFER_ENABLED='true';
 const admin=db({verified:true,accepted:true,grant:true});
 const req=new Request('https://ekodi.kr/messages/'+id,{method:'POST',body:JSON.stringify({text:'안녕하세요'})});
 const res=await handleSinglesSocial(req,'/messages/'+id,admin,uid,reply);
 assert.equal(res.status,200);assert.equal((await res.json()).ok,true);
 assert.equal(admin.writes.length,1);
 assert.equal(admin.writes[0].name,'singles_messages');
 settings.SINGLES_BANK_TRANSFER_ENABLED='false';
});
test('mutually accepted message history remains readable without subscription',async()=>{
 settings.SINGLES_BANK_TRANSFER_ENABLED='false';
 const admin=db({verified:true,accepted:true});
 const req=new Request('https://ekodi.kr/messages/'+id);
 const res=await handleSinglesSocial(req,'/messages/'+id,admin,uid,reply);
 assert.equal(res.status,200);
 assert.deepEqual((await res.json()).messages,[]);
 assert.equal(admin.writes.length,0);
});
test('free block remains available to an enrolled non-verified adult',async()=>{
 const admin=db({verified:false});
 const req=new Request('https://ekodi.kr/blocks/'+other,{method:'POST',body:'{}'});
 const res=await handleSinglesSocial(req,'/blocks/'+other,admin,uid,reply);
 assert.equal(res.status,200);assert.equal((await res.json()).blocked,true);
 assert.deepEqual(admin.writes[0].row,{blocker_id:uid,blocked_id:other});
});
test('no active subscription is inferred from identity or mutable client input',async()=>{
 const admin=db({verified:true});
 const res=await handleSinglesSocial(new Request('https://ekodi.kr/subscription'),'/subscription',admin,uid,reply);
 assert.deepEqual(await res.json(),{active:false,community_active:false,consulting_active:false,payment_method:'bank_transfer'});
});
