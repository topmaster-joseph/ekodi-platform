import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSinglesBank, hasBankPlan } from '../supabase/functions/singles-api/bank-transfer.ts';
import {readFile} from 'node:fs/promises';

const uid='11111111-1111-4111-8111-111111111111';
const reference='EDH-'+'B'.repeat(32);
const reply=(_req,body,status=200)=>new Response(JSON.stringify(body),{status});
const flags={SINGLES_BANK_TRANSFER_ENABLED:'false',SINGLES_BANK_VERIFICATION_ENABLED:'false'};
globalThis.Deno={env:{get:key=>flags[key]||undefined}};
function db({operator=false,grant=false,configured=false}={}){
 const writes=[],reads=[],calls=[];
 const rows={
  singles_bank_operators:{enabled:operator},
  singles_memberships:{status:'active',base_consent:true,adult_verified_at:'2026-10-09T01:00:00Z'},
  singles_bank_plans:{code:'community',display_name:'행사 참가',amount_krw:25000,duration_days:30,active:configured},
  singles_bank_settings:{bank_name:'테스트은행',account_number:'0000000000',account_holder:'테스트',active:configured},
  singles_bank_grants:grant?{expires_at:'2030-01-01T00:00:00Z'}:null,
  singles_bank_orders:[],singles_bank_audit:[],singles_consulting_requests:[],
 };
 const resultFor=name=>{const data=rows[name];return Array.isArray(data)?data:[]};
 return {
  writes,reads,calls,
  from(name){
   const q={
    name,filters:[],mode:'read',
    select(){return this},eq(k,v){this.filters.push([k,v]);reads.push([name,k,v]);return this},
    order(){return this},limit(){return this},
    insert(row){writes.push({name,row});this.mode='write';return this},
    single:async()=>({data:{id:'55555555-5555-4555-8555-555555555555',status:'requested'},error:null}),
    maybeSingle:async()=>({data:rows[name]||null,error:null}),
    then(on,fail){return Promise.resolve({data:resultFor(name),error:null}).then(on,fail)},
   };
   return q;
  },
  rpc:async(name,params)=>{calls.push({name,params});return{data:name==='singles_bank_confirm_order'?'verified':'reported_paid',error:null}}
 };
}
const request=(path,method='GET',body)=>new Request('https://ekodi.kr'+path,{
  method,...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})
});
test('bank transfer cannot accept an order while collection is disabled',async()=>{
 flags.SINGLES_BANK_TRANSFER_ENABLED='false';
 const x=db({configured:true}),r=await handleSinglesBank(request('/bank/orders','POST',{plan_code:'community'}),'/bank/orders',x,uid,reply);
 assert.equal(r.status,503);assert.equal(x.writes.length,0);
 assert.deepEqual((await r.json()).error,'bank_collection_not_launched');
});
test('self-declared payment never creates an entitlement; only trusted server RPC can record a report',async()=>{
 flags.SINGLES_BANK_TRANSFER_ENABLED='true';
 const x=db({configured:true});
 const r=await handleSinglesBank(request('/bank/orders/'+reference+'/report','POST',{}),
  '/bank/orders/'+reference+'/report',x,uid,reply);
 assert.equal(r.status,200);assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].name,'singles_bank_report_order');
 assert.equal(x.calls[0].params.p_actor,uid);
 assert.equal(x.writes.filter(i=>i.name==='singles_bank_grants').length,0);
});
test('new order uses unguessable unique reference and server plan amount only',async()=>{
 flags.SINGLES_BANK_TRANSFER_ENABLED='true';
 const x=db({configured:true});
 const r=await handleSinglesBank(request('/bank/orders','POST',{plan_code:'community'}),
  '/bank/orders',x,uid,reply);
 assert.equal(r.status,201);
 const v=await r.json();assert.match(v.order.reference,/^EDH-[A-F0-9]{32}$/);
 assert.equal(v.order.amount_krw,25000);
 assert.equal(v.order.payment_method,'bank_transfer');
 assert.equal(x.writes[0].row.user_id,uid);
 assert.equal(x.writes[0].row.status,'awaiting_transfer');
 assert.equal(x.writes.filter(z=>z.name==='singles_bank_grants').length,0);
});
test('only caller own receipts are selected; no other customer data returned',async()=>{
 flags.SINGLES_BANK_TRANSFER_ENABLED='true';
 const x=db();
 const r=await handleSinglesBank(request('/bank/orders'),'/bank/orders',x,uid,reply);
 assert.equal(r.status,200);
 assert.ok(x.reads.some(([table,key,value])=>table==='singles_bank_orders'&&key==='user_id'&&value===uid));
});
test('admin receipt view is denied unless an operator has been provisioned',async()=>{
 flags.SINGLES_BANK_TRANSFER_ENABLED='true';
 const x=db({operator:false});
 const r=await handleSinglesBank(request('/bank/admin/orders'),'/bank/admin/orders',x,uid,reply);
 assert.equal(r.status,403);
 assert.equal((await r.json()).error,'operator_capability_required');
 assert.ok(!x.reads.some(([table])=>table==='singles_bank_orders'));
});
test('admin must have capability, verification flag, and bank statement reference',async()=>{
 flags.SINGLES_BANK_TRANSFER_ENABLED='true';
 flags.SINGLES_BANK_VERIFICATION_ENABLED='false';
 const x=db({operator:true,configured:true});
 const path='/bank/admin/orders/'+reference+'/review';
 let r=await handleSinglesBank(request(path,'POST',{decision:'verified',bank_trace:'TX-123456'}),path,x,uid,reply);
 assert.equal(r.status,503);
 assert.equal(x.calls.length,0);
 flags.SINGLES_BANK_VERIFICATION_ENABLED='true';
 r=await handleSinglesBank(request(path,'POST',{decision:'verified',bank_trace:''}),path,x,uid,reply);
 assert.equal(r.status,400);assert.equal(x.calls.length,0);
 r=await handleSinglesBank(request(path,'POST',{decision:'verified',bank_trace:'TX-123456'}),path,x,uid,reply);
 assert.equal(r.status,200);
 assert.equal(x.calls[0].name,'singles_bank_confirm_order');
 assert.equal(x.calls[0].params.p_operator,uid);
});
test('optional general consulting requires its own confirmed plan, not community plan',async()=>{
 flags.SINGLES_BANK_TRANSFER_ENABLED='true';
 const path='/bank/consulting/requests';
 let x=db({grant:false});
 let r=await handleSinglesBank(request(path,'POST',{topic:'communication'}),path,x,uid,reply);
 assert.equal(r.status,402);
 assert.equal(x.writes.length,0);
 x=db({grant:true});
 r=await handleSinglesBank(request(path,'POST',{topic:'named_spouse_referral'}),path,x,uid,reply);
 assert.equal(r.status,400);
 r=await handleSinglesBank(request(path,'POST',{topic:'communication'}),path,x,uid,reply);
 assert.equal(r.status,201);
 assert.equal(x.writes.filter(z=>z.name==='singles_consulting_requests').length,1);
});
test('DB migration limits raw function execution to server and forces manually confirmed orders',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261009224000_singles_bank_transfer_consulting.sql',import.meta.url),'utf8');
 for(const f of ['singles_bank_confirm_order','singles_bank_report_order','singles_bank_acknowledge_order']){
  assert.match(sql,new RegExp('revoke all on function public\\.'+f));
  assert.match(sql,new RegExp('grant execute on function public\\.'+f+'[\\s\\S]*?to service_role'));
 }
 assert.match(sql,/for update/);
 assert.match(sql,/status='reported_paid'/);
 assert.match(sql,/p_action='verified'/);
 assert.match(sql,/not exists\(select 1 from public\.singles_bank_operators/);
 assert.doesNotMatch(sql,/grant (?:select|insert|update) on table public\.singles_bank_orders to authenticated/i);
});
