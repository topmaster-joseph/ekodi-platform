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
  return new Response("\n:root{color-scheme:light;--ink:#191a3e;--muted:#667087;--navy:#101347;--navy2:#29247f;--gold:#e7bf7b;--gold-light:#f9ead2;--red:#ca1730;--paper:#fffaf4;--line:#e8e3dc;--shadow:0 12px 36px rgba(16,19,71,.07)}\n*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:96px}body{margin:0;background:var(--paper);color:var(--ink);font-family:system-ui,-apple-system,\"Apple SD Gothic Neo\",\"Noto Sans KR\",sans-serif;word-break:keep-all;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}button{font:inherit}img{max-width:100%;display:block}.skip{position:absolute;left:-9999px;top:0}.skip:focus{left:12px;top:12px;z-index:99;background:#fff;padding:12px;border-radius:8px}.wrap{width:min(1300px,calc(100% - 48px));margin-inline:auto}\n.header{position:sticky;top:0;z-index:30;background:rgba(255,255,255,.98);border-bottom:3px solid var(--gold);box-shadow:0 4px 18px #10134709}.head{display:flex;align-items:center;justify-content:space-between;gap:22px;min-height:78px}.logo{display:flex;gap:16px;align-items:center;min-width:0}.logo-mark{font-family:Arial,sans-serif;color:var(--red);font-size:39px;line-height:1;font-weight:1000;letter-spacing:-.09em;white-space:nowrap}.logo-copy{border-left:1px solid #d8d9df;padding-left:15px;font-size:21px;font-weight:900;letter-spacing:-.06em;white-space:nowrap}.logo-copy small{display:block;color:#6b6e83;font-size:10px;letter-spacing:.03em;font-weight:650;margin-top:2px}.nav{display:flex;align-items:center;gap:clamp(10px,1.8vw,30px);font-size:14px;font-weight:800;white-space:nowrap}.nav a{padding:14px 0;transition:color .18s}.nav a:hover{color:#9d6934}.nav a:not(:last-child):after{content:\"\";display:inline-block;background:#d8d6dc;width:1px;height:12px;margin-left:clamp(10px,1.8vw,30px);vertical-align:middle}\na:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #c78e37;outline-offset:4px;border-radius:4px}\n.hero{isolation:isolate;overflow:hidden;position:relative;color:#fff;background:linear-gradient(108deg,#11123e 0%,#1e1c54 59%,#312979 100%)}.hero-photo{position:absolute;inset:0 0 0 42%;width:58%;height:100%;object-fit:cover;object-position:center 52%;opacity:.98;z-index:-2}.hero:before{position:absolute;content:\"\";inset:0;background:linear-gradient(90deg,#121342 0%,#121342 32%,rgba(18,19,66,.88) 47%,rgba(18,19,66,.08) 79%);z-index:-1}.hero:after{content:\"\";position:absolute;left:-130px;bottom:-240px;width:470px;height:470px;border:2px solid rgba(231,191,123,.7);border-radius:50%;pointer-events:none}.hero-inner{display:flex;align-items:center;min-height:445px;padding-block:58px}.hero-copy{position:relative;z-index:1;max-width:590px}.eyebrow{display:flex;align-items:center;gap:10px;font-size:11px;letter-spacing:.18em;font-weight:800;color:#f3cd92}.eyebrow:before{content:\"\";display:block;width:27px;height:1px;background:var(--gold)}.hero h1{font-size:clamp(43px,4.8vw,74px);letter-spacing:-.07em;line-height:1.17;margin:18px 0 14px;font-weight:900;text-wrap:balance}.hero h1 em{font-style:normal;color:var(--gold)}.hero .hero-store{font-size:20px;font-weight:750;color:#fff}.hero .hero-desc{font-size:14px;line-height:1.85;max-width:400px;color:#e8e5ef;margin:10px 0 0}.actions{display:flex;align-items:center;gap:11px;flex-wrap:wrap;margin-top:28px}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;min-height:47px;padding:12px 27px;font-size:14px;font-weight:850;border:1px solid rgba(255,255,255,.42);transition:transform .18s,box-shadow .18s}.btn.primary{color:#151642;background:linear-gradient(135deg,#f9dfaa,var(--gold));border-color:var(--gold)}.btn.secondary{background:#ffffff13;color:#fff}.btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px #0002}\n.stats-bg{background:#f5efe7;border-bottom:1px solid var(--line)}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;padding-block:20px}.stat{display:flex;align-items:center;gap:15px;min-width:0;padding:16px 20px;background:#fff;border:1px solid #e7e1db;border-radius:15px;box-shadow:0 5px 16px #14134209}.stat-icon{display:grid;place-items:center;flex:0 0 46px;width:46px;height:46px;border-radius:13px;background:var(--gold-light);color:#a57b43;font-size:23px}.stat-icon svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.stat small{display:block;font-size:12px;font-weight:750;color:var(--muted);margin-bottom:5px}.stat strong{display:block;overflow-wrap:anywhere;font-size:clamp(13px,1.45vw,19px);line-height:1.45;letter-spacing:-.03em}.stat .store-address{font-size:clamp(12px,1.2vw,16px)}\n.section{padding-block:54px}.section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px}.section h2{margin:0;font-size:clamp(25px,3vw,35px);line-height:1.3;letter-spacing:-.05em}.section .section-kicker{margin:0 0 8px;color:#ab8550;font-size:11px;letter-spacing:.15em;font-weight:850}.section p{line-height:1.7;color:var(--muted);margin:0}.section-head>a{font-weight:850;color:var(--navy);font-size:14px;border-bottom:1px solid var(--navy);padding-bottom:5px;white-space:nowrap}.section-subnote{font-size:12px;margin-top:13px!important}\n.showcase{display:grid;grid-template-columns:minmax(0,2.05fr) minmax(285px,1fr);gap:28px;align-items:start}.photo-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.photo-card{display:block;overflow:hidden;background:#fff;border-radius:15px;border:1px solid #e9e3dc;box-shadow:var(--shadow)}.photo-card img{width:100%;height:220px;aspect-ratio:4/3;object-fit:cover;transition:transform .3s}.photo-card:hover img{transform:scale(1.045)}.photo-card .photo-caption{padding:13px 14px 16px}.photo-card strong{display:block;font-size:16px;line-height:1.4}.photo-card small{display:block;color:#8c8b92;font-size:11px;margin-top:5px}.photo-card:nth-child(1) img{object-position:center 43%}.photo-card:nth-child(2) img{object-position:center 60%}.photo-card:nth-child(3) img{object-position:center 50%}\n.order-panel{background:#fff;border:1px solid #e5e0d9;border-radius:18px;padding:21px;box-shadow:var(--shadow)}.order-panel h2{font-size:24px;margin:0 0 17px}.order-panel .section-kicker{margin-bottom:8px}.order-option{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:74px;margin-bottom:9px;padding:14px 16px;background:var(--navy);border-radius:13px;color:#fff}.order-option.phone{color:#1d1d40;background:linear-gradient(125deg,#f6dcac,#e3b771)}.order-option strong{display:block;font-size:16px}.order-option small{display:block;margin-top:4px;font-size:12px;color:#dfdfec}.order-option.phone small{color:#594624}.order-icon{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border:1px solid #ffffff4d;border-radius:12px;font-size:20px}.order-option .arrow{font-size:25px;line-height:1}.qr-mini{display:grid;grid-template-columns:98px minmax(0,1fr);gap:14px;align-items:center;background:#f8f7f8;border:1px solid var(--line);border-radius:13px;padding:10px 12px}.qr-visual{width:92px;height:92px;padding:4px;background:#fff;display:grid;place-items:center}.qr-visual img,.qr-visual canvas{width:100%;height:auto;max-height:100%;object-fit:contain}.qr-mini strong{font-size:15px;display:block}.qr-mini p{font-size:11px;line-height:1.5;margin:5px 0;color:var(--muted)}.qr-actions{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin-top:6px}.qr-actions button{font-size:12px;font-weight:750;color:#252058;background:transparent;border:0;padding:0;text-decoration:underline;cursor:pointer}.qr-actions small{color:#6a7084;font-size:10px}.qr-actions a{font-size:12px;color:var(--navy);text-decoration:underline}\n.pending-channels{margin-top:12px;border-top:1px solid var(--line);padding-top:12px}.pending-channels summary{font-size:12px;cursor:pointer;color:#73758a;font-weight:750}.pending-list{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:9px}.pending-list span{font-size:11px;color:#797d8d;background:#f4f4f7;border-radius:7px;padding:8px;text-align:center}.pending-list small{display:block;font-size:10px;line-height:1.5}\n.verified-menu{margin-top:22px;border:1px solid var(--line);border-radius:14px;background:#fff;padding:20px}.verified-menu h3{margin:0 0 12px}.verified-menu-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.menu-card{padding:15px;border-radius:12px;background:#f8f7f4;border:1px solid #eceae6}.menu-card strong{display:block;margin:5px 0}.menu-card span,.menu-card p{font-size:12px;color:#697082}.menu-card em{font-style:normal;color:var(--navy);font-weight:800}\n.details-area{padding-block:36px 46px;border-top:1px solid #eee9df}.info-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.info-card{padding:23px;background:#fff;border-radius:16px;border:1px solid var(--line);min-height:168px}.info-card .num{font-size:11px;font-weight:900;letter-spacing:.15em;color:#bd9054}.info-card h3{margin:10px 0;font-size:18px}.info-card p{font-size:13px;line-height:1.75;overflow-wrap:anywhere}.info-card a{display:inline-flex;margin-top:12px;font-size:13px;font-weight:850;color:var(--navy);text-decoration:underline}\n.links{display:flex;gap:22px;flex-wrap:wrap}.foot{background:#151639;color:#dedce7;padding:26px 0;font-size:12px}.foot-inner{display:flex;align-items:center;justify-content:space-between;gap:16px}.foot-note{font-size:12px;color:#b7b8cf}\n@media(max-width:1100px){.head{min-height:72px}.logo-mark{font-size:31px}.logo-copy{font-size:18px}.nav{font-size:12px}.showcase{grid-template-columns:1fr}.photo-card img{height:240px}.order-panel{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.order-panel h2,.order-panel .section-kicker,.order-panel .pending-channels{grid-column:1/-1}.order-option{margin:0}.qr-mini{grid-column:1/-1}.stat{padding:14px}.stat-icon{flex-basis:39px;width:39px;height:39px}}\n@media(max-width:720px){.wrap{width:calc(100% - 32px)}.head{min-height:68px;flex-wrap:wrap;padding:11px 0 8px;gap:9px}.logo-mark{font-size:30px}.logo-copy{font-size:16px}.nav{width:100%;overflow-x:auto;justify-content:flex-start;flex-wrap:nowrap;gap:15px;scrollbar-width:none}.nav::-webkit-scrollbar{display:none}.nav a{padding:8px 0 11px}.nav a:not(:last-child):after{margin-left:15px}.hero-inner{min-height:415px;align-items:end;padding-block:65px 45px}.hero-photo{inset:0;width:100%;opacity:.55;object-position:60% 50%}.hero:before{background:linear-gradient(90deg,rgba(13,15,54,.98),rgba(13,15,54,.78) 64%,rgba(13,15,54,.45))}.hero h1{font-size:clamp(36px,8.6vw,57px)}.hero .hero-store{font-size:17px}.hero .hero-desc{font-size:13px}.stats{grid-template-columns:1fr;gap:8px;padding-block:11px}.stat{padding:11px 14px}.stat small{margin-bottom:1px}.stat strong{font-size:15px}.stat .store-address{font-size:13px}.section{padding-block:38px}.section-head{align-items:start}.photo-grid{gap:8px}.photo-card img{height:190px}.photo-card .photo-caption{padding:10px}.photo-card strong{font-size:13px}.photo-card small{font-size:10px}.info-grid{grid-template-columns:1fr}.info-card{min-height:0}.foot-inner{align-items:flex-start;flex-direction:column}}\n@media(max-width:560px){.hero-inner{min-height:400px}.hero:after{width:310px;height:310px;left:-120px;bottom:-170px}.photo-grid{grid-template-columns:1fr;gap:12px}.photo-card{display:grid;grid-template-columns:130px minmax(0,1fr);align-items:center;min-height:128px}.photo-card img{height:128px;width:130px;aspect-ratio:1;object-fit:cover}.photo-card .photo-caption{padding:14px}.order-panel{display:block;padding:17px}.order-option{margin-bottom:9px}.qr-mini{grid-template-columns:90px minmax(0,1fr)}.qr-visual{width:85px;height:85px}.verified-menu-grid{grid-template-columns:1fr}.section-head{flex-direction:column;align-items:flex-start}.logo-copy small{font-size:9px}.stat-icon{font-size:20px}.pending-list{grid-template-columns:1fr}.actions .btn{flex:1 1 auto;min-width:110px;padding:11px 17px}}\n@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn,.photo-card img,.nav a{transition:none}}\n", {headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
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
  const menuHtml=menu.length?`<section class="verified-menu" aria-labelledby="verified-menu-heading"><h3 id="verified-menu-heading">우리 매장에 등록된 메뉴</h3><div class="verified-menu-grid">${menu.map(item=>`<article class="menu-card"><span>${escapeHtml(item.category||'메뉴')}</span><strong>${escapeHtml(item.name||'메뉴')}</strong><p>${escapeHtml(item.description||'')}</p>${Number.isFinite(Number(item.base_price))&&item.base_price!==null?`<em>${Number(item.base_price).toLocaleString('ko-KR')}원</em>`:''}</article>`).join('')}</div></section>`:'';
  // The tenant is still prelaunch until an authorized operator verifies its public data.
  const hasVerifiedPublicFacts=Boolean(store.address&&store.phone&&hoursLabel(store.business_hours));
  const robots=hasVerifiedPublicFacts?'index,follow':'noindex,nofollow,noarchive';
  const body=`<!doctype html>
<html lang="ko" data-store-entity="bbqcg">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#111342">
<meta name="robots" content="${robots}">
<meta name="description" content="BBQ 무안청계점 매장정보, BBQ 공식 메뉴, 주문방법과 방문 안내">
<link rel="canonical" href="https://ekodi.kr/bbqcg">
<link rel="preconnect" href="https://images.unsplash.com" crossorigin>
<link rel="preload" as="image" href="https://images.unsplash.com/photo-1742936401708-dd1b132f06db?auto=format&amp;fit=crop&amp;w=1400&amp;q=78" fetchpriority="high">
<link rel="stylesheet" href="/bbqcg/assets/site.css">
<title>${name} | 매장 안내</title>
</head>
<body>
<a class="skip" href="#main">본문으로 이동</a>
<header class="header"><div class="wrap head">
<a class="logo" href="/bbqcg" aria-label="BBQ 무안청계점 홈"><span class="logo-mark" aria-hidden="true">BBQ</span><span class="logo-copy">BBQ 무안청계점<small>우리 동네 BBQ · 무안청계점</small></span></a>
<nav class="nav" aria-label="주요 메뉴"><a href="#guide">매장안내</a><a href="#menu">BBQ 메뉴</a><a href="#order">주문하기</a><a href="#notice">매장소식</a><a href="#directions">오시는 길</a></nav>
</div></header>
<main id="main">
<section class="hero" aria-labelledby="hero-heading">
<img class="hero-photo" src="https://images.unsplash.com/photo-1742936401708-dd1b132f06db?auto=format&amp;fit=crop&amp;w=1400&amp;q=78" width="1400" height="1000" alt="노릇하게 튀겨진 치킨을 담은 음식 연출 사진" decoding="async" fetchpriority="high">
<div class="wrap hero-inner"><div class="hero-copy">
<div class="eyebrow">BBQ MUAN CHEONGGYE</div>
<h1 id="hero-heading">바삭함의 기준,<br>오늘도 <em>BBQ</em></h1>
<div class="hero-store">BBQ 무안청계점</div>
<p class="hero-desc">가까운 곳에서 만나는 따뜻한 한 끼.<br>매장 안내부터 메뉴·주문방법까지 한눈에 확인하세요.</p>
<div class="actions"><a class="btn primary" href="#order">주문방법 보기 <span aria-hidden="true">›</span></a><a class="btn secondary" href="#guide">매장안내</a></div>
</div></div></section>
<div class="stats-bg"><section class="wrap stats" id="guide" aria-label="매장 기본 정보">
<div class="stat"><span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/></svg></span><div><small>영업시간</small><strong>${hours}</strong></div></div>
<div class="stat"><span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 16.4v3a2 2 0 0 1-2.2 2 18 18 0 0 1-16.2-16A2 2 0 0 1 4.6 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.8l-1.7 1.5a15 15 0 0 0 5.4 5.4l1.5-1.7a2 2 0 0 1 1.8-.6l2.8.5A2 2 0 0 1 21 16.4Z"/></svg></span><div><small>매장전화</small><strong>${phoneHref?`<a href="${escapeHtml(phoneHref)}">${publicPhone}</a>`:publicPhone}</strong></div></div>
<div class="stat"><span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><div><small>오시는 길</small><strong class="store-address">${address}</strong></div></div>
</section></div>
<section class="wrap section" id="menu" aria-labelledby="menu-heading">
<div class="showcase">
<div class="menu-content"><div class="section-head"><div><p class="section-kicker">OUR FAVORITES</p><h2 id="menu-heading">BBQ 대표 메뉴</h2></div><a href="${official}" target="_blank" rel="noopener noreferrer">공식 메뉴 전체보기 ›</a></div>
<div class="photo-grid">
<article class="photo-card"><img src="https://images.unsplash.com/photo-1742936401708-dd1b132f06db?auto=format&amp;fit=crop&amp;w=600&amp;q=75" width="400" height="300" loading="lazy" decoding="async" alt="바삭한 후라이드 치킨 연출 사진"><div class="photo-caption"><strong>황금올리브치킨™</strong><small>이미지 예시 · 판매 여부 확인</small></div></article>
<article class="photo-card"><img src="https://images.unsplash.com/photo-1624153064067-566cae78993d?auto=format&amp;fit=crop&amp;w=600&amp;q=75" width="400" height="300" loading="lazy" decoding="async" alt="양념을 입힌 치킨 연출 사진"><div class="photo-caption"><strong>오리지날 양념치킨</strong><small>이미지 예시 · 판매 여부 확인</small></div></article>
<article class="photo-card"><img src="https://images.unsplash.com/photo-1766589221324-656419e4c844?auto=format&amp;fit=crop&amp;w=600&amp;q=75" width="400" height="300" loading="lazy" decoding="async" alt="소스와 함께 제공된 튀김치킨 연출 사진"><div class="photo-caption"><strong>BBQ 인기 메뉴</strong><small>이미지 예시 · 판매 여부 확인</small></div></article>
</div>
<p class="section-subnote">사진은 메뉴 연출 예시이며 BBQ 본사 제품 사진이 아닙니다. 매장별 판매 메뉴와 가격은 공식 주문 화면에서 확인해 주세요.</p>
</div>
<aside class="order-panel" id="order" aria-labelledby="order-heading">
<p class="section-kicker">EASY ORDER</p><h2 id="order-heading">간편 주문하기</h2>
<a class="order-option" href="${official}" target="_blank" rel="noopener noreferrer"><span class="order-icon" aria-hidden="true">▤</span><span><strong>BBQ 공식 주문</strong><small>본사에서 무안청계점 선택 후 주문</small></span><span class="arrow" aria-hidden="true">›</span></a>
<a class="order-option phone" href="${phoneHref?escapeHtml(phoneHref):'#guide'}"><span class="order-icon" aria-hidden="true">☎</span><span><strong>전화 주문</strong><small>${publicPhone}</small></span><span class="arrow" aria-hidden="true">›</span></a>
<div class="qr-mini"><div id="bbqOrderQr" class="qr-visual" role="img" aria-label="BBQ 무안청계점 주문방법 안내 QR"></div><div><strong>주문 안내 QR</strong><p>스캔하면 주문방법 페이지로 연결됩니다. QR로 직접 결제되지는 않습니다.</p><div class="qr-actions"><button type="button" id="bbqQrDownload">QR 저장</button><a href="/bbqcg#order">안내 링크</a><small id="bbqQrStatus" aria-live="polite">QR 생성 준비 중</small></div></div></div>
<details class="pending-channels"><summary>배달앱 주문 채널 확인</summary><div class="pending-list"><span>배달의민족<small>청계점 전용 주문 링크 확인 중</small></span><span>요기요<small>청계점 전용 주문 링크 확인 중</small></span><span>쿠팡이츠<small>청계점 전용 주문 링크 확인 중</small></span></div></details>
</aside></div>
${menuHtml}
</section>
<section class="details-area" id="notice" aria-labelledby="notice-heading"><div class="wrap"><div class="section-head"><div><p class="section-kicker">STORE INFORMATION</p><h2 id="notice-heading">매장 안내</h2></div><p>방문 전 운영 정보를 확인해 주세요.</p></div>
<div class="info-grid" id="directions">
<article class="info-card"><span class="num">01 · LOCATION</span><h3>찾아오시는 길</h3><p>${address}</p><a href="https://map.naver.com/p/search/%EB%AC%B4%EC%95%88%EA%B5%B0%20%EC%B2%AD%EA%B3%84%EB%A9%B4%20%EC%8A%B9%EB%8B%AC%EC%82%B0%EA%B8%B8%2037-1" target="_blank" rel="noopener noreferrer">지도에서 찾기 ›</a></article>
<article class="info-card"><span class="num">02 · NEWS</span><h3>매장 소식</h3><p>${desc}</p></article>
<article class="info-card"><span class="num">03 · ORDER</span><h3>주문 안내</h3><p>온라인 주문은 BBQ 공식 페이지에서 매장 및 배달·포장 가능 여부를 확인해 주세요.</p><a href="${official}" target="_blank" rel="noopener noreferrer">공식 주문으로 이동 ›</a></article>
</div></div></section>
</main>
<footer class="foot"><div class="wrap foot-inner"><span class="foot-note">BBQ 무안청계점</span><div class="links"><a href="${official}" target="_blank" rel="noopener noreferrer">BBQ 공식 사이트</a><a href="/bbqcg/admin">매장 운영관리</a></div></div></footer>
<script defer src="/my/vendor/qrcode.min.js"></script><script defer src="/bbqcg/assets/order-qr.js"></script>
</body></html>`;
  return new Response(request.method==='HEAD'?null:body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':robots,'x-ekodi-workspace':BBQ_CG_SLUG}});
}

export function bbqCheonggyeQrScript(){
  const js=`(()=>{
    'use strict';
    const target='https://ekodi.kr/bbqcg#order';
    const host=document.getElementById('bbqOrderQr');
    const status=document.getElementById('bbqQrStatus');
    const download=document.getElementById('bbqQrDownload');
    const message=value=>{if(status)status.textContent=value};
    if(!host)return;
    if(typeof QRCode!=='function'){message('QR을 표시할 수 없습니다. 안내 링크를 이용해 주세요.');return}
    try{new QRCode(host,{text:target,width:240,height:240,colorDark:'#171565',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});message('QR 생성 완료')}catch{message('QR 생성 오류. 안내 링크를 이용해 주세요.')}
    download?.addEventListener('click',()=>{
      const canvas=host.querySelector('canvas'),image=host.querySelector('img');
      const source=canvas?.width&&canvas?.height?canvas:(image?.complete&&image?.naturalWidth?image:null);
      if(!source){message('QR 이미지 준비 중입니다.');return}
      try{const c=document.createElement('canvas');c.width=360;c.height=360;const ctx=c.getContext('2d');if(!ctx)throw Error('no-canvas');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,360,360);ctx.imageSmoothingEnabled=false;ctx.drawImage(source,60,60,240,240);
      const link=document.createElement('a');link.href=c.toDataURL('image/png');link.download='BBQ-무안청계점-주문안내-QR.png';link.click();message('QR 이미지 저장 시작')}
      catch{message('이미지 저장을 지원하지 않는 환경입니다.')}
    });
  })();`;
  return new Response(js,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}
