import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BBQCG_ORDER_PATH, BBQCG_REAL_PAYMENT_ENABLED, BBQCG_ORDER_APPROVAL_NOTE,
  verifiedBbqcgMenu,bbqcgOrderReadiness,bbqcgOrderPortalCss,
  bbqcgOrderClientScript,renderBbqcgOrderPortal
} from '../bbqcg-order-portal.js';
import {renderBbqcgHeader,renderBbqcgFooter} from '../bbqcg-shared-chrome.js';
import {bbqCheonggyeQrScript,renderBbqCheonggyePage} from '../bbq-cheonggye-site.js';

const url='https://ekodi.kr/bbqcg/order';
const validId='2b8c9f65-755b-4f6a-8ad2-2cc1fd974b5a';

test('QR is a stable customer route, not an anchor or unverified payment channel',async()=>{
  const qr=await bbqCheonggyeQrScript().text();
  const homepage=await (await renderBbqCheonggyePage(new Request('https://ekodi.kr/bbqcg'),{},{})).text();
  assert.equal(BBQCG_ORDER_PATH,'/bbqcg/order');
  assert.match(qr,/const target='https:\/\/ekodi\.kr\/bbqcg\/order'/);
  assert.doesNotMatch(qr,/bbqcg#order/);
  assert.match(homepage,/href="\/bbqcg\/order"/);
  assert.match(homepage,/QR 메뉴 확인/);
  assert.match(homepage,/온라인 결제와 매장 자동 접수는 승인 후 개통/);
  assert.match(qr,/BBQ-무안청계점/);
});

test('customer menu never invents prices, approved products, or publishes unverified catalog rows',()=>{
  const sample={menu:[
    {id:validId,name:'승인 메뉴',base_price:24000,source_basis:'operator_verified',verified_at:'2026-11-15T12:00:00Z',availability:'available'},
    {id:'2b8c9f65-755b-4f6a-8ad2-2cc1fd974b5b',name:'미확인 가격',base_price:25000,source_basis:'operator_verified',verified_at:null},
    {id:'2b8c9f65-755b-4f6a-8ad2-2cc1fd974b5c',name:'예시 사진 메뉴',base_price:22000,source_basis:'pending',verified_at:'2026-11-15T12:00:00Z'},
    {id:'2b8c9f65-755b-4f6a-8ad2-2cc1fd974b5d',name:'가격 없음',base_price:0,source_basis:'brand_official',verified_at:'2026-11-15T12:00:00Z'},
    {id:'2b8c9f65-755b-4f6a-8ad2-2cc1fd974b5e',name:'숨김 제품',base_price:19000,source_basis:'operator_verified',verified_at:'2026-11-15T12:00:00Z',availability:'hidden'},
    {id:'2b8c9f65-755b-4f6a-8ad2-2cc1fd974b5f',name:'일치하지 않는 메뉴',base_price:24000,source_basis:'unknown',verified_at:'2026-11-15T12:00:00Z'}
  ]};
  const verified=verifiedBbqcgMenu(sample);
  assert.equal(verified.length,1);
  assert.equal(verified[0].name,'승인 메뉴');
  assert.equal(verified[0].price,24000);
  assert.equal(verifiedBbqcgMenu({menu:null}).length,0);
  assert.equal(verifiedBbqcgMenu({menu:[{...sample.menu[0],id:'private-123'}]}).length,0);
  const ready=bbqcgOrderReadiness({snapshot:sample,storePublished:true,orderEnabled:true,merchantVerified:true,notificationVerified:true});
  assert.equal(BBQCG_REAL_PAYMENT_ENABLED,false);
  assert.equal(ready.catalogReady,true);
  assert.equal(ready.checkoutReady,false,'activation requires implemented server payment+receipt');
  assert.equal(ready.menuCount,1);
});

test('guest portal can view approved menu but cannot perform a payment or create a store order',async()=>{
  const observed=[];
  const mockFetch=async(req,opts)=>{
    observed.push({url:String(req),method:opts.method,body:opts.body});
    return new Response(JSON.stringify({store:{phone:'061-453-8295'},menu:[
      {id:validId,name:'특별한 <script>alert(1)</script>',category:'치킨',description:'매장 승인',base_price:25000,source_basis:'operator_verified',verified_at:'2026-11-15T12:00:00Z',availability:'available'},
      {id:'2b8c9f65-755b-4f6a-8ad2-2cc1fd974b5f',name:'비공개 판매가',base_price:38000,source_basis:'pending',verified_at:null}
    ]}),{status:200});
  };
  const r=await renderBbqcgOrderPortal(new Request(url),{
    SUPABASE_URL:'https://test-db.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-public-key'
  },mockFetch);
  const html=await r.text();
  assert.equal(r.status,200);
  assert.equal(r.headers.get('x-robots-tag'),'noindex,nofollow,noarchive');
  assert.equal(r.headers.get('x-ekodi-order-mode'),'read-only-until-verified');
  assert.equal(observed.length,1);
  assert.equal(observed[0].method,'POST','read-only catalog snapshot RPC');
  assert.match(observed[0].url,/\/rest\/v1\/rpc\/store_user_site_public_snapshot$/);
  assert.equal(JSON.parse(observed[0].body).p_slug,'bbqcg');
  assert.match(html,/특별한 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html,/비공개 판매가/);
  assert.match(html,/25,000원/);
  assert.match(html,/tel:0614538295/);
  assert.match(html,/data-item-price="25000"/);
  assert.match(html,/disabled aria-disabled="true"/);
  assert.match(html,/온라인 결제 및 매장 자동 접수는 아직 준비 중/);
  assert.match(html,/href="https:\/\/bbq\.co\.kr\/"/);
  assert.equal(html.split(renderBbqcgHeader()).length-1,1);
  assert.equal(html.split(renderBbqcgFooter()).length-1,1);
  assert.doesNotMatch(html,/<form[^>]*action=/i);
  assert.doesNotMatch(html,/cdn\.portone\.io|toss-payments|paymentKey|customer_phone/);
});

test('unprovisioned or unverified store remains informative and fail-closed',async()=>{
  const r=await renderBbqcgOrderPortal(new Request(url));
  const html=await r.text();
  assert.equal(r.status,200);
  assert.match(html,/판매 메뉴 등록을 준비/);
  assert.match(html,/BBQ 공식 메뉴·주문/);
  assert.doesNotMatch(html,/data-item-price=/);
  assert.match(html,/disabled aria-disabled="true"/);
  const noData=await renderBbqcgOrderPortal(new Request(url),{
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'
  },async()=>new Response(null,{status:503}));
  assert.match(await noData.text(),/판매 메뉴 등록을 준비/);
});

test('mutations are rejected; HEAD and assets preserve the same chrome and responsive mobile access',async()=>{
  const bad=await renderBbqcgOrderPortal(new Request(url,{method:'POST'}));
  assert.equal(bad.status,405);
  assert.equal(bad.headers.get('allow'),'GET, HEAD');
  const head=await renderBbqcgOrderPortal(new Request(url,{method:'HEAD'}));
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
  const css=await bbqcgOrderPortalCss().text();
  const js=await bbqcgOrderClientScript().text();
  assert.match(css,/bbqcg-shared-chrome-v1/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(js,/event\.preventDefault\(\)/);
  assert.doesNotMatch(js,/fetch\(|sendBeacon\(|\/api\/checkout|paymentKey/);
  assert.match(js,/toLocaleString\('ko-KR'\)/);
  const space=await readFile(new URL('../space-worker.js',import.meta.url),'utf8');
  assert.match(space,/if\(url\.pathname==='\/bbqcg\/order'\)/);
  assert.match(space,/resolved\.source!=='store-user-sites'\|\|resolved\.status==='paused'/);
  assert.match(space,/renderBbqcgOrderPortal\(request,env\)/);
  assert.match(space,/withHeaders\(env,await renderBbqcgOrderPortal\(request,env\),'bbqcg-qr-order'\)/);
});
