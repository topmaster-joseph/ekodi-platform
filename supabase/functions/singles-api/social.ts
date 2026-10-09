// EKODI Singles social actions. Server-side identity, adult, reciprocal consent and paid entitlement.
// Active only when BOTH central worker and Supabase function feature gates are explicitly enabled.
// Never infer subscription from client properties, user_metadata, or a user-editable profile.
import { bankPlanSnapshot, hasBankPlan } from './bank-transfer.ts';
type Reply=(req:Request,body:unknown,status?:number)=>Response;
type Admin=any;
const socialEnabled=()=>Deno.env.get('SINGLES_SOCIAL_ENABLED')==='true';
async function one(query:any){const {data,error}=await query.maybeSingle();if(error)throw error;return data}
async function many(query:any){const {data,error}=await query;if(error)throw error;return data||[]}
async function membership(admin:Admin,id:string){return one(admin.from('singles_memberships').select('status,base_consent,religion_consent,age_19_confirmed,adult_verified_at,discoverable').eq('user_id',id))}
const active=(m:any)=>m?.status==='active'&&m.base_consent===true&&m.age_19_confirmed===true;
const verified=(m:any)=>active(m)&&Boolean(m.adult_verified_at);
async function subscribed(admin:Admin,userId:string){return hasBankPlan(admin,userId,'community')}
async function blocked(admin:Admin,a:string,b:string){
 const items=await many(admin.from('singles_blocks').select('blocker_id,blocked_id')
  .or('and(blocker_id.eq.'+a+',blocked_id.eq.'+b+'),and(blocker_id.eq.'+b+',blocked_id.eq.'+a+')').limit(1));
 return items.length>0;
}
async function body(req:Request){if(Number(req.headers.get('content-length')||0)>4096)throw new Error('payload_too_large');return await req.json()}
const match=(p:string,re:RegExp)=>p.match(re)?.[1]||'';
export async function handleSinglesSocial(req:Request,p:string,admin:Admin,userId:string,reply:Reply):Promise<Response>{
 if(!socialEnabled())return reply(req,{error:'singles_social_not_launched'},503);
 const m=await membership(admin,userId);
 const method=req.method;
 if(p==='/subscription'&&method==='GET')return reply(req,await bankPlanSnapshot(admin,userId));
 if(p==='/profile'&&method==='GET'){
  const record=await one(admin.from('singles_profiles').select('display_name,broad_region,intro').eq('user_id',userId));
  return reply(req,{profile:record?{...record,discoverable:m?.discoverable===true}:null});
 }
 if(p==='/profile'&&method==='PUT'){
  if(!active(m))return reply(req,{error:'membership_required'},403);
  const v=await body(req);
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['display_name','broad_region','intro','discoverable'].includes(k)))
   return reply(req,{error:'invalid_profile_fields'},400);
  if(typeof v.display_name!=='string'||v.display_name.trim().length<2||v.display_name.trim().length>32
    ||typeof v.broad_region!=='string'||v.broad_region.length>40||typeof v.intro!=='string'||v.intro.length>400
    ||typeof v.discoverable!=='boolean')return reply(req,{error:'invalid_profile'},400);
  const visibilityRequested=v.discoverable===true;
  const allowDiscover=visibilityRequested&&verified(m)&&m.religion_consent===true;
  const {error:profileError}=await admin.from('singles_profiles').upsert({
   user_id:userId,display_name:v.display_name.trim(),broad_region:v.broad_region.trim(),intro:v.intro.trim(),updated_at:new Date().toISOString()
  },{onConflict:'user_id'});
  if(profileError)throw profileError;
  const {error:memberError}=await admin.from('singles_memberships').update({discoverable:allowDiscover})
   .eq('user_id',userId).eq('status','active');
  if(memberError)throw memberError;
  return reply(req,{saved:true,discoverable:allowDiscover,adult_verified:verified(m)});
 }
 // Logged-in users can browse published events even before signing up for singles.
 if(p==='/events'&&method==='GET'){
  const events=await many(admin.from('singles_events').select('id,title,summary,region,starts_at')
   .eq('state','published').gte('starts_at',new Date().toISOString()).order('starts_at').limit(40));
  return reply(req,{events});
 }
 const eventId=match(p,/^\/events\/([0-9a-f-]{36})$/i);
 if(eventId&&method==='GET'){
  const event=await one(admin.from('singles_events').select('id,title,summary,description,region,starts_at,capacity')
    .eq('id',eventId).eq('state','published'));
  return event?reply(req,{event}):reply(req,{error:'not_found'},404);
 }
 const rsvpId=match(p,/^\/events\/([0-9a-f-]{36})\/rsvp$/i);
 if(rsvpId&&method==='POST'){
  if(!verified(m))return reply(req,{error:'adult_verification_required'},403);
  if(!await subscribed(admin,userId))return reply(req,{error:'community_subscription_required'},402);
  const event=await one(admin.from('singles_events').select('id,starts_at').eq('id',rsvpId).eq('state','published'));
  if(!event||Date.parse(event.starts_at)<=Date.now())return reply(req,{error:'event_not_available'},409);
  const {error}=await admin.from('singles_event_rsvps').upsert({event_id:rsvpId,user_id:userId,status:'requested'}, {onConflict:'event_id,user_id'});
  if(error)throw error;return reply(req,{ok:true,status:'requested'});
 }
 const earlyBlock=match(p,/^\/blocks\/([0-9a-f-]{36})$/i);
 if(earlyBlock&&method==='POST'){
  if(!active(m))return reply(req,{error:'membership_required'},403);
  if(earlyBlock===userId)return reply(req,{error:'cannot_block_self'},400);
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
  const {error}=await admin.from('singles_reports').insert({reporter_id:userId,target_id:reportTarget,category:v.category,details:v.details});
  if(error)throw error;
  return reply(req,{ok:true,status:'open'});
 }
 if(!verified(m))return reply(req,{error:'adult_verification_required'},403);
 if(p==='/discover'&&method==='GET'){
  const eligible=await many(admin.from('singles_memberships').select('user_id').eq('status','active').eq('discoverable',true)
   .eq('base_consent',true).eq('religion_consent',true).not('adult_verified_at','is',null).neq('user_id',userId).limit(30));
  if(!eligible.length)return reply(req,{profiles:[]});
  const ownBlocks=await many(admin.from('singles_blocks').select('blocker_id,blocked_id')
    .or('blocker_id.eq.'+userId+',blocked_id.eq.'+userId));
  const blockedIds=new Set(ownBlocks.map((b:any)=>b.blocker_id===userId?b.blocked_id:b.blocker_id));
  const ids=eligible.map((x:any)=>x.user_id).filter((id:string)=>!blockedIds.has(id));
  if(!ids.length)return reply(req,{profiles:[]});
  const profiles=await many(admin.from('singles_profiles').select('user_id,display_name,broad_region,intro').in('user_id',ids).limit(20));
  return reply(req,{profiles:profiles.map((p:any)=>({id:p.user_id,display_name:p.display_name,broad_region:p.broad_region,intro:p.intro}))});
 }
 const interestUser=match(p,/^\/interests\/([0-9a-f-]{36})$/i);
 if(interestUser&&method==='POST'){
  if(interestUser===userId)return reply(req,{error:'cannot_match_self'},400);
  if(await blocked(admin,userId,interestUser))return reply(req,{error:'connection_unavailable'},403);
  const recipient=await membership(admin,interestUser);
  if(!verified(recipient)||recipient.discoverable!==true)return reply(req,{error:'connection_unavailable'},404);
  const existing=await one(admin.from('singles_interests').select('id,status').eq('from_user_id',userId).eq('to_user_id',interestUser));
  if(existing)return reply(req,{ok:true,status:existing.status,interest_id:existing.id});
  const {data,error}=await admin.from('singles_interests').insert({from_user_id:userId,to_user_id:interestUser,status:'pending'}).select('id').single();
  if(error)throw error;return reply(req,{ok:true,status:'pending',interest_id:data.id});
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
  const v=await body(req);
  if(typeof v?.text!=='string'||!v.text.trim()||v.text.length>1000)return reply(req,{error:'invalid_message'},400);
  const {error}=await admin.from('singles_messages').insert({interest_id:interestId,sender_id:userId,body:v.text.trim()});
  if(error)throw error;return reply(req,{ok:true});
 }
 return reply(req,{error:'not_found'},404);
}
