import { injectEkodiShell } from './ekodi-shell-injector.js';
import { buildFinancialCleanupBrief, requiresHumanGate } from './money/core.js';
import { buildConsentPreview, buildIntegrationReadiness, providerFor, securityEvent } from './money/integrations.js';

const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
};
const SENSITIVE_KEYS=new Set(['accountnumber','account_number','residentnumber','rrn','ssn','password','pin','cardnumber','card_number','cvc','cvv','access_token','refresh_token','client_secret']);
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const[key,value]of Object.entries(SECURITY_HEADERS))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function body(request){try{return await request.json()}catch{return null}}
function hasSensitiveKeys(value){if(!value||typeof value!=='object')return false;if(Array.isArray(value))return value.some(hasSensitiveKeys);return Object.entries(value).some(([key,item])=>SENSITIVE_KEYS.has(String(key).toLowerCase())||hasSensitiveKeys(item))}
function runtimeConfig(env){const readiness=buildIntegrationReadiness(env);return{
  dataMode:env.DATA_MODE||'isolated-staging',
  authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=money',
  myUrl:'https://my.ekodi.kr/',
  officialHandoffUrl:env.ACCOUNTINFO_URL||'https://www.payinfo.or.kr/main/main.do',
  financialExecution:false,
  autonomousFinancialExecution:false,
  humanGateRequired:true,
  sensitiveCredentialCollection:false,
  persistence:'none-v2-readiness',
  apiStatus:'integration-readiness',
  integrationVersion:readiness.version,
  openBankingConfigured:readiness.openBankingConfigured
}}
function logSecurity(type,detail={}){console.log(JSON.stringify(securityEvent(type,detail)));}
export default{async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return json({ok:true,service:'ekodi-money',surface:'money-platform',...runtimeConfig(env),ekodiShell:true});
  if(url.pathname==='/config.js')return new Response(`window.EKODI_MONEY_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
  if(url.pathname==='/api/integrations'&&request.method==='GET')return json(buildIntegrationReadiness(env));
  if(url.pathname==='/api/consent/preview'&&request.method==='POST'){
    const p=await body(request);if(!p||hasSensitiveKeys(p))return json({error:'invalid_or_sensitive_consent_payload'},400);
    const preview=buildConsentPreview(p.providerId,p.scopes);if(!preview.ok)return json(preview,404);
    logSecurity('consent-previewed',{providerId:p.providerId,scopes:preview.scopes});
    return json(preview);
  }
  if(url.pathname==='/api/consent/revoke'&&request.method==='POST'){
    const p=await body(request);if(!p||hasSensitiveKeys(p))return json({error:'invalid_or_sensitive_revoke_payload'},400);
    const provider=providerFor(p.providerId);if(!provider)return json({error:'provider_not_found'},404);
    logSecurity('consent-revocation-requested',{providerId:provider.id});
    return json({ok:true,providerId:provider.id,revoked:true,activeConnection:false,persistence:'none-v2-readiness',message:'현재 V2 준비단계에는 영구 저장된 금융 연결정보가 없어 즉시 비활성 상태로 확인됩니다.'});
  }
  if(url.pathname==='/api/connect/begin'&&request.method==='POST'){
    const p=await body(request);if(!p||hasSensitiveKeys(p))return json({error:'invalid_or_sensitive_connection_payload'},400);
    const provider=providerFor(p.providerId);if(!provider)return json({error:'provider_not_found'},404);
    const readiness=buildIntegrationReadiness(env);
    const current=readiness.providers.find(item=>item.id===provider.id);
    logSecurity('connection-begin-requested',{providerId:provider.id,scopes:p.scopes});
    if(provider.id==='accountinfo')return json({ok:true,mode:'official-handoff',providerId:provider.id,url:runtimeConfig(env).officialHandoffUrl,humanGateRequired:true});
    return json({ok:false,error:'provider_not_live',providerId:provider.id,state:current?.state||provider.state,contractRequired:provider.contractRequired,message:'이 연동은 정식 이용기관 계약·보안검토·사용자 동의 인프라가 완료된 뒤 활성화됩니다.'},503);
  }
  if(url.pathname==='/api/analyze'&&request.method==='POST'){
    const p=await body(request);if(!p||!Array.isArray(p.accounts))return json({error:'accounts_required'},400);if(hasSensitiveKeys(p))return json({error:'sensitive_financial_identifiers_not_accepted',message:'계좌번호·주민번호·비밀번호·카드번호 등 민감 식별정보는 EKODI Money 분석 API에 보내지 마세요.'},400);return json(buildFinancialCleanupBrief(p.accounts,p.targetAccountId||''));
  }
  if(url.pathname==='/api/action-gate'&&request.method==='POST'){
    const p=await body(request);const action=p?.action||'';return json({action,humanGateRequired:requiresHumanGate(action),allowedAutonomously:!requiresHumanGate(action),financialExecution:false});
  }
  if(url.pathname==='/api/execution'&&request.method==='POST'){logSecurity('blocked-financial-execution',{action:'execution'});return json({error:'financial_execution_disabled',humanGateRequired:true,officialHandoffUrl:runtimeConfig(env).officialHandoffUrl},409);}
  if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/?focus=money',307);
  const response=await env.ASSETS.fetch(request);return injectEkodiShell(withHeaders(response),'money');
}};
