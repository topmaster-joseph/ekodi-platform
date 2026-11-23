import test from 'node:test';
import assert from 'node:assert/strict';
import {bbqCheonggyeCss,renderBbqCheonggyePage} from '../bbq-cheonggye-site.js';

const site='https://ekodi.kr/bbqcg';

test('BBQ opening notice is truthful and offers an immediate verified phone path',async()=>{
  const snapshot={store:{
    address:'전남 무안군 청계면 승달산길 37-1, 1층',
    phone:'061-453-8295',
    business_hours:{display:'매일 11:00 ~ 23:00'}
  },menu:[]};
  const response=await renderBbqCheonggyePage(
    new Request(site),
    {SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'},
    {name:'BBQ 무안청계점'},
    async()=>new Response(JSON.stringify(snapshot),{status:200})
  );
  const html=await response.text();
  assert.match(html,/11월 24일 개점/);
  assert.match(html,/class="launch-note"/);
  assert.match(html,/href="tel:0614538295">전화 주문하기/);
  assert.match(html,/href="\/bbqcg\/order">메뉴·주문 방법/);
  assert.match(html,/자체 온라인 결제는 준비 중입니다/);
  assert.match(html,/BBQ 공식 주문/);
  assert.doesNotMatch(html,/지금 바로 온라인 결제|결제가 완료되었습니다|주문이 접수되었습니다/);
  assert.equal(response.headers.get('x-robots-tag'),'index,follow');
});

test('BBQ unverified phone still has accessible menu/order guidance without false call-to-action',async()=>{
  const html=await (await renderBbqCheonggyePage(new Request(site),{},{})).text();
  assert.match(html,/11월 24일 개점/);
  assert.match(html,/href="\/bbqcg\/order">메뉴·주문 안내/);
  assert.doesNotMatch(html,/전화 주문하기/);
  assert.equal((html.match(/<header class="header"/g)||[]).length,1);
  assert.equal((html.match(/<footer class="foot"/g)||[]).length,1);
});

test('storefront CSS no longer swallows responsive rules in malformed selectors',async()=>{
  const css=await bbqCheonggyeCss().text();
  assert.doesNotMatch(css,/\.foot\s*\n@media\(max-width:1100px\)/);
  assert.doesNotMatch(css,/\.foot\s*\}\s*@media\(max-width:560px\)/);
  assert.doesNotMatch(css,/\.btn,\.photo-card img,\s*\}/);
  assert.match(css,/@media\(max-width:1100px\)\{\.showcase/);
  assert.match(css,/@media\(max-width:720px\)\{\.wrap/);
  assert.match(css,/@media\(max-width:560px\)\{\.hero-inner/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{html\{scroll-behavior:auto\}\.btn,\.photo-card img\{transition:none!important\}\}/);
  assert.match(css,/\.launch-note\{display:flex;flex-wrap:wrap/);
  assert.equal((css.match(/\{/g)||[]).length,(css.match(/\}/g)||[]).length,'all CSS blocks must balance');
  assert.match(css,/bbqcg-shared-chrome-v1/);
});
