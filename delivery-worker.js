import { injectEkodiShell } from './ekodi-shell-injector.js';
import { recommendDelivery, calculateSettlement, buildOperationsBrief, evaluateProviderPolicy, buildWorkspaceModel } from './delivery/core.js';

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
function runtimeConfig(env={}){return{operationsVersion:2,dataMode:env.DATA_MODE||'isolated-staging',authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=delivery',centralIdentity:centralIdentityConfig(env),canonicalUrl:'https://ekodi.kr/delivery',accessPolicy:'public-guide-free-member-workspace',providerAdapterCount:0,providerAdapters:'official-adapters-only',executionEnabled:false,persistence:'supabase-rls-operations-v2',schemaContract:'delivery_operations_v2',aiMode:'policy-aware-provider-independent-decision-support',externalMutation:false,humanConfirmationRequired:true}}
async function assetResponse(request,env,pathname){const assetUrl=new URL(request.url);assetUrl.pathname=pathname;const assetRequest=new Request(assetUrl,{method:'GET',headers:request.headers});return env.ASSETS.fetch(assetRequest)}

export default{async fetch(request,env){
  const url=new URL(request.url);
  const pathname=featurePath(url);
  const productionHost=url.hostname==='ekodi.kr';
  const canonicalSegment=url.pathname===FEATURE_PREFIX||url.pathname.startsWith(`${FEATURE_PREFIX}/`);
  if(productionHost&&!canonicalSegment)return fetch(request);
  if(pathname==='/health')return json({ok:true,service:'ekodi-delivery-hub-ai',surface:'delivery-platform',canonicalPath:'/delivery',operationsVersion:2,dataMode:runtimeConfig(env).dataMode,accessPolicy:'public-guide-free-member-workspace',providerAdapterCount:0,executionEnabled:false,externalMutation:false,humanConfirmationRequired:true,aiMode:'policy-aware-provider-independent-decision-support',schemaContract:'delivery_operations_v2',centralIdentityEnabled:centralIdentityConfig(env).enabled,ekodiShell:true},200,env);
  if(pathname==='/config.js')return new Response(`window.EKODI_DELIVERY_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...securityHeaders(env)}});
  if(pathname==='/api/recommend'&&request.method==='POST'){const payload=await body(request);if(!payload||!Array.isArray(payload.providers))return json({ok:false,error:'providers_required'},400,env);const result=recommendDelivery(payload);return json(result,result.ok?200:422,env)}
  if(pathname==='/api/policy-evaluate'&&request.method==='POST'){const payload=await body(request);if(!payload?.provider)return json({ok:false,error:'provider_required'},400,env);return json({ok:true,...evaluateProviderPolicy(payload.provider,payload.policy||{})},200,env)}
  if(pathname==='/api/settlement-preview'&&request.method==='POST'){const payload=await body(request);if(!payload||!Array.isArray(payload.orders))return json({ok:false,error:'orders_required'},400,env);return json({ok:true,...calculateSettlement(payload.orders,payload.policy||{})},200,env)}
  if(pathname==='/api/operations-brief'&&request.method==='POST'){const payload=await body(request);if(!payload||!Array.isArray(payload.orders))return json({ok:false,error:'orders_required'},400,env);return json({ok:true,...buildOperationsBrief(payload.orders)},200,env)}
  if(pathname==='/api/workspace-model'&&request.method==='POST'){const payload=await body(request);return json({ok:true,...buildWorkspaceModel(payload||{})},200,env)}
  if(pathname==='/api/dispatch'&&request.method==='POST')return json({ok:false,reason:'official_adapter_required',executionEnabled:false,externalMutation:false,humanConfirmationRequired:true,message:'공식 배달대행 연동과 사용자 확인 전에는 외부 배차를 실행하지 않습니다.'},409,env);
  if(pathname==='/admin'||pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/',307);
  const response=await assetResponse(request,env,pathname);
  return injectEkodiShell(withHeaders(response,env),'delivery');
}};
