import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BBQ_CG_SLUG, bbqCheonggyeCss, bbqCheonggyeQrScript, renderBbqCheonggyePage } from '../bbq-cheonggye-site.js';

const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const url='https://ekodi.kr/bbqcg';
test('BBQ Cheonggye uses an EKODI customer workspace path, not a local server',async()=>{
  assert.equal(BBQ_CG_SLUG,'bbqcg');
  const response=await renderBbqCheonggyePage(new Request(url),{}, {name:'BBQ 무안청계점'});
  const html=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-robots-tag'),'noindex,nofollow,noarchive');
  assert.match(html,/https:\/\/ekodi\.kr\/bbqcg/);
  assert.match(html,/\/bbqcg\/assets\/site\.css/);
  assert.match(html,/\/bbqcg\/admin/);
  assert.match(html,/https:\/\/bbq\.co\.kr\//);
  assert.doesNotMatch(html,/http:\/\/127\.0\.0\.1|localhost|8080/);
  assert.doesNotMatch(html,/bbqe-learning.*(?:password|비밀번호)/);
});
test('premium stylesheet uses exact local route and a fingerprint for cache coherence',async()=>{
  const html=await (await renderBbqCheonggyePage(new Request(url),{},{})).text();
  assert.match(html,/href="\/bbqcg\/assets\/site\.css\?v=[a-f0-9]{12,40}"/);
  assert.doesNotMatch(html,/href="\/bbqcg\/assets\/site\.css"/);
});
test('styles are served from same-origin CSS and support narrow screens',async()=>{
  const css=await bbqCheonggyeCss().text();
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/grid-template-columns:1fr/);
  assert.match(css,/word-break:keep-all/);
});
test('public projection includes verified data but escapes untrusted store fields',async()=>{
  const data={
    store:{name:'BBQ 무안청계점',address:'광장 <script>alert(1)</script>',phone:'061-123-4567',business_hours:{display:'매일 11:00 ~ 23:00'},description:'오픈 안내'},
    menu:[{name:'공식 확인된 메뉴',category:'치킨',description:'맛있는 치킨',base_price:22000,availability:'available'},{name:'숨김 메뉴',availability:'hidden'}]
  };
  const mock=async()=>new Response(JSON.stringify(data),{status:200});
  const response=await renderBbqCheonggyePage(new Request(url),{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'}, {name:'BBQ 무안청계점'},mock);
  const html=await response.text();
  assert.match(html,/공식 확인된 메뉴/);
  assert.match(html,/22,000원/);
  assert.doesNotMatch(html,/숨김 메뉴/);
  assert.match(html,/광장 &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.equal(response.headers.get('x-robots-tag'),'index,follow');
});
test('HEAD contains metadata but never returns a body',async()=>{
  const response=await renderBbqCheonggyePage(new Request(url,{method:'HEAD'}),{},{});
  assert.equal(await response.text(),'');
});
test('workspace route is gated by an actual store_user_sites record',async()=>{
  const worker=await source('space-worker.js');
  assert.match(worker,/requested==='bbqcg'&&!workspaceRoute\?\.service&&resolved\.source==='store-user-sites'/);
  assert.match(worker,/renderBbqCheonggyePage/);
  assert.match(worker,/\/bbqcg\/assets\/site\.css/);
});
test('store provisioning reuses immutable store identity and does not assign roles',async()=>{
  const migration=await source('supabase/migrations/20261108104500_bbqcg_hard_cutover.sql');
  assert.match(migration,/update public\.stores/);
  assert.match(migration,/operating_space_slug/);
  assert.match(migration,/v_owner/);
  assert.match(migration,/store_user_sites/);
  assert.match(migration,/no role grants/i);
  assert.doesNotMatch(migration,/bbq123456|26110938|password\s*=/i);
});

test('BBQ store presents its own sticky brand, safe order selection and a local QR asset',async()=>{
  const html=await (await renderBbqCheonggyePage(new Request(url),{},{})).text();
  const css=await bbqCheonggyeCss().text();
  const qr=await bbqCheonggyeQrScript().text();
  assert.doesNotMatch(html,/LOCAL STORE\s*·\s*EKODI|<small>EKODI<\/small>/);
  assert.match(html,/id="order"/);
  assert.match(html,/id="directions"/);
  assert.match(html,/청계점 전용 주문 링크 확인 중/);
  assert.match(html,/\/bbqcg\/assets\/order-qr\.js/);
  assert.match(css,/position:sticky/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(qr,/https:\/\/ekodi\.kr\/bbqcg#order/);
  assert.match(qr,/QRCode/);
  assert.match(qr,/toDataURL\('image\/png'\)/);
  assert.doesNotMatch(html,/baemin\.com|yogiyo\.co\.kr|coupangeats\.com/i);
});
test('worker serves the BBQ QR JavaScript from its own public route',async()=>{
  const src=await source('space-worker.js');
  assert.match(src,/bbqCheonggyeQrScript/);
  assert.match(src,/\/bbqcg\/assets\/order-qr\.js/);
});


test('BBQ customer footer omits owner-deleted notices but preserves genuine navigation',async()=>{
  const html=await (await renderBbqCheonggyePage(new Request(url),{},{})).text();
  assert.doesNotMatch(html,/매장 자체 안내 페이지입니다\. 제너시스BBQ 본사 및 치킨대학 교육시스템과는 별도 운영됩니다\./);
  assert.doesNotMatch(html,/교육 원문·조리 지침은 허가 없이 수집하거나 공개하지 않습니다\./);
  assert.match(html,/<footer class="foot">/);
  assert.match(html,/BBQ 공식 사이트<\/a>/);
  assert.match(html,/매장 운영관리<\/a>/);
  assert.match(html,/<script defer src="\/bbqcg\/assets\/order-qr\.js"><\/script>/);
});


test('approved premium storefront keeps photographic hero, anchor routes and independent store identity',async()=>{
  const html=await (await renderBbqCheonggyePage(new Request(url),{},{})).text();
  const css=await bbqCheonggyeCss().text();
  for(const id of ['main','guide','menu','order','notice','directions','bbqOrderQr','bbqQrDownload']){
    assert.match(html,new RegExp('id="'+id+'"'),id);
  }
  assert.match(html,/바삭함의 기준,/);
  assert.match(html,/오늘도 <em>BBQ<\/em>/);
  assert.match(html,/class="hero-photo"/);
  assert.match(html,/images\.unsplash\.com\/photo-1742936401708-dd1b132f06db/);
  assert.match(html,/images\.unsplash\.com\/photo-1624153064067-566cae78993d/);
  assert.match(html,/images\.unsplash\.com\/photo-1766589221324-656419e4c844/);
  assert.match(html,/사진은 메뉴 연출 예시이며 BBQ 본사 제품 사진이 아닙니다/);
  assert.match(html,/황금올리브치킨™/);
  assert.match(html,/오리지날 양념치킨/);
  assert.match(html,/매장별 판매 메뉴와 가격은 공식 주문 화면에서 확인/);
  assert.match(html,/청계점 전용 주문 링크 확인 중/);
  assert.doesNotMatch(html,/<h[1-6][^>]*>[^<]*EKODI/);
  assert.doesNotMatch(html,/매장 자체 안내 페이지입니다|교육 원문·조리 지침은/);
  assert.match(css,/\.hero-photo/);
  assert.match(css,/\.photo-grid/);
  assert.match(css,/\.qr-mini/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/prefers-reduced-motion/);
});
test('premium layout still renders only authorized verified local menu and safe phone data',async()=>{
  const data={store:{name:'BBQ 무안청계점',address:'승달산길 37-1',phone:'061-453-8295',
    business_hours:{display:'11:00 ~ 23:00'},description:'매장 소식'},menu:[
      {name:'우리 매장 등록 메뉴',description:'테스트 메뉴',category:'치킨',base_price:21000,availability:'available'},
      {name:'비공개 메뉴',availability:'hidden'}
  ]};
  const fetchImpl=async()=>new Response(JSON.stringify(data),{status:200});
  const html=await (await renderBbqCheonggyePage(new Request(url),{
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test'
  },{name:'BBQ 무안청계점'},fetchImpl)).text();
  assert.match(html,/승달산길 37-1/);
  assert.match(html,/061-453-8295/);
  assert.match(html,/href="tel:0614538295"/);
  assert.match(html,/id="verified-menu-heading"/);
  assert.match(html,/테스트 메뉴/);
  assert.match(html,/21,000원/);
  assert.doesNotMatch(html,/비공개 메뉴/);
  assert.doesNotMatch(html,/[\s\S]*<\/script><script>alert/);
});
