import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRestaurantStorefrontPage } from '../restaurant-storefront.js';
import { PIZZAMARU_CATEGORIES, PIZZAMARU_SOCIALS, parsePizzamaruCategory, loadPizzamaruOfficialCatalog } from '../pizzamaru-catalog.js';

const productHtml=(category)=>`<li><div class="img por"><a href="/product/${encodeURIComponent(category)}"><img src="/d_fileinfo/img/${encodeURIComponent(category)}.jpg" alt=""></a></div><div class="txt_box tac"><p class="t1 lh tov">${category} 테스트 피자</p><p class="t2 c6 tov2">${category} 설명<br>(본 가격은 포장 및 매장 내 취식 기준입니다.)<br>(본 사진은 이미지컷으로 실제와 다를 수 있습니다.)</p><p class="t3 lh">12,900원</p></div></li>`;

test('PizzaMaru official catalog contract covers every HQ category and social channel',()=>{
  assert.equal(PIZZAMARU_CATEGORIES.length,10);
  for(const label of ['신메뉴','클래식','1인피자(8인치)','몬스터','골드&바이트','프리미엄','시카고&치즈폭탄','퍼스널(마루업)','투탑박스','사이드 및 기타'])assert.ok(PIZZAMARU_CATEGORIES.some(row=>row.label===label));
  for(const url of ['instagram.com/pizzamaru_official','facebook.com/pizzamaruofficial','youtube.com/user/pizzamaru','pizzamaru.co.kr'])assert.ok(PIZZAMARU_SOCIALS.some(row=>row.url.includes(url)));
  const parsed=parsePizzamaruCategory(productHtml('클래식'),'클래식','https://www.pizzamaru.co.kr/menu/11/');
  assert.equal(parsed.length,1);
  assert.equal(parsed[0].price,12900);
  assert.match(parsed[0].image_url,/^https:\/\/www\.pizzamaru\.co\.kr\/d_fileinfo\/img\//);
  assert.doesNotMatch(parsed[0].description,/포장 및 매장/);
});

test('PizzaMaru full menu stays complete without runtime access to HQ',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{throw new Error('offline')};
  try{
    const catalog=await loadPizzamaruOfficialCatalog();
    assert.equal(catalog.items.length,78);
    assert.equal(catalog.complete,true);
    assert.equal(catalog.source,'hq_verified_snapshot');
    assert.ok(catalog.items.every(item=>item.image_url.startsWith('https://www.pizzamaru.co.kr/')));
  }finally{globalThis.fetch=originalFetch}
});

test('PizzaMaru customer page renders full menu navigation and official social links',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>{
    const href=String(url);
    const category=PIZZAMARU_CATEGORIES.find(row=>href.includes(`/menu/${row.id}/`));
    if(category)return new Response(productHtml(category.label),{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
    return new Response('{}',{status:404,headers:{'content-type':'application/json'}});
  };
  try{
    const response=await renderRestaurantStorefrontPage(new Request('https://ekodi.kr/pizzamaru'),{},
      {profile:{name:'피자마루 목포대점',theme:'pizzamaru',lead:'목포대점'}},'pizzamaru');
    const html=await response.text();
    for(const marker of ['피자마루 전체메뉴','전체메뉴','공식채널','Instagram','Facebook','YouTube','@pizzamaru_official','본사 공식'])assert.match(html,new RegExp(marker));
    for(const category of PIZZAMARU_CATEGORIES)assert.ok(html.includes(category.label.replaceAll('&','&amp;')));
    assert.match(html,/https:\/\/www\.pizzamaru\.co\.kr\/d_fileinfo\/img\//);
    assert.match(html,/본사 가격은 포장 주문·매장 내 취식 기준/);
    assert.match(html,/정보 확인 기준/);
    assert.doesNotMatch(html,/Powered by EKODI|EKODI 검증 원칙/);
  }finally{globalThis.fetch=originalFetch}
});
