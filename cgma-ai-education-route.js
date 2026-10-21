// CGMA 상인 AI 교육 수요조사 — retired Shared Site prototype guard.
//
// Source of truth: topmaster-joseph/cheonggye-market (ai-education/, functions/api/ai-education-*.js,
// D1 cheonggye-market-notices). In production `ekodi.kr/cgma*` is owned by the `cgma-root-gateway`
// Worker, which serves that survey (with D1 persistence, admin statistics and share links).
//
// The Shared Site used to ship an anonymous, NON-persisting prototype here (2026-10-16). It was
// shadowed by the gateway, but if the gateway route were ever bypassed it would silently collect
// answers that are never stored. This module therefore never serves a survey: every request under
// the path fails closed with a no-store notice that points to the operating survey.
const PREFIX='/cgma/ai-education';
export const CGMA_AI_EDUCATION_ROUTE='cgma-ai-education-retired-prototype';
export const CGMA_AI_EDUCATION_SOURCE='topmaster-joseph/cheonggye-market';
export function isCgmaAiEducationPath(pathname){
  return pathname===PREFIX||pathname.startsWith(PREFIX+'/');
}
const NOTICE='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>설문 연결 점검 중 | 청계면상인회</title></head>'
  +'<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;line-height:1.6">'
  +'<h1 style="font-size:1.4rem">상인 AI 교육 수요조사 연결을 점검하고 있습니다</h1>'
  +'<p>응답이 저장되지 않는 화면은 제공하지 않습니다. 잠시 후 다시 접속해 주세요.</p>'
  +'<p><a href="/cgma/">청계면상인회 홈으로</a></p></body></html>';
function headers(extra={}){
  return {'cache-control':'no-store','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow',
    'x-ekodi-route':CGMA_AI_EDUCATION_ROUTE,'x-ekodi-workspace':'cgma','x-ekodi-source-of-truth':CGMA_AI_EDUCATION_SOURCE,...extra};
}
export async function routeCgmaAiEducation(request){
  const url=new URL(request.url);
  if(!isCgmaAiEducationPath(url.pathname))return null;
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:headers({allow:'GET, HEAD'})});
  // Log the path only (never query or body) so a gateway bypass is visible in Worker logs.
  console.error('[cgma-ai-education] request reached retired Shared Site guard; gateway bypass?',url.pathname.slice(0,80));
  const isDocument=url.pathname===PREFIX||url.pathname===PREFIX+'/'||url.pathname===PREFIX+'/index.html';
  if(!isDocument)return new Response('Survey is served by the CGMA gateway',{status:503,headers:headers({'content-type':'text/plain; charset=utf-8','retry-after':'300'})});
  return new Response(request.method==='HEAD'?null:NOTICE,{status:503,headers:headers({
    'content-type':'text/html; charset=utf-8','retry-after':'300',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  })});
}
