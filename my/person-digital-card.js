const HANDLE_RE=/^[a-z0-9][a-z0-9._-]{2,39}$/;
const CARD_RE=/^\/([a-z0-9][a-z0-9._-]{2,39})\/card\/?$/;
const VCARD_RE=/^\/([a-z0-9][a-z0-9._-]{2,39})\/card\.vcf$/;
const EXCHANGE_RE=/^\/([a-z0-9][a-z0-9._-]{2,39})\/card\/exchange\/?$/;
const QR_RE=/^\/([a-z0-9][a-z0-9._-]{2,39})\/qr\/?$/;
const MAX_BODY_BYTES=8192;
const encoder=new TextEncoder();

function clean(value,max=1000){return String(value??'').replace(/\0/g,'').trim().slice(0,max)}
function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function safeUrl(value){
  const raw=clean(value,1000);if(!raw)return'';
  const candidate=/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:`https://${raw.replace(/^\/+/, '')}`;
  try{const url=new URL(candidate);return ['https:','http:'].includes(url.protocol)?url.toString():''}catch{return''}
}
function dataConfig(env={}){
  const enabled=env.DATA_ENABLED==='true'&&Boolean(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);
  return {enabled,url:enabled?String(env.SUPABASE_URL).replace(/\/$/,''):'',key:enabled?String(env.SUPABASE_PUBLISHABLE_KEY):''};
}
function commonHeaders(type='text/html; charset=utf-8'){
  return {
    'content-type':type,
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    'permissions-policy':'camera=(), microphone=(), geolocation=()',
    'x-ekodi-service':'my-ekodi',
    'x-ekodi-surface-context':'person-digital-card',
  };
}
function json(data,status=200,extra={}){
  return new Response(JSON.stringify(data),{status,headers:{...commonHeaders('application/json; charset=utf-8'),'cache-control':'no-store',...extra}});
}
async function cardForHandle(env,handle){
  const cfg=dataConfig(env);if(!cfg.enabled||!HANDLE_RE.test(handle))return null;
  const response=await fetch(`${cfg.url}/rest/v1/rpc/person_digital_card`,{
    method:'POST',
    headers:{apikey:cfg.key,'content-type':'application/json','cache-control':'no-store'},
    body:JSON.stringify({p_handle:handle}),
  });
  if(!response.ok)return null;
  const data=await response.json().catch(()=>null);
  return data?.ok===true?data:null;
}
function publicCardHeaders(found=true){
  return {
    ...commonHeaders(),
    'cache-control':found?'public, max-age=60, s-maxage=120, stale-while-revalidate=300':'public, max-age=30',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    'x-robots-tag':found?'index, follow, max-image-preview:large':'noindex, nofollow, noarchive',
  };
}
function affiliationHtml(items=[]){
  const rows=(Array.isArray(items)?items:[]).slice(0,20).map(item=>{
    const name=clean(item?.name,120),title=clean(item?.title,120),description=clean(item?.description,800),url=safeUrl(item?.url);
    if(!name)return'';
    return `<article class="affiliation"><div><h2>${escapeHtml(name)}</h2>${title?`<p class="title">${escapeHtml(title)}</p>`:''}</div>${description?`<p class="description">${escapeHtml(description)}</p>`:''}${url?`<a href="${escapeHtml(url)}" rel="noreferrer">관련 링크 <span aria-hidden="true">↗</span></a>`:''}</article>`;
  }).filter(Boolean);
  return rows.length?`<section class="affiliations" aria-label="소속과 역할"><p class="section-label">AFFILIATIONS</p>${rows.join('')}</section>`:'';
}
function linksHtml(items=[]){
  const links=(Array.isArray(items)?items:[]).slice(0,20).map(item=>{
    const url=safeUrl(item?.url);if(!url)return'';
    return `<a href="${escapeHtml(url)}" rel="noreferrer"><strong>${escapeHtml(clean(item?.label,120)||new URL(url).hostname)}</strong><span aria-hidden="true">↗</span></a>`;
  }).filter(Boolean);
  return links.length?`<nav class="links" aria-label="관련 링크">${links.join('')}</nav>`:'';
}
function cardHtml(card,handle){
  const displayName=clean(card?.display_name,120)||handle;
  const headline=clean(card?.headline,160);
  const bio=clean(card?.bio,2000);
  const phone=clean(card?.phone,40);
  const email=clean(card?.email,254);
  const exchangeEnabled=card?.exchange_enabled===true;
  const description=(headline||bio||`${displayName}의 디지털 명함`).replace(/\s+/g,' ').slice(0,160);
  const canonical=`https://ekodi.kr/${handle}/card`;
  const contactActions=[
    phone?`<a class="quick" href="tel:${escapeHtml(phone)}">전화</a>`:'',
    email?`<a class="quick" href="mailto:${escapeHtml(email)}">이메일</a>`:'',
  ].filter(Boolean).join('');
  const exchangeSection=exchangeEnabled?`
  <section class="exchange" id="exchange">
    <div class="exchange-head"><div><p class="section-label">CONTACT EXCHANGE</p><h2>서로 연락처 교환</h2></div><button id="contactPicker" class="secondary" type="button">내 폰에서 불러오기</button></div>
    <p class="exchange-copy">휴대폰에서 내 연락처를 불러올 수 있는 기기에서는 선택창이 열립니다. 확인하고 필요한 내용만 수정한 뒤 보내세요.</p>
    <form id="exchangeForm" data-handle="${escapeHtml(handle)}">
      <div class="two"><label>이름<input name="name" autocomplete="name" maxlength="80" required></label><label>휴대전화<input name="phone" autocomplete="tel" inputmode="tel" maxlength="40"></label></div>
      <div class="two"><label>이메일<input name="email" type="email" autocomplete="email" maxlength="254"></label><label>소속<input name="affiliation" autocomplete="organization" maxlength="160"></label></div>
      <div class="two"><label>직함<input name="title" autocomplete="organization-title" maxlength="160"></label><label>대표 링크<input name="website" type="text" autocomplete="url" inputmode="url" maxlength="1000" placeholder="ekodi.kr 또는 https://ekodi.kr"></label></div>
      <label class="trap" aria-hidden="true">확인용<input name="bot_field" tabindex="-1" autocomplete="off"></label>
      <label class="consent"><input name="privacyConsent" type="checkbox" required><span>연락처 교환을 위해 위 정보를 명함 소유자에게 전달하는 데 동의합니다.</span></label>
      <div class="exchange-actions"><button id="exchangeSubmit" class="primary" type="submit">확인 후 연락처 보내기</button><span id="exchangeStatus" role="status" aria-live="polite"></span></div>
    </form>
  </section>`: '';
  return `<!doctype html>
<html lang="ko" data-ekodi-global-nav="off" data-ekodi-character="off">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="profile">
<meta property="og:title" content="${escapeHtml(displayName)} · 디지털 명함">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<title>${escapeHtml(displayName)} · 디지털 명함</title>
<style>
:root{color-scheme:light;--ink:#172f25;--muted:#65756c;--line:#dce5dc;--paper:#fbfcf8;--green:#244d35}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#edf4ec,#fbfcf8 34%,#fff);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55;word-break:keep-all}header,main,footer{width:min(720px,calc(100% - 28px));margin-inline:auto}header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}.handle{font-weight:850}.surface{font-size:11px;color:var(--muted)}main{padding:38px 0 54px}.eyebrow,.section-label{margin:0 0 7px;font-size:10px;letter-spacing:.13em;font-weight:850;color:#5e7968}.name{font-size:clamp(38px,8vw,64px);line-height:1.03;letter-spacing:-.045em;margin:0}.headline{margin:14px 0 0;font-size:clamp(18px,4vw,23px);font-weight:720;color:#395344}.bio{white-space:pre-wrap;margin:20px 0 0;color:#53665a}.actions{display:grid;grid-template-columns:1.2fr 1.2fr .8fr;gap:8px;margin-top:26px}.actions a,.actions button,.quick,.secondary,.primary{min-height:46px;border-radius:13px;border:1px solid #cad6cc;background:#fff;color:var(--ink);font:inherit;font-weight:800;text-decoration:none;display:flex;align-items:center;justify-content:center;cursor:pointer}.actions .primary,.primary{border-color:var(--green);background:var(--green);color:#fff}.contact-quick{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.quick{min-height:38px;padding:7px 12px;font-size:12px}.affiliations,.exchange,.links{margin-top:34px}.affiliation{padding:15px 0;border-top:1px solid var(--line)}.affiliation:last-child{border-bottom:1px solid var(--line)}.affiliation h2{font-size:18px;margin:0}.affiliation .title{margin:3px 0 0;font-weight:750;color:#405b4b}.affiliation .description{margin:9px 0 0;color:var(--muted);white-space:pre-wrap}.affiliation a,.links a{color:#2f5a3e;font-weight:800;text-decoration:none}.affiliation>a{display:inline-flex;margin-top:8px;font-size:12px}.links{display:grid;gap:8px}.links a{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff}.exchange{padding:18px;border:1px solid var(--line);border-radius:18px;background:#f8faf7}.exchange-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.exchange h2{margin:0;font-size:22px}.exchange-copy{margin:7px 0 16px;color:var(--muted);font-size:13px}.secondary{min-height:38px;padding:7px 11px;font-size:12px}.exchange form{display:grid;gap:10px}.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#486052}input{width:100%;border:1px solid #ccd8cf;border-radius:11px;padding:10px 11px;background:#fff;color:var(--ink);font:inherit;outline:none}input:focus{border-color:#557b61;box-shadow:0 0 0 3px rgba(76,118,92,.11)}.consent{display:flex;align-items:flex-start;gap:8px;font-weight:650;line-height:1.45}.consent input{width:auto;margin-top:3px;accent-color:var(--green)}.exchange-actions{display:flex;align-items:center;gap:10px;margin-top:3px}.exchange-actions .primary{padding:10px 14px}.exchange-actions span{font-size:12px;color:var(--muted)}.exchange-actions span.error{color:#9b3b38}.exchange-actions span.success{color:#2d6942;font-weight:800}.trap{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}.desktop-share-panel{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:rgba(10,25,17,.48)}.desktop-share-panel>strong,.desktop-share-panel>input,.desktop-share-panel>.desktop-share-actions{width:min(440px,100%)}.desktop-share-panel>strong{display:block;padding:18px 18px 8px;border-radius:18px 18px 0 0;background:#fff;font-size:20px}.desktop-share-panel>input{border-radius:0;padding:12px 18px;background:#fff}.desktop-share-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px 18px 18px;border-radius:0 0 18px 18px;background:#fff}.desktop-share-action{min-height:42px;display:flex;align-items:center;justify-content:center;border:1px solid #cad6cc;border-radius:11px;background:#fff;color:var(--ink);font:inherit;font-weight:800;text-decoration:none;cursor:pointer}footer{padding:18px 0 28px;border-top:1px solid var(--line);font-size:11px;color:#7b8880}
@media(max-width:560px){header{align-items:flex-start;flex-direction:column;gap:2px}main{padding-top:28px}.actions{grid-template-columns:1fr 1fr}.actions button{grid-column:1/-1}.two{grid-template-columns:1fr}.exchange-head{flex-direction:column}.secondary{width:100%}.exchange-actions{align-items:stretch;flex-direction:column}.exchange-actions .primary{width:100%}}
</style>
</head>
<body>
<header><span class="handle">@${escapeHtml(handle)}</span><span class="surface">EKODI DIGITAL CARD</span></header>
<main>
<p class="eyebrow">DIGITAL BUSINESS CARD</p>
<h1 class="name">${escapeHtml(displayName)}</h1>
${headline?`<p class="headline">${escapeHtml(headline)}</p>`:''}
${bio?`<p class="bio">${escapeHtml(bio)}</p>`:''}
<div class="actions"><a class="primary" href="/${escapeHtml(handle)}/card.vcf">내 연락처 저장</a>${exchangeEnabled?'<a href="#exchange">서로 연락처 교환</a>':'<a href="/@'+escapeHtml(handle)+'">프로필 보기</a>'}<button id="shareCard" type="button">명함 공유</button></div>
${contactActions?`<div class="contact-quick">${contactActions}</div>`:''}
${affiliationHtml(card?.affiliations)}
${linksHtml(card?.links)}
${exchangeSection}
</main>
<footer>공개 정보는 명함 소유자가 My EKODI에서 직접 선택해 관리합니다.</footer>
<script src="/my/digital-card.js?v=20261001-desktop-share-2" defer></script>
</body></html>`;
}
function notFoundHtml(handle){
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>디지털 명함 준비 중</title><style>body{font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f5f8f3;color:#23372d}main{width:min(560px,calc(100% - 32px));padding:30px;border:1px solid #dce5dc;border-radius:18px;background:#fff}p{color:#68776e}a{color:#29553b;font-weight:800}</style></head><body><main><strong>@${escapeHtml(handle)} 디지털 명함이 아직 공개되지 않았습니다.</strong><p>명함 소유자가 My EKODI에서 공개 아이디와 명함 정보를 저장하면 이 주소가 활성화됩니다.</p><a href="https://ekodi.kr/my/#account">My EKODI에서 설정</a></main></body></html>`;
}
function vcardEscape(value){return String(value??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function vcard(card,handle){
  const name=clean(card?.display_name,120)||handle;
  const aff=(Array.isArray(card?.affiliations)?card.affiliations:[]).find(item=>clean(item?.name,120));
  const lines=['BEGIN:VCARD','VERSION:3.0',`FN:${vcardEscape(name)}`,`N:;${vcardEscape(name)};;;`];
  if(aff?.name)lines.push(`ORG:${vcardEscape(clean(aff.name,120))}`);
  if(aff?.title)lines.push(`TITLE:${vcardEscape(clean(aff.title,120))}`);
  if(card?.phone)lines.push(`TEL;TYPE=CELL:${vcardEscape(clean(card.phone,40))}`);
  if(card?.email)lines.push(`EMAIL:${vcardEscape(clean(card.email,254))}`);
  lines.push(`URL:https://ekodi.kr/${handle}/card`);
  if(card?.headline)lines.push(`NOTE:${vcardEscape(clean(card.headline,160))}`);
  lines.push('END:VCARD','');
  return lines.join('\r\n');
}
function exchangeOriginAllowed(request,env){
  const origin=clean(request.headers.get('origin'),300);
  if(!origin||origin==='https://ekodi.kr')return true;
  return env.DATA_MODE!=='production'&&/^https:\/\/[^/]+\.workers\.dev$/i.test(origin);
}
async function exchangeRateLimit(request,env,handle){
  const binding=env.CARD_EXCHANGE_RATE_LIMITER;
  if(!binding?.limit)return env.DATA_MODE==='production'?{available:false,allowed:false}:{available:true,allowed:true};
  const ip=clean(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown',128);
  try{const result=await binding.limit({key:`card-exchange:${handle}:${ip}`});return{available:true,allowed:result?.success!==false}}catch(error){console.error('Digital card rate limiter unavailable',error);return{available:false,allowed:false}}
}
function rpcErrorMessage(raw){
  const value=String(raw||'').toLowerCase();
  if(value.includes('privacy_consent_required'))return'개인정보 전달 동의가 필요합니다.';
  if(value.includes('contact_required'))return'휴대전화 또는 이메일 중 하나는 필요합니다.';
  if(value.includes('invalid_email'))return'이메일 주소를 확인해 주세요.';
  if(value.includes('invalid_phone'))return'휴대전화 번호를 확인해 주세요.';
  if(value.includes('contact_exchange_unavailable'))return'현재 이 명함에서는 연락처 교환을 받을 수 없습니다.';
  if(value.includes('contact_exchange_rate_limited'))return'연락처 교환 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  if(value.includes('contact_identity_conflict'))return'휴대전화와 이메일이 서로 다른 기존 연락처와 연결되어 있어 자동 병합하지 않았습니다.';
  return'연락처를 전달하지 못했습니다.';
}
async function submitExchange(request,env,handle){
  if(request.method!=='POST')return json({ok:false,error:'허용되지 않은 요청입니다.'},405,{allow:'POST'});
  if(!exchangeOriginAllowed(request,env))return json({ok:false,error:'허용되지 않은 요청 출처입니다.'},403);
  const declared=Number(request.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)return json({ok:false,error:'요청 내용이 너무 깁니다.'},413);
  const limited=await exchangeRateLimit(request,env,handle);
  if(!limited.available)return json({ok:false,error:'보호 장치가 잠시 응답하지 않습니다.'},503,{'retry-after':'30'});
  if(!limited.allowed)return json({ok:false,error:'연락처 교환 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'},429,{'retry-after':'60'});
  let raw='';try{raw=await request.text()}catch{return json({ok:false,error:'요청을 읽지 못했습니다.'},400)}
  if(encoder.encode(raw).byteLength>MAX_BODY_BYTES)return json({ok:false,error:'요청 내용이 너무 깁니다.'},413);
  let body={};try{body=JSON.parse(raw||'{}')}catch{return json({ok:false,error:'요청 형식을 확인해 주세요.'},400)}
  if(clean(body?.bot_field,120))return json({ok:true,message:'연락처가 전달되었습니다.'});
  if(body?.privacyConsent!==true)return json({ok:false,error:'개인정보 전달 동의가 필요합니다.'},400);
  const name=clean(body?.name,80),phone=clean(body?.phone,40),email=clean(body?.email,254).toLowerCase();
  if(!name)return json({ok:false,error:'이름을 확인해 주세요.'},400);
  if(!phone&&!email)return json({ok:false,error:'휴대전화 또는 이메일 중 하나는 필요합니다.'},400);
  const cfg=dataConfig(env);if(!cfg.enabled)return json({ok:false,error:'연락처 저장 기능을 사용할 수 없습니다.'},503);
  const payload={
    p_handle:handle,p_name:name,p_phone:phone,p_email:email,
    p_affiliation:clean(body?.affiliation,160),p_title:clean(body?.title,160),
    p_website:clean(body?.website,1000),p_privacy_consent:true,
    p_source_channel:body?.source==='qr'?'qr':'card',
  };
  const response=await fetch(`${cfg.url}/rest/v1/rpc/submit_person_contact_exchange`,{
    method:'POST',headers:{apikey:cfg.key,'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(payload),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){
    const raw=String(data?.message||data?.error||'');
    const status=raw.toLowerCase().includes('contact_exchange_rate_limited')?429:400;
    return json({ok:false,error:rpcErrorMessage(raw)},status,status===429?{'retry-after':'60'}:{});
  }
  return json({ok:true,message:'연락처가 명함 소유자에게 전달되었습니다.'});
}

export async function routePersonDigitalCard(request,env={}){
  const url=new URL(request.url);
  let match=url.pathname.match(QR_RE);
  if(match){
    if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD'}});
    const target=new URL(`/${match[1]}/card`,url.origin);target.searchParams.set('utm_source','qr');
    return new Response(null,{status:307,headers:{location:target.toString(),'cache-control':'no-store','x-ekodi-surface-context':'person-digital-card-qr'}});
  }
  match=url.pathname.match(EXCHANGE_RE);
  if(match)return submitExchange(request,env,match[1]);
  match=url.pathname.match(VCARD_RE);
  if(match){
    if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD'}});
    const card=await cardForHandle(env,match[1]).catch(()=>null);
    if(!card)return new Response(request.method==='HEAD'?null:'Not Found',{status:404,headers:{...commonHeaders('text/plain; charset=utf-8'),'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
    return new Response(request.method==='HEAD'?null:vcard(card,match[1]),{headers:{...commonHeaders('text/vcard; charset=utf-8'),'cache-control':'public, max-age=60','content-disposition':`attachment; filename="${match[1]}.vcf"`,'x-robots-tag':'noindex, nofollow'}});
  }
  match=url.pathname.match(CARD_RE);
  if(match){
    if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD'}});
    const card=await cardForHandle(env,match[1]).catch(()=>null),found=Boolean(card);
    const html=found?cardHtml(card,match[1]):notFoundHtml(match[1]);
    return new Response(request.method==='HEAD'?null:html,{status:found?200:404,headers:publicCardHeaders(found)});
  }
  return null;
}
