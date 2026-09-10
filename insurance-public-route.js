import { injectEkodiShell } from './ekodi-shell-injector.js';

const PREFIX='/insurance';
const STATIC_ASSETS=new Set([
  'styles.css','privacy.css','app.js','server-bridge.js',
  'advisor.css','advisor.js'
]);
const SECURITY_HEADERS=Object.freeze({
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://insurance-api.ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
});

export function isInsurancePublicPath(pathname){
  const path=String(pathname||'');
  return path===PREFIX||path.startsWith(`${PREFIX}/`);
}

export function insuranceAssetPath(pathname){
  const path=String(pathname||'');
  // Cloudflare Static Assets canonicalizes explicit *.html requests with a 307.
  // Ask the binding for the extensionless public URL so the Worker receives the
  // actual HTML response instead of forwarding an asset-layer redirect.
  if(path===PREFIX||path===`${PREFIX}/`)return `${PREFIX}/`;
  if(path===`${PREFIX}/advisor`||path===`${PREFIX}/advisor/`)return `${PREFIX}/advisor`;
  const match=new RegExp(`^${PREFIX}/([^/]+)$`).exec(path);
  return match&&STATIC_ASSETS.has(match[1])?path:null;
}

function truthifyAndPrefix(html,production){
  let output=String(html||'')
    .replaceAll('="/styles.css"','="/insurance/styles.css"')
    .replaceAll('="/privacy.css"','="/insurance/privacy.css"')
    .replaceAll('="/app.js"','="/insurance/app.js"')
    .replaceAll('="/advisor.css"','="/insurance/advisor.css"')
    .replaceAll('="/advisor.js"','="/insurance/advisor.js"')
    .replaceAll('href="/"','href="/insurance"')
    .replaceAll('href="/#privacy"','href="/insurance#privacy"')
    .replace('STAGING · LOCAL ONLY','STAGING · PRIVACY FIRST')
    .replace('현재 스테이징은 민감정보를 서버로 전송하지 않습니다. 입력 내용은 이 브라우저에만 임시 저장되며 언제든 전체 삭제할 수 있습니다.','보험목록·청구 메모·기본 AI 대화는 이 브라우저에 보관합니다. 실제 설계사 상담을 요청할 때만 이름과 연락처를 암호화해 전송하며, AI 대화 원문 공유는 별도로 선택할 수 있습니다.')
    .replace('이 스테이징 버전에서는 입력한 보험·청구·상담 정보가 EKODI 서버나 외부 분석서비스로 전송되지 않습니다. 현재 브라우저의 저장공간에만 임시 보관됩니다.','보험목록·청구 준비기록·AI 대화는 이 브라우저에 보관합니다. 설계사 상담을 요청하면 이름과 연락처만 필수동의 후 암호화해 상담대기열에 저장하며, AI 대화 원문은 별도 선택동의가 있을 때만 암호화해 공유합니다.')
    .replace('현재 단계에서는 실제 담당자에게 전송되지 않고 이 브라우저에만 임시 저장됩니다.','설계사 상담 요청 시 이름과 연락처를 암호화해 상담대기열에 저장합니다. AI 대화 원문 공유는 별도 선택사항입니다.')
    .replace('스테이징에서는 외부 전송되지 않습니다.','설계사 상담 요청 시 암호화 저장됩니다.');
  if(!output.includes('/insurance/server-bridge.js'))output=output.replace('</head>','  <script src="/insurance/server-bridge.js" defer></script>\n</head>');
  if(production)output=output.replaceAll('STAGING · PRIVACY FIRST','PRIVACY FIRST').replaceAll('STAGING · LOCAL ONLY','PRIVACY FIRST').replaceAll('현재 스테이징','현재 서비스').replaceAll('이 스테이징 버전','현재 서비스');
  return output;
}

function securedHeaders(response,html){
  const headers=new Headers(response.headers);
  for(const [name,value] of Object.entries(SECURITY_HEADERS))headers.set(name,value);
  headers.set('cache-control',html?'no-store':'public, max-age=300');
  headers.set('x-ekodi-route','public-insurance');
  headers.set('x-ekodi-insurance-scope','public-service');
  return headers;
}

function assetRequest(request,pathname){
  const target=new URL(request.url);
  target.pathname=pathname;
  target.search='';
  return new Request(target.toString(),request);
}

export async function routeInsurancePublic(request,env){
  const url=new URL(request.url);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  if(url.pathname===`${PREFIX}/admin`||url.pathname===`${PREFIX}/admin/`){
    return new Response(null,{status:302,headers:{location:'https://ekodi.kr/admin/services/insurance','cache-control':'no-store','x-ekodi-route':'insurance-admin-handoff'}});
  }
  if(url.pathname===`${PREFIX}/health`){
    return new Response(JSON.stringify({ok:true,service:'ekodi-insurance',surface:'public',canonical:'https://ekodi.kr/insurance'}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-ekodi-route':'public-insurance-health','x-content-type-options':'nosniff'}});
  }
  const assetPath=insuranceAssetPath(url.pathname);
  if(!assetPath)return new Response('Not Found',{status:404,headers:{'cache-control':'no-store','x-ekodi-route':'public-insurance'}});
  if(!env?.ASSETS?.fetch)return new Response('Insurance service unavailable',{status:503,headers:{'cache-control':'no-store','x-ekodi-route':'public-insurance'}});
  const upstream=await env.ASSETS.fetch(assetRequest(request,assetPath));
  const isHtml=String(upstream.headers.get('content-type')||'').toLowerCase().includes('text/html');
  const headers=securedHeaders(upstream,isHtml);
  if(!isHtml)return new Response(upstream.body,{status:upstream.status,statusText:upstream.statusText,headers});
  const production=String(env?.ENVIRONMENT||'production').toLowerCase()==='production';
  const html=truthifyAndPrefix(await upstream.text(),production);
  headers.delete('content-length');headers.delete('etag');
  return injectEkodiShell(new Response(request.method==='HEAD'?null:html,{status:upstream.status,statusText:upstream.statusText,headers}),'insurance','public');
}
