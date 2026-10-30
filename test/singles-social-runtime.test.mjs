import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSinglesSocial, maskContacts } from '../supabase/functions/singles-api/social.ts';
const uid='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const id='33333333-3333-4333-8333-333333333333';
const reply=(_req,body,status=200)=>new Response(JSON.stringify(body),{status});
const settings={SINGLES_SOCIAL_ENABLED:'true',SINGLES_BANK_TRANSFER_ENABLED:'false'};
globalThis.Deno={env:{get:key=>settings[key]||undefined}};
function db({verified=true,accepted=false,grant=false,retry=0,rpcError=null,interest=null,extra={},lists={},rpcResult=undefined}={}){
 const writes=[],calls=[];
 const rows={singles_memberships:{status:'active',base_consent:true,age_19_confirmed:true,adult_verified_at:verified?'2026-10-09T00:00:00Z':null,religion_consent:true,discoverable:verified},
  singles_interests:accepted?{from_user_id:other,to_user_id:uid,status:'accepted'}:null,
  singles_events:{id,starts_at:'2027-05-01T09:00:00Z'},
  ...extra,
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
    if(name==='singles_interests'&&interest)record=interest;
    return {data:record,error:null};
   },
   then(ok,fail){return Promise.resolve({data:lists[name]||[],error:null}).then(ok,fail)}
  };
  return query;
 };
 return {from:make,writes,calls,rpc:async(name,params)=>{calls.push({name,params});return rpcError?{data:null,error:rpcError}:{data:name==='singles_report_review'?(rpcResult??params.p_status):retry,error:null}}};
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

test('each social write takes a per-user rate slot before writing',async()=>{
 settings.SINGLES_BANK_TRANSFER_ENABLED='true';
 const cases=[
  ['/blocks/'+other,'POST',{verified:false},null,'block'],
  ['/reports/'+other,'POST',{verified:false},{category:'spam',details:'x'},'report'],
  ['/interests/'+other,'POST',{},null,'interest'],
  ['/messages/'+id,'POST',{accepted:true,grant:true},{text:'안녕하세요'},'message'],
 ];
 for(const [path,method,opts,payload,action] of cases){
  const admin=db(opts);
  const res=await handleSinglesSocial(new Request('https://ekodi.kr'+path,{method,body:payload?JSON.stringify(payload):undefined}),path,admin,uid,reply);
  assert.ok(res.status<300,path+' '+res.status);
  const call=admin.calls.find(c=>c.name==='singles_rate_take');
  assert.ok(call,'rate slot taken for '+action);
  assert.equal(call.params.p_user,uid);assert.equal(call.params.p_action,action);
 }
});
test('over-limit social writes return 429 with retry time and write nothing',async()=>{
 settings.SINGLES_BANK_TRANSFER_ENABLED='true';
 const cases=[
  ['/blocks/'+other,{verified:false},null,'block'],
  ['/reports/'+other,{verified:false},{category:'spam',details:'x'},'report'],
  ['/interests/'+other,{},null,'interest'],
  ['/messages/'+id,{accepted:true,grant:true},{text:'안녕하세요'},'message'],
 ];
 for(const [path,opts,payload,action] of cases){
  const admin=db({...opts,retry:42});
  const res=await handleSinglesSocial(new Request('https://ekodi.kr'+path,{method:'POST',body:payload?JSON.stringify(payload):undefined}),path,admin,uid,reply);
  assert.equal(res.status,429,path);
  assert.deepEqual(await res.json(),{error:'rate_limited',action,retry_after_seconds:42});
  assert.equal(admin.writes.filter(w=>w.name!=='singles_rate_events').length,0,path+' must not write');
 }
});
test('rate limiter failure fails closed instead of allowing the write',async()=>{
 const admin=db({verified:false,rpcError:{message:'db down'}});
 await assert.rejects(()=>handleSinglesSocial(new Request('https://ekodi.kr/blocks/'+other,{method:'POST'}),'/blocks/'+other,admin,uid,reply));
 assert.equal(admin.writes.length,0);
});
test('invalid requests are rejected before consuming a rate slot',async()=>{
 const admin=db({verified:false});
 const res=await handleSinglesSocial(new Request('https://ekodi.kr/reports/'+other,{method:'POST',body:JSON.stringify({category:'bogus',details:'x'})}),'/reports/'+other,admin,uid,reply);
 assert.equal(res.status,400);assert.equal(admin.calls.length,0);
});
test('rate limit migration is atomic, bounded and server-only',async()=>{
 const {readFile}=await import('node:fs/promises');
 const sql=await readFile(new URL('../supabase/migrations/20261025070000_singles_rate_limits.sql',import.meta.url),'utf8');
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.ok(sql.indexOf('pg_advisory_xact_lock')<sql.indexOf('select count(*)'),'lock before counting');
 assert.match(sql,/alter table public\.singles_rate_events enable row level security;/);
 assert.match(sql,/revoke all on table public\.singles_rate_events from public,anon,authenticated;/);
 assert.match(sql,/revoke all on function public\.singles_rate_take\(uuid,text,int,int\) from public,anon,authenticated;/);
 assert.match(sql,/grant execute on function public\.singles_rate_take\(uuid,text,int,int\) to service_role;/);
 assert.doesNotMatch(sql,/body|details|text\s+text/i);
});

test('a withdrawn connection never reopens its conversation or accepts new replies',async()=>{
 settings.SINGLES_BANK_TRANSFER_ENABLED='true';
 const closed={id,from_user_id:other,to_user_id:uid,status:'withdrawn'};
 for(const method of ['GET','POST']){
  const admin=db({grant:true,interest:closed});
  const res=await handleSinglesSocial(new Request('https://ekodi.kr/messages/'+id,{method,body:method==='POST'?JSON.stringify({text:'다시 안녕'}):undefined}),'/messages/'+id,admin,uid,reply);
  assert.equal(res.status,403,method);assert.equal((await res.json()).error,'mutual_consent_required');
  assert.equal(admin.writes.length,0);
 }
 const admin=db({interest:closed});
 const res=await handleSinglesSocial(new Request('https://ekodi.kr/requests/'+id+'/respond',{method:'POST',body:JSON.stringify({decision:'accepted'})}),'/requests/'+id+'/respond',admin,uid,reply);
 assert.equal(res.status,409);assert.equal(admin.writes.length,0);
});
test('re-sending interest to a withdrawn pair does not revive the old connection',async()=>{
 const admin=db({interest:{id,from_user_id:uid,to_user_id:other,status:'withdrawn'}});
 const res=await handleSinglesSocial(new Request('https://ekodi.kr/interests/'+other,{method:'POST'}),'/interests/'+other,admin,uid,reply);
 assert.equal(res.status,200);assert.equal((await res.json()).status,'withdrawn');
 assert.equal(admin.writes.filter(w=>w.name==='singles_interests').length,0);
});

const rid='44444444-4444-4444-8444-444444444444';
const reviewer={singles_report_operators:{enabled:true,can_review:true}};
const reviewReq=(b)=>new Request('https://ekodi.kr/admin/reports/'+rid+'/review',{method:'POST',body:JSON.stringify(b)});
test('report moderation requires an enabled reviewer capability',async()=>{
 for(const extra of [{},{singles_report_operators:{enabled:true,can_review:false}},{singles_report_operators:{enabled:false,can_review:true}}]){
  const admin=db({verified:false,extra});
  let res=await handleSinglesSocial(new Request('https://ekodi.kr/admin/reports/open'),'/admin/reports/open',admin,uid,reply);
  assert.equal(res.status,403);
  res=await handleSinglesSocial(reviewReq({status:'resolved',note:'조치함'}),'/admin/reports/'+rid+'/review',admin,uid,reply);
  assert.equal(res.status,403);assert.equal(admin.calls.length,0);
 }
});
test('reviewer queue shows names and short refs, never raw account ids',async()=>{
 const admin=db({verified:false,extra:reviewer,lists:{
  singles_reports:[{id:rid,reporter_id:other,target_id:id,category:'spam',details:'광고',status:'open',created_at:'2026-10-25T00:00:00Z',reviewed_at:null,resolution_note:null}],
  singles_profiles:[{user_id:other,display_name:'신고자'}]}});
 const res=await handleSinglesSocial(new Request('https://ekodi.kr/admin/reports/open'),'/admin/reports/open',admin,uid,reply);
 assert.equal(res.status,200);
 const body=await res.json();
 assert.equal(body.reports[0].reporter.name,'신고자');assert.equal(body.reports[0].target.name,'이름 없는 회원');
 assert.equal(body.reports[0].target.ref,id.slice(0,8));
 assert.ok(!JSON.stringify(body).includes(other)&&!JSON.stringify(body).includes(id+'"'),'no full ids');
});
test('review goes through the atomic DB function with validated input',async()=>{
 let admin=db({verified:false,extra:reviewer});
 let res=await handleSinglesSocial(reviewReq({status:'resolved',note:'경고 조치'}),'/admin/reports/'+rid+'/review',admin,uid,reply);
 assert.equal(res.status,200);assert.equal((await res.json()).status,'resolved');
 assert.deepEqual(admin.calls[0],{name:'singles_report_review',params:{p_report:rid,p_operator:uid,p_status:'resolved',p_note:'경고 조치'}});
 assert.equal(admin.writes.length,0,'no direct table writes');
 for(const bad of [{status:'open'},{status:'resolved',note:5},{status:'resolved',extra:1},{status:'dismissed',note:'x'.repeat(501)}]){
  admin=db({verified:false,extra:reviewer});
  res=await handleSinglesSocial(reviewReq(bad),'/admin/reports/'+rid+'/review',admin,uid,reply);
  assert.equal(res.status,400,JSON.stringify(bad));assert.equal(admin.calls.length,0);
 }
});
test('review DB errors map to clear statuses',async()=>{
 for(const [message,status] of [['operator_conflict_of_interest',403],['resolution_note_required',400],['report_not_found',404],['report_not_reviewable',409]]){
  const admin=db({verified:false,extra:reviewer,rpcError:{message}});
  const res=await handleSinglesSocial(reviewReq({status:'resolved',note:'메모'}),'/admin/reports/'+rid+'/review',admin,uid,reply);
  assert.equal(res.status,status,message);
 }
});

// --- 유료회원 모델(2026-10-28): 가입비=적립금, 요청 보류·수락 확정, 기본 요금+입력·공개 할인 ---
const withPaid=async(fn)=>{settings.SINGLES_REQUEST_BILLING_ENABLED='true';try{await fn()}finally{delete settings.SINGLES_REQUEST_BILLING_ENABLED}};
const rpcBy=(admin,map)=>{admin.rpc=async(name,params)=>{admin.calls.push({name,params});const r=map[name];return typeof r==='function'?r(params):(r||{data:0,error:null})};return admin};
const paidReq=(kind)=>new Request('https://ekodi.kr/interests/'+other,{method:'POST',...(kind?{body:JSON.stringify({kind}),headers:{'content-length':'20'}}:{})});
const respondReq=(decision)=>new Request('https://ekodi.kr/requests/'+id+'/respond',{method:'POST',body:JSON.stringify({decision})});
const PAID={singles_is_paid_member:{data:true,error:null}},FREE={singles_is_paid_member:{data:false,error:null}};

test('paid model: free members cannot request, accept, or save a profile',()=>withPaid(async()=>{
 let admin=rpcBy(db(),FREE);
 let res=await handleSinglesSocial(paidReq(),'/interests/'+other,admin,uid,reply);
 assert.equal(res.status,402);assert.equal((await res.json()).error,'paid_membership_required');
 assert.ok(!admin.calls.some(c=>c.name==='singles_paid_request_create'));
 admin=rpcBy(db(),FREE);
 res=await handleSinglesSocial(new Request('https://ekodi.kr/profile',{method:'PUT',body:JSON.stringify({display_name:'동행',broad_region:'',intro:'',public_link:'',discoverable:false})}),'/profile',admin,uid,reply);
 assert.equal(res.status,402);assert.equal(admin.writes.length,0);
 admin=rpcBy(db(),FREE);
 res=await handleSinglesSocial(new Request('https://ekodi.kr/discover'),'/discover',admin,uid,reply);
 assert.equal(res.status,402);
}));
test('postpaid: requests are created without any payment; the fee is only announced',()=>withPaid(async()=>{
 for(const [kind,fee] of [[undefined,15000],['contact',112000]]){
  const admin=rpcBy(db(),{...PAID,singles_postpaid_request_create:p=>({data:{request_id:id,fee_krw:fee,kind:p.p_kind},error:null})});
  const res=await handleSinglesSocial(paidReq(kind),'/interests/'+other,admin,uid,reply);
  assert.equal(res.status,200);const body=await res.json();
  assert.deepEqual(body.billing,{fee_krw:fee,charged_on:'acceptance_invoice'});
  assert.deepEqual(admin.calls.find(c=>c.name==='singles_postpaid_request_create').params,{p_requester:uid,p_responder:other,p_kind:kind||'message'});
  assert.ok(!admin.calls.some(c=>/paid_request_create$/.test(c.name)&&c.name!=='singles_postpaid_request_create'),'no prepaid reservation');
  assert.equal(admin.writes.filter(w=>w.name==='singles_interests').length,0,'no direct interest insert');
 }
 const bad=await handleSinglesSocial(paidReq('marriage'),'/interests/'+other,rpcBy(db(),PAID),uid,reply);
 assert.equal(bad.status,400);
}));
test('postpaid: duplicate or already-connected requests are refused without charging',()=>withPaid(async()=>{
 for(const code of ['request_exists','already_connected','contact_already_shared']){
  const admin=rpcBy(db(),{...PAID,singles_postpaid_request_create:{data:null,error:{message:code}}});
  const res=await handleSinglesSocial(paidReq('contact'),'/interests/'+other,admin,uid,reply);
  assert.equal(res.status,409);assert.equal((await res.json()).error,code);
 }
}));
test('postpaid: accepting issues invoices through the DB function; nothing is connected yet',()=>withPaid(async()=>{
 const pending={requester_id:other,status:'pending'};
 let admin=rpcBy(db({extra:{singles_paid_requests:pending}}),{...PAID,singles_postpaid_request_decide:p=>({data:{status:'awaiting_payment',fee_krw:75000,invoice_id:id,kind:'contact'},error:null})});
 let res=await handleSinglesSocial(respondReq('accepted'),'/requests/'+id+'/respond',admin,uid,reply);
 assert.equal(res.status,200);const body=await res.json();
 assert.equal(body.status,'awaiting_payment');assert.deepEqual(body.billing,{invoice_id:id,fee_krw:75000,due_days:7});
 assert.deepEqual(admin.calls.find(c=>c.name==='singles_postpaid_request_decide').params,{p_responder:uid,p_request:id,p_decision:'accepted'});
 assert.equal(admin.writes.length,0,'no direct status write');
 admin=rpcBy(db({extra:{singles_paid_requests:pending}}),{...FREE,singles_postpaid_request_decide:{data:null,error:{message:'paid_membership_required'}}});
 res=await handleSinglesSocial(respondReq('accepted'),'/requests/'+id+'/respond',admin,uid,reply);
 assert.equal(res.status,402);
 admin=rpcBy(db({extra:{singles_paid_requests:{requester_id:other,status:'awaiting_payment'}}}),PAID);
 res=await handleSinglesSocial(respondReq('declined'),'/requests/'+id+'/respond',admin,uid,reply);
 assert.equal(res.status,409);
}));
test('passes were replaced by subscriptions',()=>withPaid(async()=>{
 const res=await handleSinglesSocial(new Request('https://ekodi.kr/passes/pass_10d',{method:'POST'}),'/passes/pass_10d',rpcBy(db(),PAID),uid,reply);
 assert.equal(res.status,410);
}));
test('contact masking hides phone, email, messenger IDs and links but keeps ordinary text',()=>{
 for(const raw of ['제 번호는 010-1234-5678 이에요','01012345678','+82 10 1234 5678','메일 abc.def@gmail.com','abc (at) naver (dot) com',
  '카톡 아이디: lovely_77','kakao id lovely77','인스타 @my.insta_','https://open.kakao.com/o/abc','www.example.kr','0 1 0 1 2 3 4 5 6 7 8']){
  const r=maskContacts(raw);assert.ok(r.masked,raw);assert.match(r.text,/\[연락처 가림\]/,raw);
  assert.doesNotMatch(r.text,/1234|gmail|lovely|insta_|kakao\.com|example/,raw);
 }
 for(const ok of ['주일 11시 예배 후에 카페에서 만나요','30대 초반이고 2026년에 이사했어요','온라인 모임 line up 좋네요','점심 1시 반 어때요?']){
  const r=maskContacts(ok);assert.equal(r.masked,false,ok);assert.equal(r.text,ok);
 }
});
test('paid model: messages are masked until a contact exchange is accepted',()=>withPaid(async()=>{
 const send=(extra)=>{const admin=rpcBy(db({accepted:true,extra}),PAID);return [admin,handleSinglesSocial(new Request('https://ekodi.kr/messages/'+id,{method:'POST',body:JSON.stringify({text:'연락 주세요 010-9876-5432'})}),'/messages/'+id,admin,uid,reply)]};
 let [admin,resP]=send({});let res=await resP;
 assert.equal(res.status,200);assert.equal((await res.json()).masked,true);
 assert.equal(admin.writes.find(w=>w.name==='singles_messages').row.body,'연락 주세요 [연락처 가림]');
 [admin,resP]=send({singles_contact_unlocks:{request_id:id}});res=await resP;
 assert.equal((await res.json()).masked,false);
 assert.equal(admin.writes.find(w=>w.name==='singles_messages').row.body,'연락 주세요 010-9876-5432');
}));
