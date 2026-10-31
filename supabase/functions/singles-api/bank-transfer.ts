// EKODI 동행 bank-transfer membership and optional general communication consulting.
// Money is NEVER collected or confirmed automatically. Member self-report != bank verification.
// Requires Core-authenticated Edge request, explicitly provisioned operator, and trusted SQL receipt.
type Admin=any;
type Reply=(req:Request,body:unknown,status?:number)=>Response;
const bankOn=()=>Deno.env.get('SINGLES_BANK_TRANSFER_ENABLED')==='true';
const verifyOn=()=>Deno.env.get('SINGLES_BANK_VERIFICATION_ENABLED')==='true';
const REF=/^EDH-[A-F0-9]{32}$/;
// 2026-10-31: 가입비·적립금 폐지. 기간제 구독권(1·10·20·30일)만 판매하고, 요청·수락 요금은 청구서로 결제한다.
const CODES=['consulting','sub_1d','sub_10d','sub_20d','sub_30d'];
async function one(q:any){const {data,error}=await q.maybeSingle();if(error)throw error;return data}
async function many(q:any){const {data,error}=await q;if(error)throw error;return data||[]}
async function payload(req:Request){
 if(Number(req.headers.get('content-length')||0)>2048)throw new Error('payload_too_large');
 const raw=await req.text();
 if(raw.length>2048)throw new Error('payload_too_large');
 try{return JSON.parse(raw)}catch{throw new Error('invalid_json')}
}
// 운영자 화면 표시용: 가입 시도 기록의 최근 Google 계정.
async function emailsFor(admin:Admin,ids:string[]){
 const map=new Map<string,string>();if(!ids.length)return map;
 const rows=await many(admin.from('singles_signup_attempts').select('user_id,email,created_at').in('user_id',ids).order('created_at',{ascending:false}).limit(500));
 for(const r of rows)if(r.email&&!map.has(r.user_id))map.set(r.user_id,r.email);
 return map;
}
async function operator(admin:Admin,userId:string){
 const row=await one(admin.from('singles_bank_operators')
   .select('enabled,can_verify,can_configure').eq('user_id',userId));
 return row?.enabled===true?row:null;
}
export async function hasBankPlan(admin:Admin,userId:string,planCode:string){
 if(!bankOn())return false;
 const codes=planCode==='community'?['community','community_90','community_365']:[planCode];
 for(const code of codes){
  const row=await one(admin.from('singles_bank_grants').select('expires_at').eq('user_id',userId).eq('plan_code',code));
  if(row?.expires_at&&Date.parse(row.expires_at)>Date.now())return true;
 }
 return false;
}
export async function bankPlanSnapshot(admin:Admin,userId:string){
 const community=await hasBankPlan(admin,userId,'community'),consulting=await hasBankPlan(admin,userId,'consulting');
 return {active:community,community_active:community,consulting_active:consulting,payment_method:'bank_transfer'};
}
function publicOrder(row:any){
 return {
  reference:row.reference,plan_code:row.plan_code,amount_krw:row.amount_krw,
  payment_method:'bank_transfer',status:row.status,
  bank_name:row.bank_name,account_number:row.account_number,account_holder:row.account_holder,
  created_at:row.created_at,reported_paid_at:row.reported_paid_at,verified_at:row.verified_at,
  member_acknowledged_at:row.member_acknowledged_at,rejection_reason:row.rejection_reason||null,
 };
}
const columns='reference,plan_code,amount_krw,status,bank_name,account_number,account_holder,created_at,reported_paid_at,verified_at,member_acknowledged_at,rejection_reason';
const refFrom=(path:string)=>path.match(/^\/bank\/orders\/(EDH-[A-F0-9]{32})\/(report|acknowledge)$/)?.slice(1)||null;
const decisionRef=(path:string)=>path.match(/^\/bank\/admin\/orders\/(EDH-[A-F0-9]{32})\/review$/)?.[1]||null;
export async function handleSinglesBank(req:Request,path:string,admin:Admin,userId:string,reply:Reply,email:string|null=null):Promise<Response>{
 if(!path.startsWith('/bank/'))return reply(req,{error:'not_found'},404);
 const method=req.method;
 if(path==='/bank/plans'&&method==='GET'){
  if(!bankOn())return reply(req,{available:false,plans:[],payment_method:'bank_transfer'});
  const settings=await one(admin.from('singles_bank_settings').select('active').eq('id',1));
  const plans=await many(admin.from('singles_bank_plans').select('code,display_name,amount_krw,duration_days').eq('active',true));
  return reply(req,{available:settings?.active===true,plans:settings?.active===true?plans:[],payment_method:'bank_transfer'});
 }
 if(path==='/bank/wallet'&&method==='GET'){
  // 구독 상태와 내 청구서(후불). 선불 적립금은 2026-10-31 폐지.
  const grant=await one(admin.from('singles_bank_grants').select('expires_at').eq('user_id',userId).eq('plan_code','subscription'));
  const invoices=await many(admin.from('singles_request_invoices').select('id,request_id,role,amount_krw,status,order_reference,due_at,paid_at,created_at,refund_due_at,refunded_at')
   .eq('user_id',userId).order('created_at',{ascending:false}).limit(30));
  const active=Boolean(grant?.expires_at&&Date.parse(grant.expires_at)>Date.now());
  return reply(req,{paid_model:Deno.env.get('SINGLES_REQUEST_BILLING_ENABLED')==='true',paid_member:active,
   subscription_expires_at:active?grant.expires_at:null,invoices});
 }
 const invoiceId=path.match(/^\/bank\/invoices\/([0-9a-f-]{36})\/order$/i)?.[1];
 if(invoiceId&&method==='POST'){
  if(!bankOn())return reply(req,{error:'bank_collection_not_launched'},503);
  const {data:ref,error}=await admin.rpc('singles_invoice_open_order',{p_user:userId,p_invoice:invoiceId});
  if(error){
   const msg=String(error.message||'');
   if(msg.includes('invoice_not_found'))return reply(req,{error:'invoice_not_found'},404);
   if(msg.includes('invoice_not_payable'))return reply(req,{error:'invoice_not_payable'},409);
   if(msg.includes('bank_payment_not_configured'))return reply(req,{error:'bank_payment_not_configured'},503);
   throw error;
  }
  const row=await one(admin.from('singles_bank_orders').select(columns).eq('reference',ref).eq('user_id',userId));
  return reply(req,{order:publicOrder(row)},201);
 }
 if(path==='/bank/admin/proposals'&&method==='GET'){
  const role=await operator(admin,userId);
  if(!role||role.can_configure!==true)return reply(req,{error:'owner_capability_required'},403);
  const proposals=await many(admin.from('singles_ops_proposals').select('id,rule,kind,title,rationale,metrics,proposed_change,status,decided_at,created_at')
   .order('created_at',{ascending:false}).limit(30));
  return reply(req,{proposals});
 }
 if(path==='/bank/admin/ops/review'&&method==='POST'){
  const role=await operator(admin,userId);
  if(!role||role.can_configure!==true)return reply(req,{error:'owner_capability_required'},403);
  const {data,error}=await admin.rpc('singles_ops_review');if(error)throw error;
  return reply(req,{ok:true,metrics:data});
 }
 const proposalId=path.match(/^\/bank\/admin\/proposals\/([0-9a-f-]{36})\/decide$/i)?.[1];
 if(proposalId&&method==='POST'){
  const role=await operator(admin,userId);
  if(!role||role.can_configure!==true)return reply(req,{error:'owner_capability_required'},403);
  const v=await payload(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>k!=='decision')||!['approved','rejected'].includes(v.decision))
   return reply(req,{error:'invalid_decision'},400);
  const {data,error}=await admin.rpc('singles_ops_decide',{p_operator:userId,p_id:proposalId,p_decision:v.decision});
  if(error){const msg=String(error.message||'');
   if(msg.includes('proposal_already_decided'))return reply(req,{error:'proposal_already_decided'},409);
   if(msg.includes('proposal_not_found'))return reply(req,{error:'not_found'},404);throw error}
  return reply(req,{ok:true,status:data});
 }
 if(path==='/bank/orders'&&method==='GET'){
  const list=await many(admin.from('singles_bank_orders').select(columns).eq('user_id',userId).order('created_at',{ascending:false}).limit(30));
  return reply(req,{orders:list.map(publicOrder)});
 }
 const ownRef=path.match(/^\/bank\/orders\/(EDH-[A-F0-9]{32})$/)?.[1];
 if(ownRef&&method==='GET'){
  const row=await one(admin.from('singles_bank_orders').select(columns).eq('reference',ownRef).eq('user_id',userId));
  return row?reply(req,{order:publicOrder(row)}):reply(req,{error:'not_found'},404);
 }
 if(path==='/bank/orders'&&method==='POST'){
  if(!bankOn())return reply(req,{error:'bank_collection_not_launched'},503);
  const member=await one(admin.from('singles_memberships')
    .select('status,base_consent,adult_verified_at').eq('user_id',userId));
  if(member?.status!=='active'||member.base_consent!==true||!member.adult_verified_at)
    return reply(req,{error:'verified_member_required'},403);
  const v=await payload(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>k!=='plan_code')||!CODES.includes(v.plan_code))
    return reply(req,{error:'invalid_plan'},400);
  const plan=await one(admin.from('singles_bank_plans')
    .select('code,amount_krw,duration_days,active').eq('code',v.plan_code));
  const settings=await one(admin.from('singles_bank_settings')
    .select('bank_name,account_number,account_holder,active').eq('id',1));
  if(!plan?.active||!Number.isInteger(plan.amount_krw)||!settings?.active||
    !settings.bank_name||!settings.account_number||!settings.account_holder)
    return reply(req,{error:'bank_payment_not_configured'},503);
  const reference='EDH-'+crypto.randomUUID().replaceAll('-','').toUpperCase();
  const row={reference,user_id:userId,plan_code:plan.code,amount_krw:plan.amount_krw,
    duration_days:plan.duration_days,bank_name:settings.bank_name,account_number:settings.account_number,
    account_holder:settings.account_holder,status:'awaiting_transfer'};
  const {error}=await admin.from('singles_bank_orders').insert(row);
  if(error)throw error;
  const {error:auditError}=await admin.from('singles_bank_audit')
    .insert({reference,actor_id:userId,action:'opened'});
  if(auditError)throw auditError;
  if(plan.code.startsWith('sub_')){
   const {error:logError}=await admin.from('singles_signup_attempts').insert({user_id:userId,email,action:'subscribe_order',detail:reference});
   if(logError)throw logError;
  }
  return reply(req,{order:publicOrder({...row,created_at:new Date().toISOString()})},201);
 }
 const rowParts=refFrom(path);
 if(rowParts&&method==='POST'){
  const [reference,action]=rowParts;
  if(!REF.test(reference))return reply(req,{error:'invalid_reference'},400);
  const name=action==='report'?'singles_bank_report_order':'singles_bank_acknowledge_order';
  const {data,error}=await admin.rpc(name,{p_reference:reference,p_actor:userId});
  if(error)return reply(req,{error:action==='report'?'report_not_allowed':'acknowledgment_not_allowed'},409);
  return reply(req,{reference,status:data});
 }
 if(path==='/bank/admin/brokerage-readiness'&&method==='GET'){
  const role=await operator(admin,userId);
  if(!role||role.can_configure!==true)return reply(req,{error:'readiness_operator_capability_required'},403);
  const items=await many(admin.from('singles_brokerage_readiness')
   .select('regime,code,requirement,progress,evidence_ref,updated_at').order('regime').order('code'));
  return reply(req,{items,brokerage_mode:'disabled',application_submitted_by_platform:false});
 }
 if(path==='/bank/admin/brokerage-readiness'&&method==='PUT'){
  const role=await operator(admin,userId);
  if(!role||role.can_configure!==true)return reply(req,{error:'readiness_operator_capability_required'},403);
  const v=await payload(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).some(k=>!['regime','code','progress','evidence_ref'].includes(k))||
    !['domestic','international'].includes(v.regime)||
    !/^[a-z][a-z0-9_]{2,48}$/.test(v.code||'')||
    !['not_started','collecting','ready_for_review','submitted'].includes(v.progress)||
    typeof v.evidence_ref!=='string'||v.evidence_ref.length>240)
   return reply(req,{error:'invalid_readiness_request'},400);
  const {data,error}=await admin.rpc('singles_brokerage_update_readiness',{
    p_regime:v.regime,p_code:v.code,p_progress:v.progress,
    p_evidence_ref:v.evidence_ref,p_actor:userId});
  if(error)return reply(req,{error:'readiness_update_rejected'},409);
  return reply(req,{saved:true,item:data,brokerage_mode:'disabled'});
 }
 if(path==='/bank/admin/catalog'&&method==='GET'){
  const role=await operator(admin,userId);
  if(!role||role.can_configure!==true)return reply(req,{error:'price_admin_required'},403);
  const products=await many(admin.from('singles_product_catalog').select('code,title,category,scope,amount_krw,message_credits,contact_credits,period_days,session_minutes,active,legal_reviewed').order('code'));
  return reply(req,{products,collection_open:false});
 }
 const catalogCode=path.match(/^\/bank\/admin\/catalog\/([a-z][a-z0-9_]{2,49})$/)?.[1];
 if(catalogCode&&method==='PUT'){
  const role=await operator(admin,userId);
  if(!role||role.can_configure!==true)return reply(req,{error:'price_admin_required'},403);
  const v=await payload(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>k!=='amount_krw')||
    !Number.isInteger(v.amount_krw)||v.amount_krw<4900||v.amount_krw>200000)
   return reply(req,{error:'invalid_catalog_price'},400);
  const existing=await one(admin.from('singles_product_catalog').select('code,amount_krw,active').eq('code',catalogCode));
  if(!existing)return reply(req,{error:'not_found'},404);
  const {error:editError}=await admin.from('singles_product_catalog').update({amount_krw:v.amount_krw,active:false,revised_at:new Date().toISOString()}).eq('code',catalogCode);
  if(editError)throw editError;
  return reply(req,{saved:true,code:catalogCode,amount_krw:v.amount_krw,active:false,reason:'requires_separate_legal_review_and_approval'});
 }
 if(path==='/bank/admin/config'&&method==='GET'){
  const role=await operator(admin,userId);
  if(!role)return reply(req,{error:'operator_capability_required'},403);
  const settings=await one(admin.from('singles_bank_settings')
    .select('bank_name,account_number,account_holder,active').eq('id',1));
  const plans=await many(admin.from('singles_bank_plans')
    .select('code,display_name,amount_krw,duration_days,active').order('code'));
  return reply(req,{bank:settings,plans,can_configure:role.can_configure===true,
    can_verify:role.can_verify===true,collection_open:bankOn()});
 }
 if(path==='/bank/admin/config'&&method==='PUT'){
  const role=await operator(admin,userId);
  if(!role||role.can_configure!==true)return reply(req,{error:'bank_configuration_capability_required'},403);
  const v=await payload(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).some(k=>!['bank_name','account_number','account_holder','community_amount_krw','consulting_amount_krw','tier_prices'].includes(k)))
    return reply(req,{error:'invalid_bank_configuration'},400);
  const name=typeof v.bank_name==='string'?v.bank_name.trim():'';
  const account=typeof v.account_number==='string'?v.account_number.trim():'';
  const holder=typeof v.account_holder==='string'?v.account_holder.trim():'';
  const validAmount=(a:any)=>a===null||(Number.isInteger(a)&&a>=100&&a<=10000000);
  if(name.length<2||name.length>70||! /^[0-9 -]{6,40}$/.test(account)||holder.length<2||holder.length>70
     ||!validAmount(v.community_amount_krw)||!validAmount(v.consulting_amount_krw))
    return reply(req,{error:'invalid_bank_configuration_values'},400);
  const tierPrices=v.tier_prices||{};
  if(!tierPrices||typeof tierPrices!=='object'||Array.isArray(tierPrices)||Object.keys(tierPrices).some(k=>!['community_90','community_365'].includes(k)||!validAmount(tierPrices[k])))
    return reply(req,{error:'invalid_tier_prices'},400);
  // Changing destination/prices always closes collection until a separate release approval.
  const {error:bankError}=await admin.from('singles_bank_settings')
    .upsert({id:1,bank_name:name,account_number:account,account_holder:holder,active:false},{onConflict:'id'});
  if(bankError)throw bankError;
  const {error:priceError}=await admin.from('singles_bank_plans')
    .upsert([
      {code:'community',display_name:'행사 참여 구독',amount_krw:v.community_amount_krw,duration_days:30,active:false},
      {code:'consulting',display_name:'선택형 일반 교제·소통 컨설팅',amount_krw:v.consulting_amount_krw,duration_days:30,active:false},
    ],{onConflict:'code'});
  if(priceError)throw priceError;
  for(const code of ['community_90','community_365']){
   if(Object.prototype.hasOwnProperty.call(tierPrices,code)){
    const amount_krw=tierPrices[code];
    const {error:tierError}=await admin.from('singles_bank_plans').update({amount_krw,active:false}).eq('code',code);
    if(tierError)throw tierError;
   }
  }
  const last4=account.replace(/[^0-9]/g,'').slice(-4);
  const {error:auditError}=await admin.from('singles_bank_settings_audit').insert({
    actor_id:userId,account_last4:last4,
    community_amount_krw:v.community_amount_krw,consulting_amount_krw:v.consulting_amount_krw,
  });
  if(auditError)throw auditError;
  return reply(req,{saved:true,bank_collection_enabled:false,reason:'requires_independent_release_approval'});
 }
 const adminLookup=path.match(/^\/bank\/admin\/orders\/(EDH-[A-F0-9]{32})$/)?.[1];
 if(adminLookup&&method==='GET'){
  if(!await operator(admin,userId))return reply(req,{error:'operator_capability_required'},403);
  const row=await one(admin.from('singles_bank_orders')
    .select('reference,user_id,plan_code,amount_krw,status,created_at,reported_paid_at,verified_at,member_acknowledged_at')
    .eq('reference',adminLookup));
  return row?reply(req,{order:row}):reply(req,{error:'not_found'},404);
 }
 if(path==='/bank/admin/orders'&&method==='GET'){
  if(!await operator(admin,userId))return reply(req,{error:'operator_capability_required'},403);
  const list=await many(admin.from('singles_bank_orders')
    .select('reference,user_id,plan_code,amount_krw,status,created_at,reported_paid_at,verified_at,member_acknowledged_at')
    .order('created_at',{ascending:false}).limit(50));
  const emails=await emailsFor(admin,[...new Set<string>(list.map((o:any)=>o.user_id))]);
  return reply(req,{orders:list.map((o:any)=>({...o,email:emails.get(o.user_id)||null}))});
 }
 if(path==='/bank/admin/members'&&method==='GET'){
  const role=await operator(admin,userId);
  if(!role||role.can_verify!==true)return reply(req,{error:'verification_capability_required'},403);
  const members=await many(admin.from('singles_memberships').select('user_id,status,adult_verified_at,paid_member_since,consented_at')
    .order('consented_at',{ascending:false}).limit(100));
  const attempts=await many(admin.from('singles_signup_attempts').select('user_id,email,action,detail,created_at')
    .order('created_at',{ascending:false}).limit(100));
  const emails=await emailsFor(admin,[...new Set<string>(members.map((m:any)=>m.user_id))]);
  return reply(req,{members:members.map((m:any)=>({...m,email:emails.get(m.user_id)||null})),attempts});
 }
 // H3(2026-10-31): 환불 대상 청구서 송금 처리. 돈은 운영자가 은행에서 직접 보내고, 여기서는 송금 거래번호만 기록한다.
 if(path==='/bank/admin/refunds'&&method==='GET'){
  const role=await operator(admin,userId);
  if(!role||role.can_verify!==true)return reply(req,{error:'verification_capability_required'},403);
  const rows=await many(admin.from('singles_request_invoices')
    .select('id,request_id,user_id,role,amount_krw,status,order_reference,paid_at,refund_due_at,refunded_at,refund_trace')
    .in('status',['refund_due','refunded']).order('refund_due_at',{ascending:true}).limit(100));
  const refs=[...new Set<string>(rows.map((r:any)=>r.order_reference).filter(Boolean))];
  const orders=refs.length?await many(admin.from('singles_bank_orders').select('reference,bank_trace,verified_at').in('reference',refs)):[];
  const byRef=new Map<string,any>(orders.map((o:any)=>[o.reference,o]));
  const emails=await emailsFor(admin,[...new Set<string>(rows.map((r:any)=>r.user_id))]);
  const refunds=rows.map((r:any)=>({id:r.id,amount_krw:r.amount_krw,status:r.status,role:r.role,email:emails.get(r.user_id)||null,
    self:r.user_id===userId,order_reference:r.order_reference,paid_trace:byRef.get(r.order_reference)?.bank_trace||null,
    paid_at:r.paid_at,refund_due_at:r.refund_due_at,refunded_at:r.refunded_at,refund_trace:r.refund_trace}));
  return reply(req,{refunds,pending:refunds.filter((r:any)=>r.status==='refund_due').length,
    pending_krw:refunds.filter((r:any)=>r.status==='refund_due').reduce((n:number,r:any)=>n+r.amount_krw,0)});
 }
 const refundId=path.match(/^\/bank\/admin\/refunds\/([0-9a-f-]{36})\/complete$/i)?.[1];
 if(refundId&&method==='POST'){
  const role=await operator(admin,userId);
  if(!role||role.can_verify!==true)return reply(req,{error:'verification_capability_required'},403);
  const v=await payload(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>k!=='refund_trace')||typeof v.refund_trace!=='string')
   return reply(req,{error:'refund_trace_required'},400);
  const trace=v.refund_trace.trim();
  if(trace.length<4||trace.length>100)return reply(req,{error:'refund_trace_required'},400);
  const {data,error}=await admin.rpc('singles_invoice_refund_complete',{p_operator:userId,p_invoice:refundId,p_trace:trace});
  if(error){const msg=String(error.message||'');
   if(msg.includes('operator_self_refund_forbidden'))return reply(req,{error:'operator_self_refund_forbidden'},403);
   if(msg.includes('invoice_not_found'))return reply(req,{error:'invoice_not_found'},404);
   if(msg.includes('invoice_not_refundable'))return reply(req,{error:'invoice_not_refundable'},409);
   if(msg.includes('invoice_already_refunded'))return reply(req,{error:'invoice_already_refunded'},409);
   if(msg.includes('refund_trace_duplicate'))return reply(req,{error:'refund_trace_duplicate'},409);
   if(msg.includes('verification_capability_required'))return reply(req,{error:'verification_capability_required'},403);
   throw error;
  }
  return reply(req,data);
 }
 const verifyAdultId=path.match(/^\/bank\/admin\/members\/([0-9a-f-]{36})\/adult-verify$/i)?.[1];
 if(verifyAdultId&&method==='POST'){
  const role=await operator(admin,userId);
  if(!role||role.can_verify!==true)return reply(req,{error:'verification_capability_required'},403);
  const v=await payload(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['method','note'].includes(k))||
    !['id_document_in_person','id_document_video','certified_provider'].includes(v.method)||
    (v.note!==undefined&&(typeof v.note!=='string'||v.note.length>200)))
   return reply(req,{error:'invalid_adult_verification'},400);
  const {data,error}=await admin.rpc('singles_operator_verify_adult',{p_operator:userId,p_user:verifyAdultId,p_method:v.method,p_note:v.note||''});
  if(error){
   const msg=String(error.message||'');
   if(msg.includes('operator_self_verification_forbidden'))return reply(req,{error:'operator_self_verification_forbidden'},403);
   if(msg.includes('member_not_found'))return reply(req,{error:'member_not_found'},404);
   throw error;
  }
  return reply(req,{ok:true,adult_verified_at:data});
 }
 const adminRef=decisionRef(path);
 if(adminRef&&method==='POST'){
  const role=await operator(admin,userId);
  if(!role||role.can_verify!==true)return reply(req,{error:'verification_capability_required'},403);
  if(!verifyOn())return reply(req,{error:'bank_verification_not_launched'},503);
  const v=await payload(req);
  if(!v||!['verified','rejected'].includes(v.decision)||
    Object.keys(v).some(k=>!['decision','bank_trace','reason'].includes(k)))
    return reply(req,{error:'invalid_decision'},400);
  const trace=typeof v.bank_trace==='string'?v.bank_trace.trim():'';
  const reason=typeof v.reason==='string'?v.reason.trim():'';
  if(v.decision==='verified'&&(trace.length<4||trace.length>100))
    return reply(req,{error:'bank_statement_reference_required'},400);
  if(reason.length>200)return reply(req,{error:'reason_too_long'},400);
  const {data,error}=await admin.rpc('singles_bank_confirm_order',{
    p_reference:adminRef,p_operator:userId,p_action:v.decision,
    p_trace:trace||null,p_reason:reason||null});
  if(error&&String(error.message||'').includes('operator_self_confirmation_forbidden'))
   return reply(req,{error:'operator_self_confirmation_forbidden'},403);
  if(error&&String(error.message||'').includes('member_no_longer_eligible'))
   return reply(req,{error:'adult_verification_required_before_confirm'},409);
  if(error)return reply(req,{error:'bank_verification_failed_or_duplicate'},409);
  return reply(req,{reference:adminRef,status:data});
 }
 if(path==='/bank/consulting/requests'&&method==='GET'){
  const rows=await many(admin.from('singles_consulting_requests')
    .select('id,topic,status,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(20));
  return reply(req,{requests:rows});
 }
 if(path==='/bank/consulting/requests'&&method==='POST'){
  if(!await hasBankPlan(admin,userId,'consulting'))return reply(req,{error:'consulting_membership_required'},402);
  const v=await payload(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||
    Object.keys(v).some(k=>k!=='topic')||
    !['communication','community_participation','personal_growth'].includes(v.topic))
    return reply(req,{error:'unsupported_consulting_topic'},400);
  const {data,error}=await admin.from('singles_consulting_requests')
    .insert({user_id:userId,topic:v.topic}).select('id,status').single();
  if(error)throw error;
  return reply(req,{request:{id:data.id,status:data.status}},201);
 }
 return reply(req,{error:'not_found'},404);
}
