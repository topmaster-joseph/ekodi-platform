import { restaurantStorefrontCss, renderRestaurantStorefrontPage as renderV2 } from './restaurant-storefront-v2.js';

export { restaurantStorefrontCss };

const YOGURT_REFERENCE = [
  ['플레인 요거트아이스크림','요거트아이스크림'],
  ['딸기 요아츄','요거트아이스크림'],
  ['그릭요거트 100g','그릭요거트'],
];
const YOGURT_CHANNELS = [
  ['baemin','배달의민족','배','https://www.baemin.com/'],
  ['coupang_eats','쿠팡이츠','C','https://www.coupangeats.com/'],
  ['yogiyo','요기요','요','https://www.yogiyo.co.kr/mobile/'],
  ['daangn_order','당근주문','당','https://www.daangn.com/kr/local-profile/?search=%EC%9A%94%EA%B1%B0%ED%8A%B8%ED%8D%BC%ED%94%8C%20%EB%AA%A9%ED%8F%AC%EB%8C%80%EC%A0%90'],
  ['naver_order','네이버주문','N','https://map.naver.com/p/search/%EC%9A%94%EA%B1%B0%ED%8A%B8%ED%8D%BC%ED%94%8C%20%EB%AC%B4%EC%95%88%EB%AA%A9%ED%8F%AC%EB%8C%80%EC%A0%90'],
];

function referenceMenuHtml(){
  return YOGURT_REFERENCE.map(([name,category],index)=>`<article class="rs-menu-card"><div class="rs-menu-media"><div class="rs-food-fallback"><span>${index+1}</span><b>${category}</b></div></div><div class="rs-menu-body"><div class="rs-menu-meta"><span>${category}</span><small>본사 공식 메뉴 + 공개 등록가 참고</small></div><h3>${name}</h3><p>목포대점의 검증 메뉴가 연결되기 전까지 메뉴명만 참고용으로 안내합니다.</p><div class="rs-price-empty">참고가 · 최종 판매가격은 주문앱 또는 매장에서 확인해 주세요.</div></div></article>`).join('');
}
function fallbackOrdersHtml(){
  return YOGURT_CHANNELS.map(([provider,label,short,url])=>`<a class="rs-order-card p-${provider}" href="${url}" target="_blank" rel="noopener noreferrer"><i>${short}</i><span><b>${label}</b><small>매장 찾기 · 직행 링크 확인 시 자동 우선</small></span><strong>→</strong></a>`).join('');
}

export async function renderRestaurantStorefrontPage(request,env,resolved,slug){
  const response=await renderV2(request,env,resolved,slug);
  if(!response.headers.get('content-type')?.includes('text/html'))return response;
  let html=await response.text();
  html=html.replace(`<html lang="ko" data-restaurant-theme="${slug==='pizzamaru'?'pizza':'yogurt'}">`,`<html lang="ko" data-store-page="${slug}" data-restaurant-theme="${slug==='pizzamaru'?'pizza':'yogurt'}">`);
  html=html.replace('<div class="rs-actions">','<div class="rs-actions"><a class="rs-action primary" href="#menu">메뉴·가격 보기</a>');
  html=html.replace('class="rs-action primary" href="tel:','class="rs-action " href="tel:');
  html=html.replace('<h2>대표 메뉴</h2>','<h2>메뉴와 앱별 가격</h2>');
  if(slug==='yogurt'){
    html=html.replace('<h3>배달앱 주문</h3>','<h3>배달앱에서 바로 주문</h3>');
    if(!html.includes('플레인 요거트아이스크림')){
      html=html.replace('<div class="rs-menu"><div class="rs-info-card" style="grid-column:1/-1"><h3>목포대점 메뉴를 연결하고 있습니다.</h3><p style="margin:0;color:var(--muted);font-size:10px;line-height:1.6">확인되지 않은 메뉴명이나 가격을 임의로 만들지 않습니다. 본사 메뉴 또는 주문 앱에서 현재 판매 메뉴를 확인해 주세요.</p></div></div>',`<div class="rs-menu">${referenceMenuHtml()}</div>`);
    }
    if(!html.includes('배달의민족')){
      html=html.replace('<div class="rs-order-foot">검증된 주문 링크를 연결하고 있습니다.</div>',fallbackOrdersHtml());
    }
    if(!html.includes('본사 등록명 ‘무안목포대점’')){
      html=html.replace('요거트퍼플 목포대점 안내</h3>','요거트퍼플 목포대점 안내</h3><p style="margin:-7px 0 14px;color:var(--muted);font-size:9px">본사 등록명 ‘무안목포대점’</p>');
    }
  }
  const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');headers.delete('etag');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}
