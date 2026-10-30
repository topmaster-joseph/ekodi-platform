// EKODI Singles social actions. Server-side identity, adult, reciprocal consent and paid entitlement.
// Active only when BOTH central worker and Supabase function feature gates are explicitly enabled.
// Never infer subscription from client properties, user_metadata, or a user-editable profile.
import { bankPlanSnapshot, hasBankPlan } from './bank-transfer.ts';
type Reply=(req:Request,body:unknown,status?:number)=>Response;
type Admin=any;
const socialEnabled=()=>Deno.env.get('SINGLES_SOCIAL_ENABLED')==='true';
// 요청 과금(2026-10-27): 요청 시 크레딧 잡아두기, 수락 시 요청자·응답자 각 1단위(1만원) 확정.
const requestBilling=()=>Deno.env.get('SINGLES_REQUEST_BILLING_ENABLED')==='true';
const rpcMsg=(e:any)=>String(e?.message||'');
async function one(query:any){const {data,error}=await query.maybeSingle();if(error)throw error;return data}
async function many(query:any){const {data,error}=await query;if(error)throw error;return data||[]}
async function membership(admin:Admin,id:string){return one(admin.from('singles_memberships').select('status,base_consent,religion_consent,age_19_confirmed,adult_verified_at,discoverable').eq('user_id',id))}
const active=(m:any)=>m?.status==='active'&&m.base_consent===true&&m.age_19_confirmed===true;
const verified=(m:any)=>active(m)&&Boolean(m.adult_verified_at);
// 유료회원 모델(2026-10-28): SINGLES_REQUEST_BILLING_ENABLED=true이면 가입비를 낸 유료회원만 회원 기능을 쓴다.
const paidModel=()=>requestBilling();
export const SUBSCRIPTION_CODES=['sub_1d','sub_10d','sub_20d','sub_30d'];
async function isPaid(admin:Admin,userId:string){const {data,error}=await admin.rpc('singles_is_paid_member',{p_user:userId});if(error)throw error;return data===true}
async function subscribed(admin:Admin,userId:string){return paidModel()?isPaid(admin,userId):hasBankPlan(admin,userId,'community')}
// 연락처 가림: 연락처 교환이 수락되지 않은 사이에서는 전화번호·이메일·메신저 아이디·링크를 서버가 가린다.
const CONTACT_PATTERNS=[
 /(?:\+?82[\s.-]?)?0?1[016789][\s.-]*\d{3,4}[\s.-]*\d{4}/g,
 /\b0\d{1,2}[\s.-]*\d{3,4}[\s.-]*\d{4}\b/g,
 /[A-Za-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|골뱅이)\s*[A-Za-z0-9.-]+\s*(?:\.|\(dot\)|점)\s*[A-Za-z]{2,}/gi,
 /(?:https?:\/\/|www\.)\S+/gi,
 /(?:카톡|카카오톡?|kakao(?:talk)?|오픈채팅|open\.kakao|라인|\bline\b|텔레그램|telegram|인스타(?:그램)?|instagram|\binsta\b|페북|facebook|위챗|wechat)\s*(?:id|아이디|ID)?\s*[:：]?\s*@?[A-Za-z0-9._-]{3,}/gi,
 /(?:^|\s)@[A-Za-z0-9._]{3,}/g,
 /\d(?:[\s.\-·]*\d){8,}/g
];
export function maskContacts(text:string){
 let out=text,masked=false;
 for(const re of CONTACT_PATTERNS)out=out.replace(re,m=>{masked=true;const lead=m.match(/^\s/)?.[0]||'';return lead+'[연락처 가림]'});
 return {text:out,masked};
}
async function contactUnlocked(admin:Admin,a:string,b:string){
 const [lo,hi]=a<b?[a,b]:[b,a];
 return Boolean(await one(admin.from('singles_contact_unlocks').select('request_id').eq('user_low',lo).eq('user_high',hi)));
}
async function blocked(admin:Admin,a:string,b:string){
 const items=await many(admin.from('singles_blocks').select('blocker_id,blocked_id')
  .or('and(blocker_id.eq.'+a+',blocked_id.eq.'+b+'),and(blocker_id.eq.'+b+',blocked_id.eq.'+a+')').limit(1));
 return items.length>0;
}
async function body(req:Request,max=4096){if(Number(req.headers.get('content-length')||0)>max)throw new Error('payload_too_large');return await req.json()}

// 프로필 항목 카탈로그(2026-10-28). 화면(app.js PROFILE_FIELDS)과 같은 키·한도를 쓴다.
// sensitive=신앙 항목: 민감정보 별도 동의 회원만 저장, 입력·공개 점수(향후 요금 반영)에서 제외.
export const PROFILE_FIELDS:Record<string,{max?:number,options?:string[],sensitive?:boolean}>={
 real_name:{max:32},
 gender:{options:['남성','여성']},
 age_band:{options:['20대 초반','20대 중반','20대 후반','30대 초반','30대 중반','30대 후반','40대 초반','40대 중반','40대 후반','50대 이상']},
 occupation:{max:40},
 education:{options:['고등학교','전문대학','대학교','대학원 이상']},
 hobbies:{max:120},
 looking_for:{max:200},
 church:{max:60,sensitive:true},
 faith_life:{max:200,sensitive:true}
};
// 지역은 광역 시·도에서만 고른다(세부 주소는 받지 않음).
// 전남광주특별시(2026-07-01 출범) 반영. 다른 광역 통합은 확인 후 갱신.
export const REGIONS=['서울','부산','대구','인천','대전','울산','세종','경기','강원','충북','충남','전북','전남광주','경북','경남','제주','해외'];
// 별명(display_name)은 항상 공개. 아래 항목은 회원이 하나씩 공개를 고른다.
export const VISIBILITY_KEYS=['broad_region','intro','public_link',...Object.keys(PROFILE_FIELDS)];
// 공개 선택 기능 이전에 저장된 프로필은 지역·소개·링크가 공개였으므로 그 동작을 유지한다.
const LEGACY_PUBLIC=new Set(['broad_region','intro','public_link']);
const isVisible=(vis:any,k:string)=>vis&&typeof vis==='object'&&k in vis?vis[k]===true:LEGACY_PUBLIC.has(k);
export function profileScore(record:any){
 const keys=['broad_region','intro',...Object.keys(PROFILE_FIELDS).filter(k=>!PROFILE_FIELDS[k].sensitive)];
 const value=(k:string)=>k in PROFILE_FIELDS?record?.details?.[k]:record?.[k];
 const filled=keys.filter(k=>typeof value(k)==='string'&&value(k).trim());
 return {total:keys.length,filled:filled.length,public:filled.filter(k=>isVisible(record?.visibility,k)).length};
}
function cleanDetails(raw:unknown,faithAllowed:boolean){
 if(raw===undefined)return {};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const out:Record<string,string>={};
 for(const [k,v] of Object.entries(raw as Record<string,unknown>)){
  const f=PROFILE_FIELDS[k];if(!f||typeof v!=='string')return null;
  const t=v.trim();if(!t)continue;
  if(f.sensitive&&!faithAllowed)return 'faith';
  if(f.options?!f.options.includes(t):t.length>(f.max||0))return null;
  out[k]=t;
 }
 return out;
}
function cleanVisibility(raw:unknown){
 if(raw===undefined)return undefined;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const out:Record<string,boolean>={};
 for(const [k,v] of Object.entries(raw as Record<string,unknown>)){if(!VISIBILITY_KEYS.includes(k)||typeof v!=='boolean')return null;out[k]=v}
 return out;
}

// 본인확인기관(포트원 V2) 연동. 비밀키는 Edge 비밀값 PORTONE_API_SECRET에만 둔다.
const identityOn=()=>Deno.env.get('SINGLES_IDENTITY_PROVIDER_ENABLED')==='true'&&Boolean(Deno.env.get('PORTONE_API_SECRET'));
async function fetchIdentity(id:string){
 try{
  const r=await fetch('https://api.portone.io/identity-verifications/'+encodeURIComponent(id),{headers:{authorization:'PortOne '+Deno.env.get('PORTONE_API_SECRET')},signal:AbortSignal.timeout(10000)});
  if(!r.ok)return {ok:false,data:null};
  return {ok:true,data:await r.json()};
 }catch{return {ok:false,data:null}}
}
// 만 19세 이상(한국 시간 기준 생일 경과). birthDate는 yyyy-MM-dd.
export function isAdult(birthDate:unknown,now=new Date()){
 if(typeof birthDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(birthDate))return false;
 const [y,mo,d]=birthDate.split('-').map(Number);
 const kst=new Date(now.getTime()+9*3600000);
 const ty=kst.getUTCFullYear(),tm=kst.getUTCMonth()+1,td=kst.getUTCDate();
 let age=ty-y;if(tm<mo||(tm===mo&&td<d))age--;
 return age>=19;
}
async function sha256hex(text:string){
 const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const match=(p:string,re:RegExp)=>p.match(re)?.[1]||'';
// Per-user write limits (EKODI-SINGLES-MVP abuse controls). Enforced atomically in
// the database; an RPC failure throws so the request fails closed (503).
export const SINGLES_RATE_LIMITS={
 interest:{limit:20,windowSeconds:86400},
 report:{limit:10,windowSeconds:86400},
 block:{limit:30,windowSeconds:86400},
 message:{limit:60,windowSeconds:600},
} as const;
async function rateLimited(admin:Admin,userId:string,action:keyof typeof SINGLES_RATE_LIMITS){
 const rule=SINGLES_RATE_LIMITS[action];
 const {data,error}=await admin.rpc('singles_rate_take',{p_user:userId,p_action:action,p_limit:rule.limit,p_window_seconds:rule.windowSeconds});
 if(error)throw error;
 return Number(data)>0?Number(data):0;
}
const tooMany=(req:Request,reply:Reply,action:string,retry:number)=>reply(req,{error:'rate_limited',action,retry_after_seconds:retry},429);
export async function handleSinglesSocial(req:Request,p:string,admin:Admin,userId:string,reply:Reply):Promise<Response>{
 if(!socialEnabled())return reply(req,{error:'singles_social_not_launched'},503);
 const m=await membership(admin,userId);
 const method=req.method;
 if(p==='/subscription'&&method==='GET')return reply(req,await bankPlanSnapshot(admin,userId));
 if(p==='/admin/events'&&method==='GET'){
  const role=await one(admin.from('singles_event_pricing_operators').select('enabled,can_price').eq('user_id',userId));
  if(!role?.enabled||!role?.can_price)return reply(req,{error:'event_pricing_capability_required'},403);
  const events=await many(admin.from('singles_events').select('id,title,state,starts_at,fee_krw').order('starts_at',{ascending:false}).limit(50));
  return reply(req,{events});
 }
 const priceEventId=match(p,new RegExp('^/admin/events/([0-9a-f-]{36})/fee$','i'));
 if(priceEventId&&method==='PUT'){
  const role=await one(admin.from('singles_event_pricing_operators').select('enabled,can_price').eq('user_id',userId));
  if(!role?.enabled||!role?.can_price)return reply(req,{error:'event_pricing_capability_required'},403);
  const v=await body(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>k!=='fee_krw')||!Number.isInteger(v.fee_krw)||v.fee_krw<0||v.fee_krw>1000000)
   return reply(req,{error:'invalid_event_fee'},400);
  const event=await one(admin.from('singles_events').select('id,state,fee_krw').eq('id',priceEventId));
  if(!event||event.state==='cancelled')return reply(req,{error:'event_not_available'},404);
  if(event.state==='published'&&event.fee_krw!==v.fee_krw){
   const existing=await many(admin.from('singles_event_rsvps').select('user_id').eq('event_id',priceEventId).limit(1));
   if(existing.length)return reply(req,{error:'fee_locked_after_registration'},409);
  }
  const {error:saveError}=await admin.from('singles_events').update({fee_krw:v.fee_krw}).eq('id',priceEventId);
  if(saveError)throw saveError;
  return reply(req,{saved:true,fee_krw:v.fee_krw,paid_registration_ready:v.fee_krw===0});
 }
 const reportQueue=match(p,/^\/admin\/reports\/(open|under_review|resolved|dismissed)$/);
 const reportReview=match(p,/^\/admin\/reports\/([0-9a-f-]{36})\/review$/i);
 if((reportQueue&&method==='GET')||(reportReview&&method==='POST')){
  const role=await one(admin.from('singles_report_operators').select('enabled,can_review').eq('user_id',userId));
  if(!role?.enabled||!role?.can_review)return reply(req,{error:'report_review_capability_required'},403);
  if(reportQueue){
   const rows=await many(admin.from('singles_reports')
    .select('id,reporter_id,target_id,category,details,status,created_at,reviewed_at,resolution_note')
    .eq('status',reportQueue).order('created_at',{ascending:reportQueue==='open'||reportQueue==='under_review'}).limit(50));
   const ids=[...new Set(rows.flatMap((r:any)=>[r.reporter_id,r.target_id]))];
   const names=ids.length?await many(admin.from('singles_profiles').select('user_id,display_name').in('user_id',ids)):[];
   const byId=new Map(names.map((n:any)=>[n.user_id,n.display_name]));
   // Reviewers see display names and short references, never raw account identifiers.
   const who=(id:string)=>({name:byId.get(id)||'이름 없는 회원',ref:String(id).slice(0,8),self:id===userId});
   return reply(req,{reports:rows.map((r:any)=>({id:r.id,category:r.category,details:r.details,status:r.status,
    created_at:r.created_at,reviewed_at:r.reviewed_at,resolution_note:r.resolution_note,reporter:who(r.reporter_id),target:who(r.target_id)}))});
  }
  const v=await body(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['status','note'].includes(k))
   ||!['under_review','resolved','dismissed'].includes(v.status)||(v.note!==undefined&&(typeof v.note!=='string'||v.note.length>500)))
   return reply(req,{error:'invalid_review'},400);
  const {data,error}=await admin.rpc('singles_report_review',{p_report:reportReview,p_operator:userId,p_status:v.status,p_note:v.note??null});
  if(error){
   const msg=String(error.message||'');
   if(msg.includes('operator_conflict_of_interest'))return reply(req,{error:'operator_conflict_of_interest'},403);
   if(msg.includes('operator_not_authorized'))return reply(req,{error:'report_review_capability_required'},403);
   if(msg.includes('resolution_note_required'))return reply(req,{error:'resolution_note_required'},400);
   if(msg.includes('invalid_review'))return reply(req,{error:'invalid_review'},400);
   if(msg.includes('report_not_found'))return reply(req,{error:'report_not_found'},404);
   if(msg.includes('report_not_reviewable'))return reply(req,{error:'report_not_reviewable'},409);
   throw error;
  }
  return reply(req,{ok:true,id:reportReview,status:data});
 }
 if(p==='/pricing'&&method==='GET'){
  // 2026-10-31: 가입비 없음. 유료회원=구독권 보유, 요청·수락은 수락 후 청구서(후불).
  const rules=await many(admin.from('singles_price_rules').select('kind,display_name,standard_krw,floor_krw,max_discount_pct'));
  const plans=await many(admin.from('singles_bank_plans').select('code,display_name,amount_krw,duration_days').eq('active',true).in('code',SUBSCRIPTION_CODES).order('duration_days'));
  const paid=paidModel()?await isPaid(admin,userId):false;
  const quotes:Record<string,number>={};
  if(paid)for(const k of ['message','contact']){const {data,error}=await admin.rpc('singles_price_quote',{p_user:userId,p_kind:k});if(error)throw error;quotes[k]=data}
  const grant=await one(admin.from('singles_bank_grants').select('expires_at').eq('user_id',userId).eq('plan_code','subscription'));
  return reply(req,{paid_model:paidModel(),paid_member:paid,billing:'postpaid_invoice',rules,subscription_plans:plans,quotes,
   subscription_expires_at:grant?.expires_at&&Date.parse(grant.expires_at)>Date.now()?grant.expires_at:null});
 }
 if(/^\/passes\//.test(p))return reply(req,{error:'passes_discontinued'},410);
 if(p==='/profile'&&method==='GET'){
  const record=await one(admin.from('singles_profiles').select('display_name,broad_region,intro,public_link,details,visibility').eq('user_id',userId));
  const vis=Object.fromEntries(VISIBILITY_KEYS.map(k=>[k,isVisible(record?.visibility,k)]));
  return reply(req,{profile:record?{...record,details:record.details||{},visibility:vis,discoverable:m?.discoverable===true}:null,
   score:profileScore(record),faith_fields_allowed:m?.religion_consent===true});
 }
 if(p==='/profile'&&method==='PUT'){
  if(!active(m))return reply(req,{error:'membership_required'},403);
  if(paidModel()&&!await isPaid(admin,userId))return reply(req,{error:'paid_membership_required'},402);
  const v=await body(req,12288);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['display_name','broad_region','intro','public_link','discoverable','details','visibility'].includes(k)))
   return reply(req,{error:'invalid_profile_fields'},400);
  if(typeof v.display_name!=='string'||v.display_name.trim().length<2||v.display_name.trim().length>32
    ||typeof v.broad_region!=='string'||v.broad_region.length>40||typeof v.intro!=='string'||v.intro.length>400
    ||typeof v.discoverable!=='boolean'||typeof v.public_link!=='string'||v.public_link.length>300)return reply(req,{error:'invalid_profile'},400);
  if(v.broad_region.trim()&&!REGIONS.includes(v.broad_region.trim()))return reply(req,{error:'invalid_region'},400);
  const profileUrl=v.public_link.trim();
  if(profileUrl){try{const link=new URL(profileUrl);if(link.protocol!=='https:'||link.username||link.password||!link.hostname.includes('.')||link.hostname==='localhost')return reply(req,{error:'invalid_public_profile_link'},400)}catch{return reply(req,{error:'invalid_public_profile_link'},400)}}
  const visibilityRequested=v.discoverable===true;
  const allowDiscover=visibilityRequested&&verified(m)&&m.religion_consent===true;
  const details=cleanDetails(v.details,m?.religion_consent===true);
  if(details==='faith')return reply(req,{error:'faith_consent_required'},403);
  if(details===null)return reply(req,{error:'invalid_profile_details'},400);
  const visibility=cleanVisibility(v.visibility);
  if(visibility===null)return reply(req,{error:'invalid_profile_visibility'},400);
  const {error:profileError}=await admin.from('singles_profiles').upsert({
   user_id:userId,display_name:v.display_name.trim(),broad_region:v.broad_region.trim(),intro:v.intro.trim(),public_link:profileUrl||null,
   ...(v.details!==undefined?{details}:{}),...(visibility?{visibility}:{}),updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  if(profileError)throw profileError;
  const {error:memberError}=await admin.from('singles_memberships').update({discoverable:allowDiscover})
   .eq('user_id',userId).eq('status','active');
  if(memberError)throw memberError;
  return reply(req,{saved:true,discoverable:allowDiscover,adult_verified:verified(m)});
 }
 // Logged-in users can browse published events even before signing up for singles.
 if(p==='/events'&&method==='GET'){
  const events=await many(admin.from('singles_events').select('id,title,summary,region,starts_at,fee_krw')
   .eq('state','published').gte('starts_at',new Date().toISOString()).order('starts_at').limit(40));
  return reply(req,{events});
 }
 const eventId=match(p,/^\/events\/([0-9a-f-]{36})$/i);
 if(eventId&&method==='GET'){
  const event=await one(admin.from('singles_events').select('id,title,summary,description,region,starts_at,capacity,fee_krw')
    .eq('id',eventId).eq('state','published'));
  return event?reply(req,{event}):reply(req,{error:'not_found'},404);
 }
 const rsvpId=match(p,/^\/events\/([0-9a-f-]{36})\/rsvp$/i);
 if(rsvpId&&method==='POST'){
  if(!verified(m))return reply(req,{error:'adult_verification_required'},403);
  if(!await subscribed(admin,userId))return reply(req,{error:'community_subscription_required'},402);
  const event=await one(admin.from('singles_events').select('id,starts_at,fee_krw').eq('id',rsvpId).eq('state','published'));
  if(!event||Date.parse(event.starts_at)<=Date.now())return reply(req,{error:'event_not_available'},409);
  // Event-specific paid fees require a distinct verified receipt; subscriptions cannot silently waive them.
  if(event.fee_krw>0)return reply(req,{error:'event_fee_verification_not_configured'},503);
  const {error}=await admin.from('singles_event_rsvps').upsert({event_id:rsvpId,user_id:userId,status:'requested'}, {onConflict:'event_id,user_id'});
  if(error)throw error;return reply(req,{ok:true,status:'requested'});
 }
 const earlyBlock=match(p,/^\/blocks\/([0-9a-f-]{36})$/i);
 if(earlyBlock&&method==='POST'){
  if(!active(m))return reply(req,{error:'membership_required'},403);
  if(earlyBlock===userId)return reply(req,{error:'cannot_block_self'},400);
  {const retry=await rateLimited(admin,userId,'block');if(retry)return tooMany(req,reply,'block',retry);}
  const {error}=await admin.from('singles_blocks').upsert({blocker_id:userId,blocked_id:earlyBlock},{onConflict:'blocker_id,blocked_id'});
  if(error)throw error;
  return reply(req,{ok:true,blocked:true});
 }
 const reportTarget=match(p,/^\/reports\/([0-9a-f-]{36})$/i);
 if(reportTarget&&method==='POST'){
  if(!active(m))return reply(req,{error:'membership_required'},403);
  if(reportTarget===userId)return reply(req,{error:'cannot_report_self'},400);
  const v=await body(req);
  if(!['harassment','fake_profile','spam','safety','other'].includes(v?.category)||typeof v?.details!=='string'||v.details.length>500)
   return reply(req,{error:'invalid_report'},400);
  {const retry=await rateLimited(admin,userId,'report');if(retry)return tooMany(req,reply,'report',retry);}
  const {error}=await admin.from('singles_reports').insert({reporter_id:userId,target_id:reportTarget,category:v.category,details:v.details});
  if(error)throw error;
  return reply(req,{ok:true,status:'open'});
 }
 // ── 본인확인기관 연동(포트원 V2 본인인증, 2026-10-28) ──
 // 이름·생년월일·전화번호는 저장하지 않고, 만 19세 이상 여부와 중복 가입 방지용 CI 해시만 남긴다.
 if(p==='/identity/start'&&method==='POST'){
  if(!identityOn())return reply(req,{error:'identity_provider_not_configured'},503);
  if(!active(m))return reply(req,{error:'membership_required'},403);
  if(m.adult_verified_at)return reply(req,{ok:true,already_verified:true});
  const id='ekodi-sgl-'+crypto.randomUUID().replaceAll('-','');
  const {error}=await admin.rpc('singles_identity_start',{p_user:userId,p_id:id});
  if(error){if(rpcMsg(error).includes('identity_rate_limited'))return reply(req,{error:'identity_rate_limited'},429);throw error}
  return reply(req,{ok:true,identity_verification_id:id});
 }
 if(p==='/identity/complete'&&method==='POST'){
  if(!identityOn())return reply(req,{error:'identity_provider_not_configured'},503);
  const v=await body(req);const id=typeof v?.identity_verification_id==='string'?v.identity_verification_id:'';
  if(!/^ekodi-sgl-[0-9a-f]{32}$/.test(id))return reply(req,{error:'invalid_identity_verification'},400);
  const pending=await one(admin.from('singles_identity_verifications').select('status').eq('id',id).eq('user_id',userId));
  if(!pending)return reply(req,{error:'identity_not_found'},404);
  if(pending.status!=='pending')return reply(req,{error:'identity_already_completed',status:pending.status},409);
  const result=await fetchIdentity(id);
  if(!result.ok)return reply(req,{error:'identity_provider_unavailable'},502);
  const iv=result.data;
  if(iv?.status!=='VERIFIED'||iv?.id!==id)return reply(req,{error:'identity_not_verified'},409);
  const adult=isAdult(iv?.verifiedCustomer?.birthDate);
  const ci=typeof iv?.verifiedCustomer?.ci==='string'&&iv.verifiedCustomer.ci?iv.verifiedCustomer.ci:'';
  const ciHash=ci?await sha256hex('ekodi-singles:'+ci):null;
  const {data,error}=await admin.rpc('singles_identity_complete',{p_user:userId,p_id:id,p_adult:adult,p_ci_hash:ciHash});
  if(error){if(rpcMsg(error).includes('identity_already_completed'))return reply(req,{error:'identity_already_completed'},409);throw error}
  if(data==='rejected_minor')return reply(req,{error:'adult_required'},403);
  if(data==='duplicate')return reply(req,{error:'identity_already_used'},409);
  if(data==='failed')return reply(req,{error:'identity_key_missing'},409);
  return reply(req,{ok:true,adult_verified:true});
 }
 if(!verified(m))return reply(req,{error:'adult_verification_required'},403);
 if(p==='/discover'&&method==='GET'){
  if(paidModel()&&!await isPaid(admin,userId))return reply(req,{error:'paid_membership_required'},402);
  let eligibleQuery=admin.from('singles_memberships').select('user_id').eq('status','active').eq('discoverable',true)
   .eq('base_consent',true).eq('religion_consent',true).not('adult_verified_at','is',null).neq('user_id',userId);
  if(paidModel())eligibleQuery=eligibleQuery.not('paid_member_since','is',null);
  const eligible=await many(eligibleQuery.limit(30));
  if(!eligible.length)return reply(req,{profiles:[]});
  const ownBlocks=await many(admin.from('singles_blocks').select('blocker_id,blocked_id')
    .or('blocker_id.eq.'+userId+',blocked_id.eq.'+userId));
  const blockedIds=new Set(ownBlocks.map((b:any)=>b.blocker_id===userId?b.blocked_id:b.blocker_id));
  const ids=eligible.map((x:any)=>x.user_id).filter((id:string)=>!blockedIds.has(id));
  if(!ids.length)return reply(req,{profiles:[]});
  const profiles=await many(admin.from('singles_profiles').select('user_id,display_name,broad_region,intro,public_link,details,visibility').in('user_id',ids).limit(20));
  // 회원이 공개로 고른 항목만 내보낸다(비공개 항목은 응답에 아예 싣지 않음).
  return reply(req,{profiles:profiles.map((p:any)=>{
   const show=(k:string)=>isVisible(p.visibility,k);
   const details=Object.fromEntries(Object.keys(PROFILE_FIELDS).filter(k=>show(k)&&typeof p.details?.[k]==='string'&&p.details[k]).map(k=>[k,p.details[k]]));
   return {id:p.user_id,display_name:p.display_name,broad_region:show('broad_region')?p.broad_region:'',intro:show('intro')?p.intro:'',
    public_link:show('public_link')?p.public_link||null:null,details};
  })});
 }
 const interestUser=match(p,/^\/interests\/([0-9a-f-]{36})$/i);
 if(interestUser&&method==='POST'){
  if(interestUser===userId)return reply(req,{error:'cannot_match_self'},400);
  if(await blocked(admin,userId,interestUser))return reply(req,{error:'connection_unavailable'},403);
  const recipient=await membership(admin,interestUser);
  if(!verified(recipient)||recipient.discoverable!==true)return reply(req,{error:'connection_unavailable'},404);
  if(paidModel()){
   // 요청 종류: message(메시지 교환) | contact(연락처 교환).
   let kind='message';
   if(Number(req.headers.get('content-length')||0)>0){const v=await body(req);if(v&&typeof v==='object'&&'kind' in v)kind=v.kind}
   if(!['message','contact'].includes(kind))return reply(req,{error:'invalid_request_kind'},400);
   if(!await isPaid(admin,userId))return reply(req,{error:'paid_membership_required'},402);
   {const retry=await rateLimited(admin,userId,'interest');if(retry)return tooMany(req,reply,'interest',retry);}
   const {data,error}=await admin.rpc('singles_postpaid_request_create',{p_requester:userId,p_responder:interestUser,p_kind:kind});
   if(error){
    const msg=rpcMsg(error);
    if(msg.includes('paid_membership_required'))return reply(req,{error:'paid_membership_required'},402);
    if(msg.includes('responder_unavailable'))return reply(req,{error:'connection_unavailable'},404);
    for(const code of ['request_exists','already_connected','contact_already_shared'])if(msg.includes(code))return reply(req,{error:code},409);
    throw error;
   }
   // 요청할 때는 아무것도 결제·보류하지 않는다. 상대가 수락하면 양쪽에 청구서가 발행된다.
   return reply(req,{ok:true,status:'pending',request_id:data.request_id,kind,billing:{fee_krw:data.fee_krw,charged_on:'acceptance_invoice'}});
  }
  const existing=await one(admin.from('singles_interests').select('id,status').eq('from_user_id',userId).eq('to_user_id',interestUser));
  if(existing)return reply(req,{ok:true,status:existing.status,interest_id:existing.id});
  {const retry=await rateLimited(admin,userId,'interest');if(retry)return tooMany(req,reply,'interest',retry);}
  const {data,error}=await admin.from('singles_interests').insert({from_user_id:userId,to_user_id:interestUser,status:'pending'}).select('id').single();
  if(error)throw error;return reply(req,{ok:true,status:'pending',interest_id:data.id});
 }
 if(p==='/requests'&&method==='GET'&&paidModel()){
  const reqs=await many(admin.from('singles_paid_requests').select('id,requester_id,responder_id,kind,status,requester_fee_krw,responder_fee_krw,created_at')
   .or('requester_id.eq.'+userId+',responder_id.eq.'+userId).order('created_at',{ascending:false}).limit(50));
  const invoices=await many(admin.from('singles_request_invoices').select('id,request_id,amount_krw,status,order_reference,due_at').eq('user_id',userId).limit(100));
  const invByReq=new Map<string,any>(invoices.map((i:any)=>[i.request_id,i]));
  const conns=await many(admin.from('singles_interests').select('id,from_user_id,to_user_id,status')
   .or('from_user_id.eq.'+userId+',to_user_id.eq.'+userId).eq('status','accepted').limit(50));
  const others=[...new Set([...reqs.map((r:any)=>r.requester_id===userId?r.responder_id:r.requester_id),...conns.map((c:any)=>c.from_user_id===userId?c.to_user_id:c.from_user_id)])];
  const names=others.length?await many(admin.from('singles_profiles').select('user_id,display_name').in('user_id',others)):[];
  const byId=new Map(names.map((x:any)=>[x.user_id,x.display_name]));
  const quotes:Record<string,number>={};
  for(const k of ['message','contact']){const {data,error}=await admin.rpc('singles_price_quote',{p_user:userId,p_kind:k});if(error)throw error;quotes[k]=data}
  const unlocks=await many(admin.from('singles_contact_unlocks').select('user_low,user_high').or('user_low.eq.'+userId+',user_high.eq.'+userId));
  const shared=new Set(unlocks.map((u:any)=>u.user_low===userId?u.user_high:u.user_low));
  return reply(req,{paid_model:true,billing:'postpaid_invoice',
   requests:reqs.map((r:any)=>{const incoming=r.responder_id===userId,other=incoming?r.requester_id:r.responder_id;const inv=invByReq.get(r.id);
    return {id:r.id,kind:r.kind,status:r.status,incoming,display_name:byId.get(other)||'동행 회원',
     my_fee_krw:inv?inv.amount_krw:(incoming?quotes[r.kind]:r.requester_fee_krw),
     invoice:inv?{id:inv.id,amount_krw:inv.amount_krw,status:inv.status,order_reference:inv.order_reference||null,due_at:inv.due_at}:null}}),
   connections:conns.map((c:any)=>{const other=c.from_user_id===userId?c.to_user_id:c.from_user_id;
    return {id:c.id,display_name:byId.get(other)||'동행 회원',contact_shared:shared.has(other)}})});
 }
 if(p==='/requests'&&method==='GET'){
  const interests=await many(admin.from('singles_interests').select('id,from_user_id,to_user_id,status')
   .or('from_user_id.eq.'+userId+',to_user_id.eq.'+userId).limit(50));
  const visible=interests.filter((x:any)=>x.to_user_id===userId||x.status==='accepted');
  const ids=[...new Set(visible.map((x:any)=>x.from_user_id===userId?x.to_user_id:x.from_user_id))];
  const names=ids.length?await many(admin.from('singles_profiles').select('user_id,display_name').in('user_id',ids)):[];
  const byId=new Map(names.map((x:any)=>[x.user_id,x.display_name]));
  return reply(req,{requests:visible.map((i:any)=>{
   const other=i.from_user_id===userId?i.to_user_id:i.from_user_id;
   return{id:i.id,display_name:byId.get(other)||'동행 회원',status:i.status,incoming:i.to_user_id===userId}
  })});
 }
 const decisionId=match(p,/^\/requests\/([0-9a-f-]{36})\/respond$/i);
 if(decisionId&&method==='POST'){
  const v=await body(req),decision=v?.decision;
  if(!['accepted','declined'].includes(decision))return reply(req,{error:'invalid_decision'},400);
  if(paidModel()){
   const q=await one(admin.from('singles_paid_requests').select('requester_id,status').eq('id',decisionId).eq('responder_id',userId));
   if(!q||q.status!=='pending')return reply(req,{error:'connection_not_pending'},409);
   if(await blocked(admin,userId,q.requester_id))return reply(req,{error:'blocked'},403);
   const {data,error}=await admin.rpc('singles_postpaid_request_decide',{p_responder:userId,p_request:decisionId,p_decision:decision});
   if(error){
    const msg=rpcMsg(error);
    if(msg.includes('paid_membership_required'))return reply(req,{error:'paid_membership_required'},402);
    if(msg.includes('request_not_pending'))return reply(req,{error:'request_state_changed'},409);
    throw error;
   }
   // 수락하면 양쪽에 청구서가 발행되고, 둘 다 결제되면 연결된다.
   return reply(req,{ok:true,status:data.status,kind:data.kind,billing:{invoice_id:data.invoice_id||null,fee_krw:data.fee_krw,due_days:7}});
  }
  const interest=await one(admin.from('singles_interests').select('from_user_id,to_user_id,status')
   .eq('id',decisionId).eq('to_user_id',userId));
  if(!interest||interest.status!=='pending')return reply(req,{error:'connection_not_pending'},409);
  if(await blocked(admin,userId,interest.from_user_id))return reply(req,{error:'blocked'},403);
  const {data,error}=await admin.from('singles_interests').update({status:decision,updated_at:new Date().toISOString()})
   .eq('id',decisionId).eq('status','pending').eq('to_user_id',userId).select('id').maybeSingle();
  if(error)throw error;if(!data)return reply(req,{error:'request_state_changed'},409);
  return reply(req,{ok:true,status:decision});
 }
 const interestId=match(p,/^\/messages\/([0-9a-f-]{36})$/i);
 if(interestId&&['GET','POST'].includes(method)){
  const interest=await one(admin.from('singles_interests').select('from_user_id,to_user_id,status').eq('id',interestId));
  if(!interest||interest.status!=='accepted'||![interest.from_user_id,interest.to_user_id].includes(userId))
    return reply(req,{error:'mutual_consent_required'},403);
  const other=interest.from_user_id===userId?interest.to_user_id:interest.from_user_id;
  if(await blocked(admin,userId,other))return reply(req,{error:'blocked'},403);
  if(!verified(await membership(admin,other)))return reply(req,{error:'other_member_unavailable'},403);
  if(method==='GET'){
   const messages=await many(admin.from('singles_messages').select('id,sender_id,body,created_at')
     .eq('interest_id',interestId).order('created_at',{ascending:true}).limit(100));
   return reply(req,{messages});
  }
  // The sender of every new message (including replies) must have a valid
  // bank-confirmed community subscription; receiving/reading remains free.
  // Do not use profile flags or client claims as billing evidence.
  if(!await subscribed(admin,userId))return reply(req,{error:'community_subscription_required'},402);
  const v=await body(req);
  if(typeof v?.text!=='string'||!v.text.trim()||v.text.length>1000)return reply(req,{error:'invalid_message'},400);
  {const retry=await rateLimited(admin,userId,'message');if(retry)return tooMany(req,reply,'message',retry);}
  // 연락처 교환이 수락되지 않은 사이에서는 메시지 속 연락처를 가려서 저장한다(유료회원 모델).
  let stored=v.text.trim(),masked=false;
  if(paidModel()&&!await contactUnlocked(admin,userId,other)){const r=maskContacts(stored);stored=r.text;masked=r.masked}
  const {error}=await admin.from('singles_messages').insert({interest_id:interestId,sender_id:userId,body:stored});
  if(error)throw error;return reply(req,{ok:true,masked});
 }
 return reply(req,{error:'not_found'},404);
}
