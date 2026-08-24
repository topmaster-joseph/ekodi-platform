import { injectEkodiShell } from './ekodi-shell-injector.js';
import { buildFinancialCleanupBrief, requiresHumanGate } from './money/core.js';

const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests"
};
const SENSITIVE_KEYS=new Set(['accountnumber','account_number','residentnumber','rrn','ssn','password','pin','cardnumber','card_number','cvc','cvv','access_token','refresh_token']);
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}})}
function withHeaders(response){const headers=new Headers(response.headers);for(const[key,value]of Object.entries(SECURITY_HEADERS))headers.set(key,value);if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-cache':'public, max-age=300');return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function body(request){try{return await request.json()}catch{return null}}
function hasSensitiveKeys(value){if(!value||typeof value!=='object')return false;if(Array.isArray(value))return value.some(hasSensitiveKeys);return Object.entries(value).some(([key,item])=>SENSITIVE_KEYS.has(String(key).toLowerCase())||hasSensitiveKeys(item))}
function runtimeConfig(env){return{
  dataMode:env.DATA_MODE||'isolated-staging',
  authUrl:env.AUTH_URL||'https://auth.ekodi.kr/?site=money',
  officialHandoffUrl:env.ACCOUNTINFO_URL||'https://www.payinfo.or.kr/main/main.do',
  financialExecution:false,
  autonomousFinancialExecution:false,
  humanGateRequired:true,
  sensitiveCredentialCollection:false,
  persistence:'none-v1',
  apiStatus:'planning-and-handoff'
}}
export default{async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health')return json({ok:true,service:'ekodi-money',surface:'money-platform',...runtimeConfig(env),ekodiShell:true});
  if(url.pathname==='/config.js')return new Response(`window.EKODI_MONEY_CONFIG=${JSON.stringify(runtimeConfig(env))};`,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
  if(url.pathname==='/api/analyze'&&request.method==='POST'){
    const p=await body(request);if(!p||!Array.isArray(p.accounts))return json({error:'accounts_required'},400);if(hasSensitiveKeys(p))return json({error:'sensitive_financial_identifiers_not_accepted',message:'계좌번호·주민번호·비밀번호·카드번호 등 민감 식별정보는 EKODI Money V1 분석 API에 보내지 마세요.'},400);return json(buildFinancialCleanupBrief(p.accounts,p.targetAccountId||''));
  }
  if(url.pathname==='/api/action-gate'&&request.method==='POST'){
    const p=await body(request);const action=p?.action||'';return json({action,humanGateRequired:requiresHumanGate(action),allowedAutonomously:!requiresHumanGate(action),financialExecution:false});
  }
  if(url.pathname==='/api/execution'&&request.method==='POST')return json({error:'financial_execution_disabled',humanGateRequired:true,officialHandoffUrl:runtimeConfig(env).officialHandoffUrl},409);
  if(url.pathname==='/admin'||url.pathname==='/admin/')return Response.redirect('https://admin.ekodi.kr/',307);
  const response=await env.ASSETS.fetch(request);return injectEkodiShell(withHeaders(response),'money');
}};
