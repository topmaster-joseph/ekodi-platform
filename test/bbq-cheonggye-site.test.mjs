import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BBQ_CG_SLUG, bbqCheonggyeCss, renderBbqCheonggyePage } from '../bbq-cheonggye-site.js';

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
  assert.match(html,/\/bbqcg\/admin\/site/);
  assert.match(html,/https:\/\/bbq\.co\.kr\//);
  assert.doesNotMatch(html,/http:\/\/127\.0\.0\.1|localhost|8080/);
  assert.doesNotMatch(html,/bbqe-learning.*(?:password|비밀번호)/);
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
  const migration=await source('supabase/migrations/20261108103100_bbqcg_hard_cutover.sql');
  assert.match(migration,/update public\.stores/);
  assert.match(migration,/operating_space_slug/);
  assert.match(migration,/customer-site/);
  assert.match(migration,/store_user_sites/);
  assert.match(migration,/no role grants/i);
  assert.doesNotMatch(migration,/bbq123456|26110938|password\s*=/i);
});
