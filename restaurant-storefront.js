import { restaurantStorefrontCss, renderRestaurantStorefrontPage as renderV2 } from './restaurant-storefront-v2.js';
import { loadPizzamaruOfficialCatalog, PIZZAMARU_CATEGORIES, PIZZAMARU_SOCIALS, PIZZAMARU_CATALOG_VERIFIED_AT } from './pizzamaru-catalog.js';

export { restaurantStorefrontCss };

const esc=(value)=>String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const won=(value)=>Number.isFinite(Number(value))?`${Number(value).toLocaleString('ko-KR')}원`:'가격 확인';
const categoryId=(label)=>`pm-${String(label||'menu').replace(/[^0-9A-Za-z가-힣]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase()}`;

function pizzamaruProductCard(item,index){
  return `<article class="rs-menu-card" data-pm-product="${esc(item.name)}"><div class="rs-menu-media"><img src="${esc(item.image_url)}" alt="${esc(item.name)}" loading="lazy" referrerpolicy="no-referrer"></div><div class="rs-menu-body"><div class="rs-menu-meta"><span>${esc(item.category)}</span><small>피자마루 본사 공식</small></div><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><div class="rs-base"><span>본사 기준가</span><strong>${esc(won(item.price))}</strong></div><div class="rs-price-empty">목포대점 판매 여부·옵션·배달앱 가격은 주문 시 최종 확인해 주세요.</div><a class="rs-action" href="${esc(item.product_url)}" target="_blank" rel="noopener noreferrer">본사 제품 상세 ↗</a></div></article>`;
}
function pizzamaruFullMenu(catalog){
  const items=Array.isArray(catalog?.items)?catalog.items:[];
  const nav=PIZZAMARU_CATEGORIES.map((row)=>`<a class="rs-action" href="#${esc(categoryId(row.label))}">${esc(row.label)}</a>`).join('');
  const groups=PIZZAMARU_CATEGORIES.map((row)=>{
    const categoryItems=items.filter((item)=>item.category===row.label);
    const categoryUrl=`https://www.pizzamaru.co.kr/menu/${row.id}/`;
    return `<section id="${esc(categoryId(row.label))}" class="rs-info-card" data-pm-category="${esc(row.label)}"><div class="rs-section-head"><h2>${esc(row.label)} <small>${categoryItems.length}개</small></h2><a class="rs-action" href="${esc(categoryUrl)}" target="_blank" rel="noopener noreferrer">본사 카테고리 ↗</a></div>${categoryItems.length?`<div class="rs-menu">${categoryItems.map(pizzamaruProductCard).join('')}</div>`:'<div class="rs-price-empty">본사 메뉴를 불러오는 중입니다. 본사 카테고리에서 최신 메뉴를 확인할 수 있습니다.</div>'}</section>`;
  }).join('');
  const status=catalog?.complete?`본사 공식 메뉴 ${items.length}종 · ${PIZZAMARU_CATALOG_VERIFIED_AT} 확인`:`본사 공식 메뉴 ${items.length}종 확인 · 일부 카테고리 갱신 중`;
  return `<div id="all-menu" class="rs-pm-full"><div class="rs-section-head"><h2>피자마루 전체메뉴</h2><p>피자마루 본사 공식 제품 이미지와 본사 기준가격을 사용합니다. 본사 가격은 포장 주문·매장 내 취식 기준이며, 목포대점 판매 여부와 배달가격은 주문앱 또는 매장에서 최종 확인합니다.</p></div><div class="rs-price-empty"><strong>${esc(status)}</strong></div><div class="rs-actions">${nav}</div>${groups}</div>`;
}
function pizzamaruSocials(){
  return `<section id="social" class="rs-main"><div class="rs-shell"><div class="rs-section-head"><h2>피자마루 공식 소셜채널</h2><p>피자마루 본사 홈페이지에서 연결하는 공식 채널입니다. 신메뉴·이벤트·브랜드 콘텐츠를 바로 확인하세요.</p></div><div class="rs-info-grid">${PIZZAMARU_SOCIALS.map((row,index)=>`<a class="rs-info-card" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer"><h3>${esc(row.label)}</h3><p>${esc(row.handle)}</p><strong>공식채널 바로가기 ↗</strong></a>`).join('')}</div></div></section>`;
}

export async function renderRestaurantStorefrontPage(request,env,resolved,slug){
  const response=await renderV2(request,env,resolved,slug);
  if(!response.headers.get('content-type')?.includes('text/html'))return response;
  let html=await response.text();
  const storefrontCssVersion=slug==='yogurt'?'20260912-yogurt-v4':'20260911-v2';
  html=html.replace('/_ekodi/space/restaurant-storefront.css?v=20260911-v1',`/_ekodi/space/storefront.css?v=${storefrontCssVersion}`);
  html=html.replace(`<html lang="ko" data-restaurant-theme="${slug==='pizzamaru'?'pizza':'yogurt'}">`,`<html lang="ko" data-store-page="${slug}" data-restaurant-theme="${slug==='pizzamaru'?'pizza':'yogurt'}">`);
  html=html.replace('<div class="rs-actions">',`<div class="rs-actions"><a class="rs-action primary" href="${slug==='pizzamaru'?'#all-menu':'#menu'}">메뉴·가격 보기</a>`);
  html=html.replace('class="rs-action primary" href="tel:','class="rs-action " href="tel:');
  html=html.replace('<h2>대표 메뉴</h2>','<h2>메뉴와 앱별 가격</h2>');
  if(slug==='pizzamaru'){
    const catalog=await loadPizzamaruOfficialCatalog().catch(()=>({items:[],complete:false,failed:PIZZAMARU_CATEGORIES.map((row)=>row.label)}));
    html=html.replace('<a href="#menu">메뉴·가격</a>','<a href="#menu">대표메뉴</a><a href="#all-menu">전체메뉴</a>');
    html=html.replace('<a href="#order">배달주문</a>','<a href="#order">배달주문</a><a href="#social">공식채널</a>');
    html=html.replace('<div id="store" class="rs-info">',`${pizzamaruFullMenu(catalog)}<div id="store" class="rs-info">`);
    html=html.replace('<footer class="rs-footer">',`${pizzamaruSocials()}<footer class="rs-footer">`);
    html=html.replace('<nav class="rs-mobile"><a href="#menu">메뉴</a>','<nav class="rs-mobile"><a href="#all-menu">전체메뉴</a>');
  }
  if(slug==='yogurt'){
    html=html.replace('<h3>배달앱 주문</h3>','<h3>배달앱에서 바로 주문</h3>');
    if(!html.includes('본사 등록명 ‘무안목포대점’'))html=html.replace('요거트퍼플 목포대점 안내</h3>','요거트퍼플 목포대점 안내</h3><p style="margin:-7px 0 14px;color:var(--muted);font-size:9px">본사 등록명 ‘무안목포대점’</p>');
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
