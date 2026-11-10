import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

const sites=[
  {path:'index.html', css:'index.html',marker:'master-open-loop',name:'EKODI',shape:'stroke-dasharray="103 23"'},
  {path:'ekodibiz/index.html',css:'ekodibiz/style.css',marker:'biz-parallel-paths',name:'EKODIBIZ',shape:'M 8 16 H 22'},
  {path:'mall.html',css:'mall.css',marker:'mall-opposing-gates',name:'EKODI MALL',shape:'M 8 37 V 21'}
];

test('first-party public homepages have distinct, accessible, self-contained CI and retain their own names',async()=>{
 for(const site of sites){
   const [html,css]=await Promise.all([read(site.path),read(site.css)]);
   assert.match(html,/<svg class="ekodi-ci-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">/);
   assert.ok(html.includes('data-ekodi-ci="'+site.marker+'"'),site.path);
   assert.ok(html.includes(site.name),site.path);
   assert.ok(html.includes(site.shape),site.path);
   assert.match(html,/stroke="currentColor"/);
   assert.match(css,/.ekodi-ci-icon/);
   assert.ok(!html.includes('EKODI®'),site.path);
   assert.ok(!html.includes('상표등록 완료'),site.path);
 }
});
test('homepage CI does not change established navigation, login, mall disclosure, or customer brand',async()=>{
 const [root,biz,mall,rights]=await Promise.all([
  read('index.html'),read('ekodibiz/index.html'),read('mall.html'),read('docs/brand/rights/ekodi-ip-registry.json')
 ]);
 assert.match(root,/<a class="brand" href="https:\/\/ekodi\.kr\/" aria-label="EKODI 홈"/);
 assert.match(biz,/<a class="brand" href="https:\/\/ekodibiz\.kr\/" data-i18n-aria="brandHome"/);
 assert.match(mall,/aria-label="에코디몰 홈"/);
 assert.match(mall,/쿠팡 파트너스 활동의 일환으로/);
 assert.match(root,/href="#services"/);
 assert.equal(JSON.parse(rights).legalStatus,'NO_VERIFIED_TRADEMARK_CLEARANCE_OR_FILING');
});
test('responsive CI keeps independent site-owned layout, with low-overhead inline vectors',async()=>{
 const [root,bizCss,mallCss]=await Promise.all([read('index.html'),read('ekodibiz/style.css'),read('mall.css')]);
 assert.ok(root.includes('max-width:640px'));
 assert.ok(root.includes('.brand-copy{display:flex;flex-direction:column'));
 assert.ok(bizCss.includes('@media(max-width:390px){.topbar .brand .ekodi-ci-icon'));
 assert.ok(mallCss.includes('.brand-mark[data-ekodi-ci] .ekodi-ci-icon'));
 for(const s of [root,await read('ekodibiz/index.html'),await read('mall.html')]){
  const ci=s.match(/<svg class="ekodi-ci-icon"[^>]*>[\s\S]*?<\/svg>/);
  assert.ok(ci && ci[0].length < 550);
  assert.doesNotMatch(ci[0],/<(?:image|foreignObject|script|text)\b|(?:href|xlink:href|onload|onclick)=/i);
 }
});
