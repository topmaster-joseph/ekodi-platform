const BRAND=Object.freeze({
  pizzamaru:{brand:'피자마루',branch:'목포대점',category:'피자',mark:'PM',tagline:'목포대 후문에서 오늘 먹고 싶은 피자를 바로 만나보세요.',address:'전남 무안군 청계면 승달산길 37-1 1층',phone:'061-453-8295'},
  jadam:{brand:'자담치킨',branch:'목포대점',category:'치킨',mark:'JD',tagline:'국립목포대학교 후문, 메뉴·앱별 가격·주문을 한 화면에서 확인하세요.',address:'전남 무안군 청계면 승달산길 37-1',phone:'061-453-8295'},
  yogurt:{brand:'요거트퍼플',branch:'목포대점',category:'요거트',mark:'YP',tagline:'목포대점의 디저트와 주문을 가장 빠르게 연결합니다.'},
});
const PROVIDERS=Object.freeze({
  ddangyo:{label:'땡겨요',order:1},baemin:{label:'배달의민족',order:2},
  yogiyo:{label:'요기요',order:3},mukkebi:{label:'먹깨비',order:4},
  coupang_eats:{label:'쿠팡이츠',order:5},store:{label:'피자마루 공식 주문',order:6},
});
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeHttps(value){try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:''}catch{return''}}
function phoneText(value){return String(value||'').trim()}
function telUrl(value){const phone=phoneText(value).replace(/[^0-9+]/g,'');return phone?`tel:${phone}`:''}
function won(value){return Number.isFinite(Number(value))?`${Number(value).toLocaleString('ko-KR')}원`:''}
function hoursText(value){
  if(!value||typeof value!=='object'||!Object.keys(value).length)return'';
  if(Array.isArray(value))return value.map(String).join(' · ');
  return Object.entries(value).map(([k,v])=>`${k} ${Array.isArray(v)?v.join(', '):String(v)}`).join(' · ');
}
function mapUrl(address){return address?`https://map.naver.com/p/search/${encodeURIComponent(address)}`:''}
async function snapshot(slug,env){
  if(!slug||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return null;
  const endpoint=`${env.SUPABASE_URL}/rest/v1/rpc/store_user_site_public_snapshot`;
  try{
    const r=await fetch(endpoint,{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({p_slug:slug})});
    if(!r.ok)return null;
    const d=await r.json().catch(()=>null);
    return d&&typeof d==='object'?d:null;
  }catch{return null}
}
function officialLinks(slug){
  if(slug==='pizzamaru')return{menu:'https://www.pizzamaru.co.kr/menu/',order:'https://www.pizzamaru.co.kr/orderchoice/?deliv_type=1'};
  return{menu:'',order:''};
}
function providerMeta(provider){return PROVIDERS[provider]||{label:String(provider||'배달앱'),order:99}}
function action(href,label,{primary=false,external=false}={}){
  return href?`<a class="action${primary?' primary':''}" href="${e(href)}"${external?' target="_blank" rel="noopener noreferrer"':''}>${e(label)}</a>`:'';
}
function mobile(href,label,external=false){
  return href?`<a href="${e(href)}"${external?' target="_blank" rel="noopener noreferrer"':''}>${e(label)}</a>`:'<span></span>';
}
const CSS=`:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;--ink:#251b18;--muted:#72625c;--brand:#a33f2d;--dark:#7b2e21;--soft:#fff0e9;--paper:#fffdfb;--line:#ead8d0;color:var(--ink);background:#fffaf7;word-break:keep-all}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fffaf7;color:var(--ink)}a{color:inherit}.sf{min-height:100vh;overflow:hidden}.top{width:min(1180px,calc(100% - 40px));height:70px;margin:auto;display:flex;align-items:center;justify-content:space-between}.brand{display:flex;gap:9px;align-items:baseline;text-decoration:none}.brand b{font-size:18px}.brand span{font-size:12px;font-weight:900;color:var(--brand)}nav{display:flex;gap:20px}nav a{text-decoration:none;font-size:13px;font-weight:800;color:#5e4d47}
html[data-store-page="pizzamaru"]{--brand:#b3132b;--dark:#121827;--soft:#fff0f2;--line:#eadde1}html[data-store-page="pizzamaru"] .hero{background:radial-gradient(circle at 83% 39%,#f5c5b6 0 13%,transparent 13.4%),radial-gradient(circle at 83% 39%,#d75a48 0 22%,transparent 22.4%),linear-gradient(125deg,#fff8f8,#fbe9ed 58%,#121827)}html[data-store-page="pizzamaru"] .hero h1 span{color:#6d1728}html[data-store-page="pizzamaru"] .action.primary{background:#b3132b;border-color:#b3132b}
html[data-store-page="jadam"]{--ink:#152219;--muted:#607066;--brand:#174f2c;--dark:#10391f;--soft:#edf6ef;--paper:#fff;--line:#dce8df;background:#f7faf7}html[data-store-page="jadam"] body{background:#f7faf7}html[data-store-page="jadam"] .hero{background:radial-gradient(circle at 84% 38%,rgba(23,79,44,.16) 0 14%,transparent 14.5%),linear-gradient(125deg,#fbfefb,#edf6ef 62%,#d6e7da)}html[data-store-page="jadam"] .hero h1 span{color:#315b3e}html[data-store-page="jadam"] .action.primary{background:#174f2c;border-color:#174f2c}
.hero{min-height:550px;border-block:1px solid var(--line);background:linear-gradient(125deg,#fff8f4,#ffede4 58%,#f8d9cb)}.hero-in{width:min(1180px,calc(100% - 40px));margin:auto;padding:76px 0 64px;display:grid;grid-template-columns:minmax(0,720px) 1fr;gap:42px}.kicker{margin:0 0 14px;color:var(--brand);font-size:12px;font-weight:950;letter-spacing:.12em}.hero h1{margin:0;line-height:.93;letter-spacing:-.065em}.hero h1 span{display:block;font-size:clamp(26px,3vw,43px);font-weight:700;color:#64473e}.hero h1 strong{display:block;margin-top:8px;font-size:clamp(62px,9vw,116px);font-weight:950}.lead{max-width:600px;margin:24px 0 0;font-size:18px;line-height:1.7;color:#64534d}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}.action{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 19px;border:1px solid #d8bbb0;border-radius:14px;background:rgba(255,255,255,.86);text-decoration:none;font-size:14px;font-weight:900}.action.primary{background:var(--brand);border-color:var(--brand);color:#fff}
.facts{align-self:end;display:grid;gap:15px;padding:24px;border-left:1px solid rgba(80,46,35,.16)}.fact small{display:block;margin-bottom:4px;color:#806c65;font-size:11px}.fact strong,.fact a{font-size:15px;font-weight:850;line-height:1.5;text-decoration:none}.section{width:min(1180px,calc(100% - 40px));margin:auto;padding:72px 0}.section+.section{border-top:1px solid var(--line)}.head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:28px}.head h2{margin:0;font-size:clamp(34px,5vw,52px);letter-spacing:-.05em}.head p{max-width:560px;margin:0;color:var(--muted);font-size:14px;line-height:1.65}
`;const MENU_CSS=`.menu{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.menu-card{overflow:hidden;border:1px solid var(--line);border-radius:20px;background:var(--paper);box-shadow:0 10px 34px rgba(82,44,32,.06)}.menu-media{aspect-ratio:4/3;background:linear-gradient(145deg,#f7e8e2,#fff7f4);overflow:hidden;display:grid;place-items:center}.menu-media img{width:100%;height:100%;object-fit:cover;display:block}.menu-media .fallback{font-size:34px;font-weight:950;color:var(--brand);letter-spacing:-.06em}.menu-body{padding:20px}.menu-meta{display:flex;align-items:center;justify-content:space-between;gap:10px}.menu-meta small{color:var(--brand);font-size:10px;font-weight:950;letter-spacing:.06em}.menu-source{font-size:10px;color:#8b7770}.menu h3{margin:10px 0 6px;font-size:21px;letter-spacing:-.03em}.menu-desc{min-height:42px;margin:0;color:var(--muted);font-size:13px;line-height:1.55}.base-price{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid #f0e5e1}.base-price span{font-size:11px;color:#806e68}.base-price strong{font-size:18px}.platform-prices{display:grid;gap:7px;margin-top:14px}.platform-price{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;padding:9px 10px;border:1px solid #eee4e0;border-radius:11px;background:#fff}.platform-price b{font-size:11px}.platform-price strong{font-size:13px}.platform-price a{padding:6px 8px;border-radius:8px;background:var(--brand);color:#fff;text-decoration:none;font-size:10px;font-weight:900}.platform-empty{margin-top:13px;padding:10px 11px;border-radius:10px;background:#faf5f3;color:#89736b;font-size:10px;line-height:1.55}.lowest{display:inline-flex;margin-top:11px;border-radius:999px;background:#fff1db;color:#8e5a11;padding:5px 8px;font-size:10px;font-weight:900}.price-note{margin-top:18px;padding:12px 14px;border-radius:12px;background:#f8f2ef;color:#7c6760;font-size:11px;line-height:1.6}
.order{display:grid;grid-template-columns:1.15fr .85fr;gap:40px}.order-links{display:grid;gap:10px}.order-link{display:flex;align-items:center;justify-content:space-between;min-height:62px;padding:0 18px;border:1px solid var(--line);background:#fff;text-decoration:none;font-weight:900}.order-link span{color:var(--brand);font-size:12px}.note{padding:24px;background:var(--soft);color:#604b44;line-height:1.7}.note strong{display:block;margin-bottom:6px;color:var(--dark)}.empty{padding:32px;border:1px solid var(--line);background:var(--paper)}.empty strong{display:block;font-size:20px}.empty p{margin:8px 0 18px;color:var(--muted);line-height:1.6}footer{padding:34px 20px 108px;text-align:center;color:#88756e;font-size:12px}.mobile{display:none}
@media(max-width:920px){.menu{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:820px){.top{height:62px}nav{display:none}.hero{min-height:auto}.hero-in{grid-template-columns:1fr;padding:52px 0 46px}.facts{border-left:0;border-top:1px solid rgba(80,46,35,.16);padding:20px 0 0;grid-template-columns:1fr 1fr}.order{grid-template-columns:1fr}.section{padding:54px 0}.head{align-items:flex-start;flex-direction:column}.mobile{position:fixed;z-index:50;left:10px;right:10px;bottom:10px;display:grid;grid-template-columns:repeat(4,1fr);padding:6px;border:1px solid var(--line);border-radius:16px;background:rgba(255,253,251,.96);box-shadow:0 12px 40px rgba(65,38,28,.15)}.mobile a,.mobile span{padding:10px 3px;text-align:center;text-decoration:none;font-size:11px;font-weight:900}.mobile a:last-child{background:var(--brand);color:#fff;border-radius:11px}}@media(max-width:560px){.top,.hero-in,.section{width:min(100% - 24px,1180px)}.hero h1 strong{font-size:64px}.lead{font-size:16px}.actions{display:grid;grid-template-columns:1fr 1fr}.action{padding:0 10px}.facts{grid-template-columns:1fr}.menu{grid-template-columns:1fr}.head h2{font-size:36px}.menu-desc{min-height:auto}}`;
function normalizeChannels(data){
  const map=new Map();
  for(const row of Array.isArray(data)?data:[]){
    if(!row?.provider)continue;
    map.set(row.provider,{...row,order_url:safeHttps(row.order_url)});
  }
  return map;
}
function normalizedListings(item,channels){
  const rows=(Array.isArray(item?.listings)?item.listings:[]).map(row=>{
    const meta=providerMeta(row.provider);
    const channel=channels.get(row.provider);
    return {...row,label:row.display_name||meta.label,sort:meta.order,
      image_url:safeHttps(row.image_url),order_url:safeHttps(row.order_url)||channel?.order_url||''};
  }).filter(row=>row.price!=null||row.order_url||row.image_url);
  return rows.sort((a,b)=>a.sort-b.sort||String(a.label).localeCompare(String(b.label),'ko'));
}
function menuCard(item,meta,channels){
  const listings=normalizedListings(item,channels);
  const image=safeHttps(listings.find(x=>x.image_url)?.image_url)||safeHttps(item.image_url);
  const priced=listings.filter(x=>Number.isFinite(Number(x.price)));
  const min=priced.length?Math.min(...priced.map(x=>Number(x.price))):null;
  const fallbackMark=meta.mark||String(meta.brand||'ST').slice(0,2);
  const source=item.source_basis==='brand_official'?'본사 기준':'목포대점 확인';
  const base=item.base_price!=null?`<div class="base-price"><span>${e(source)}</span><strong>${e(won(item.base_price))}</strong></div>`:'';
  const platform=priced.length||listings.length?`<div class="platform-prices">${listings.map(row=>`<div class="platform-price"><b>${e(row.label)}</b><strong>${row.price!=null?e(won(row.price)):'가격 확인'}</strong>${row.order_url?`<a href="${e(row.order_url)}" target="_blank" rel="noopener noreferrer">주문</a>`:'<span></span>'}</div>`).join('')}</div>`:'<div class="platform-empty">땡겨요 · 배달의민족 · 요기요 · 먹깨비의 목포대점 가격은 검증된 스냅샷이 연결되는 순서대로 표시됩니다.</div>';
  const lowest=min!=null&&priced.length>1?`<span class="lowest">앱 최저 ${e(won(min))}</span>`:'';
  return `<article class="menu-card"><div class="menu-media">${image?`<img src="${e(image)}" alt="${e(item.name)}" loading="lazy" referrerpolicy="no-referrer">`:`<span class="fallback">${e(fallbackMark)}</span>`}</div><div class="menu-body"><div class="menu-meta"><small>${e(item.category||meta.category||'MENU')}</small><span class="menu-source">${e(source)}</span></div><h3>${e(item.name)}</h3>${item.description?`<p class="menu-desc">${e(item.description)}</p>`:'<p class="menu-desc"></p>'}${base}${platform}${lowest}</div></article>`;
}
export function storefrontCss(){
  return new Response(CSS+MENU_CSS,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}});
}
export async function renderStorefrontPage(request,env,resolved,slug){
  const page=resolved?.profile||{};
  const meta=BRAND[slug]||{brand:page.name||slug,branch:'매장',category:'매장',tagline:'오늘의 메뉴와 주문을 빠르게 확인하세요.'};
  const links=officialLinks(slug);
  const data=await snapshot(slug,env);
  const store=data?.store||{};
  const address=String(store.address||meta.address||'').trim();
  const phone=phoneText(store.phone||meta.phone||'');
  const hours=hoursText(store.business_hours);
  const description=String(store.description||meta.tagline||page.description||'').trim();
  const menu=Array.isArray(data?.menu)?data.menu.filter(item=>item&&item.name).slice(0,36):[];
  const channels=normalizeChannels(data?.channels);
  const officialMenu=safeHttps(links.menu),officialOrder=safeHttps(links.order);
  const channelRows=[...channels.values()].sort((a,b)=>providerMeta(a.provider).order-providerMeta(b.provider).order);
  const firstAppOrder=channelRows.find(row=>['ddangyo','baemin','yogiyo','mukkebi'].includes(row.provider)&&row.order_url)?.order_url||'';
  const order=firstAppOrder||channelRows.find(row=>row.order_url)?.order_url||officialOrder||telUrl(phone);
  const map=mapUrl(address);
  const menuTarget=menu.length?'#menu':officialMenu||'#menu';
  const menuHtml=menu.length
    ?`<div class="menu">${menu.map(item=>menuCard(item,meta,channels)).join('')}</div><div class="price-note">앱별 가격은 마지막으로 검증된 공개 스냅샷 기준입니다. 쿠폰·배달비·옵션·실시간 판매 여부는 각 앱의 최종 주문화면을 기준으로 합니다.</div>`
    :`<div class="empty"><strong>목포대점 메뉴를 확인하세요.</strong><p>검증된 매장 메뉴가 연결되기 전에는 임의 가격을 표시하지 않습니다.</p>${officialMenu?action(officialMenu,`${meta.brand} 본사 메뉴 보기`,{external:true}):''}</div>`;
  const channelLinks=channelRows.filter(row=>row.order_url).map(row=>{
    const label=row.display_name||providerMeta(row.provider).label;
    return `<a class="order-link" href="${e(row.order_url)}" target="_blank" rel="noopener noreferrer"><b>${e(label)}</b><span>목포대점 주문하기 →</span></a>`;
  }).join('');
  const orderHtml=channelLinks||`${officialOrder?`<a class="order-link" href="${e(officialOrder)}" target="_blank" rel="noopener noreferrer"><b>${e(meta.brand)} 공식 주문</b><span>주문하기 →</span></a>`:''}${phone?`<a class="order-link" href="${e(telUrl(phone))}"><b>${e(meta.branch)} 전화 주문</b><span>${e(phone)} →</span></a>`:''}`;
  const title=page.name||`${meta.brand} ${meta.branch}`;
  const body=`<!doctype html><html lang="ko" data-store-page="${e(page.theme||slug||'default')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="${e(description||title)}"><meta name="robots" content="index,follow"><title>${e(title)} | 메뉴 · 가격 · 주문</title><link rel="stylesheet" href="/_ekodi/space/storefront.css?v=20260909-platform-menu-v1"></head><body><main class="sf"><header class="top"><a class="brand" href="/${e(slug)}"><b>${e(meta.brand)}</b><span>${e(meta.branch)}</span></a><nav><a href="#menu">메뉴·가격</a><a href="#store">매장정보</a><a href="#order">배달앱 주문</a></nav></header>
<section class="hero"><div class="hero-in"><div><p class="kicker">${e(meta.brand)} · ${e(address?'목포대 후문':'우리 동네 매장')}</p><h1><span>${e(meta.brand)}</span><strong>${e(meta.branch)}</strong></h1><p class="lead">${e(description||meta.tagline)}</p><div class="actions">${action(menuTarget,'메뉴·가격 보기',{primary:true,external:menuTarget.startsWith('http')})}${action(telUrl(phone),'전화하기')}${action(map,'지도 보기',{external:true})}${action(order,'배달앱 주문',{external:order.startsWith('http')})}</div></div><aside id="store" class="facts">${address?`<div class="fact"><small>매장 위치</small><strong>${e(address)}</strong></div>`:''}${phone?`<div class="fact"><small>전화</small><a href="${e(telUrl(phone))}">${e(phone)}</a></div>`:''}${hours?`<div class="fact"><small>영업시간</small><strong>${e(hours)}</strong></div>`:''}<div class="fact"><small>한 화면에서</small><strong>메뉴 · 앱별 가격 · 주문 연결</strong></div></aside></div></section>
<section id="menu" class="section"><div class="head"><h2>메뉴와 앱별 가격</h2><p>${e(meta.brand)} 기준 메뉴와 땡겨요·배달의민족·요기요·먹깨비에서 실제 확인된 목포대점 가격을 함께 보여줍니다. 확인되지 않은 앱 가격은 만들지 않습니다.</p></div>${menuHtml}</section>
<section id="order" class="section"><div class="head"><h2>배달앱에서 바로 주문</h2><p>목포대점으로 확인된 주문 링크만 연결합니다. 앱에서 최종 가격·쿠폰·배달비와 주문 가능 여부를 확인해 주세요.</p></div><div class="order"><div class="order-links">${orderHtml||'<div class="empty"><strong>주문 경로를 준비하고 있습니다.</strong><p>목포대점의 검증된 앱 주문 링크가 연결되는 즉시 여기에 표시됩니다.</p></div>'}</div><aside class="note"><strong>${e(meta.branch)} 안내</strong>${e(address||'매장 위치 정보를 확인하고 있습니다.')}<br>${phone?`문의 · 주문 ${e(phone)}`:'전화번호를 확인하고 있습니다.'}</aside></div></section><footer>${e(meta.brand)} ${e(meta.branch)} · EKODI</footer></main>
<div class="mobile">${mobile('#menu','메뉴·가격')}${mobile(telUrl(phone),'전화')}${mobile(map,'지도',true)}${mobile(order,'주문',order.startsWith('http'))}</div></body></html>`;
  return new Response(body,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
