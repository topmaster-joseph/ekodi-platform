const OFFICIAL=Object.freeze({
  home:'https://www.ejadam.co.kr/',
  menu:'https://www.ejadam.co.kr/bbs/content.php?co_id=newmenu',
  logo:'https://www.ejadam.co.kr/theme/creasor_renew/img/common/logo.png',
  hero:'https://www.ejadam.co.kr/theme/creasor_renew/img/main/main_visual_0713_01.jpg',
});


const HQ_PRODUCT_MEDIA=Object.freeze({
  mapSoyKick:'https://www.ejadam.co.kr/data/editor/2412/f5d18b0bb0f47150673ee09a0f30de64_1733105080_1319.jpg',
  honeyPop:'https://www.ejadam.co.kr/data/editor/2412/f5d18b0bb0f47150673ee09a0f30de64_1733105087_7106.jpg',
  garlic:'https://www.ejadam.co.kr/data/editor/2407/1ea532d1e6e0e65b99c320a48ce4cfa6_1722416347_9584.jpg',
  whatTheHot:'https://www.ejadam.co.kr/data/editor/2406/6627c23603af165f334d02e0694f05dc_1718264582_6518.jpg',
  combo:'https://www.ejadam.co.kr/data/editor/2401/9328ba66c17ff56bd186fbe306051f3a_1705306245_7669.jpg',
  soboro:'https://www.ejadam.co.kr/data/editor/2211/18366ac11e8d3e3345f00d8eaf4e3ecf_1667283816_5342.jpg',
  blackPepper:'https://www.ejadam.co.kr/data/editor/2204/1bff6051d4490d919ccd491af5c7ee78_1649061688_914.png',
  sriracha:'https://www.ejadam.co.kr/data/editor/2104/3280d4c53f5139c74bf741487b9a67f9_1617354448_5214.jpg',
  mapchelin:'https://www.ejadam.co.kr/data/editor/2006/741060666f533def13d4e5c0f5c759c5_1590999938_5873.jpg',
  chiyoring:'https://www.ejadam.co.kr/data/editor/2002/c7ba4ab994d94e7be9aa059b5a1d5a3c_1582895879_8836.jpg',
  creamyOnion:'https://www.ejadam.co.kr/data/editor/1809/36ab2bb0a5b8cbf8c0c68372669c813c_1536718841_8716.jpg',
  classic:'https://www.ejadam.co.kr/data/editor/1709/de8720524886cf91e6ef20f944eabc48_1506676434_3065.jpg',
});

const PROVIDERS=Object.freeze([
  {id:'ddangyo',name:'땡겨요',mark:'땡',tone:'ddangyo'},
  {id:'baemin',name:'배달의민족',mark:'배',tone:'baemin'},
  {id:'yogiyo',name:'요기요',mark:'요',tone:'yogiyo'},
  {id:'mukkebi',name:'먹깨비',mark:'먹',tone:'mukkebi'},
]);

const REFERENCE_MENU=Object.freeze([
  {name:'후라이드치킨',description:'바삭하고 고소한 자담의 기본 치킨',reference_price:21000},
  {name:'핫후라이드치킨',description:'매콤한 파우더와 깊게 밴 양념',reference_price:22000},
  {name:'양념치킨',description:'새콤달콤한 대표 양념치킨',reference_price:23000},
  {name:'반반치킨',description:'후라이드와 원하는 맛을 한 번에',reference_price:23000},
  {name:'맵슐랭치킨',description:'마요소스와 청양고추의 시그니처',reference_price:23000},
  {name:'크리미양파치킨',description:'크리미 소스와 아삭한 양파의 조화',reference_price:23000},
  {name:'치요링치킨',description:'치즈 시즈닝과 요거트소스의 조화',reference_price:23000},
  {name:'간장치킨',description:'짭조름하고 깊은 감칠맛',reference_price:23000},
  {name:'치즈핑치킨',description:'치즈 풍미를 더한 바삭한 치킨',reference_price:23000},
  {name:'맵쏘이킥치킨',description:'흑마늘 간장소스와 알싸한 킥',reference_price:23000},
  {name:'허니팝치킨',description:'허니갈릭과 크런치의 달콤고소함',reference_price:23000},
  {name:'3반치킨세트',description:'세 가지 맛을 한 번에 즐기는 세트',reference_price:33500},
]);

const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeHttps=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:''}catch{return''}};
const tel=value=>{const phone=String(value||'').replace(/[^0-9+]/g,'');return phone?`tel:${phone}`:''};
const won=value=>Number.isFinite(Number(value))?`${Number(value).toLocaleString('ko-KR')}원`:'';
const mapUrl=(name,address)=>`https://map.naver.com/p/search/${encodeURIComponent(`${name} ${address}`.trim())}`;

function hoursText(value){
  if(!value||typeof value!=='object')return'';
  if(value.display)return String(value.display);
  return Object.entries(value).filter(([key])=>key!=='note').map(([key,val])=>`${key} ${Array.isArray(val)?val.join(', '):String(val)}`).join(' · ');
}

async function snapshot(slug,env){
  if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return null;
  try{
    const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/store_user_site_public_snapshot`,{
      method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({p_slug:slug})
    });
    if(!response.ok)return null;
    const data=await response.json().catch(()=>null);
    return data&&typeof data==='object'?data:null;
  }catch{return null}
}

function channelMap(rows){
  const map=new Map();
  for(const row of Array.isArray(rows)?rows:[]){
    if(!row?.provider||!PROVIDERS.some(provider=>provider.id===row.provider))continue;
    map.set(row.provider,{...row,order_url:safeHttps(row.order_url||row.direct_url||row.public_order_url)});
  }
  return map;
}

function mergeMenu(rows){
  const live=new Map((Array.isArray(rows)?rows:[]).filter(item=>item?.name).map(item=>[String(item.name).trim(),item]));
  const merged=REFERENCE_MENU.map(reference=>live.has(reference.name)?{...reference,...live.get(reference.name),reference_price:reference.reference_price}:{...reference,is_reference:true});
  for(const item of live.values())if(!REFERENCE_MENU.some(reference=>reference.name===item.name))merged.push(item);
  return merged.slice(0,18);
}


function officialProductImage(name){
  const n=String(name||'').replace(/\s+/g,'');
  if(n.includes('맵쏘이킥'))return HQ_PRODUCT_MEDIA.mapSoyKick;
  if(n.includes('허니팝'))return HQ_PRODUCT_MEDIA.honeyPop;
  if(n.includes('마늘')||n.includes('마티니'))return HQ_PRODUCT_MEDIA.garlic;
  if(n.includes('왓더핫'))return HQ_PRODUCT_MEDIA.whatTheHot;
  if(n.includes('3반')||n.includes('콤보')||n.includes('반반'))return HQ_PRODUCT_MEDIA.combo;
  if(n.includes('소보로'))return HQ_PRODUCT_MEDIA.soboro;
  if(n.includes('불패'))return HQ_PRODUCT_MEDIA.blackPepper;
  if(n.includes('스리라차'))return HQ_PRODUCT_MEDIA.sriracha;
  if(n.includes('맵슐랭'))return HQ_PRODUCT_MEDIA.mapchelin;
  if(n.includes('치요링'))return HQ_PRODUCT_MEDIA.chiyoring;
  if(n.includes('크리미양파'))return HQ_PRODUCT_MEDIA.creamyOnion;
  if(n.includes('후라이드')||n.includes('양념')||n.includes('간장'))return HQ_PRODUCT_MEDIA.classic;
  return OFFICIAL.hero;
}

function listingRows(item,channels){
  return (Array.isArray(item?.listings)?item.listings:[])
    .filter(row=>PROVIDERS.some(provider=>provider.id===row?.provider))
    .map(row=>({...row,
      price:row.price??row.listed_price,
      image_url:safeHttps(row.image_url),
      order_url:safeHttps(row.order_url||row.public_order_url)||channels.get(row.provider)?.order_url||''
    }));
}

function menuCard(item,channels){
  const listings=listingRows(item,channels);
  const image=officialProductImage(item.name);
  const verifiedBase=item.base_price!=null;
  const base=verifiedBase?item.base_price:item.reference_price;
  const source=verifiedBase||listings.some(row=>row.price!=null||row.order_url)?'목포대점 확인':'공개 참고가';
  const platform=listings.filter(row=>Number.isFinite(Number(row.price))||row.order_url).map(row=>{
    const provider=PROVIDERS.find(item=>item.id===row.provider);
    return `<div class="jd-app-price"><b>${e(provider?.name||row.display_name||row.provider)}</b><strong>${row.price!=null?e(won(row.price)):'가격 확인'}</strong>${row.order_url?`<a href="${e(row.order_url)}" target="_blank" rel="noopener noreferrer">주문</a>`:'<span></span>'}</div>`;
  }).join('');
  return `<article class="jd-menu-card"><div class="jd-menu-photo"><img src="${e(image)}" alt="${e(item.name)} 본사 공식 제품 이미지" loading="lazy" referrerpolicy="no-referrer"><span class="jd-hq-badge">본사 공식 제품 이미지</span></div><div class="jd-menu-body"><small>${e(source)}</small><h3>${e(item.name)}</h3><p>${e(item.description||'자담치킨 메뉴')}</p>${base!=null?`<strong class="jd-price">${e(won(base))}</strong>`:''}${platform?`<div class="jd-app-prices">${platform}</div>`:'<div class="jd-app-wait">앱별 목포대점 가격 연결 대기</div>'}</div></article>`;
}

function providerCard(provider,channels){
  const row=channels.get(provider.id);
  const href=safeHttps(row?.order_url);
  const inner=`<span class="jd-provider-mark">${e(provider.mark)}</span><span><b>${e(provider.name)}</b><small>${href?'목포대점 주문하기':'주문 링크 확인 중'}</small></span><strong>${href?'→':'·'}</strong>`;
  return href?`<a class="jd-provider ${e(provider.tone)}" href="${e(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`:`<div class="jd-provider ${e(provider.tone)} is-pending">${inner}</div>`;
}

const CSS=`
html[data-store-page="jadam"]{--green:#0b6d3c;--deep:#074a2a;--orange:#f4a313;--ink:#173127;--muted:#667970;--line:#dce9e0;background:#f7faf7;font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;word-break:keep-all}html[data-store-page="jadam"] *{box-sizing:border-box}html[data-store-page="jadam"] body{margin:0;background:#f7faf7;color:var(--ink)}.jd-top{height:72px;position:sticky;top:0;z-index:40;background:rgba(255,255,255,.97);border-bottom:1px solid #edf2ee;backdrop-filter:blur(14px)}.jd-top-in{width:min(1320px,calc(100% - 32px));height:100%;margin:auto;display:flex;align-items:center;gap:28px}.jd-logo{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--deep)}.jd-logo img{width:150px;max-height:44px;object-fit:contain;object-position:left center}.jd-logo span{font-size:11px;color:#698076}.jd-nav{display:flex;gap:22px;margin-left:auto}.jd-nav a{font-size:12px;font-weight:850;text-decoration:none;color:#2c4638}.jd-head-call{padding:10px 15px;border-radius:999px;background:var(--green);color:#fff;text-decoration:none;font-size:11px;font-weight:900}
.jd-hero{display:grid;grid-template-columns:minmax(0,46%) minmax(0,54%);min-height:420px;background:#fff}.jd-hero-copy{padding:54px max(28px,calc((100vw - 1320px)/2));padding-right:40px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#fff,#fbfdf5 58%,#eaf4e5)}.jd-kicker{margin:0 0 9px;color:var(--green);font-size:17px;font-weight:900}.jd-hero h1{margin:0;line-height:.92;letter-spacing:-.065em}.jd-hero h1 span{display:block;color:#ef5a24;font-size:clamp(52px,6.2vw,86px);font-weight:950}.jd-hero h1 strong{display:block;margin-top:9px;color:var(--deep);font-size:clamp(43px,5vw,70px)}.jd-lead{margin:20px 0 0;font-size:16px;line-height:1.6;font-weight:800}.jd-facts{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:21px;font-size:12px}.jd-facts b{color:var(--deep)}.jd-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:25px}.jd-btn{min-height:47px;padding:0 17px;border:1px solid #cfe0d2;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:var(--deep);text-decoration:none;font-size:12px;font-weight:950}.jd-btn.primary{background:var(--green);border-color:var(--green);color:#fff}.jd-btn.order{background:var(--orange);border-color:var(--orange);color:#20362c}.jd-hero-media{min-height:420px;position:relative;background:#292b29 url('${OFFICIAL.hero}') center/cover no-repeat}.jd-hero-media:after{content:'자담치킨 공식 브랜드 이미지';position:absolute;right:14px;bottom:12px;padding:5px 8px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:9px}
.jd-values{background:#fff;border-block:1px solid var(--line)}.jd-values-in{width:min(1320px,calc(100% - 32px));margin:auto;display:grid;grid-template-columns:repeat(4,1fr)}.jd-value{padding:15px 22px;display:flex;gap:11px;align-items:center;border-right:1px solid var(--line)}.jd-value:last-child{border-right:0}.jd-value i{font-style:normal;font-size:23px}.jd-value b{display:block;font-size:13px}.jd-value span{display:block;margin-top:2px;color:var(--muted);font-size:10px}
.jd-main{width:min(1320px,calc(100% - 32px));margin:auto;padding:26px 0 68px}.jd-grid{display:grid;grid-template-columns:210px minmax(0,1fr) 300px;gap:16px;align-items:start}.jd-brand-card{min-height:520px;position:sticky;top:90px;padding:26px 22px;border-radius:18px;overflow:hidden;background:linear-gradient(155deg,#0c7040,#06391f);color:#fff}.jd-brand-card:after{content:'☘';position:absolute;right:-18px;bottom:-25px;font-size:165px;color:rgba(255,255,255,.08)}.jd-brand-card h2{margin:0;font-size:27px;line-height:1.38}.jd-brand-card p{margin:20px 0;color:#d8ebde;font-size:12px;line-height:1.75}.jd-brand-card small{position:absolute;bottom:26px;left:22px;letter-spacing:.22em;color:#f2ce77;font-size:9px}.jd-menu-head,.jd-order-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}.jd-menu-head h2,.jd-order-head h2{margin:0;font-size:22px;letter-spacing:-.04em}.jd-menu-head p,.jd-order-head p{margin:0;color:var(--muted);font-size:9px}.jd-menu-head a{color:var(--green);font-size:10px;font-weight:900;text-decoration:none}.jd-menu-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.jd-menu-card{overflow:hidden;border:1px solid var(--line);border-radius:13px;background:#fff;box-shadow:0 8px 22px rgba(20,72,44,.045)}.jd-menu-photo{aspect-ratio:4/3;overflow:hidden;display:grid;place-items:center;position:relative;background:#f5f3ed}.jd-menu-photo img{width:100%;height:100%;object-fit:cover;object-position:center 68%}.jd-hq-badge{position:absolute;left:7px;bottom:7px;padding:4px 6px;border-radius:999px;background:rgba(5,55,31,.82);color:#fff;font-size:7px;font-weight:900;letter-spacing:-.01em}.jd-food-fallback{width:100%;height:100%;display:grid;place-items:center;font-size:46px;background:radial-gradient(circle at 68% 35%,#fff1c9 0 18%,transparent 19%),linear-gradient(145deg,#fff9e9,#e5f3e7)}.jd-menu-body{padding:12px}.jd-menu-body>small{font-size:8px;color:#789083}.jd-menu-body h3{margin:4px 0;font-size:14px}.jd-menu-body>p{min-height:29px;margin:0;color:var(--muted);font-size:9px;line-height:1.45}.jd-price{display:block;margin-top:7px;color:#dc362e;font-size:16px}.jd-app-wait{margin-top:7px;padding:6px 7px;border-radius:7px;background:#f5f8f5;color:#7a8980;font-size:8px}.jd-app-prices{display:grid;gap:4px;margin-top:7px}.jd-app-price{display:grid;grid-template-columns:1fr auto auto;gap:5px;align-items:center;padding:5px 6px;border:1px solid #edf1ee;border-radius:7px;font-size:8px}.jd-app-price strong{font-size:9px}.jd-app-price a{padding:3px 5px;border-radius:5px;background:var(--green);color:#fff;text-decoration:none;font-weight:900}.jd-reference-note{margin:11px 0 0;padding:9px 10px;border-radius:9px;background:#f1f6f2;color:#67776e;font-size:9px;line-height:1.55}
.jd-providers{display:grid;gap:8px}.jd-provider{min-height:63px;padding:9px 12px;border-radius:11px;display:grid;grid-template-columns:39px 1fr auto;gap:9px;align-items:center;color:#fff;text-decoration:none;box-shadow:0 7px 17px rgba(0,0,0,.08)}.jd-provider-mark{width:36px;height:36px;border-radius:9px;display:grid;place-items:center;background:rgba(255,255,255,.95);color:#26382f;font-weight:950}.jd-provider b{display:block;font-size:14px}.jd-provider small{display:block;margin-top:2px;color:rgba(255,255,255,.9);font-size:8px}.jd-provider strong{font-size:18px}.jd-provider.is-pending{opacity:.68;filter:saturate(.65)}.jd-provider.ddangyo{background:#ff563d}.jd-provider.baemin{background:#20b7bd}.jd-provider.yogiyo{background:#ed174c}.jd-provider.mukkebi{background:#303234}.jd-order-note{margin-top:10px;padding:11px;border:1px solid var(--line);border-radius:11px;background:#fff;color:var(--muted);font-size:9px;line-height:1.55}
.jd-store{margin-top:16px;display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px}.jd-store-card{min-height:135px;padding:18px;border:1px solid var(--line);border-radius:13px;background:#fff}.jd-store-card h3{margin:0 0 10px;font-size:15px}.jd-store-row{display:grid;grid-template-columns:61px 1fr;gap:7px;margin-top:7px;font-size:10px}.jd-store-row span{color:#7c8c83}.jd-store-row strong,.jd-store-row a{color:var(--ink);text-decoration:none}.jd-map-card{display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(135deg,#eef5ef,#fafbf9)}.jd-map-card p,.jd-brand-info p{margin:0;color:#617269;font-size:10px;line-height:1.55}.jd-map-card a,.jd-brand-info a{align-self:flex-start;margin-top:10px;color:var(--green);font-size:10px;font-weight:900}.jd-footer{margin-top:16px;padding:19px 20px;border-radius:13px;background:var(--deep);color:#d9eadf;display:flex;align-items:center;justify-content:space-between;gap:18px}.jd-footer b{color:#fff}.jd-footer span{font-size:9px}.jd-mobile{display:none}
@media(min-width:1220px){.jd-menu-list{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:980px){.jd-grid{grid-template-columns:180px minmax(0,1fr) 270px}.jd-menu-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:820px){.jd-nav,.jd-head-call,.jd-logo span{display:none}.jd-logo img{width:130px}.jd-hero{grid-template-columns:1fr}.jd-hero-copy{padding:39px 20px}.jd-hero-media{min-height:290px}.jd-values-in{grid-template-columns:1fr 1fr}.jd-value:nth-child(2){border-right:0}.jd-main{width:min(100% - 24px,720px)}.jd-grid{grid-template-columns:1fr}.jd-brand-card{min-height:180px;position:relative;top:auto}.jd-brand-card small{position:static;display:block;margin-top:20px}.jd-menu-list{grid-template-columns:repeat(2,minmax(0,1fr))}.jd-store{grid-template-columns:1fr}.jd-mobile{position:fixed;left:9px;right:9px;bottom:9px;z-index:60;display:grid;grid-template-columns:repeat(4,1fr);padding:6px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.97);box-shadow:0 12px 34px rgba(17,66,39,.18)}.jd-mobile a{padding:9px 2px;text-align:center;text-decoration:none;font-size:10px;font-weight:900;color:var(--deep)}.jd-mobile a:last-child{border-radius:10px;background:var(--green);color:#fff}.jd-footer{padding-bottom:78px}}
@media(max-width:520px){.jd-hero h1 span{font-size:48px}.jd-hero h1 strong{font-size:40px}.jd-lead{font-size:14px}.jd-actions{display:grid;grid-template-columns:1fr 1fr}.jd-menu-list{grid-template-columns:1fr}.jd-menu-photo{aspect-ratio:16/10}.jd-values-in{grid-template-columns:1fr}.jd-value{border-right:0;border-bottom:1px solid var(--line)}.jd-value:last-child{border-bottom:0}.jd-footer{align-items:flex-start;flex-direction:column}}
`;

export function jadamStorefrontCss(){return new Response(CSS,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}})}

export async function renderJadamStorefrontPage(request,env,resolved,slug='jadam'){
  const data=await snapshot(slug,env);
  const store=data?.store||{};
  const title=resolved?.profile?.name||'자담치킨 목포대점';
  const address=String(store.address||'전남 무안군 청계면 승달산길 37-1').trim();
  const phone=String(store.phone||'061-453-8295').trim();
  const hours=hoursText(store.business_hours)||'11:00–22:00';
  const note=String(store.business_hours?.note||'휴무·마감시간은 전화 확인').trim();
  const channels=channelMap(data?.channels);
  const menu=mergeMenu(data?.menu);
  const verifiedPlatformCount=PROVIDERS.filter(provider=>channels.get(provider.id)?.order_url).length;
  const firstOrder=PROVIDERS.map(provider=>channels.get(provider.id)?.order_url).find(Boolean)||'';
  const map=mapUrl(title,address);
  const description='목포대 후문 자담치킨 목포대점의 메뉴·가격을 확인하고 검증된 배달앱 주문 경로로 연결합니다.';
  const orderAction=firstOrder?`<a class="jd-btn order" href="${e(firstOrder)}" target="_blank" rel="noopener noreferrer">배달앱 주문하기</a>`:'<a class="jd-btn order" href="#order">배달앱 주문 보기</a>';
  const mobileOrder=firstOrder?`<a href="${e(firstOrder)}" target="_blank" rel="noopener noreferrer">주문</a>`:'<a href="#order">주문</a>';
  return new Response(`<!doctype html><html lang="ko" data-store-page="jadam" data-jadam-menu-images="brand-official"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="description" content="${e(description)}"><meta name="robots" content="index,follow"><title>${e(title)} | 메뉴 · 가격 · 배달주문</title><link rel="stylesheet" href="/_ekodi/space/jadam-storefront.css?v=20260910-hq-menu-v1"></head><body><main class="jd-page">
<header class="jd-top"><div class="jd-top-in"><a class="jd-logo" href="/jadam"><img src="${e(OFFICIAL.logo)}" alt="자담치킨"><span>목포대점 · 자연을 담은 건강한 치킨</span></a><nav class="jd-nav"><a href="#menu">메뉴·가격</a><a href="#order">배달주문</a><a href="#store">매장안내</a><a href="${e(OFFICIAL.menu)}" target="_blank" rel="noopener noreferrer">본사 메뉴</a></nav><a class="jd-head-call" href="${e(tel(phone))}">전화 주문</a></div></header>
<section class="jd-hero"><div class="jd-hero-copy"><p class="jd-kicker">자연을 담은 건강한 치킨</p><h1><span>자담치킨</span><strong>목포대점</strong></h1><p class="jd-lead">국립목포대학교 후문 · 메뉴와 주문을 한 화면에서</p><div class="jd-facts"><span>📍 <b>${e(address)}</b></span><span>☎ <b>${e(phone)}</b></span><span>🕒 <b>${e(hours)}</b></span></div><div class="jd-actions"><a class="jd-btn primary" href="${e(tel(phone))}">전화하기</a><a class="jd-btn" href="${e(map)}" target="_blank" rel="noopener noreferrer">길찾기</a>${orderAction}</div></div><div class="jd-hero-media" role="img" aria-label="자담치킨 공식 브랜드 이미지"></div></section>
<section class="jd-values"><div class="jd-values-in"><div class="jd-value"><i>🌿</i><div><b>자담치킨 브랜드 메뉴</b><span>본사 메뉴정보를 기준으로 확인</span></div></div><div class="jd-value"><i>✓</i><div><b>검증값 우선</b><span>목포대점 데이터가 있으면 자동 우선</span></div></div><div class="jd-value"><i>₩</i><div><b>앱별 가격 비교</b><span>확인된 플랫폼 가격만 노출</span></div></div><div class="jd-value"><i>🛵</i><div><b>주문 바로 연결</b><span>검증된 목포대점 링크만 활성화</span></div></div></div></section>
<section class="jd-main"><div class="jd-grid"><aside class="jd-brand-card"><h2>좋은 치킨이<br>좋은 하루를<br>만듭니다.</h2><p>자담치킨 목포대점의 메뉴·가격·주문 정보를 한곳에서 확인하세요. 확인되지 않은 앱 가격이나 주문 링크는 만들지 않습니다.</p><small>JADAM CHICKEN</small></aside><section id="menu"><div class="jd-menu-head"><div><h2>대표 메뉴</h2><p>목포대점 검증값 우선 · 미확인 항목은 공개 참고가</p></div><a href="${e(OFFICIAL.menu)}" target="_blank" rel="noopener noreferrer">본사 전체 메뉴 →</a></div><div class="jd-menu-list">${menu.map(item=>menuCard(item,channels)).join('')}</div><p class="jd-reference-note">공개 참고가는 목포대점 확정 판매가가 아닙니다. 목포대점 또는 배달앱의 검증 스냅샷이 연결되면 메뉴·가격·주문 정보는 검증값을 우선하고, 메뉴 이미지는 본사 공식 제품 이미지를 유지합니다. 쿠폰·옵션·배달비는 최종 주문화면을 기준으로 합니다.</p></section><aside id="order"><div class="jd-order-head"><div><h2>배달앱 주문</h2><p>${verifiedPlatformCount}개 목포대점 직행 링크 확인</p></div></div><div class="jd-providers">${PROVIDERS.map(provider=>providerCard(provider,channels)).join('')}</div><div class="jd-order-note">땡겨요 · 배달의민족 · 요기요 · 먹깨비의 실제 목포대점 주문 URL이 검증되기 전에는 버튼을 활성화하지 않습니다.</div></aside></div>
<div id="store" class="jd-store"><section class="jd-store-card"><h3>자담치킨 목포대점</h3><div class="jd-store-row"><span>주소</span><strong>${e(address)}</strong></div><div class="jd-store-row"><span>전화</span><a href="${e(tel(phone))}">${e(phone)}</a></div><div class="jd-store-row"><span>영업시간</span><strong>${e(hours)}</strong></div><div class="jd-store-row"><span>안내</span><strong>${e(note)}</strong></div></section><section class="jd-store-card jd-map-card"><div><h3>목포대 후문에서 찾기</h3><p>네이버 지도에서 현재 위치부터 매장까지의 이동 경로를 확인하세요.</p></div><a href="${e(map)}" target="_blank" rel="noopener noreferrer">지도에서 보기 →</a></section><section class="jd-store-card jd-brand-info"><h3>자담치킨 공식 메뉴</h3><p>브랜드 메뉴와 공식 이미지는 자담치킨 본사 페이지를 함께 참고할 수 있습니다.</p><a href="${e(OFFICIAL.home)}" target="_blank" rel="noopener noreferrer">공식 홈페이지 →</a></section></div><footer class="jd-footer"><div><b>자담치킨 목포대점</b><br><span>${e(phone)} · ${e(hours)}</span></div><span>Powered by EKODI</span></footer></section></main><nav class="jd-mobile"><a href="#menu">메뉴</a><a href="${e(tel(phone))}">전화</a><a href="${e(map)}" target="_blank" rel="noopener noreferrer">지도</a>${mobileOrder}</nav></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}
