// EKODI 동행 bank-transfer membership and optional general communication consulting.
// Money is NEVER collected or confirmed automatically. Member self-report != bank verification.
// Requires Core-authenticated Edge request, explicitly provisioned operator, and trusted SQL receipt.
type Admin=any;
type Reply=(req:Request,body:unknown,status?:number)=>Response;
const bankOn=()=>Deno.env.get('SINGLES_BANK_TRANSFER_ENABLED')==='true';
const verifyOn=()=>Deno.env.get('SINGLES_BANK_VERIFICATION_ENABLED')==='true';
const REF=/^EDH-[A-F0-9]{32}$/;
const CODES=['community','consulting'];
async function one(q:any){const {data,error}=await q.maybeSingle();if(error)throw error;return data}
async function many(q:any){const {data,error}=await q;if(error)throw error;return data||[]}
async function payload(req:Request){
 if(Number(req.headers.get('content-length')||0)>2048)throw new Error('payload_too_large');
 const raw=await req.text();
 if(raw.length>2048)throw new Error('payload_too_large');
 try{return JSON.parse(raw)}catch{throw new Error('invalid_json')}
}
async function operator(admin:Admin,userId:string){
 const row=await one(admin.from('singles_bank_operators')
   .select('enabled,can_verify,can_configure').eq('user_id',userId));
 return row?.enabled===true?row:null;
}
export async function hasBankPlan(admin:Admin,userId:string,planCode:string){
 if(!bankOn())return false;
 const row=await one(admin.from('singles_bank_grants').select('expires_at').eq('user_id',userId).eq('plan_code',planCode));
 return Boolean(row?.expires_at&&Date.parse(row.expires_at)>Date.now());
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
export async function handleSinglesBank(req:Request,path:string,admin:Admin,userId:string,reply:Reply):Promise<Response>{
 if(!path.startsWith('/bank/'))return reply(req,{error:'not_found'},404);
 const method=req.method;
 if(path==='/bank/plans'&&method==='GET'){
  if(!bankOn())return reply(req,{available:false,plans:[],payment_method:'bank_transfer'});
  const settings=await one(admin.from('singles_bank_settings').select('active').eq('id',1));
  const plans=await many(admin.from('singles_bank_plans').select('code,display_name,amount_krw,duration_days').eq('active',true));
  return reply(req,{available:settings?.active===true,plans:settings?.active===true?plans:[],payment_method:'bank_transfer'});
 }
 if(path==='/bank/orders'&&method==='GET'){
  const list=await many(admin.from('singles_bank_orders').select(columns).eq('user_id',userId).order('created_at',{ascending:false}).limit(30));
  return reply(req,{orders:list.map(publicOrder)});
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
    Object.keys(v).some(k=>!['bank_name','account_number','account_holder','community_amount_krw','consulting_amount_krw'].includes(k)))
    return reply(req,{error:'invalid_bank_configuration'},400);
  const name=typeof v.bank_name==='string'?v.bank_name.trim():'';
  const account=typeof v.account_number==='string'?v.account_number.trim():'';
  const holder=typeof v.account_holder==='string'?v.account_holder.trim():'';
  const validAmount=a=>a===null||(Number.isInteger(a)&&a>=100&&a<=10000000);
  if(name.length<2||name.length>70||! /^[0-9 -]{6,40}$/.test(account)||holder.length<2||holder.length>70
     ||!validAmount(v.community_amount_krw)||!validAmount(v.consulting_amount_krw))
    return reply(req,{error:'invalid_bank_configuration_values'},400);
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
  return reply(req,{saved:true,bank_collection_enabled:false,reason:'requires_independent_release_approval'});
 }
 if(path==='/bank/admin/orders'&&method==='GET'){
  if(!await operator(admin,userId))return reply(req,{error:'operator_capability_required'},403);
  const list=await many(admin.from('singles_bank_orders')
    .select('reference,user_id,plan_code,amount_krw,status,created_at,reported_paid_at,verified_at,member_acknowledged_at')
    .order('created_at',{ascending:false}).limit(50));
  return reply(req,{orders:list});
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
