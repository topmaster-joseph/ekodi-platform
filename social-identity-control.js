// SOCIAL-ID-001: EKODI is the identity authority; social profiles are optional, unverified references.
// The new feature is fail-closed. No OAuth, account login, publishing, or token storage is enabled here.
export const SOCIAL_IDENTITY_PROVIDERS=Object.freeze([
  {id:'youtube',name:'YouTube'}, {id:'facebook',name:'Facebook'},
  {id:'instagram',name:'Instagram'}, {id:'threads',name:'Threads'},
  {id:'naver',name:'Naver'}, {id:'kakao',name:'Kakao'},
  {id:'tiktok',name:'TikTok'}, {id:'x',name:'X'},
  {id:'linkedin',name:'LinkedIn'}, {id:'pinterest',name:'Pinterest'},
  {id:'bluesky',name:'Bluesky'}, {id:'discord',name:'Discord'},
  {id:'telegram',name:'Telegram'}
]);
const PROVIDER_SET=new Set(SOCIAL_IDENTITY_PROVIDERS.map(p=>p.id));
const PREFIX='/api/control/external-accounts/social-identities';
const NAME_LIMIT=120;
const ACCOUNT_LIMIT=160;
function trim(value,max){return String(value??'').trim().slice(0,max)}
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}})}
function enabled(env){return env?.EKODI_SOCIAL_IDENTITY_REGISTRATION_ENABLED==='true'}
function routeProvider(item){
  const provider=String(item.provider||'').toLowerCase();
  if(provider==='google'&&['youtube','youtube-short','youtube_shorts'].includes(String(item.serviceKey||'').toLowerCase()))return'youtube';
  if(provider==='meta'&&['facebook','instagram','threads'].includes(String(item.serviceKey||'').toLowerCase()))return String(item.serviceKey).toLowerCase();
  return PROVIDER_SET.has(provider)?provider:'';
}
function existingAccounts(rows){
  return (Array.isArray(rows)?rows:[]).flatMap(item=>{
    const provider=routeProvider(item);
    if(!provider)return [];
    return [{
      source:'existing_service',provider,workspaceSlug:trim(item.workspaceSlug,80),
      displayName:trim(item.displayName,NAME_LIMIT),
      providerAccountId:trim(item.providerAccountId,ACCOUNT_LIMIT),
      status:trim(item.status,40),lastVerifiedAt:item.lastVerifiedAt||null
    }];
  });
}
export function socialIdentityPolicy(env){
  return Object.freeze({registrationEnabled:enabled(env),oauthLinkingEnabled:false,socialLoginEnabled:false,autoPublishingEnabled:false,manualActivationRequired:true});
}
async function readLinks(db,all,userId){
  if(!db)return {ready:false,accounts:[]};
  try{
    const stmt=all
      ?db.prepare('SELECT id,ekodi_user_id,provider,provider_account_id,display_name,status,created_at,verified_at FROM ekodi_social_account_links ORDER BY created_at DESC LIMIT 500')
      :db.prepare('SELECT id,ekodi_user_id,provider,provider_account_id,display_name,status,created_at,verified_at FROM ekodi_social_account_links WHERE ekodi_user_id=? ORDER BY created_at DESC LIMIT 100').bind(userId);
    const result=await stmt.all();
    return {ready:true,accounts:(result.results||[]).map(x=>({
      id:x.id,ekodiUserId:x.ekodi_user_id,provider:x.provider,
      providerAccountId:x.provider_account_id,displayName:x.display_name,
      status:x.status,verifiedAt:x.verified_at||null,createdAt:x.created_at
    }))};
  }catch(error){
    console.error('Social identity registry read unavailable',error?.message||error);
    return {ready:false,accounts:[]};
  }
}
export async function handleSocialIdentityControl(request,env,actor,{existing=[]}={}){
  const url=new URL(request.url);
  if(url.pathname!==PREFIX)return null;
  if(!actor?.userId)return response({ok:false,error:'auth_required'},401);
  if(request.method==='GET'){
    const all=url.searchParams.get('scope')==='all';
    if(all&&!actor.superAdmin)return response({ok:false,error:'super_admin_required'},403);
    const links=await readLinks(env?.DB,all,actor.userId);
    const serviceConnections=all&&actor.superAdmin?existingAccounts(existing):[];
    const counts=new Map(SOCIAL_IDENTITY_PROVIDERS.map(p=>[p.id,{registered:0,existingService:0}]));
    for(const item of links.accounts)if(counts.has(item.provider))counts.get(item.provider).registered++;
    for(const item of serviceConnections)counts.get(item.provider).existingService++;
    return response({
      ok:true,policy:socialIdentityPolicy(env),storageReady:links.ready,
      ownerScope:all?'platform':'person',
      providers:SOCIAL_IDENTITY_PROVIDERS.map(p=>({...p,status:'disabled',...counts.get(p.id)})),
      accounts:links.accounts,existingServiceConnections:serviceConnections,
      note:'Metadata registration, if later enabled, creates only pending_provider_verification. No provider ownership is asserted.'
    });
  }
  if(request.method!=='POST')return response({ok:false,error:'method_not_allowed'},405);
  // No way to bypass with an admin query, a client-supplied role, or a provider name.
  if(!enabled(env))return response({ok:false,error:'social_identity_registration_disabled'},423);
  if(!env?.DB)return response({ok:false,error:'registry_storage_unavailable'},503);
  let body;
  try{body=await request.json()}catch{return response({ok:false,error:'invalid_json'},400)}
  if(!body||typeof body!=='object'||Array.isArray(body))return response({ok:false,error:'invalid_body'},400);
  // An allowlist excludes secrets, tokens, permissions, user IDs and arbitrary state.
  if(Object.keys(body).some(key=>!['provider','providerAccountId','displayName'].includes(key)))return response({ok:false,error:'unexpected_field'},400);
  const provider=trim(body.provider,30).toLowerCase();
  const providerAccountId=trim(body.providerAccountId,ACCOUNT_LIMIT);
  const displayName=trim(body.displayName,NAME_LIMIT);
  if(!PROVIDER_SET.has(provider)||!providerAccountId||!/^.{1,160}$/u.test(providerAccountId))
    return response({ok:false,error:'invalid_provider_or_identifier'},400);
  if(typeof body.providerAccountId!=='string'||body.providerAccountId.length>ACCOUNT_LIMIT)
    return response({ok:false,error:'invalid_identifier_length'},400);
  const stamp=new Date().toISOString(),id='social_'+crypto.randomUUID();
  try{
    const create=env.DB.prepare("INSERT INTO ekodi_social_account_links(id,ekodi_user_id,provider,provider_account_id,display_name,status,created_at,updated_at) VALUES(?,?,?,?,?,'pending_provider_verification',?,?)")
      .bind(id,actor.userId,provider,providerAccountId,displayName,stamp,stamp);
    const audit=env.DB.prepare("INSERT INTO ekodi_social_account_link_audit(id,link_id,actor_user_id,action,created_at) VALUES(?,?,?,'registration_pending',?)")
      .bind('socialaudit_'+crypto.randomUUID(),id,actor.userId,stamp);
    await env.DB.batch([create,audit]);
    return response({ok:true,id,status:'pending_provider_verification',provider,oauthLinked:false,autoPublishingEnabled:false},201);
  }catch(error){
    console.error('Social identity registration failed',error?.message||error);
    return response({ok:false,error:'social_identity_registration_unavailable'},503);
  }
}
