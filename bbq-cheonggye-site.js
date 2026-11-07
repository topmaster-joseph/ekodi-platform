// Customer-safe BBQ storefront projection. Store identity, access and data remain in EKODI store_user_sites.
export const BBQ_CG_SLUG = 'bbqcg';
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const official = 'https://bbq.co.kr/';
function verifiedHttps(url) {
  try { const parsed = new URL(String(url || '')); return parsed.protocol === 'https:' ? parsed.href : ''; } catch { return ''; }
}
function phoneLink(value) { const digits=String(value || '').replace(/[^0-9+]/g, ''); return digits.length >= 8 ? 'tel:' + digits : ''; }
function hoursLabel(value) {
  if (typeof value === 'string') return value.slice(0, 120);
  if (!value || typeof value !== 'object') return '';
  if (typeof value.display === 'string') return value.display.slice(0, 120);
  return '';
}
async function publicSnapshot(env, fetchImpl) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const response = await fetchImpl(new URL('/rest/v1/rpc/store_user_site_public_snapshot',env.SUPABASE_URL), {
      method:'POST', headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},
      body:JSON.stringify({p_slug:BBQ_CG_SLUG})
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
export function bbqCheonggyeCss() {
  return new Response(`
:root{color-scheme:light;--ink:#1d2140;--muted:#5d657b;--brand:#171565;--gold:#ddab56;--line:#e7e8ef;--paper:#f9f9fc}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:var(--ink);background:var(--paper);word-break:keep-all}a{color:inherit;text-decoration:none}button{font:inherit}
.skip{position:absolute;left:-9999px;top:0}.skip:focus{left:12px;top:12px;z-index:20;background:#fff;padding:12px}
.wrap{width:min(1200px,calc(100% - 36px));margin-inline:auto}.header{background:#fff;border-bottom:1px solid var(--line)}.head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding-block:16px}.logo{font-size:20px;font-weight:900;letter-spacing:-.05em}.logo small{font-size:11px;color:var(--muted);display:block;letter-spacing:.08em}.nav{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:13px;font-weight:750}.nav a:hover,.links a:hover{text-decoration:underline}
.hero{background:radial-gradient(circle at 82% 20%,#39349a 0%,transparent 28%),linear-gradient(125deg,#11134a 0%,#252076 80%);color:#fff}.hero-inner{display:grid;grid-template-columns:1.4fr .65fr;align-items:center;gap:36px;min-height:420px;padding-block:64px}.eyebrow{font-size:11px;font-weight:850;letter-spacing:.13em;color:#f6d4a0}.hero h1{font-size:clamp(34px,5vw,61px);letter-spacing:-.07em;line-height:1.16;margin:16px 0}.hero p{font-size:clamp(14px,1.7vw,17px);max-width:570px;line-height:1.8;color:#e4e4f4}.hero-side{display:grid;place-items:center;min-height:230px;border:1px solid #ffffff3a;border-radius:30px;background:#ffffff10;text-align:center}.hero-side b{font-size:clamp(60px,10vw,104px);line-height:1;letter-spacing:-.09em}.hero-side small{display:block;margin-top:16px;color:#f3d4a1;font-weight:750}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.btn{display:inline-flex;justify-content:center;align-items:center;min-height:44px;padding:12px 19px;border:1px solid #fff5;border-radius:11px;font-size:14px;font-weight:850}.btn.primary{background:#f4c77d;color:#171549;border-color:#f4c77d}.btn.secondary{background:#ffffff15;color:#fff}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding-block:20px}.stat{padding:18px;background:#fff;border:1px solid var(--line);border-radius:16px}.stat small{display:block;font-size:12px;color:var(--muted);margin-bottom:8px}.stat strong{display:block;font-size:15px;overflow-wrap:break-word}
.section{padding-block:48px}.section-head{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:20px}.section h2{font-size:clamp(22px,3vw,30px);margin:0 0 6px}.section p{line-height:1.65;color:var(--muted);margin:0}.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px;min-width:0}.card h3{font-size:17px;margin:8px 0}.card p{font-size:13px}.card .num{font-size:12px;font-weight:900;color:var(--brand)}.card .link{display:block;margin-top:15px;font-size:13px;font-weight:850;color:var(--brand)}.menu-card{display:grid;gap:6px}.menu-card strong{font-size:17px}.menu-card span{font-size:12px;color:var(--muted)}.menu-card em{font-style:normal;font-size:14px;font-weight:800;color:var(--brand)}.notice{border-radius:18px;background:#eeeffa;border:1px solid #dddff6;padding:20px;line-height:1.75}.notice strong{display:block;margin-bottom:5px}.links{display:flex;gap:16px;flex-wrap:wrap}.foot{margin-top:35px;border-top:1px solid var(--line);padding:30px 0;color:var(--muted);font-size:12px;line-height:1.75}
@media(max-width:850px){.hero-inner{grid-template-columns:1fr;min-height:auto}.hero-side{min-height:150px}.hero-side b{font-size:60px}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.head{align-items:start;flex-direction:column}.nav{gap:13px}.wrap{width:calc(100% - 28px)}.hero-inner{padding-block:44px;gap:20px}.hero-side{display:none}.stats,.cards{grid-template-columns:1fr}.section{padding-block:34px}.section-head{align-items:start;flex-direction:column}.stat{padding:15px}.actions .btn{flex:1 1 160px}}
`,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}
export async function renderBbqCheonggyePage(request,env,profile={},fetchImpl=fetch) {
  const data=await publicSnapshot(env,fetchImpl);
  const store=data?.store||{};
  const name=escapeHtml(profile?.name||'BBQ 무안청계점');
  const address=escapeHtml(store.address||'매장 확인 후 안내');
  const hours=escapeHtml(hoursLabel(store.business_hours)||'매장 확인 후 안내');
  const phone=String(store.phone||'').trim();
  const phoneHref=phoneLink(phone);
  const publicPhone=escapeHtml(phone||'매장 확인 후 안내');
  const desc=escapeHtml(store.description||'매장 이용 안내를 준비하고 있습니다.');
  const menu=Array.isArray(data?.menu)?data.menu.filter(item=>item&&item.availability!=='hidden').slice(0,12):[];
  const menuHtml=menu.length?menu.map(item=>`<article class="card menu-card"><span>${escapeHtml(item.category||'메뉴')}</span><strong>${escapeHtml(item.name||'메뉴')}</strong><p>${escapeHtml(item.description||'')}</p>${Number.isFinite(Number(item.base_price))&&item.base_price!==null?`<em>${Number(item.base_price).toLocaleString('ko-KR')}원</em>`:''}</article>`).join(''):`<article class="card"><h3>BBQ 공식 메뉴 보기</h3><p>판매 메뉴와 가격은 본사 최신 안내와 주문 화면에서 확인해 주세요.</p><a class="link" href="${official}" target="_blank" rel="noopener noreferrer">공식 메뉴로 이동</a></article>`;
  // The tenant is still prelaunch until an authorized operator verifies its public data.
  const hasVerifiedPublicFacts=Boolean(store.address&&store.phone&&hoursLabel(store.business_hours));
  const robots=hasVerifiedPublicFacts?'index,follow':'noindex,nofollow,noarchive';
  const body=`<!doctype html><html lang="ko" data-store-entity="${BBQ_CG_SLUG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#171565"><meta name="robots" content="${robots}"><meta name="description" content="BBQ 무안청계점의 매장 정보와 공식 메뉴·주문 안내"><link rel="canonical" href="https://ekodi.kr/${BBQ_CG_SLUG}"><link rel="stylesheet" href="/${BBQ_CG_SLUG}/assets/site.css"><title>${name} | 매장 안내</title></head><body><a class="skip" href="#main">본문으로 이동</a><header class="header"><div class="wrap head"><a class="logo" href="/${BBQ_CG_SLUG}">BBQ 무안청계점<small>LOCAL STORE · EKODI</small></a><nav class="nav" aria-label="주요 메뉴"><a href="#guide">매장 안내</a><a href="#menu">메뉴</a><a href="#notice">소식</a><a href="/${BBQ_CG_SLUG}/admin">운영자 전용</a></nav></div></header><main id="main"><section class="hero"><div class="wrap hero-inner"><div><div class="eyebrow">BBQ MUAN CHEONGGYE · STORE</div><h1>가까운 곳에서 만나는<br>따뜻한 한 끼</h1><p>${name}의 매장 소식과 이용 정보를 확인하세요. 메뉴와 주문은 BBQ 공식 서비스를 통해 안내합니다.</p><div class="actions"><a class="btn primary" href="${official}" target="_blank" rel="noopener noreferrer">BBQ 공식 주문하기</a><a class="btn secondary" href="#guide">매장 이용 안내</a></div></div><div class="hero-side"><div><b>BBQ</b><small>MUAN CHEONGGYE</small></div></div></div></section><section class="wrap stats" id="guide" aria-label="매장 기본 정보"><div class="stat"><small>매장명</small><strong>${name}</strong></div><div class="stat"><small>영업시간</small><strong>${hours}</strong></div><div class="stat"><small>매장 전화</small><strong>${phoneHref?`<a href="${escapeHtml(phoneHref)}">${publicPhone}</a>`:publicPhone}</strong></div></section><section class="wrap section" id="menu"><div class="section-head"><div><h2>메뉴와 주문</h2><p>등록된 매장 메뉴만 표시하며, 최신 판매 여부와 가격은 공식 주문 화면에서 확인해 주세요.</p></div><a href="${official}" target="_blank" rel="noopener noreferrer">BBQ 공식 메뉴</a></div><div class="cards">${menuHtml}</div></section><section class="wrap section" id="notice"><div class="section-head"><div><h2>매장 안내</h2><p>검증된 매장 정보부터 차례로 안내합니다.</p></div></div><div class="cards"><article class="card"><span class="num">01 · 찾아오시는 길</span><h3>위치</h3><p>${address}</p></article><article class="card"><span class="num">02 · 매장 소식</span><h3>공지</h3><p>${desc}</p></article><article class="card"><span class="num">03 · 주문</span><h3>공식 주문 안내</h3><p>본사 주문 페이지에서 실제 주문 가능 매장과 배달·포장 여부를 확인합니다.</p><a class="link" href="${official}" target="_blank" rel="noopener noreferrer">공식 사이트로 이동</a></article></div></section></main><footer class="foot"><div class="wrap"><div class="links"><a href="${official}" target="_blank" rel="noopener noreferrer">BBQ 공식 사이트</a><a href="/${BBQ_CG_SLUG}/admin">매장 운영관리</a></div><p>매장 자체 안내 페이지입니다. 제너시스BBQ 본사 및 치킨대학 교육시스템과는 별도 운영됩니다.</p><p>교육 원문·조리 지침은 허가 없이 수집하거나 공개하지 않습니다.</p></div></footer></body></html>`;
  return new Response(request.method==='HEAD'?null:body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':robots,'x-ekodi-workspace':BBQ_CG_SLUG}});
}
