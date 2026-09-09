import { injectEkodiShell } from './ekodi-shell-injector.js';
import { recommendDelivery, calculateSettlement, buildOperationsBrief } from './delivery/core.js';
import { discoverStores, storeDiscoveryProviderStatus } from './delivery/store-resolver.js';

const FEATURE_PREFIX='/delivery';
function featurePath(url){
  if(url.pathname===FEATURE_PREFIX||url.pathname===`${FEATURE_PREFIX}/`)return '/';
  if(url.pathname.startsWith(`${FEATURE_PREFIX}/`))return url.pathname.slice(FEATURE_PREFIX.length)||'/';
  return url.pathname;
}
function centralIdentityConfig(env={}){
  const production=(env.DATA_MODE||'isolated-staging')==='production';
  const supabaseUrl=production?String(env.SUPABASE_URL||''):'';
  const publishableKey=production?String(env.SUPABASE_PUBLISHABLE_KEY||''):'';
  const enabled=Boolean(production&&supabaseUrl&&publishableKey);
  return{
    enabled,
    authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=delivery',
    supabaseUrl:enabled?supabaseUrl:'',
    publishableKey:enabled?publishableKey:'',
    profileApi:enabled?`${supabaseUrl.replace(/\/$/,'')}/functions/v1/profile-api`:'',
    disabledReason:production?'중앙 로그인 연결을 확인할 수 없습니다.':'격리 스테이징은 실제 회원 데이터를 읽지 않습니다.',
  };
}
function securityHeaders(env={}){
  const identity=centralIdentityConfig(env);
  const scriptSrc=["'self'"];
  const connectSrc=["'self'"];
  if(identity.enabled){
    scriptSrc.push('https://cdn.jsdelivr.net','https://esm.sh');
    try{connectSrc.push(new URL(identity.supabaseUrl).origin)}catch{}
  }
  return{
    'x-content-type-options':'nosniff',
    'referrer-policy':'strict-origin-when-cross-origin',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':`default-src 'self'; script-src ${scriptSrc.join(' ')}; style-src 'self'; img-src 'self' data: https:; connect-src ${connectSrc.join(' ')}; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://auth.ekodi.kr; object-src 'none'; upgrade-insecure-requests`,
  };
}
function json(data,status=200,env={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}})}
function withHeaders(response,env={}){const headers=new Headers(response.headers);for(const[key,value]of Object.entries(securityHeaders(env)))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function body(request){try{return await request.json()}catch{return null}}
function bearer(request){const value=String(request.headers.get('authorization')||'').trim();return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():''}
async function requireMember(request,env){
  const identity=centralIdentityConfig(env);const token=bearer(request);
  if(!identity.enabled)return{error:json({ok:false,error:'identity_unavailable'},503,env)};
  if(!token)return{error:json({ok:false,error:'authentication_required'},401,env)};
  const response=await fetch(`${identity.supabaseUrl.replace(/\/$/,'')}/auth/v1/user`,{headers:{apikey:identity.publishableKey,authorization:`Bearer ${token}`,accept:'application/json'},cache:'no-store'});
  const user=await response.json().catch(()=>({}));
  if(!response.ok||!user?.id)return{error:json({ok:false,error:'invalid_session'},401,env)};
  return{user:{id:String(user.id),email:String(user.email||'')}};
}
function runtimeConfig(env={}){const providers=storeDiscoveryProviderStatus(env);return{dataMode:env.DATA_MODE||'isolated-staging',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=delivery',centralIdentity:centralIdentityConfig(env),canonicalUrl:'https://ekodi.kr/delivery',accessPolicy:'public-guide-free-member-workspace',providerAdapterCount:providers.filter(item=>item.configured).length,providerAdapters:'official-or-approved-adapters-only',storeResolver:{version:'10g-preview',providers},executionEnabled:false,persistence:'browser-local-non-sensitive-mvp',aiMode:'provider-independent-decision-support',externalMutation:false,humanConfirmationRequired:true}}
async function assetResponse(request,env,pathname){const assetUrl=new URL(request.url);assetUrl.pathname=pathname;const assetRequest=new Request(assetUrl,{method:'GET',headers:request.headers});return env.ASSETS.fetch(assetRequest)}

export default{async fetch(request,env){
  const url=new URL(request.url);
  const pathname=featurePath(url);
  const productionHost=url.hostname==='ekodi.kr';
  const canonicalSegment=url.pathname===FEATURE_PREFIX||url.pathname.startsWith(`${FEATURE_PREFIX}/`);
  if(productionHost&&!canonicalSegment)return fetch(request);
  if(pathname==='/health'){const cfg=runtimeConfig(env);return json({ok:true,service:'ekodi-delivery-hub-ai',surface:'delivery-platform',canonicalPath:'/delivery',dataMode:cfg.dataMode,accessPolicy:cfg.accessPolicy,providerAdapterCount:cfg.providerAdapterCount,storeResolver:cfg.storeResolver,executionEnabled:false,externalMutation:false,humanConfirmationRequired:true,aiMode:'provider-independent-decision-support',centralIdentityEnabled:centralIdentityConfig(env).enabled,ekodiShell:true},200,env);}
  if(pathname==='/config.js')return new Response(`window.EKODI_DELIVERY_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}});
  if(pathname==='/api/store-resolver/providers'&&request.method==='GET')return json({ok:true,providers:storeDiscoveryProviderStatus(env),externalMutation:false},200,env);
  if(pathname==='/api/store-resolver/discover'&&request.method==='POST'){const member=await requireMember(request,env);if(member.error)return member.error;const payload=await body(request);if(!payload?.name)return json({ok:false,error:'store_name_required'},400,env);const result=await discoverStores(payload,env);return json({...result,member:{id:member.user.id}},result.ok?200:422,env);}
  if(pathname==='/api/recommend'&&request.method==='POST'){const payload=await body(request);if(!payload||!Array.isArray(payload.providers))return json({ok:false,error:'providers_required'},400,env);const result=recommendDelivery(payload);return json(result,result.ok?200:422,env)}
  if(pathname==='/api/settlement-preview'&&request.method==='POST'){const payload=await body(request);if(!payload||!Array.isArray(payload.orders))return json({ok:false,error:'orders_required'},400,env);return json({ok:true,...calculateSettlement(payload.orders)},200,env)}
  if(pathname==='/api/operations-brief'&&request.method==='POST'){const payload=await body(request);if(!payload||!Array.isArray(payload.orders))return json({ok:false,error:'orders_required'},400,env);return json({ok:true,...buildOperationsBrief(payload.orders)},200,env)}
  if(pathname==='/api/dispatch'&&request.method==='POST')return json({ok:false,reason:'official_adapter_required',executionEnabled:false,externalMutation:false,humanConfirmationRequired:true,message:'공식 배달대행 연동과 사용자 확인 전에는 외부 배차를 실행하지 않습니다.'},409,env);
  if(pathname==='/admin'||pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/',307);
  const response=await assetResponse(request,env,pathname);
  return injectEkodiShell(withHeaders(response,env),'delivery');
}};
