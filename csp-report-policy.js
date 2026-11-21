// EKODI-CSP-REPORT-001 — 공개 페이지 보안 정책 '감시 모드'(Content-Security-Policy-Report-Only)
//
// Stage 1 of tightening CSP across every Shared Site page without breaking any of them:
// documents that ship no enforcing CSP get a Report-Only policy describing the target
// baseline. Browsers keep rendering exactly as before and only *report* what the target
// policy would have blocked. Reports land in Workers Logs ("EKODI CSP report") and decide
// what the enforced policy may allow in stage 2.
//
// Quota-aware: the header is attached to a sample of page views (default 10%), the
// collector accepts small bodies only and answers 204 without touching storage.

export const CSP_REPORT_PATH='/__ekodi/csp-report';
export const CSP_REPORT_VERSION='v1';
const DEFAULT_SAMPLE=0.1;
const MAX_REPORT_BYTES=16*1024;

// Target baseline (stage 2 candidate): blocks plugins, <base> hijacking, plain-http
// subresources, javascript:/data: scripts and third-party framing. Inline code and https
// hosts stay allowed for now; reports show which hosts are really needed.
export const CSP_REPORT_ONLY_POLICY=[
  "default-src 'self' https:",
  "script-src 'self' 'unsafe-inline' https:",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "frame-ancestors 'self'",
  // report-uri only: when report-to is present Chrome ignores report-uri and batches
  // through the Reporting API (delayed, dropped in some contexts). report-uri is sent
  // immediately by Chrome, Edge, Firefox and Safari (verified 2026-11-21 in Chrome).
  `report-uri ${CSP_REPORT_PATH}`,
].join('; ');

function sampleRate(env){
  const value=Number(env?.EKODI_CSP_REPORT_SAMPLE);
  return Number.isFinite(value)&&value>=0&&value<=1?value:DEFAULT_SAMPLE;
}

/** Adds the Report-Only policy to sampled HTML documents that have no enforcing CSP. Never throws. */
export function applyCspReportOnly(response,request,env={},random=Math.random){
  try{
    if(!response)return response;
    const type=String(response.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('text/html')||response.status>=300)return response;
    if(String(request.method||'GET').toUpperCase()!=='GET')return response;
    if(response.headers.has('content-security-policy')||response.headers.has('content-security-policy-report-only'))return response;
    if(random()>=sampleRate(env))return response;
    const headers=new Headers(response.headers);
    headers.set('Content-Security-Policy-Report-Only',CSP_REPORT_ONLY_POLICY);
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }catch(error){
    console.error('EKODI CSP report-only skipped',error);
    return response;
  }
}

function originOf(value){
  const text=String(value||'');
  if(!text||/^(inline|eval|self|data|blob|wasm-eval|trusted-types-[a-z-]+)$/i.test(text))return text.slice(0,40);
  try{return new URL(text).origin;}catch{return text.slice(0,40);}
}
function pathOf(value){try{return new URL(String(value||'')).pathname.slice(0,120);}catch{return '';}}

/** Normalizes legacy (application/csp-report) and Reporting API (application/reports+json) bodies. */
export function summarizeCspReports(payload){
  const list=Array.isArray(payload)?payload:[payload];
  const out=[];
  for(const item of list.slice(0,20)){
    const body=item?.['csp-report']||(item?.type==='csp-violation'?item.body:null);
    if(!body||typeof body!=='object')continue;
    out.push({
      directive:String(body['effective-directive']||body.effectiveDirective||body['violated-directive']||'').split(' ')[0].slice(0,40),
      blocked:originOf(body['blocked-uri']||body.blockedURL),
      page:pathOf(body['document-uri']||body.documentURL||item?.url),
      disposition:String(body.disposition||'report').slice(0,10),
    });
  }
  return out;
}

/** Collector: POST /__ekodi/csp-report → 204. Logs only aggregated, privacy-safe fields. */
export async function handleCspReport(request){
  const method=String(request.method||'GET').toUpperCase();
  if(method!=='POST')return new Response(null,{status:405,headers:{allow:'POST','cache-control':'no-store'}});
  const type=String(request.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('application/csp-report')&&!type.includes('application/reports+json')&&!type.includes('application/json'))return new Response(null,{status:415,headers:{'cache-control':'no-store'}});
  const length=Number(request.headers.get('content-length')||0);
  if(length>MAX_REPORT_BYTES)return new Response(null,{status:413,headers:{'cache-control':'no-store'}});
  const text=(await request.text().catch(()=>'')).slice(0,MAX_REPORT_BYTES);
  let payload=null;
  try{payload=JSON.parse(text);}catch{}
  const reports=payload?summarizeCspReports(payload):[];
  for(const report of reports)console.warn('EKODI CSP report',report);
  return new Response(null,{status:204,headers:{'cache-control':'no-store','x-ekodi-route':'csp-report'}});
}

export function isCspReportPath(pathname=''){return String(pathname||'')===CSP_REPORT_PATH;}
