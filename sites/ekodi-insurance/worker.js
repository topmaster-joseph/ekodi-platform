const SECURITY_HEADERS={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://ekodi-insurance-api-staging.ekodi-development.workers.dev https://ekodi-insurance-api-green.topmaster-joseph.workers.dev https://insurance-api.ekodi.kr; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
};
function isProduction(env){return String(env?.ENVIRONMENT||'staging').toLowerCase()==='production';}
function withHeaders(response){
  const headers=new Headers(response.headers);
  for(const [k,v] of Object.entries(SECURITY_HEADERS))headers.set(k,v);
  if(!headers.has('cache-control'))headers.set('cache-control',response.headers.get('content-type')?.includes('text/html')?'no-store':'public, max-age=300');
  return headers;
}
function truthfulHtml(html,production=false){
  let output=html
    .replace('STAGING · LOCAL ONLY','STAGING · PRIVACY FIRST')
    .replace('현재 스테이징은 민감정보를 서버로 전송하지 않습니다. 입력 내용은 이 브라우저에만 임시 저장되며 언제든 전체 삭제할 수 있습니다.','보험목록·청구 메모·기본 AI 대화는 이 브라우저에 보관합니다. 실제 설계사 상담을 요청할 때만 이름과 연락처를 암호화해 전송하며, AI 대화 원문 공유는 별도로 선택할 수 있습니다.')
    .replace('이 스테이징 버전에서는 입력한 보험·청구·상담 정보가 EKODI 서버나 외부 분석서비스로 전송되지 않습니다. 현재 브라우저의 저장공간에만 임시 보관됩니다.','보험목록·청구 준비기록·AI 대화는 이 브라우저에 보관합니다. 설계사 상담을 요청하면 이름과 연락처만 필수동의 후 암호화해 상담대기열에 저장하며, AI 대화 원문은 별도 선택동의가 있을 때만 암호화해 공유합니다.')
    .replace('현재 단계에서는 실제 담당자에게 전송되지 않고 이 브라우저에만 임시 저장됩니다.','설계사 상담 요청 시 이름과 연락처를 암호화해 상담대기열에 저장합니다. AI 대화 원문 공유는 별도 선택사항입니다.')
    .replace('스테이징에서는 외부 전송되지 않습니다.','설계사 상담 요청 시 암호화 저장됩니다.');
  if(production){
    output=output
      .replaceAll('STAGING · PRIVACY FIRST','PRIVACY FIRST')
      .replaceAll('STAGING · LOCAL ONLY','PRIVACY FIRST')
      .replaceAll('현재 스테이징','현재 서비스')
      .replaceAll('이 스테이징 버전','현재 서비스');
  }
  return output;
}
async function secureAsset(response,production=false){
  const headers=withHeaders(response);
  if(response.headers.get('content-type')?.includes('text/html')){
    let html=truthfulHtml(await response.text(),production);
    if(!html.includes('/server-bridge.js')) html=html.replace('</head>','  <script src="/server-bridge.js" defer></script>\n</head>');
    headers.delete('content-length');
    headers.delete('etag');
    headers.set('cache-control','no-store');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function fetchAsset(request,env,pathname){
  if(!pathname)return env.ASSETS.fetch(request);
  const target=new URL(request.url);
  target.pathname=pathname;
  target.search='';
  return env.ASSETS.fetch(new Request(target.toString(),request));
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const production=isProduction(env);
    if(url.pathname==='/health')return new Response(JSON.stringify({
      ok:true,
      service:'ekodi-insurance',
      environment:production?'production':'staging',
      mode:production?'production-cloudflare-d1-free':'staging-cloudflare-d1-free',
      personalPolicyData:'browser-local',
      personalClaimData:'browser-local',
      aiConversationDefault:'browser-local',
      consultationStorage:'encrypted-d1-on-explicit-handoff',
      transcriptDefault:'not-shared',
      privacyCenter:true,
      productRecommendation:false,
      aiChat:true,
      humanHandoffQueue:true,
      adminQueue:true,
      externalAiProvider:false
    }),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...SECURITY_HEADERS}});
    if(url.pathname==='/advisor'||url.pathname==='/advisor/')return secureAsset(await fetchAsset(request,env,'/advisor.html'),production);
    if(url.pathname==='/admin'||url.pathname==='/admin/'){
      if(production)return Response.redirect('https://admin.ekodi.kr/',302);
      return secureAsset(await fetchAsset(request,env,'/admin.html'),false);
    }
    return secureAsset(await fetchAsset(request,env),production);
  }
};
