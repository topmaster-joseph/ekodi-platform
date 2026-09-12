import { YOGURT_PURPLE_CATALOG_SNAPSHOT } from './yogurtpurple-catalog-snapshot.js';

const BRAND = Object.freeze({
  pizzamaru: {
    brand: '피자마루', branch: '목포대점', category: '피자', mark: 'PIZZA MARU',
    kicker: '정직한 피자, 가까운 목포대점',
    lead: '국립목포대학교 후문에서 피자마루 메뉴·가격·주문을 한 화면에서 확인하세요.',
    promo: '오늘의 피자를 한눈에, 주문은 더 빠르게.',
    heroLine: '좋은 재료와 익숙한 맛, 목포대 후문에서 바로.',
    official: 'https://www.pizzamaru.co.kr',
    officialMenu: 'https://www.pizzamaru.co.kr/menu/',
    officialOrder: 'https://www.pizzamaru.co.kr/orderchoice/?deliv_type=1',
    imageHosts: ['www.pizzamaru.co.kr', 'pizzamaru.co.kr', 'static.devpizzamaru.com'],
    theme: 'pizza'
  },
  yogurt: {
    brand: '요거트퍼플', branch: '목포대점', category: '요거트 · 디저트', mark: 'YOGURT PURPLE',
    kicker: '오늘도 상큼한 하루',
    lead: '국립목포대학교 후문에서 만나는 요거트퍼플. 메뉴·가격·배달주문을 한 화면에서 연결합니다.',
    promo: '가볍고 상큼하게, 오늘의 퍼플 모먼트.',
    heroLine: '좋은 요거트가 좋은 하루를 만듭니다.',
    official: 'https://www.yogurtpurple.com/',
    officialMenu: 'https://www.yogurtpurple.com/',
    officialOrder: '',
    imageHosts: ['www.yogurtpurple.com', 'yogurtpurple.com'],
    theme: 'yogurt'
  }
});

const YOGURT_DELIVERY_PROVIDERS = Object.freeze(['ddangyo','baemin','yogiyo','mukkebi','coupang_eats']);
const YOGURT_OFFICIAL_BY_NAME = new Map(YOGURT_PURPLE_CATALOG_SNAPSHOT.map((item)=>[String(item.name).replace(/[^0-9A-Za-z가-힣]+/g,'').toLowerCase(),item]));
const YOGURT_REPRESENTATIVE_NAMES = Object.freeze(['플레인요거트아이스크림','딸기요아츄','허니그래놀라','플레인 그릭','딸기스무디볼','딸기요거와상']);
const YOGURT_FALLBACK_ORDERS = Object.freeze([
  {provider:'ddangyo',label:'땡겨요',url:'https://play.google.com/store/apps/details?hl=ko&id=com.shinhan.o2o'},
  {provider:'baemin',label:'배달의민족',url:'https://www.baemin.com/'},
  {provider:'yogiyo',label:'요기요',url:'https://www.yogiyo.co.kr/mobile/'},
  {provider:'mukkebi',label:'먹깨비',url:'https://mukkebi.com/'},
]);

const PROVIDERS = Object.freeze({
  ddangyo: { label: '땡겨요', short: '땡', order: 1 },
  baemin: { label: '배달의민족', short: '배', order: 2 },
  yogiyo: { label: '요기요', short: '요', order: 3 },
  mukkebi: { label: '먹깨비', short: '먹', order: 4 },
  coupang_eats: { label: '쿠팡이츠', short: 'C', order: 5 },
  daangn_order: { label: '당근주문', short: '당', order: 6 },
  naver_order: { label: '네이버주문', short: 'N', order: 7 },
  store: { label: '공식 주문', short: '공', order: 8 }
});

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function safeHttps(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}
function safeImage(value, hosts = []) {
  const src = safeHttps(value);
  if (!src) return '';
  if (!hosts.length) return src;
  try { return hosts.includes(new URL(src).hostname.toLowerCase()) ? src : ''; }
  catch { return ''; }
}
function phoneText(value) { return String(value || '').trim(); }
function telUrl(value) {
  const phone = phoneText(value).replace(/[^0-9+]/g, '');
  return phone ? `tel:${phone}` : '';
}
function won(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('ko-KR')}원` : '';
}
function hoursText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(String).join(' · ');
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => `${key} ${Array.isArray(item) ? item.join(', ') : String(item)}`).join(' · ');
  }
  return '';
}
function mapUrl(address, name) {
  const query = [name, address].filter(Boolean).join(' ');
  return query ? `https://map.naver.com/p/search/${encodeURIComponent(query)}` : '';
}
function providerMeta(provider) {
  return PROVIDERS[provider] || { label: String(provider || '배달앱'), short: '앱', order: 99 };
}
async function loadSnapshot(slug, env) {
  if (!slug || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  try {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/store_user_site_public_snapshot`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ p_slug: slug })
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data && typeof data === 'object' ? data : null;
  } catch { return null; }
}
function normalizeChannels(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => row?.provider).map((row) => ({
    ...row,
    order_url: safeHttps(row.order_url) || safeHttps(row.direct_url),
    meta: providerMeta(row.provider)
  }));
  return list.sort((a, b) => a.meta.order - b.meta.order || String(a.meta.label).localeCompare(String(b.meta.label), 'ko'));
}
function normalizedListings(item, channels) {
  const channelMap = new Map(channels.map((channel) => [channel.provider, channel]));
  return (Array.isArray(item?.listings) ? item.listings : []).map((row) => {
    const meta = providerMeta(row.provider);
    const channel = channelMap.get(row.provider);
    return {
      ...row,
      label: row.display_name || meta.label,
      sort: meta.order,
      image_url: safeHttps(row.image_url),
      order_url: safeHttps(row.order_url) || channel?.order_url || ''
    };
  }).filter((row) => row.price != null || row.order_url || row.image_url)
    .sort((a, b) => a.sort - b.sort || String(a.label).localeCompare(String(b.label), 'ko'));
}
function yogurtOfficialMatch(item) {
  const key=String(item?.name||'').replace(/[^0-9A-Za-z가-힣]+/g,'').toLowerCase();
  return key ? YOGURT_OFFICIAL_BY_NAME.get(key) || null : null;
}
function enrichYogurtMenu(items) {
  return items.map((item)=>{
    const official=yogurtOfficialMatch(item);
    return official ? {...item,image_url:official.image_url,category:item.category||official.category,official_product_url:official.product_url} : item;
  });
}
function yogurtRepresentativeMenu(menu, channels, fallback=false) {
  if(fallback){
    const picked=YOGURT_REPRESENTATIVE_NAMES.map((name)=>YOGURT_OFFICIAL_BY_NAME.get(name.replace(/[^0-9A-Za-z가-힣]+/g,'').toLowerCase())).filter(Boolean);
    return picked.length ? picked.map((item)=>({...item,source_basis:'brand_official'})) : menu.slice(0,6);
  }
  return [...menu].sort((a,b)=>{
    const score=(item)=>normalizedListings(item,channels).filter((row)=>YOGURT_DELIVERY_PROVIDERS.includes(row.provider)).length;
    return score(b)-score(a);
  }).slice(0,6);
}

function menuImage(item, meta, channels) {
  const hosts = meta.imageHosts.map((host) => host.toLowerCase());
  const official = safeImage(item?.image_url, hosts);
  if (official) return official;
  const listing = normalizedListings(item, channels).find((row) => row.image_url);
  return listing?.image_url || '';
}
function heroImage(menu, meta, channels) {
  for (const item of menu) {
    const image = menuImage(item, meta, channels);
    if (image) return image;
  }
  return '';
}
function action(href, label, className = '', external = false) {
  if (!href) return '';
  return `<a class="rs-action ${escapeHtml(className)}" href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>`;
}
function menuCard(item, meta, channels, index) {
  const listings = normalizedListings(item, channels);
  const image = menuImage(item, meta, channels);
  const priced = listings.filter((row) => Number.isFinite(Number(row.price)));
  const minimum = priced.length ? Math.min(...priced.map((row) => Number(row.price))) : null;
  const base = item?.base_price != null ? won(item.base_price) : '';
  const source = item?.source_basis === 'brand_official' ? '본사 기준' : '목포대점 확인';
  const listingHtml = listings.slice(0, 5).map((row) => `<div class="rs-price-row"><span>${escapeHtml(row.label)}</span><strong>${row.price != null ? escapeHtml(won(row.price)) : '가격 확인'}</strong>${row.order_url ? `<a href="${escapeHtml(row.order_url)}" target="_blank" rel="noopener noreferrer">주문</a>` : '<i></i>'}</div>`).join('');
  return `<article class="rs-menu-card">
    <div class="rs-menu-media">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="rs-food-fallback"><span>${index + 1}</span><b>${escapeHtml(meta.category)}</b></div>`}</div>
    <div class="rs-menu-body"><div class="rs-menu-meta"><span>${escapeHtml(item.category || meta.category)}</span><small>${escapeHtml(source)}</small></div><h3>${escapeHtml(item.name)}</h3>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      ${base ? `<div class="rs-base"><span>기준가</span><strong>${escapeHtml(base)}</strong></div>` : ''}
      ${listingHtml ? `<div class="rs-prices">${listingHtml}</div>` : '<div class="rs-price-empty">검증된 앱 가격이 연결되면 자동으로 표시됩니다.</div>'}
      ${minimum != null && priced.length > 1 ? `<em>확인된 앱 최저 ${escapeHtml(won(minimum))}</em>` : ''}
    </div></article>`;
}
function yogurtFullMenuCard(item,meta,channels,index,fallback){
  const image=menuImage(item,meta,channels);
  const listings=normalizedListings(item,channels).filter((row)=>YOGURT_DELIVERY_PROVIDERS.includes(row.provider));
  const prices=listings.slice(0,5).map((row)=>`<div class="rs-price-row"><span>${escapeHtml(row.label)}</span><strong>${row.price!=null?escapeHtml(won(row.price)):'가격 확인'}</strong>${row.order_url?`<a href="${escapeHtml(row.order_url)}" target="_blank" rel="noopener noreferrer">주문</a>`:'<i></i>'}</div>`).join('');
  return `<article class="rs-all-menu-card"><div class="rs-all-menu-media">${image?`<img src="${escapeHtml(image)}" alt="${escapeHtml(item.name)}" loading="lazy" referrerpolicy="no-referrer">`:'<span>YOGURT PURPLE</span>'}</div><div class="rs-all-menu-body"><small>${escapeHtml(item.category||meta.category)}</small><h3>${escapeHtml(item.name)}</h3>${prices?`<div class="rs-prices">${prices}</div>`:`<p>${fallback?'본사 공식 메뉴 이미지 기준 · 목포대점 판매 여부와 가격은 배달앱에서 확인':'배달앱 등록 가격 확인 중'}</p>`}</div></article>`;
}
function yogurtFullMenu(menu,meta,channels,fallback){
  const groups=new Map();
  for(const item of menu){const category=String(item.category||meta.category);if(!groups.has(category))groups.set(category,[]);groups.get(category).push(item);}
  const body=[...groups].map(([category,items])=>`<section class="rs-all-menu-group"><div class="rs-all-menu-title"><h3>${escapeHtml(category)}</h3><span>${items.length}개</span></div><div class="rs-all-menu-grid">${items.map((item,index)=>yogurtFullMenuCard(item,meta,channels,index,fallback)).join('')}</div></section>`).join('');
  const basis=fallback?'본사 공식 메뉴 166종을 이미지 기준으로 표시합니다. 목포대점 실제 판매 메뉴·가격은 배달의민족·요기요·땡겨요·먹깨비 등 검증된 등록 데이터가 연결되면 자동으로 우선 표시됩니다.':'목포대점 배달앱 등록 메뉴를 기준으로 전체 메뉴를 표시하며, 동일 메뉴의 이미지는 본사 공식 이미지를 우선 사용합니다.';
  return `<details id="all-menu" class="rs-full-menu"><summary><span><b>전체메뉴 자세히 보기</b><small>${escapeHtml(basis)}</small></span><strong>펼치기</strong></summary><div class="rs-all-menu-content">${body}</div></details>`;
}

function orderCards(channels, meta, phone) {
  const usable = channels.filter((channel) => channel.order_url);
  const cards = usable.map((channel) => `<a class="rs-order-card p-${escapeHtml(channel.provider)}" href="${escapeHtml(channel.order_url)}" target="_blank" rel="noopener noreferrer"><i>${escapeHtml(channel.meta.short)}</i><span><b>${escapeHtml(channel.display_name || channel.meta.label)}</b><small>목포대점 주문 바로가기</small></span><strong>→</strong></a>`).join('');
  if (cards) return cards;
  const fallback = meta.theme==='yogurt' ? YOGURT_FALLBACK_ORDERS.map((row)=>{const m=providerMeta(row.provider);return `<a class="rs-order-card p-${escapeHtml(row.provider)}" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer"><i>${escapeHtml(m.short)}</i><span><b>${escapeHtml(row.label)}</b><small>앱에서 요거트퍼플 목포대점 검색</small></span><strong>→</strong></a>`;}).join('') : '';
  const official = safeHttps(meta.officialOrder);
  return `${fallback}${official ? `<a class="rs-order-card official" href="${escapeHtml(official)}" target="_blank" rel="noopener noreferrer"><i>공</i><span><b>${escapeHtml(meta.brand)} 공식 주문</b><small>공식 주문 화면에서 매장을 확인하세요</small></span><strong>→</strong></a>` : ''}${phone ? `<a class="rs-order-card phone" href="${escapeHtml(telUrl(phone))}"><i>☎</i><span><b>전화 주문</b><small>${escapeHtml(phone)}</small></span><strong>→</strong></a>` : ''}`;
}
function categoryChips(menu, meta) {
  const seen = [];
  for (const item of menu) {
    const label = String(item?.category || '').trim();
    if (label && !seen.includes(label)) seen.push(label);
    if (seen.length >= 5) break;
  }
  const fallback = meta.theme === 'pizza' ? ['클래식 피자', '프리미엄 피자', '사이드', '음료'] : ['요거트아이스크림', '그릭요거트', '디저트', '음료'];
  return (seen.length ? seen : fallback).map((label) => `<span>${escapeHtml(label)}</span>`).join('');
}

const CSS = `
:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;word-break:keep-all;--max:1240px;--radius:18px;--ink:#17231b;--muted:#69736c;--line:#dfe7e1;--paper:#fff;--soft:#f6faf6;--brand:#155c34;--accent:#ee5a24;--deep:#0e3d23;--hero:#f4f8f2;--chip:#edf5ee;--shadow:0 14px 40px rgba(22,51,31,.08)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:var(--ink);background:#fff}a{color:inherit}.rs{min-height:100vh;overflow:hidden}.rs-shell{width:min(var(--max),calc(100% - 42px));margin:auto}
html[data-restaurant-theme="pizza"]{--brand:#0f6539;--accent:#e84b22;--deep:#174028;--hero:#fbfaf3;--chip:#f0f6ed;--line:#e3e8dc;--soft:#f7f8f0}html[data-restaurant-theme="yogurt"]{--ink:#341742;--muted:#77657f;--line:#eadff0;--paper:#fff;--soft:#faf6fc;--brand:#62218c;--accent:#f04482;--deep:#43155f;--hero:#fbf6ff;--chip:#f2e7f9;--shadow:0 14px 40px rgba(83,35,107,.09)}
.rs-top{height:74px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.97);display:flex;align-items:center}.rs-top .rs-shell{display:flex;align-items:center;justify-content:space-between;gap:20px}.rs-logo{display:flex;align-items:center;gap:11px;text-decoration:none}.rs-logo-mark{display:grid;place-items:center;min-width:42px;height:32px;padding:0 8px;border-radius:9px;background:var(--brand);color:#fff;font-size:11px;font-weight:950;letter-spacing:-.02em}.rs-logo-copy b{display:block;font-size:17px;line-height:1}.rs-logo-copy small{display:block;margin-top:4px;color:var(--muted);font-size:10px;font-weight:750}.rs-nav{display:flex;align-items:center;gap:25px}.rs-nav a{text-decoration:none;font-size:12px;font-weight:850}.rs-nav .rs-call{padding:10px 16px;border-radius:999px;background:var(--brand);color:#fff}
.rs-hero{border-bottom:1px solid var(--line);background:var(--hero)}.rs-hero-grid{width:min(1400px,100%);margin:auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(480px,1.12fr);min-height:480px}.rs-hero-copy{display:flex;flex-direction:column;justify-content:center;padding:56px max(36px,calc((100vw - var(--max))/2)) 52px max(36px,calc((100vw - var(--max))/2));padding-right:44px}.rs-kicker{margin:0 0 13px;color:var(--brand);font-size:13px;font-weight:950}.rs-hero h1{margin:0;line-height:.94;letter-spacing:-.065em}.rs-hero h1 span{display:block;color:var(--accent);font-size:clamp(48px,5.3vw,78px);font-weight:950}.rs-hero h1 strong{display:block;margin-top:8px;color:var(--deep);font-size:clamp(47px,5vw,73px);font-weight:950}.rs-lead{max-width:600px;margin:22px 0 0;color:#334238;font-size:15px;line-height:1.65;font-weight:700}.rs-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:28px}.rs-action{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid var(--line);border-radius:11px;background:#fff;text-decoration:none;font-size:12px;font-weight:900}.rs-action.primary{background:var(--brand);border-color:var(--brand);color:#fff}.rs-action.accent{background:var(--accent);border-color:var(--accent);color:#fff}
.rs-hero-media{position:relative;min-height:480px;overflow:hidden;background:linear-gradient(145deg,var(--deep),#161b18)}.rs-hero-media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.05) contrast(1.03)}.rs-hero-media:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.05),rgba(0,0,0,.35))}.rs-hero-statement{position:absolute;z-index:2;right:34px;top:32px;max-width:360px;color:#fff;text-align:right}.rs-hero-statement small{font-size:14px;opacity:.84}.rs-hero-statement strong{display:block;margin-top:4px;font-size:34px;line-height:1.08;letter-spacing:-.05em}.rs-hero-statement em{display:block;margin-top:12px;font-size:12px;line-height:1.5;font-style:normal;opacity:.82}.rs-art{position:absolute;inset:0;z-index:1;display:grid;place-items:center}.rs-art:before{content:"";width:340px;height:340px;border-radius:50%;background:radial-gradient(circle at 50% 42%,#fff 0 23%,#f7eafc 24% 38%,#a76ac5 39% 46%,#5b1b7c 47% 100%);box-shadow:0 36px 80px rgba(0,0,0,.32);transform:rotate(-8deg)}.rs-art:after{content:"YOGURT\A PURPLE";white-space:pre;position:absolute;color:#fff;font-size:24px;line-height:.85;text-align:center;font-weight:950;letter-spacing:-.04em}.rs-hero-media.no-image{background:radial-gradient(circle at 72% 30%,#b77dd0 0 10%,transparent 10.5%),radial-gradient(circle at 35% 68%,#f05a91 0 6%,transparent 6.5%),linear-gradient(135deg,#4b176a,#7a319e 50%,#b975cf)}
html[data-restaurant-theme="yogurt"]{--yogurt-hero-polish:1}html[data-restaurant-theme="yogurt"] .rs-hero{background:radial-gradient(circle at 12% 10%,rgba(255,213,31,.16),transparent 24%),linear-gradient(135deg,#fff 0%,#fcf8ff 58%,#f4e9fb 100%)}html[data-restaurant-theme="yogurt"] .rs-hero-grid{width:min(var(--max),calc(100% - 42px));grid-template-columns:minmax(0,1.08fr) minmax(390px,.92fr);gap:38px;min-height:420px}html[data-restaurant-theme="yogurt"] .rs-hero-copy{padding:48px 26px 48px 0}html[data-restaurant-theme="yogurt"] .rs-kicker{margin-bottom:11px;font-size:12px;letter-spacing:.06em}html[data-restaurant-theme="yogurt"] .rs-hero h1{line-height:.98;letter-spacing:-.055em}html[data-restaurant-theme="yogurt"] .rs-hero h1 span{color:var(--brand);font-size:clamp(45px,4.6vw,66px)}html[data-restaurant-theme="yogurt"] .rs-hero h1 strong{display:inline-flex;margin-top:10px;padding:4px 12px 7px;border-radius:12px;background:#ffd51f;color:#4e196c;font-size:clamp(38px,4vw,54px)}html[data-restaurant-theme="yogurt"] .rs-lead{max-width:560px;margin-top:18px;color:#5b4864;font-size:14px;line-height:1.7}html[data-restaurant-theme="yogurt"] .rs-actions{margin-top:23px;gap:8px}html[data-restaurant-theme="yogurt"] .rs-action{min-height:42px;border-radius:12px;padding:0 15px;transition:transform .16s ease,box-shadow .16s ease}html[data-restaurant-theme="yogurt"] .rs-action:hover{transform:translateY(-1px);box-shadow:0 9px 20px rgba(91,22,143,.12)}html[data-restaurant-theme="yogurt"] .rs-hero-media{min-height:356px;margin:32px 0;border:1px solid rgba(91,22,143,.12);border-radius:30px;box-shadow:0 24px 54px rgba(91,22,143,.16)}html[data-restaurant-theme="yogurt"] .rs-hero-media.no-image{background:radial-gradient(circle at 82% 19%,#ffd51f 0 6%,transparent 6.4%),radial-gradient(circle at 18% 79%,rgba(255,255,255,.22) 0 7%,transparent 7.4%),linear-gradient(145deg,#7d34aa 0%,#5b168f 62%,#42105e 100%)}html[data-restaurant-theme="yogurt"] .rs-art:before{width:280px;height:220px;border-radius:46% 46% 30% 30%/20% 20% 24% 24%;background:radial-gradient(ellipse at 50% 8%,#fff 0 22%,#f7effa 23% 31%,transparent 32%),linear-gradient(180deg,#7e35ac 0%,#5b168f 78%);border:6px solid rgba(255,255,255,.16);box-shadow:0 28px 52px rgba(35,8,49,.3);transform:rotate(-3deg)}html[data-restaurant-theme="yogurt"] .rs-art:after{font-size:21px;letter-spacing:.02em;color:#ffd51f}html[data-restaurant-theme="yogurt"] .rs-hero-statement{right:24px;top:22px;max-width:300px}html[data-restaurant-theme="yogurt"] .rs-hero-statement small{font-size:11px}html[data-restaurant-theme="yogurt"] .rs-hero-statement strong{font-size:27px}html[data-restaurant-theme="yogurt"] .rs-hero-statement em{font-size:10px}html[data-restaurant-theme="yogurt"] .rs-feature{min-height:72px;padding-block:14px}
.rs-features{border-bottom:1px solid var(--line);background:#fff}.rs-feature-grid{display:grid;grid-template-columns:repeat(4,1fr)}.rs-feature{min-height:78px;padding:17px 22px;border-right:1px solid var(--line);display:flex;align-items:center;gap:11px}.rs-feature:first-child{border-left:1px solid var(--line)}.rs-feature i{display:grid;place-items:center;width:35px;height:35px;border-radius:10px;background:var(--chip);color:var(--brand);font-style:normal;font-size:17px;font-weight:950}.rs-feature b{display:block;font-size:12px}.rs-feature small{display:block;margin-top:3px;color:var(--muted);font-size:9px;line-height:1.35}
.rs-main{padding:34px 0 66px;background:var(--soft)}.rs-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin:0 0 20px}.rs-section-head h2{margin:0;font-size:27px;letter-spacing:-.045em}.rs-section-head p{margin:0;max-width:560px;color:var(--muted);font-size:11px;line-height:1.55}.rs-showcase{display:grid;grid-template-columns:170px minmax(0,1fr) 260px;gap:14px;align-items:start}.rs-promo{position:sticky;top:18px;min-height:315px;padding:22px 18px;border-radius:var(--radius);background:var(--brand);color:#fff;display:flex;flex-direction:column}.rs-promo strong{font-size:25px;line-height:1.18;letter-spacing:-.05em}.rs-promo p{margin:16px 0;color:rgba(255,255,255,.83);font-size:10px;line-height:1.65}.rs-promo .rs-chips{margin-top:auto;display:flex;flex-wrap:wrap;gap:5px}.rs-chips span{padding:5px 7px;border-radius:999px;background:rgba(255,255,255,.13);font-size:8px;font-weight:800}.rs-menu{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rs-menu-card{overflow:hidden;border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:var(--shadow)}.rs-menu-media{aspect-ratio:4/3;overflow:hidden;background:linear-gradient(145deg,var(--chip),#fff);display:grid;place-items:center}.rs-menu-media img{width:100%;height:100%;object-fit:cover;display:block}.rs-food-fallback{display:grid;place-items:center;text-align:center}.rs-food-fallback span{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:var(--brand);color:#fff;font-size:25px;font-weight:950}.rs-food-fallback b{margin-top:8px;color:var(--brand);font-size:9px}.rs-menu-body{padding:14px}.rs-menu-meta{display:flex;justify-content:space-between;gap:6px}.rs-menu-meta span{color:var(--brand);font-size:9px;font-weight:950}.rs-menu-meta small{color:#938799;font-size:8px}.rs-menu h3{margin:7px 0 5px;font-size:15px;line-height:1.25;letter-spacing:-.035em}.rs-menu-body>p{min-height:30px;margin:0;color:var(--muted);font-size:9px;line-height:1.55}.rs-base{display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:9px;border-top:1px solid #f0ecef}.rs-base span{font-size:8px;color:var(--muted)}.rs-base strong{font-size:13px}.rs-prices{display:grid;gap:4px;margin-top:9px}.rs-price-row{display:grid;grid-template-columns:minmax(0,1fr) auto 31px;align-items:center;gap:5px;padding:6px 7px;border-radius:8px;background:var(--soft)}.rs-price-row span{font-size:8px;font-weight:800}.rs-price-row strong{font-size:9px}.rs-price-row a{display:grid;place-items:center;min-height:22px;border-radius:6px;background:var(--brand);color:#fff;text-decoration:none;font-size:7px;font-weight:900}.rs-price-row i{width:31px}.rs-price-empty{margin-top:9px;padding:8px;border-radius:8px;background:var(--soft);color:var(--muted);font-size:8px;line-height:1.4}.rs-menu-body em{display:inline-block;margin-top:8px;padding:4px 6px;border-radius:999px;background:#fff3dc;color:#8e5c0b;font-size:7px;font-style:normal;font-weight:900}
.rs-section-copy{display:flex;align-items:center;gap:12px}.rs-section-copy p{margin:0;max-width:620px;color:var(--muted);font-size:14px;line-height:1.65}.rs-full-menu{margin-top:28px;border:1px solid var(--line);border-radius:20px;background:#fff;overflow:hidden}.rs-full-menu>summary{list-style:none;cursor:pointer;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:18px;background:linear-gradient(135deg,#fff,#faf5fd)}.rs-full-menu>summary::-webkit-details-marker{display:none}.rs-full-menu>summary b{display:block;font-size:23px;letter-spacing:-.04em}.rs-full-menu>summary small{display:block;margin-top:6px;max-width:820px;color:var(--muted);font-size:12px;line-height:1.6}.rs-full-menu>summary strong{color:var(--brand);font-size:13px}.rs-full-menu[open]>summary strong{font-size:0}.rs-full-menu[open]>summary strong:after{content:'접기';font-size:13px}.rs-all-menu-content{padding:22px;background:var(--soft)}.rs-all-menu-group+.rs-all-menu-group{margin-top:30px}.rs-all-menu-title{display:flex;align-items:center;gap:10px;margin-bottom:12px}.rs-all-menu-title h3{margin:0;font-size:22px;letter-spacing:-.04em}.rs-all-menu-title span{padding:4px 8px;border-radius:999px;background:var(--chip);color:var(--brand);font-size:11px;font-weight:900}.rs-all-menu-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.rs-all-menu-card{overflow:hidden;border:1px solid var(--line);border-radius:16px;background:#fff}.rs-all-menu-media{aspect-ratio:4/3;display:grid;place-items:center;overflow:hidden;background:#fff}.rs-all-menu-media img{width:100%;height:100%;object-fit:contain;display:block}.rs-all-menu-media span{color:var(--brand);font-weight:950}.rs-all-menu-body{padding:14px}.rs-all-menu-body>small{color:var(--brand);font-size:11px;font-weight:900}.rs-all-menu-body h3{margin:6px 0 8px;font-size:18px;line-height:1.3}.rs-all-menu-body>p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}html[data-restaurant-theme="yogurt"] .rs-menu h3{font-size:19px}html[data-restaurant-theme="yogurt"] .rs-menu-meta span{font-size:11px}html[data-restaurant-theme="yogurt"] .rs-menu-meta small{font-size:10px}html[data-restaurant-theme="yogurt"] .rs-menu-body>p{font-size:12px}html[data-restaurant-theme="yogurt"] .rs-price-row span{font-size:10px}html[data-restaurant-theme="yogurt"] .rs-price-row strong{font-size:11px}html[data-restaurant-theme="yogurt"] .rs-price-empty{font-size:10px}html[data-restaurant-theme="yogurt"] .rs-order-side>p{font-size:11px}html[data-restaurant-theme="yogurt"] .rs-order-card b{font-size:12px}html[data-restaurant-theme="yogurt"] .rs-order-card small{font-size:9px}
.rs-order-side{display:grid;gap:8px}.rs-order-side h3{margin:0 0 2px;font-size:18px}.rs-order-side>p{margin:0 0 8px;color:var(--muted);font-size:9px;line-height:1.5}.rs-order-card{min-height:66px;padding:8px 10px;border:1px solid var(--line);border-radius:13px;background:#fff;display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:10px;text-decoration:none}.rs-order-card i{display:grid;place-items:center;width:40px;height:40px;border-radius:10px;background:var(--chip);color:var(--brand);font-style:normal;font-size:12px;font-weight:950}.rs-order-card b{display:block;font-size:10px}.rs-order-card small{display:block;margin-top:3px;color:var(--muted);font-size:7px}.rs-order-card>strong{color:var(--brand)}.rs-order-card.p-baemin i{background:#70cfce;color:#fff}.rs-order-card.p-yogiyo i{background:#ef4771;color:#fff}.rs-order-card.p-coupang_eats i{background:#f7eee7;color:#9d4821}.rs-order-card.p-naver_order i{background:#03c75a;color:#fff}.rs-order-card.p-daangn_order i{background:#ff8a31;color:#fff}.rs-order-foot{margin-top:3px;padding:12px;border-radius:13px;background:var(--chip);font-size:8px;line-height:1.5;color:var(--muted)}
.rs-info{display:grid;grid-template-columns:1.05fr .95fr;gap:14px;margin-top:28px}.rs-info-card{padding:20px;border:1px solid var(--line);border-radius:var(--radius);background:#fff}.rs-info-card h3{margin:0 0 14px;font-size:17px}.rs-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.rs-info-item{padding:11px;border-radius:11px;background:var(--soft)}.rs-info-item small{display:block;color:var(--muted);font-size:8px}.rs-info-item b,.rs-info-item a{display:block;margin-top:4px;text-decoration:none;font-size:10px;line-height:1.45}.rs-trust{display:grid;gap:7px}.rs-trust div{padding:10px 12px;border-left:3px solid var(--brand);background:var(--soft)}.rs-trust b{display:block;font-size:10px}.rs-trust small{display:block;margin-top:3px;color:var(--muted);font-size:8px;line-height:1.4}.rs-footer{padding:26px 20px 88px;border-top:1px solid var(--line);background:#fff;text-align:center}.rs-footer b{display:block;color:var(--deep);font-size:13px}.rs-footer small{display:block;margin-top:5px;color:var(--muted);font-size:8px}.rs-mobile{display:none}
@media(max-width:1080px){.rs-showcase{grid-template-columns:150px minmax(0,1fr) 230px}.rs-menu{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:1080px){.rs-all-menu-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:860px){.rs-all-menu-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.rs-section-copy{align-items:flex-start!important;flex-direction:column}.rs-nav{display:none}.rs-hero-grid{grid-template-columns:1fr}.rs-hero-copy{padding:50px 24px 42px}.rs-hero-media{min-height:390px}.rs-feature-grid{grid-template-columns:1fr 1fr}.rs-feature:nth-child(odd){border-left:1px solid var(--line)}.rs-showcase{grid-template-columns:1fr}.rs-promo{position:static;min-height:auto}.rs-menu{grid-template-columns:repeat(2,minmax(0,1fr))}.rs-order-side{grid-template-columns:1fr 1fr}.rs-order-side h3,.rs-order-side>p,.rs-order-foot{grid-column:1/-1}.rs-info{grid-template-columns:1fr}.rs-mobile{position:fixed;z-index:80;left:9px;right:9px;bottom:calc(9px + env(safe-area-inset-bottom,0px));display:grid;grid-template-columns:repeat(4,1fr);padding:5px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.96);box-shadow:0 16px 44px rgba(35,29,39,.18);backdrop-filter:blur(14px)}.rs-mobile a{min-height:46px;display:grid;place-items:center;border-radius:11px;text-decoration:none;font-size:10px;font-weight:900}.rs-mobile a:last-child{background:var(--brand);color:#fff}}
@media(max-width:860px){html[data-restaurant-theme="yogurt"] .rs-hero-grid{width:100%;grid-template-columns:1fr;gap:0;min-height:auto}html[data-restaurant-theme="yogurt"] .rs-hero-copy{padding:42px 24px 28px}html[data-restaurant-theme="yogurt"] .rs-hero-media{margin:0 24px 30px;min-height:330px}html[data-restaurant-theme="yogurt"] .rs-feature-grid{width:100%;border-top:1px solid var(--line)}}
@media(max-width:560px){html[data-restaurant-theme="yogurt"] .rs-hero-copy{padding:34px 18px 22px}html[data-restaurant-theme="yogurt"] .rs-hero h1 span{font-size:43px}html[data-restaurant-theme="yogurt"] .rs-hero h1 strong{font-size:37px}html[data-restaurant-theme="yogurt"] .rs-actions{grid-template-columns:1fr 1fr}html[data-restaurant-theme="yogurt"] .rs-hero-media{margin:0 12px 22px;min-height:270px;border-radius:22px}html[data-restaurant-theme="yogurt"] .rs-art:before{width:210px;height:168px}html[data-restaurant-theme="yogurt"] .rs-hero-statement{right:14px;top:14px;max-width:210px}html[data-restaurant-theme="yogurt"] .rs-hero-statement strong{font-size:22px}}
@media(max-width:560px){.rs-all-menu-grid{grid-template-columns:1fr}.rs-full-menu>summary{padding:18px}.rs-all-menu-content{padding:14px}.rs-full-menu>summary b{font-size:19px}.rs-shell{width:min(var(--max),calc(100% - 24px))}.rs-top{height:64px}.rs-logo-copy b{font-size:15px}.rs-hero h1 span,.rs-hero h1 strong{font-size:49px}.rs-lead{font-size:14px}.rs-actions{display:grid;grid-template-columns:1fr 1fr}.rs-action{padding:0 8px}.rs-hero-media{min-height:300px}.rs-hero-statement{right:18px;top:20px;max-width:250px}.rs-hero-statement strong{font-size:27px}.rs-art:before{width:235px;height:235px}.rs-feature{padding:13px 10px;min-height:70px}.rs-feature i{width:31px;height:31px}.rs-feature b{font-size:10px}.rs-feature small{font-size:7px}.rs-main{padding-top:26px}.rs-section-head{align-items:flex-start;flex-direction:column}.rs-section-head h2{font-size:24px}.rs-menu{grid-template-columns:1fr}.rs-order-side{grid-template-columns:1fr}.rs-order-side h3,.rs-order-side>p,.rs-order-foot{grid-column:auto}.rs-info-grid{grid-template-columns:1fr}}
`;

export function restaurantStorefrontCss() {
  return new Response(CSS, { headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
}

export async function renderRestaurantStorefrontPage(request, env, resolved, slug) {
  const meta = BRAND[slug];
  if (!meta) return new Response('Storefront not found', { status: 404 });
  const page = resolved?.profile || {};
  const data = await loadSnapshot(slug, env);
  const store = data?.store || {};
  const address = String(store.address || '').trim();
  const phone = phoneText(store.phone || '');
  const hours = hoursText(store.business_hours);
  const description = String(store.description || page.lead || meta.lead).trim();
  const liveMenu = (Array.isArray(data?.menu) ? data.menu : []).filter((item) => item?.name);
  const channels = normalizeChannels(data?.channels);
  const yogurtFallback = slug==='yogurt' && liveMenu.length===0;
  const menu = slug==='yogurt' ? (yogurtFallback ? YOGURT_PURPLE_CATALOG_SNAPSHOT.map((item)=>({...item,source_basis:'brand_official'})) : enrichYogurtMenu(liveMenu)) : liveMenu.slice(0,12);
  const representative = slug==='yogurt' ? yogurtRepresentativeMenu(menu,channels,yogurtFallback) : menu.slice(0,6);
  const image = heroImage(representative, meta, channels);
  const map = mapUrl(address, `${meta.brand} ${meta.branch}`);
  const primaryOrder = channels.find((channel) => channel.order_url)?.order_url || safeHttps(meta.officialOrder) || telUrl(phone);
  const orderHtml = orderCards(channels, meta, phone);
  const menuHtml = representative.length ? representative.map((item, index) => menuCard(item, meta, channels, index)).join('') : `<div class="rs-info-card" style="grid-column:1/-1"><h3>목포대점 메뉴를 연결하고 있습니다.</h3><p style="margin:0;color:var(--muted);font-size:10px;line-height:1.6">확인되지 않은 메뉴명이나 가격을 임의로 만들지 않습니다. 본사 메뉴 또는 주문 앱에서 현재 판매 메뉴를 확인해 주세요.</p></div>`;
  const fullMenuHtml = slug==='yogurt' ? yogurtFullMenu(menu,meta,channels,yogurtFallback) : '';
  const officialMenu = safeHttps(meta.officialMenu);
  const title = page.name || `${meta.brand} ${meta.branch}`;
  const theme = meta.theme;
  const mobileOrder = primaryOrder || '#order';
  const html = `<!doctype html><html lang="ko" data-restaurant-theme="${escapeHtml(theme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow"><title>${escapeHtml(title)} | 메뉴 · 가격 · 주문</title><link rel="stylesheet" href="/_ekodi/space/restaurant-storefront.css?v=20260911-v1"></head><body><main class="rs">
<header class="rs-top"><div class="rs-shell"><a class="rs-logo" href="/${escapeHtml(slug)}"><span class="rs-logo-mark">${escapeHtml(meta.mark)}</span><span class="rs-logo-copy"><b>${escapeHtml(meta.brand)}</b><small>${escapeHtml(meta.branch)} · ${escapeHtml(meta.kicker)}</small></span></a><nav class="rs-nav"><a href="#menu">대표메뉴</a>${slug==='yogurt'?'<a href="#all-menu">전체메뉴</a>':''}<a href="#order">배달주문</a><a href="#store">매장안내</a>${officialMenu ? `<a href="${escapeHtml(officialMenu)}" target="_blank" rel="noopener noreferrer">본사 메뉴</a>` : ''}${phone ? `<a class="rs-call" href="${escapeHtml(telUrl(phone))}">전화 주문</a>` : ''}</nav></div></header>
<section class="rs-hero"><div class="rs-hero-grid"><div class="rs-hero-copy"><p class="rs-kicker">${escapeHtml(meta.kicker)}</p><h1><span>${escapeHtml(meta.brand)}</span><strong>${escapeHtml(meta.branch)}</strong></h1><p class="rs-lead">${escapeHtml(description)}</p><div class="rs-actions">${action(telUrl(phone), '전화하기', 'primary')}${action(map, '길찾기', '', true)}${action(primaryOrder || '#order', '배달앱 주문 보기', 'accent', Boolean(primaryOrder?.startsWith('http')))}</div></div><div class="rs-hero-media${image ? '' : ' no-image'}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(meta.brand)} 대표 메뉴" referrerpolicy="no-referrer">` : '<div class="rs-art"></div>'}<div class="rs-hero-statement"><small>${escapeHtml(meta.category)} · ${escapeHtml(meta.branch)}</small><strong>${escapeHtml(meta.promo)}</strong><em>${escapeHtml(meta.heroLine)}</em></div></div></div></section>
<section class="rs-features"><div class="rs-shell rs-feature-grid"><div class="rs-feature"><i>✓</i><span><b>브랜드 메뉴</b><small>본사·매장 확인 데이터를 기준으로 표시</small></span></div><div class="rs-feature"><i>↺</i><span><b>검증값 우선</b><small>확인되지 않은 가격은 임의 생성하지 않음</small></span></div><div class="rs-feature"><i>₩</i><span><b>앱별 가격 비교</b><small>연결된 배달앱의 확인 가격을 한눈에</small></span></div><div class="rs-feature"><i>→</i><span><b>주문 바로 연결</b><small>검증된 목포대점 링크를 우선 활성화</small></span></div></div></section>
<section class="rs-main"><div class="rs-shell"><div id="menu" class="rs-section-head"><h2>대표메뉴</h2><div class="rs-section-copy"><p>${escapeHtml(meta.brand)} 목포대점 배달앱 등록 메뉴를 우선하고, 제품 이미지는 본사 공식 이미지를 기준으로 보여줍니다. 쿠폰·배달비·옵션·실시간 판매 여부는 각 주문 앱의 최종 화면이 기준입니다.</p>${slug==='yogurt'?'<a class="rs-action primary" href="#all-menu">전체메뉴 자세히 보기</a>':''}</div></div><div class="rs-showcase"><aside class="rs-promo"><strong>${escapeHtml(meta.heroLine)}</strong><p>메뉴와 가격, 지도와 주문 경로를 여러 화면에서 헤매지 않도록 한 페이지로 정리했습니다.</p><div class="rs-chips">${categoryChips(menu, meta)}</div></aside><div class="rs-menu">${menuHtml}</div><aside id="order" class="rs-order-side"><h3>배달앱 주문</h3><p>목포대점으로 확인된 주문 링크를 우선합니다.</p>${orderHtml || '<div class="rs-order-foot">검증된 주문 링크를 연결하고 있습니다.</div>'}<div class="rs-order-foot">앱 가격·쿠폰·배달비·영업상태는 주문 직전 각 앱에서 다시 확인해 주세요.</div></aside></div>${fullMenuHtml}
<div id="store" class="rs-info"><article class="rs-info-card"><h3>${escapeHtml(meta.brand)} ${escapeHtml(meta.branch)} 안내</h3><div class="rs-info-grid"><div class="rs-info-item"><small>매장 위치</small><b>${escapeHtml(address || '매장 주소를 확인하고 있습니다.')}</b></div><div class="rs-info-item"><small>전화</small>${phone ? `<a href="${escapeHtml(telUrl(phone))}">${escapeHtml(phone)}</a>` : '<b>전화번호 확인 중</b>'}</div><div class="rs-info-item"><small>영업시간</small><b>${escapeHtml(hours || '영업시간은 전화로 확인해 주세요.')}</b></div><div class="rs-info-item"><small>길찾기</small>${map ? `<a href="${escapeHtml(map)}" target="_blank" rel="noopener noreferrer">네이버지도에서 보기 →</a>` : '<b>위치 확인 중</b>'}</div></div></article><article class="rs-info-card"><h3>정보 확인 기준</h3><div class="rs-trust"><div><b>매장 단위 데이터</b><small>${escapeHtml(meta.brand)} 목포대점 데이터만 분리해 사용합니다.</small></div><div><b>확인되지 않은 값은 숨김</b><small>임의 메뉴·임의 가격 대신 검증 완료 전 상태를 명확히 표시합니다.</small></div><div><b>주문 단계 재확인</b><small>최종 판매가격과 주문 가능 여부는 배달앱 또는 매장 확인을 기준으로 합니다.</small></div></div></article></div></div></section>
<footer class="rs-footer"><b>${escapeHtml(meta.brand)} ${escapeHtml(meta.branch)}</b><small>${escapeHtml(meta.category)} · 메뉴 · 가격 · 주문 연결</small></footer></main><nav class="rs-mobile"><a href="${slug==='yogurt'?'#all-menu':'#menu'}">${slug==='yogurt'?'전체메뉴':'메뉴'}</a>${phone ? `<a href="${escapeHtml(telUrl(phone))}">전화</a>` : '<a href="#store">매장</a>'}${map ? `<a href="${escapeHtml(map)}" target="_blank" rel="noopener noreferrer">지도</a>` : '<a href="#store">안내</a>'}<a href="${escapeHtml(mobileOrder)}"${mobileOrder.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>주문</a></nav></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
