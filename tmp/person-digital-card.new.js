const HANDLE_RE=/^[a-z0-9][a-z0-9._-]{2,39}$/;
const CONTEXT_RE=/^[a-z0-9][a-z0-9_-]{0,39}$/;
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
  try{const url=new URL(raw);return ['https:','http:'].includes(url.protocol)?url.toString():''}catch{return''}
}
function contextFromUrl(url){
  const value=clean(url.searchParams.get('context'),40).toLowerCase();
  return CONTEXT_RE.test(value)?value:'';
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
async function shareForHandle(env,handle,context=''){
  const cfg=dataConfig(env);if(!cfg.enabled||!HANDLE_RE.test(handle))return null;
  const response=await fetch(`${cfg.url}/rest/v1/rpc/person_identity_share`,{
    method:'POST',
    headers:{apikey:cfg.key,'content-type':'application/json','cache-control':'no-store'},
    body:JSON.stringify({p_handle:handle,p_context:context||null}),
  });
  if(!response.ok)return null;
  const data=await response.json().catch(()=>null);
  return data?.ok===true?data:null;
}
function publicCardHeaders({found=true,ready=true,qr=false}={}){
  return {
    ...commonHeaders(),
    'cache-control':found?'public, max-age=45, s-maxage=90, stale-while-revalidate=180':'public, max-age=30',
    'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    'x-robots-tag':qr||!found||!ready?'noindex, nofollow, noarchive':'index, follow, max-image-preview:large',
  };
}
function contextHref(handle,key,surface='card'){
  const path=surface==='qr'?`/${encodeURIComponent(handle)}/qr`:`/${encodeURIComponent(handle)}/card`;
  return `${path}?context=${encodeURIComponent(key)}`;
}
function contextsHtml(contexts=[],handle,selectedKey='',surface='card'){
  const items=(Array.isArray(contexts)?contexts:[]).slice(0,20);
  const links=items.map(item=>{
    const key=clean(item?.key,40),label=clean(item?.label,80);
    if(!CONTEXT_RE.test(key)||!label)return'';
    const href=contextHref(handle,key,surface);
    const meta=[clean(item?.role_name,120),clean(item?.role_title,120)].filter(Boolean).join(' · ');
    return `<a class="context-chip${key===selectedKey?' active':''}" href="${escapeHtml(href)}"><strong>${escapeHtml(label)}</strong>${meta?`<small>${escapeHtml(meta)}</small>`:''}</a>`;
  }).filter(Boolean).join('');
  return links?`<nav class="context-switcher" aria-label="공유모드 선택">${links}</nav>`:'';
}
function linksHtml(items=[]){
  const links=(Array.isArray(items)?items:[]).slice(0,20).map(item=>{
    const url=safeUrl(item?.url);if(!url)return'';
    return `<a href="${escapeHtml(url)}" rel="noreferrer"><strong>${escapeHtml(clean(item?.label,120)||new URL(url).hostname)}</strong><span aria-hidden="true">↗</span></a>`;
  }).filter(Boolean);
  return links.length?`<nav class="links" aria-label="관련 링크">${links.join('')}</nav>`:'';
}
function roleHtml(role){
  if(!role||typeof role!=='object')return'';
  const name=clean(role.name,120),title=clean(role.title,120),description=clean(role.description,800),url=safeUrl(role.url);
  if(!name&&!title&&!description&&!url)return'';
  return `<section class="role-card" aria-label="선택된 역할"><p class="section-label">CURRENT CONTEXT</p>${name?`<h2>${escapeHtml(name)}</h2>`:''}${title?`<p class="role-title">${escapeHtml(title)}</p>`:''}${description?`<p class="role-description">${escapeHtml(description)}</p>`:''}${url?`<a href="${escapeHtml(url)}" rel="noreferrer">관련 사이트 <span aria-hidden="true">↗</span></a>`:''}</section>`;
}
function baseStyles(){
  return `:root{color-scheme:light;--ink:#172f25;--muted:#65756c;--line:#dce5dc;--paper:#fbfcf8;--green:#244d35;--green-soft:#edf4ec}*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#edf4ec,#fbfcf8 34%,#fff);color:var(--ink);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55;word-break:keep-all}header,main,footer{width:min(720px,calc(100% - 28px));margin-inline:auto}header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 0;border-bottom:1px solid var(--line)}.handle{font-weight:850}.surface{font-size:11px;color:var(--muted)}main{padding:36px 0 54px}.eyebrow,.section-label{margin:0 0 7px;font-size:10px;letter-spacing:.13em;font-weight:850;color:#5e7968}.name{font-size:clamp(38px,8vw,64px);line-height:1.03;letter-spacing:-.045em;margin:0}.headline{margin:14px 0 0;font-size:clamp(18px,4vw,23px);font-weight:720;color:#395344}.bio{white-space:pre-wrap;margin:20px 0 0;color:#53665a}.context-switcher{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:24px 0}.context-chip{display:grid;gap:2px;padding:12px 13px;border:1px solid var(--line);border-radius:14px;background:#fff;color:var(--ink);text-decoration:none}.context-chip.active{border-color:#6b8f74;background:var(--green-soft)}.context-chip small{font-size:10px;color:var(--muted);font-weight:600}.context-prompt{margin:26px 0;padding:18px;border:1px solid var(--line);border-radius:16px;background:#fff}.context-prompt h2{margin:0;font-size:22px}.context-prompt p{margin:6px 0 0;color:var(--muted)}.actions{display:grid;grid-template-columns:1.1fr 1fr .8fr;gap:8px;margin-top:24px}.actions a,.actions button,.quick,.secondary,.primary{min-height:46px;border-radius:13px;border:1px solid #cad6cc;background:#fff;color:var(--ink);font:inherit;font-weight:800;text-decoration:none;display:flex;align-items:center;justify-content:center;cursor:pointer}.actions .primary,.primary{border-color:var(--green);background:var(--green);color:#fff}.contact-quick{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.quick{min-height:38px;padding:7px 12px;font-size:12px}.role-card,.exchange,.links{margin-top:30px}.role-card{padding:17px;border:1px solid var(--line);border-radius:17px;background:#fff}.role-card h2{font-size:20px;margin:0}.role-title{margin:3px 0 0;font-weight:780;color:#405b4b}.role-description{margin:10px 0 0;color:var(--muted);white-space:pre-wrap}.role-card>a{display:inline-flex;margin-top:9px;color:#2f5a3e;font-weight:800;text-decoration:none}.links{display:grid;gap:8px}.links a{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;color:#2f5a3e;font-weight:800;text-decoration:none}.exchange{padding:18px;border:1px solid var(--line);border-radius:18px;background:#f8faf7}.exchange-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.exchange h2{margin:0;font-size:22px}.exchange-copy{margin:7px 0 16px;color:var(--muted);font-size:13px}.secondary{min-height:38px;padding:7px 11px;font-size:12px}.exchange form{display:grid;gap:10px}.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}label{display:grid;gap:5px;font-size:11px;font-weight:800;color:#486052}input{width:100%;border:1px solid #ccd8cf;border-radius:11px;padding:10px 11px;background:#fff;color:var(--ink);font:inherit;outline:none}input:focus{border-color:#557b61;box-shadow:0 0 0 3px rgba(76,118,92,.11)}.consent{display:flex;align-items:flex-start;gap:8px;font-weight:650;line-height:1.45}.consent input{width:auto;margin-top:3px;accent-color:var(--green)}.exchange-actions{display:flex;align-items:center;gap:10px;margin-top:3px}.exchange-actions .primary{padding:10px 14px}.exchange-actions span{font-size:12px;color:var(--muted)}.exchange-actions span.error{color:#9b3b38}.exchange-actions span.success{color:#2d6942;font-weight:800}.trap{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}footer{padding:18px 0 28px;border-top:1px solid var(--line);font-size:11px;color:#7b8880}.setup{padding:28px;border:1px solid var(--line);border-radius:18px;background:#fff}.setup h1{font-size:28px;margin:0}.setup p{color:var(--muted)}.setup a{font-weight:800;color:#29553b}@media(max-width:560px){header{align-items:flex-start;flex-direction:column;gap:2px}main{padding-top:28px}.actions{grid-template-columns:1fr 1fr}.actions button,.actions .qr-action{grid-column:1/-1}.two{grid-template-columns:1fr}.exchange-head{flex-direction:column}.secondary{width:100%}.exchange-actions{align-items:stretch;flex-direction:column}.exchange-actions .primary{width:100%}}`;
}
function setupHtml(share,handle,message='공유할 정보가 아직 준비되지 않았습니다.'){
  const name=clean(share?.display_name,120)||handle;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(name)} · 공유 준비 중</title><style>${baseStyles()}</style></head><body><header><span class="handle">@${escapeHtml(handle)}</span><span class="surface">EKODI PERSONAL IDENTITY</span></header><main><section class="setup"><p class="eyebrow">SHARE SETUP</p><h1>${escapeHtml(name)}</h1><p>${escapeHtml(message)}</p><p>기본정보는 한 번만 저장하고, 역할과 공유모드에서 공개 범위를 선택합니다.</p><a href="https://ekodi.kr/my/#account">My EKODI에서 공유모드 설정 →</a></section></main><footer>전화·이메일 등 개인정보는 공유모드에서 선택한 경우에만 공개됩니다.</footer></body></html>`;
}
function cardHtml(share,handle){
  if(!share?.ready)return setupHtml(share,handle);
  const displayName=clean(share.display_name,120)||handle;
  const headline=clean(share.headline,160),bio=clean(share.bio,2000),phone=clean(share.phone,40),email=clean(share.email,254);
  const contexts=Array.isArray(share.contexts)?share.contexts:[];
  const selected=share.selected_context&&typeof share.selected_context==='object'?share.selected_context:null;
  const selectedKey=clean(selected?.key,40),selectedLabel=clean(selected?.label,80);
  const description=(headline||clean(share?.role?.description,160)||`${displayName}의 디지털 명함`).replace(/\s+/g,' ').slice(0,160);
  const canonical=`https://ekodi.kr/${handle}/card`;
  const selector=contextsHtml(contexts,handle,selectedKey,'card');
  if(!selectedKey&&contexts.length>1){
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${canonical}"><meta property="og:type" content="profile"><meta property="og:title" content="${escapeHtml(displayName)} · 연결 방식 선택"><meta property="og:description" content="관계에 맞는 정보를 선택해 확인하세요."><meta property="og:url" content="${canonical}"><title>${escapeHtml(displayName)} · 연결 방식 선택</title><style>${baseStyles()}</style></head><body><header><span class="handle">@${escapeHtml(handle)}</span><span class="surface">EKODI PERSONAL IDENTITY</span></header><main><p class="eyebrow">CONNECTION CONTEXT</p><h1 class="name">${escapeHtml(displayName)}</h1><section class="context-prompt"><h2>어떤 관계로 연결하시겠어요?</h2><p>필요한 정보만 선택해서 보여드립니다.</p></section>${selector}<div class="actions"><a class="primary qr-action" href="/${escapeHtml(handle)}/qr">QR 공유센터</a><button id="shareCard" type="button">이 페이지 공유</button></div></main><footer>하나의 개인정보 원장에서 상황별 공개 범위만 다르게 적용합니다.</footer><script src="/my/digital-card.js?v=20261001-contexts-1" defer></script></body></html>`;
  }
  if(!selectedKey)return setupHtml(share,handle,'공유모드를 다시 설정해 주세요.');

  const currentUrl=`${canonical}?context=${encodeURIComponent(selectedKey)}`;
  const vcardUrl=`/${encodeURIComponent(handle)}/card.vcf?context=${encodeURIComponent(selectedKey)}`;
  const qrUrl=`/${encodeURIComponent(handle)}/qr?context=${encodeURIComponent(selectedKey)}`;
  const exchangeEnabled=share.exchange_enabled===true;
  const contactActions=[phone?`<a class="quick" href="tel:${escapeHtml(phone)}">전화</a>`:'',email?`<a class="quick" href="mailto:${escapeHtml(email)}">이메일</a>`:''].filter(Boolean).join('');
  const exchangeSection=exchangeEnabled?`
  <section class="exchange" id="exchange">
    <div class="exchange-head"><div><p class="section-label">CONTACT EXCHANGE</p><h2>서로 연락처 교환</h2></div><button id="contactPicker" class="secondary" type="button">내 폰에서 불러오기</button></div>
    <p class="exchange-copy">${selectedLabel?`‘${escapeHtml(selectedLabel)}’ 관계로`:''} 연락처를 교환합니다. 내 정보를 확인하고 필요한 내용만 수정한 뒤 보내세요.</p>
    <form id="exchangeForm" data-handle="${escapeHtml(handle)}">
      <input type="hidden" name="contextKey" value="${escapeHtml(selectedKey)}">
      <div class="two"><label>이름<input name="name" autocomplete="name" maxlength="80" required></label><label>휴대전화<input name="phone" autocomplete="tel" inputmode="tel" maxlength="40"></label></div>
      <div class="two"><label>이메일<input name="email" type="email" autocomplete="email" maxlength="254"></label><label>소속<input name="affiliation" autocomplete="organization" maxlength="160"></label></div>
      <div class="two"><label>직함<input name="title" autocomplete="organization-title" maxlength="160"></label><label>대표 링크<input name="website" type="url" autocomplete="url" inputmode="url" maxlength="1000"></label></div>
      <label class="trap" aria-hidden="true">확인용<input name="bot_field" tabindex="-1" autocomplete="off"></label>
      <label class="consent"><input name="privacyConsent" type="checkbox" required><span>연락처 교환을 위해 위 정보를 명함 소유자에게 전달하는 데 동의합니다.</span></label>
      <div class="exchange-actions"><button id="exchangeSubmit" class="primary" type="submit">확인 후 연락처 보내기</button><span id="exchangeStatus" role="status" aria-live="polite"></span></div>
    </form>
  </section>`:'';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${canonical}"><meta property="og:type" content="profile"><meta property="og:title" content="${escapeHtml(displayName)}${selectedLabel?` · ${escapeHtml(selectedLabel)}`:''}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(currentUrl)}"><title>${escapeHtml(displayName)}${selectedLabel?` · ${escapeHtml(selectedLabel)}`:''}</title><style>${baseStyles()}</style></head><body><header><span class="handle">@${escapeHtml(handle)}</span><span class="surface">EKODI PERSONAL IDENTITY</span></header><main><p class="eyebrow">SHARE CONTEXT${selectedLabel?` · ${escapeHtml(selectedLabel)}`:''}</p><h1 class="name">${escapeHtml(displayName)}</h1>${headline?`<p class="headline">${escapeHtml(headline)}</p>`:''}${bio?`<p class="bio">${escapeHtml(bio)}</p>`:''}${contexts.length>1?selector:''}${roleHtml(share.role)}<div class="actions"><a class="primary" href="${escapeHtml(vcardUrl)}">내 연락처 저장</a>${exchangeEnabled?'<a href="#exchange">서로 연락처 교환</a>':`<a href="/@${escapeHtml(handle)}">프로필 보기</a>`}<a class="qr-action" href="${escapeHtml(qrUrl)}">QR 보기</a><button id="shareCard" type="button">명함 공유</button></div>${contactActions?`<div class="contact-quick">${contactActions}</div>`:''}${linksHtml(share.links)}${exchangeSection}</main><footer>기본정보는 한 번만 저장하며, 현재 공유모드에서 허용한 정보만 표시됩니다.</footer><script src="/my/digital-card.js?v=20261001-contexts-1" defer></script></body></html>`;
}
function qrHtml(share,handle){
  if(!share?.ready)return setupHtml(share,handle,'QR로 공유할 공개 정보가 아직 없습니다.');
  const name=clean(share.display_name,120)||handle,contexts=Array.isArray(share.contexts)?share.contexts:[];
  const selected=share.selected_context&&typeof share.selected_context==='object'?share.selected_context:null;
  const key=clean(selected?.key,40),label=clean(selected?.label,80);
  const target=key?`https://ekodi.kr/${handle}/card?context=${encodeURIComponent(key)}&utm_source=qr`:`https://ekodi.kr/${handle}/card?utm_source=qr`;
  const selector=contextsHtml(contexts,handle,key,'qr');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(name)} · QR 공유센터</title><style>${baseStyles()}.qr-shell{display:grid;justify-items:center;gap:16px;padding:22px;border:1px solid var(--line);border-radius:20px;background:#fff}.qr-code{width:min(76vw,360px);aspect-ratio:1;padding:14px;border:1px solid var(--line);border-radius:18px;background:#fff}.qr-code canvas,.qr-code img,.qr-code svg{display:block!important;width:100%!important;height:100%!important}.qr-title{text-align:center}.qr-title h2{margin:0;font-size:24px}.qr-title p{margin:5px 0 0;color:var(--muted)}.qr-target{width:100%;padding:11px;border-radius:11px;background:#f6f8f5;color:#516359;font-size:11px;overflow-wrap:anywhere}.qr-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;width:100%}.qr-actions a,.qr-actions button{min-height:44px;border-radius:12px;border:1px solid #cad6cc;background:#fff;color:var(--ink);font:inherit;font-weight:800;text-decoration:none;display:flex;align-items:center;justify-content:center;cursor:pointer}.qr-actions .primary{background:var(--green);color:#fff}@media(max-width:560px){.qr-actions{grid-template-columns:1fr 1fr}.qr-actions .primary{grid-column:1/-1}}</style></head><body><header><span class="handle">@${escapeHtml(handle)}</span><span class="surface">QR 공유센터</span></header><main><p class="eyebrow">SHARE QR</p><h1 class="name">${escapeHtml(name)}</h1>${contexts.length>1?selector:''}<section class="qr-shell"><div class="qr-title"><h2>${escapeHtml(label||'기본 공유')}</h2><p>${key?'이 공유모드로 바로 연결됩니다.':'받는 사람이 관계를 선택합니다.'}</p></div><div id="qrCode" class="qr-code" data-target="${escapeHtml(target)}" aria-label="디지털 명함 QR코드"></div><div class="qr-target">${escapeHtml(target)}</div><div class="qr-actions"><a class="primary" href="${escapeHtml(target)}">명함 열기</a><button id="copyQrLink" type="button">링크 복사</button><button id="downloadQr" type="button">QR 저장</button></div><span id="qrStatus" role="status" aria-live="polite"></span></section></main><footer>QR에는 선택된 명함 링크만 포함되며 개인정보 자체는 QR 이미지에 직접 저장하지 않습니다.</footer><script src="/my/vendor/qrcode.min.js?v=20261001-local-1" defer></script><script src="/my/digital-card-qr.js?v=20261001-contexts-1" defer></script></body></html>`;
}
function vcardEscape(value){return String(value??'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;')}
function vcard(share,handle){
  const name=clean(share?.display_name,120)||handle;
  const role=share?.role&&typeof share.role==='object'?share.role:null;
  const selected=share?.selected_context&&typeof share.selected_context==='object'?share.selected_context:null;
  const key=clean(selected?.key,40);
  const lines=['BEGIN:VCARD','VERSION:3.0',`FN:${vcardEscape(name)}`,`N:;${vcardEscape(name)};;;`];
  if(role?.name)lines.push(`ORG:${vcardEscape(clean(role.name,120))}`);
  if(role?.title)lines.push(`TITLE:${vcardEscape(clean(role.title,120))}`);
  if(share?.phone)lines.push(`TEL;TYPE=CELL:${vcardEscape(clean(share.phone,40))}`);
  if(share?.email)lines.push(`EMAIL:${vcardEscape(clean(share.email,254))}`);
  lines.push(`URL:https://ekodi.kr/${handle}/card${key?`?context=${encodeURIComponent(key)}`:''}`);
  if(role?.description)lines.push(`NOTE:${vcardEscape(clean(role.description,800))}`);
  else if(share?.headline)lines.push(`NOTE:${vcardEscape(clean(share.headline,160))}`);
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
  if(value.includes('contact_exchange_unavailable'))return'현재 선택한 공유모드에서는 연락처를 교환할 수 없습니다.';
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
  const name=clean(body?.name,80),phone=clean(body?.phone,40),email=clean(body?.email,254).toLowerCase(),contextKey=clean(body?.contextKey,40).toLowerCase();
  if(!name)return json({ok:false,error:'이름을 확인해 주세요.'},400);
  if(!phone&&!email)return json({ok:false,error:'휴대전화 또는 이메일 중 하나는 필요합니다.'},400);
  if(!CONTEXT_RE.test(contextKey))return json({ok:false,error:'공유모드를 다시 선택해 주세요.'},400);
  const cfg=dataConfig(env);if(!cfg.enabled)return json({ok:false,error:'연락처 저장 기능을 사용할 수 없습니다.'},503);
  const payload={
    p_handle:handle,p_name:name,p_phone:phone,p_email:email,
    p_affiliation:clean(body?.affiliation,160),p_title:clean(body?.title,160),
    p_website:clean(body?.website,1000),p_privacy_consent:true,
    p_source_channel:body?.source==='qr'?'qr':'card',p_context_key:contextKey,
  };
  const response=await fetch(`${cfg.url}/rest/v1/rpc/submit_person_contact_exchange_v2`,{
    method:'POST',headers:{apikey:cfg.key,'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(payload),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok){
    const rpcRaw=String(data?.message||data?.error||'');
    const status=rpcRaw.toLowerCase().includes('contact_exchange_rate_limited')?429:400;
    return json({ok:false,error:rpcErrorMessage(rpcRaw)},status,status===429?{'retry-after':'60'}:{});
  }
  return json({ok:true,message:'연락처가 명함 소유자에게 전달되었습니다.',context_label:data?.context_label||''});
}
export async function routePersonDigitalCard(request,env={}){
  const url=new URL(request.url);
  let match=url.pathname.match(EXCHANGE_RE);
  if(match)return submitExchange(request,env,match[1]);

  match=url.pathname.match(QR_RE);
  if(match){
    if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD'}});
    const context=contextFromUrl(url),share=await shareForHandle(env,match[1],context).catch(()=>null);
    if(!share){
      const html=setupHtml(null,match[1],'공개된 개인 프로필을 찾을 수 없습니다.');
      return new Response(request.method==='HEAD'?null:html,{status:404,headers:publicCardHeaders({found:false,ready:false,qr:true})});
    }
    const html=qrHtml(share,match[1]);
    return new Response(request.method==='HEAD'?null:html,{status:200,headers:{...publicCardHeaders({found:true,ready:share.ready===true,qr:true}),'x-ekodi-surface-context':'person-digital-card-qr-center'}});
  }

  match=url.pathname.match(VCARD_RE);
  if(match){
    if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD'}});
    const context=contextFromUrl(url),share=await shareForHandle(env,match[1],context).catch(()=>null);
    if(!share||share.ready!==true||!share.selected_context){
      return new Response(request.method==='HEAD'?null:'공유모드를 선택해 주세요.',{status:409,headers:{...commonHeaders('text/plain; charset=utf-8'),'cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
    }
    return new Response(request.method==='HEAD'?null:vcard(share,match[1]),{headers:{...commonHeaders('text/vcard; charset=utf-8'),'cache-control':'public, max-age=45','content-disposition':`attachment; filename="${match[1]}.vcf"`,'x-robots-tag':'noindex, nofollow'}});
  }

  match=url.pathname.match(CARD_RE);
  if(match){
    if(!['GET','HEAD'].includes(request.method))return new Response('Method Not Allowed',{status:405,headers:{allow:'GET, HEAD'}});
    const context=contextFromUrl(url),share=await shareForHandle(env,match[1],context).catch(()=>null);
    if(!share){
 