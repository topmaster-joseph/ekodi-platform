import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handleMallOwnedGeoRequest, isMallOwnedGeoPath } from '../mall-owned-geo.js';

const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');
const sampleProduct={id:112,productId:'8640112371',productName:'테스트 추천상품',priceKrw:12900,imageUrl:'https://api.ekodi.kr/api/affiliate/public/image/112?storefront=ekodi-mall',clickUrl:'https://api.ekodi.kr/api/affiliate/public/click/112?storefront=ekodi-mall',category:'식품',providerName:'Coupang',buyLabel:'쿠팡에서 구매',isRocket:true,disclosureText:'제휴 수수료를 제공받을 수 있습니다.'};

function weeklyPrimary(){
  return Array.from({length:7},(_,i)=>({slot:i+1,productRowId:101+i,productName:`주간상품 ${i+1}`,category:i%2?'생활':'식품'}));
}

test('owned GEO product page is factual, indexable and campaign-aware',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('/public/product/112')) return new Response(JSON.stringify({storefront:'ekodi-mall',disclosureText:'쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다.',product:sampleProduct}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch ${url}`);
  };
  try{
    const response=await handleMallOwnedGeoRequest(new Request('https://ekodi.kr/ekodibiz/mall/p/112?utm_campaign=mall-20260908-facebook-112'));
    assert.equal(response.status,200);
    const body=await response.text();
    assert.match(body,/rel="canonical" href="https:\/\/ekodi\.kr\/ekodibiz\/mall\/p\/112"/);
    assert.match(body,/application\/ld\+json/);
    assert.match(body,/schema\.org\/Product/);
    assert.match(body,/rel="sponsored noopener noreferrer"/);
    assert.match(body,/쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다/);
    assert.match(body,/r\/mall\/outbound\/.*\/112/);
    assert.doesNotMatch(body,/AggregateRating|reviewCount|ratingValue/);
    assert.equal(response.headers.get('x-ekodi-owned-promotion'),'geo-v1');
  } finally { globalThis.fetch=original; }
});

test('weekly A7 drives owned RSS and sitemap discovery',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('marketing-connect-api.ekodi.kr/health')) return new Response(JSON.stringify({mallPromotionAutomation:{weeklyBoard:{weekKey:'2026-W37',generatedAt:'2026-09-08T11:45:02.126Z',primary:weeklyPrimary()}}}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch ${url}`);
  };
  try{
    const feed=await handleMallOwnedGeoRequest(new Request('https://ekodi.kr/ekodibiz/mall/feed.xml'));
    const feedText=await feed.text();
    assert.match(feedText,/EKODI MALL 주간 추천/);
    assert.equal((feedText.match(/<item>/g)||[]).length,7);
    assert.match(feedText,/\/ekodibiz\/mall\/p\/101/);
    const sitemap=await handleMallOwnedGeoRequest(new Request('https://ekodi.kr/ekodibiz/mall/sitemap.xml'));
    const sitemapText=await sitemap.text();
    assert.equal((sitemapText.match(/<url>/g)||[]).length,8);
    assert.match(sitemapText,/2026-09-08/);
  } finally { globalThis.fetch=original; }
});
test('owned GEO falls back to public catalog when weekly board is unavailable',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('marketing-connect-api.ekodi.kr/health')) return new Response('offline',{status:503});
    if(url.includes('/public/products')) return new Response(JSON.stringify({products:[sampleProduct]}),{status:200,headers:{'content-type':'application/json'}});
    throw new Error(`unexpected fetch ${url}`);
  };
  try{
    const feed=await handleMallOwnedGeoRequest(new Request('https://ekodi.kr/ekodibiz/mall/feed.xml'));
    const body=await feed.text();
    assert.match(body,/테스트 추천상품/);
    assert.match(body,/\/ekodibiz\/mall\/p\/112/);
  } finally { globalThis.fetch=original; }
});

test('routing and deployment contracts keep GEO promotion first-party',async()=>{
  const [api,site,promotion,prod,stage]=await Promise.all([read('affiliate-control.js'),read('site-worker.js'),read('mall-promotion-automation.js'),read('.github/workflows/deploy-site-core.yml'),read('.github/workflows/stage-shared-site-shell.yml')]);
  assert.ok(api.includes("url.pathname.match(/^\\/api\\/affiliate\\/public\\/product\\/(\\d+)$/)"));
  assert.match(site,/handleMallOwnedGeoRequest/);
  assert.match(site,/mall-owned-geo/);
  assert.match(promotion,/ekodibiz\/mall\/p\/\$\{Number\(row\.product_row_id\)\}/);
  assert.match(prod,/mall-owned-geo\.js/);
  assert.match(stage,/mall-owned-geo\.js/);
  assert.equal(isMallOwnedGeoPath('/ekodibiz/mall/p/112'),true);
  assert.equal(isMallOwnedGeoPath('/ekodibiz/mall/feed.xml'),true);
  assert.equal(isMallOwnedGeoPath('/ekodibiz/mall'),false);
});
