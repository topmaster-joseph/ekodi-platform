import test from 'node:test';
import assert from 'node:assert/strict';
import { investMyRoute } from '../invest-my-workspace.js';

const get=async suffix=>{
 const res=await investMyRoute(new Request('https://ekodi.kr/invest/my'+suffix),{});
 assert.equal(res.status,200);
 return res.text();
};

test('guest owner page renders minimal content and private menu remains hidden',async()=>{
 const html=await get('');
 assert.match(html,/<div class="shell">/);
 assert.match(html,/id="investAuthIntro"/);
 assert.match(html,/id="authMessage"/);
 assert.match(html,/id="ownerSidebar"[^>]*hidden/);
 assert.match(html,/<section id="owner" hidden>/);
 assert.doesNotMatch(html,/<header class="top"/);
});
test('guest CSS removes orphaned grid column and centers login action',async()=>{
 const css=await get('/style.css');
 assert.match(css,/\.shell:not\(\.owner-ready\)\{display:block;width:100%;max-width:900px/);
 assert.match(css,/\.shell:not\(\.owner-ready\)>\.main\{width:100%;max-width:680px;margin:0 auto/);
 assert.match(css,/\.shell:not\(\.owner-ready\) #authMessage a\{min-width:175px/);
 assert.match(css,/\.shell.owner-ready\{display:grid;max-width:1540px;grid-template-columns:232px minmax\(0,1fr\)/);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:380px\)/);
});
test('five major sidebar headings are prominent and all 14 detail links are indented and condensed',async()=>{
 const html=await get('');
 const nav=html.match(/<nav id="ownerSidebar"([\s\S]*?)<\/nav>/)?.[0]||'';
 const groups=[...nav.matchAll(/class="sidebar-group" role="heading" aria-level="2"/g)];
 const details=[...nav.matchAll(/data-invest-detail="/g)];
 assert.equal(groups.length,5);
 assert.equal(details.length,14);
 for(const title of ['투자 현황','직접투자','AI 자동투자','투자 분석·연구','기록'])
  assert.ok(nav.includes(title),title);
 const css=await get('/style.css');
 assert.match(css,/\.sidebar-group\{font-size:17px;font-weight:900/);
 assert.match(css,/#ownerSidebar a\[data-invest-detail\]\{font-size:14px;font-weight:620;line-height:1\.25;min-height:34px;padding:7px 9px 7px 24px/);
});
test('owner verification toggles compact sidebar layout only after authorization',async()=>{
 const js=await get('/app.js');
 assert.match(js,/document\.querySelector\('\.shell'\)\.classList\.add\('owner-ready'\)/);
 assert.match(js,/document\.querySelector\('\.shell'\)\.classList\.toggle\('owner-ready',verified\)/);
 assert.match(js,/el\('ownerSidebar'\)\.hidden=!verified/);
 assert.match(js,/el\('ownerSidebar'\)\.hidden=false/);
 assert.match(js,/el\('owner'\)\.hidden=true/);
 assert.match(js,/liveTradingEnabled:false|liveOrdersEnabled:false|liveOrder/);
 assert.doesNotMatch(js,/\/broker\/orders/);
});
