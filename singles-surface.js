// EKODI Singles M1 — public-first surface. Private enrollment stays disabled without legal+release approval.
// This module never reads or stores faith data itself. Authenticated writes are forwarded only after the M1 gate.
const PREFIX='/singles';
const PUBLIC_PAGES=new Set(['','/','/groups','/events','/discover','/messages','/my']);
const PRIVATE_PATHS=new Set(['/discover','/messages','/my']);
const SAFE_METHODS=new Set(['GET','HEAD']);

function headers(type='text/html; charset=utf-8',privateContent=false){
  const h=new Headers({
    'content-type':type,
    'cache-control':privateContent?'private, no-store':'public, max-age=60',
    'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'content-security-policy':"default-src 'none'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
    'x-ekodi-singles-stage':'m1-gated',
  });
  if(privateContent)h.set('x-robots-tag','noindex, nofollow, noarchive');
  return h;
}
function json(data,status=200,privateContent=true){
  return new Response(JSON.stringify(data),{status,headers:headers('application/json; charset=utf-8',privateContent)});
}
function html(body,{privateContent=false,status=200,head=false}={}){
  const h=headers('text/html; charset=utf-8',privateContent);
  return new Response(head?null:body,{status,headers:h});
}
function pathAfterSingles(pathname){
  if(pathname===PREFIX)return '';
  if(!pathname.startsWith(PREFIX+'/'))return null;
  return pathname.slice(PREFIX.length).replace(/\/+$/,'')||'/';
}
export function isSinglesRoute(pathname){return pathAfterSingles(String(pathname||''))!==null}
function isEnabled(env){return env?.SINGLES_M1_ENABLED==='true'&&Boolean(env?.SINGLES_API_URL)&&Boolean(env?.SUPABASE_URL)&&Boolean(env?.SUPABASE_PUBLISHABLE_KEY)}
function configuredOrigin(raw){
  try{const u=new URL(String(raw||''));return u.protocol==='https:'?u:null}catch{return null}
}
function status(env){
  const active=isEnabled(env);
  return {service:'ekodi-singles',name:'EKODI 동행',phase:active?'enrollment-preview':'preparing',onboarding_enabled:active,matching_enabled:false,messaging_enabled:false,paid_brokerage_enabled:false,events:[],identity_provider:'ekodi',...(active?{auth:{supabase_url:env.SUPABASE_URL,publishable_key:env.SUPABASE_PUBLISHABLE_KEY}}:{})};
}
async function api(req,env,sub){
  if(sub==='/api/status'&&SAFE_METHODS.has(req.method))return json(status(env));
  if(sub==='/api/public'&&SAFE_METHODS.has(req.method))return json({events:[],groups:[],source:'no-published-records'},200,false);
  if(!sub.startsWith('/api/'))return null;
  if(!isEnabled(env))return json({error:'singles_enrollment_not_launched'},503);
  if(!configuredOrigin(env.SINGLES_API_URL))return json({error:'singles_api_configuration_invalid'},503);
  if(!['GET','PUT','DELETE'].includes(req.method))return json({error:'method_not_allowed'},405);
  if(!['/api/me','/api/withdraw'].includes(sub))return json({error:'not_found'},404);
  if(!req.headers.get('authorization')?.startsWith('Bearer '))return json({error:'unauthorized'},401);
  if(req.method!=='GET'){
    const origin=req.headers.get('origin');
    if(origin!==new URL(req.url).origin)return json({error:'invalid_origin'},403);
    const ct=req.headers.get('content-type')||'';
    if(req.method==='PUT'&&!/^application\/json(?:\s*;|$)/i.test(ct))return json({error:'invalid_content_type'},415);
  }
  const target=new URL(env.SINGLES_API_URL);
  // Only the narrow approved route set can be forwarded; no arbitrary upstream URL.
  target.pathname=target.pathname.replace(/\/+$/,'')+(sub==='/api/me'?'/me':'/withdraw');
  const upstream=new Request(target,{method:req.method,headers:{
    'authorization':req.headers.get('authorization'),
    'apikey':env.SUPABASE_PUBLISHABLE_KEY,
    'content-type':'application/json',
    'x-ekodi-service':'singles',
  },body:req.method==='PUT'?req.body:undefined,redirect:'manual'});
  const result=await fetch(upstream);
  const responseHeaders=headers('application/json; charset=utf-8',true);
  if(result.headers.get('retry-after'))responseHeaders.set('retry-after',result.headers.get('retry-after'));
  return new Response(result.body,{status:result.status,headers:responseHeaders});
}
function page(label='처음'){
  const titleMap={'':'처음','/':'처음','/discover':'동행 찾기','/groups':'우리 모임','/events':'행사','/messages':'메시지','/my':'나의 동행'};
  const p=Object.keys(titleMap).find(key=>titleMap[key]===label)||'';
  const active=titleMap[p]||'처음';
  const nav=[['/singles','처음'],['/singles/discover','동행 찾기'],['/singles/groups','우리 모임'],['/singles/events','행사'],['/singles/messages','메시지'],['/singles/my','나의 동행']];
  const links=nav.map(([href,name])=>'<a href="'+href+'"'+(active===name?' aria-current="page"':'')+'>'+name+'</a>').join('');
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="신앙과 삶의 가치를 나누는 크리스천 싱글 공동체, EKODI 동행"><meta name="theme-color" content="#ffffff"><title>'+active+' · EKODI 동행</title><link rel="stylesheet" href="/singles/styles.css"><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2" defer></script><script src="/singles/app.js" defer></script></head><body data-page="'+p+'"><a class="skip" href="#main">본문 바로가기</a><header class="mast"><div class="mast-inner"><a class="logo" href="/singles"><strong>EKODI</strong><span>동행</span></a><nav aria-label="주요 메뉴">'+links+'</nav><a class="account" href="/singles/my">나의 동행</a></div></header><main id="main"><section class="intro"><p class="eyebrow">FAITH · COMMUNITY · RELATIONSHIP</p><h1>같은 믿음, 서로 다른 삶.<span> 함께 걸을 수 있는 만남.</span></h1><p class="lead">신앙과 삶의 가치를 나누는 공동체에서 친구가 되고, 서로를 알아가고, 자신의 선택으로 진지한 교제와 결혼을 준비합니다.</p><div class="actions"><a class="primary" href="/singles/my">나의 동행 시작하기</a><a class="outline" href="/singles/events">공개 행사 살펴보기</a></div></section><section class="pillars" aria-label="연결 방식"><article><small>01 · COMMUNITY</small><h2>공동체</h2><p>말씀과 일상을 나누는 작고 안전한 모임</p></article><article><small>02 · RELATIONSHIP</small><h2>교제</h2><p>서로의 선택과 동의로 알아가는 관계</p></article><article><small>03 · MARRIAGE</small><h2>결혼</h2><p>강요 없이 삶의 방향을 함께 분별하는 만남</p></article></section><section class="content" id="content" aria-live="polite"><div class="section-heading"><div><p class="eyebrow">EKODI 동행</p><h2 id="sectionTitle">'+active+'</h2></div><span class="stage" id="serviceStage">서비스 준비 중</span></div><div id="publicPanel" class="panel"><p id="contentDescription">이 공간은 개인정보를 공개하지 않고 서비스의 방향과 안전 기준을 안내합니다.</p><div id="publicList" class="empty" hidden></div></div><div id="enrollmentPanel" class="panel" hidden><p class="muted">가입과 민감정보 이용에 관한 동의는 각각 분리됩니다. 공개 설정은 처음부터 꺼져 있습니다.</p><div id="accountStatus" role="status"></div><button id="loginButton" class="primary" type="button">EKODI Google로 시작</button><form id="consentForm" hidden><fieldset><legend>기본 참여 의사</legend><label><input name="adult" type="checkbox" required> 본인은 만 19세 이상임을 확인합니다(자기확인, 본인인증 아님).</label><label><input name="base" type="checkbox" required> 서비스 이용 및 필수 개인정보 처리 안내를 확인하고 동의합니다.</label></fieldset><fieldset><legend>선택 동의</legend><label><input name="sensitive" type="checkbox"> 신앙·신념에 관한 민감정보 처리에 별도로 동의합니다(선택).</label><label><input name="marriage" type="checkbox"> 결혼 목적 연결을 원합니다(선택, 추천 기능은 현재 비활성).</label></fieldset><button class="primary" type="submit">내 참여 의사 저장</button><button class="outline" id="withdrawButton" type="button">동의 철회 및 참여 중단</button><p class="muted">개인별 공개/추천·대화는 별도 본인확인과 서비스 검수를 통과하기 전까지 작동하지 않습니다.</p></form><p id="enrollmentMessage" role="status"></p></div></section><section class="safety"><h2>사람을 점수로 평가하지 않습니다</h2><p>동행은 호감이나 결혼을 강요하지 않습니다. 공개 여부는 본인이 정하며, 서로 동의하기 전에는 대화하거나 연락처를 볼 수 없습니다. 교회나 운영자에게 사적인 교제 내역을 자동 공개하지 않습니다.</p></section></main><footer><p><strong>EKODI 동행</strong><span>서로의 존엄을 지키는 연결</span></p><a href="https://ekodi.kr/privacy">개인정보 보호</a><a href="https://ekodi.kr/terms">이용약관</a></footer></body></html>';
}
export async function routeSinglesSurface(request,env){
  const url=new URL(request.url);
  const sub=pathAfterSingles(url.pathname);
  if(sub===null)return null;
  if(sub==='/styles.css'||sub==='/app.js'){
    if(!SAFE_METHODS.has(request.method))return json({error:'method_not_allowed'},405);
    return env.ASSETS.fetch(request);
  }
  const fromApi=await api(request,env,sub);
  if(fromApi)return fromApi;
  if(!SAFE_METHODS.has(request.method))return json({error:'method_not_allowed'},405);
  if(sub==='/admin')return json({error:'admin_unavailable_until_authorization_is_wired'},404);
  if(!PUBLIC_PAGES.has(sub))return json({error:'not_found'},404);
  const names={'':'처음','/':'처음','/groups':'우리 모임','/events':'행사','/discover':'동행 찾기','/messages':'메시지','/my':'나의 동행'};
  return html(page(names[sub]),{privateContent:PRIVATE_PATHS.has(sub),head:request.method==='HEAD'});
}
