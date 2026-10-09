// EKODI 동행: pastel community UI + fail-closed subscription and identity boundaries.
const PREFIX='/singles';
const PUBLIC_PAGES=new Set(['','/','/groups','/events','/discover','/messages','/my','/subscribe','/admin']);
const PRIVATE_PATHS=new Set(['/discover','/messages','/my','/events','/groups','/subscribe','/admin']);
const SAFE_METHODS=new Set(['GET','HEAD']);
function headers(type='text/html; charset=utf-8',isPrivate=false){
 const h=new Headers({'content-type':type,'cache-control':isPrivate?'private, no-store':'public, max-age=60',
 'referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-frame-options':'DENY',
 'permissions-policy':'camera=(), microphone=(), geolocation=()',
 'content-security-policy':"default-src 'none'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'; img-src 'self' data:; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
 'x-ekodi-singles-stage':'social-gated'});
 if(isPrivate)h.set('x-robots-tag','noindex, nofollow, noarchive');return h;
}
function json(data,status=200,isPrivate=true){return new Response(JSON.stringify(data),{status,headers:headers('application/json; charset=utf-8',isPrivate)})}
function html(body,{privateContent=false,status=200,head=false}={}){return new Response(head?null:body,{status,headers:headers('text/html; charset=utf-8',privateContent)})}
function pathAfterSingles(pathname){if(pathname===PREFIX)return '';if(!pathname.startsWith(PREFIX+'/'))return null;return pathname.slice(PREFIX.length).replace(/\/+$/,'')||'/'}
export function isSinglesRoute(pathname){return pathAfterSingles(String(pathname||''))!==null}
function enabled(env){return env?.SINGLES_M1_ENABLED==='true'&&Boolean(env?.SINGLES_API_URL)&&Boolean(env?.SUPABASE_URL)&&Boolean(env?.SUPABASE_PUBLISHABLE_KEY)}
function socialEnabled(env){return enabled(env)&&env?.SINGLES_SOCIAL_ENABLED==='true'}
function paymentEnabled(env){return socialEnabled(env)&&env?.SINGLES_PAID_ACTIONS_ENABLED==='true'}
function bankEnabled(env){return socialEnabled(env)&&env?.SINGLES_BANK_TRANSFER_ENABLED==='true'}
function bankVerifyEnabled(env){return bankEnabled(env)&&env?.SINGLES_BANK_VERIFICATION_ENABLED==='true'}
function configuredOrigin(raw){try{const u=new URL(String(raw||''));return u.protocol==='https:'?u:null}catch{return null}}
function status(env){const active=enabled(env);return{
 service:'ekodi-singles',name:'EKODI 동행',phase:active?'enrollment-preview':'preparing',
 onboarding_enabled:active,social_enabled:socialEnabled(env),paid_actions_enabled:paymentEnabled(env),
 matching_enabled:false,messaging_enabled:socialEnabled(env),messages_are_free:true,paid_brokerage_enabled:false,
 bank_transfer_enabled:bankEnabled(env),bank_verification_enabled:bankVerifyEnabled(env),consulting_optional:true,
 events:[],identity_provider:'ekodi',
 ...(active?{auth:{supabase_url:env.SUPABASE_URL,publishable_key:env.SUPABASE_PUBLISHABLE_KEY}}:{})
}}
function allowApi(path,method){
 if(path==='/api/me'&&['GET','PUT'].includes(method))return ['/me',false];
 if(path==='/api/withdraw'&&method==='DELETE')return ['/withdraw',false];
 if(path==='/api/profile'&&['GET','PUT'].includes(method))return ['/profile',true];
 if(path==='/api/discover'&&method==='GET')return ['/discover',true];
 if(path==='/api/subscription'&&method==='GET')return ['/subscription',true];
 for(const [endpoint,methods] of [
  ['/api/bank/plans',['GET']],['/api/bank/orders',['GET','POST']],
  ['/api/bank/admin/orders',['GET']],['/api/bank/admin/config',['GET','PUT']],['/api/bank/consulting/requests',['GET','POST']]]){
   if(path===endpoint&&methods.includes(method))return [path.slice(4),true];
 }
 const memberCheck=path.match(/^\/api\/bank\/orders\/(EDH-[A-F0-9]{32})\/(report|acknowledge)$/);
 if(memberCheck&&method==='POST')return [path.slice(4),true];
 const adminCheck=path.match(/^\/api\/bank\/admin\/orders\/(EDH-[A-F0-9]{32})\/review$/);
 if(adminCheck&&method==='POST')return [path.slice(4),true];
 if(path==='/api/events'&&method==='GET')return ['/events',true];
 if(path==='/api/requests'&&method==='GET')return ['/requests',true];
 const patterns=[
  [/^\/api\/events\/([0-9a-f-]{36})$/i,['GET'],'/events/'],
  [/^\/api\/events\/([0-9a-f-]{36})\/rsvp$/i,['POST'],'/events/', '/rsvp'],
  [/^\/api\/interests\/([0-9a-f-]{36})$/i,['POST'],'/interests/'],
  [/^\/api\/requests\/([0-9a-f-]{36})\/respond$/i,['POST'],'/requests/','/respond'],
  [/^\/api\/messages\/([0-9a-f-]{36})$/i,['GET','POST'],'/messages/'],
  [/^\/api\/blocks\/([0-9a-f-]{36})$/i,['POST'],'/blocks/'],
  [/^\/api\/reports\/([0-9a-f-]{36})$/i,['POST'],'/reports/']
 ];
 for(const [re,methods,prefix,suffix=''] of patterns){const m=path.match(re);if(m&&methods.includes(method))return[prefix+m[1]+suffix,true]}
 return null;
}
async function api(req,env,sub){
 if(sub==='/api/status'&&SAFE_METHODS.has(req.method))return json(status(env));
 if(sub==='/api/public'&&SAFE_METHODS.has(req.method))return json({description_only:true,events:[],groups:[]},200,false);
 if(!sub.startsWith('/api/'))return null;
 const route=allowApi(sub,req.method);if(!route)return json({error:'not_found'},404);
 if(!enabled(env))return json({error:'singles_enrollment_not_launched'},503);
 const [targetPath,social]=route;
 if(social&&!socialEnabled(env))return json({error:'singles_social_not_launched'},503);
 const paidWrite=Boolean(sub.match(/^\/api\/events\/[0-9a-f-]{36}\/rsvp$/i)&&req.method==='POST');
 if(paidWrite&&!paymentEnabled(env))return json({error:'paid_actions_not_launched'},503);
 if(sub==='/api/bank/orders'&&req.method==='POST'&&!bankEnabled(env))return json({error:'bank_collection_not_launched'},503);
 if(sub.match(/^\/api\/bank\/admin\/orders\/EDH-[A-F0-9]{32}\/review$/)&&!bankVerifyEnabled(env))return json({error:'bank_verification_not_launched'},503);
 if(!configuredOrigin(env.SINGLES_API_URL))return json({error:'singles_api_configuration_invalid'},503);
 const bearer=req.headers.get('authorization')||'';
 if(!/^Bearer [a-z0-9._-]{20,}$/i.test(bearer))return json({error:'unauthorized'},401);
 if(!SAFE_METHODS.has(req.method)){
  if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'invalid_origin'},403);
  if(req.method==='PUT'||req.method==='POST'){
   if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||''))return json({error:'invalid_content_type'},415);
   if(Number(req.headers.get('content-length')||0)>4096)return json({error:'payload_too_large'},413);
  }
 }
 const url=new URL(env.SINGLES_API_URL);url.pathname=url.pathname.replace(/\/+$/,'')+targetPath;url.search='';
 const result=await fetch(new Request(url,{method:req.method,headers:{authorization:bearer,apikey:env.SUPABASE_PUBLISHABLE_KEY,
  'content-type':'application/json','x-ekodi-service':'singles'},body:['POST','PUT'].includes(req.method)?req.body:undefined,redirect:'manual'}));
 const responseHeaders=headers('application/json; charset=utf-8',true);
 if(result.headers.get('retry-after'))responseHeaders.set('retry-after',result.headers.get('retry-after'));
 return new Response(result.body,{status:result.status,headers:responseHeaders});
}
function page(active='처음'){
 const nav=[['/singles','처음'],['/singles/discover','동행 찾기'],['/singles/groups','우리 모임'],['/singles/events','공개 행사'],['/singles/messages','메시지'],['/singles/my','내 프로필'],['/singles/subscribe','구독·입금']];
 const paths={'처음':'','동행 찾기':'/discover','우리 모임':'/groups','공개 행사':'/events','메시지':'/messages','내 프로필':'/my','구독':'/subscribe','결제관리':'/admin'};
 const p=paths[active]||'',links=nav.map(([href,name])=>'<a href="'+href+'"'+(name===active?' aria-current="page"':'')+'>'+name+'</a>').join('');
 return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="신앙과 삶의 가치를 나누는 크리스천 싱글 공동체 EKODI 동행"><meta name="theme-color" content="#fff7f5"><title>'+active+' · EKODI 동행</title><link rel="stylesheet" href="/singles/styles.css"><script src="/singles/app.js" defer></script></head><body data-page="'+p+'"><a class="skip" href="#main">본문 바로가기</a><header class="mast"><div class="mast-inner"><a class="logo" href="/singles"><strong>EKODI</strong><span>동행</span></a><nav aria-label="주요 메뉴">'+links+'</nav><a class="account" href="/singles/my">나의 동행</a></div></header><main id="main"><section class="intro"><p class="eyebrow">FAITH · COMMUNITY · RELATIONSHIP</p><h1>같은 믿음, 새로운 인연.<span> 설레는 동행을 시작해요.</span></h1><p class="lead">공동체에서 신뢰할 수 있는 사람을 만나고, 서로 동의할 때 대화를 시작합니다. 그 이후의 만남과 관계는 각자의 자유로운 선택과 책임입니다.</p><div class="actions"><a class="primary" href="/singles/my">나의 동행 시작하기 ↗</a><a class="outline" href="/singles/events">우리의 만남 둘러보기</a></div></section><section class="pillars" aria-label="함께하는 세 가지 방법"><article><small>01 · TOGETHER</small><h2>다정한 공동체</h2><p>말씀과 일상을 나누는 즐거운 소그룹</p></article><article><small>02 · ENCOUNTER</small><h2>새로운 교제</h2><p>서로 존중하며 천천히 알아가는 인연</p></article><article><small>03 · RESPECT</small><h2>존중하는 동행</h2><p>서로의 선택과 책임을 존중하는 관계</p></article></section><section class="content" id="content" aria-live="polite"><div class="section-heading"><div><p class="eyebrow">OUR JOURNEY</p><h2 id="sectionTitle">'+active+'</h2></div><span class="stage" id="serviceStage">서비스 준비 중</span></div><div id="publicPanel" class="panel"><p id="contentDescription">소개 화면은 누구나 볼 수 있습니다. 로그인 후에는 프로필·행사·동행 찾기를 이용할 수 있습니다.</p><div id="publicList" class="empty" hidden></div></div><div id="memberContent" hidden></div><div id="enrollmentPanel" class="panel" hidden><p class="muted">프로필 공개와 신앙정보 이용은 각각 별도로 동의합니다. 공개 설정은 기본적으로 꺼져 있습니다.</p><div id="accountStatus" role="status"></div><button id="loginButton" class="primary" type="button">EKODI Google로 시작</button><form id="consentForm" hidden><fieldset><legend>회원 참여</legend><label><input name="adult" type="checkbox" required> 만 19세 이상입니다(자기확인으로 본인인증이 대체되지 않습니다).</label><label><input name="base" type="checkbox" required> 기본 이용 및 필수 개인정보 처리 안내에 동의합니다.</label></fieldset><fieldset><legend>선택 동의</legend><label><input name="sensitive" type="checkbox"> 신앙·신념에 관한 민감정보 처리에 별도로 동의합니다.</label><label><input name="marriage" type="checkbox"> 결혼 목적 연결에도 참여하겠습니다.</label></fieldset><button class="primary" type="submit">참여 의사 저장</button><button class="outline" id="withdrawButton" type="button">동의 철회</button></form><p id="enrollmentMessage" role="status"></p></div></section><section class="safety"><h2>서로의 마음과 선택을 지켜요</h2><p>동행은 사람을 점수로 평가하지 않습니다. 본인이 선택하기 전엔 프로필이 공개되지 않고, 서로 호감을 확인하기 전에는 메시지를 보낼 수 없습니다. 거절·차단·신고·동의 철회는 언제나 무료입니다.</p></section></main><footer><p><strong>EKODI 동행</strong><span>믿음으로 만나고 존중으로 이어집니다</span></p><a href="/privacy">개인정보 보호</a><a href="/terms">이용약관</a></footer></body></html>';
}
export async function routeSinglesSurface(request,env){
 const url=new URL(request.url),sub=pathAfterSingles(url.pathname);if(sub===null)return null;
 if(sub==='/styles.css'||sub==='/app.js'){if(!SAFE_METHODS.has(request.method))return json({error:'method_not_allowed'},405);return env.ASSETS.fetch(request)}
 const fromApi=await api(request,env,sub);if(fromApi)return fromApi;
 if(!SAFE_METHODS.has(request.method))return json({error:'method_not_allowed'},405);
 // The management shell is public markup only; every bank admin API requires an operator record.
 // It exposes no payment data without a valid signed-in EKODI Core identity and bank capability.
 if(!PUBLIC_PAGES.has(sub))return json({error:'not_found'},404);
 const names={'':'처음','/':'처음','/groups':'우리 모임','/events':'공개 행사','/discover':'동행 찾기','/messages':'메시지','/my':'내 프로필','/subscribe':'구독','/admin':'결제관리'};
 return html(page(names[sub]),{privateContent:PRIVATE_PATHS.has(sub),head:request.method==='HEAD'});
}
