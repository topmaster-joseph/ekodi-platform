import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { jadamStorefrontCss, renderJadamStorefrontPage } from '../jadam-storefront.js';

const resolved={profile:{name:'자담치킨 목포대점',theme:'jadam'}};

test('Jadam customer page is public, brand-first, and exposes only the four requested delivery apps',async()=>{
  const response=await renderJadamStorefrontPage(new Request('https://ekodi.kr/jadam'),{},resolved,'jadam');
  const html=await response.text();
  assert.equal(response.status,200);
  for(const marker of ['자담치킨 목포대점','자연을 담은 건강한 치킨','국립목포대학교 후문','대표 메뉴','배달앱 주문','전남 무안군 청계면 승달산길 37-1','061-453-8295'])assert.match(html,new RegExp(marker));
  for(const provider of ['땡겨요','배달의민족','요기요','먹깨비'])assert.match(html,new RegExp(provider));
  for(const menu of ['후라이드치킨','핫후라이드치킨','맵슐랭치킨','허니팝치킨','3반치킨세트'])assert.match(html,new RegExp(menu));
  assert.match(html,/공개 참고가/);
  assert.match(html,/앱별 목포대점 가격 연결 대기/);
  assert.match(html,/주문 링크 확인 중/);
  const menuImages=[...html.matchAll(/<div class="jd-menu-photo"><img src="([^"]+)/g)].map(match=>match[1]);
  assert.equal(menuImages.length,12);
  assert.ok(menuImages.every(url=>new URL(url).hostname.endsWith('ejadam.co.kr')));
  assert.match(html,/본사 공식 제품 이미지/);
  assert.match(html,/메뉴 이미지는 본사 공식 제품 이미지를 유지합니다/);
  assert.match(html,/data-jadam-menu-images="brand-official"/);
  assert.match(html,/jadam-storefront\.css\?v=20260910-hq-menu-v1/);
  assert.doesNotMatch(html,/쿠팡이츠|당근 주문|네이버 주문|USER OPERATIONS|STORE MASTER|로그아웃/);
  assert.doesNotMatch(html,/example\.com/);
});

test('verified Mokpo platform snapshot overrides reference display and activates exact order links',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    store:{address:'전남 무안군 청계면 승달산길 37-1',phone:'061-453-8295',business_hours:{display:'11:00–22:00'}},
    channels:[{provider:'ddangyo',display_name:'땡겨요',order_url:'https://order.example.test/ddangyo'}],
    menu:[{name:'후라이드치킨',base_price:21500,description:'목포대점 확인 메뉴',listings:[{provider:'baemin',price:23500,image_url:'https://images.example.test/chicken.jpg',order_url:'https://order.example.test/baemin'}]}]
  }),{status:200,headers:{'content-type':'application/json'}});
  try{
    const response=await renderJadamStorefrontPage(new Request('https://ekodi.kr/jadam'),{SUPABASE_URL:'https://project.example.test',SUPABASE_PUBLISHABLE_KEY:'test'},resolved,'jadam');
    const html=await response.text();
    for(const marker of ['21,500원','23,500원','목포대점 확인','https://order.example.test/ddangyo','https://order.example.test/baemin','본사 공식 제품 이미지','https://www.ejadam.co.kr/data/editor/1709/de8720524886cf91e6ef20f944eabc48_1506676434_3065.jpg'])assert.match(html,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.doesNotMatch(html,/https:\/\/images\.example\.test\/chicken\.jpg/);
  }finally{globalThis.fetch=originalFetch}
});

test('Jadam stylesheet preserves desktop hierarchy and mobile ordering surface',async()=>{
  const css=await jadamStorefrontCss().text();
  for(const marker of ['.jd-hero','.jd-values','.jd-grid','.jd-menu-list','.jd-providers','.jd-store','.jd-mobile','@media(max-width:820px)'])assert.match(css,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(css,/main_visual_0713_01\.jpg/);
});

test('Space worker gives Jadam its dedicated renderer and same canonical storefront boundary',async()=>{
  const source=await readFile(new URL('../space-worker.js',import.meta.url),'utf8');
  assert.match(source,/renderJadamStorefrontPage/);
  assert.match(source,/jadamStorefrontCss/);
  assert.match(source,/requested==='jadam'/);
  assert.match(source,/space-storefront/);
  assert.match(source,/\/_ekodi\/space\/jadam-storefront\.css/);
});
