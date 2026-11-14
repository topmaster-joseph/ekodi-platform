import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bbqcgServiceStandardsCss, renderBbqcgServiceStandards } from '../bbqcg-service-standards.js';

test('BBQ service promise uses customer-owned branding and preserves noindex', async()=>{
  const response=renderBbqcgServiceStandards(new Request('https://ekodi.kr/bbqcg/service-guide'));
  const html=await response.text();
  assert.equal(response.status,200);
  assert.match(response.headers.get('x-robots-tag'),/noindex/);
  for(const phrase of ['품질','청결','서비스','BBQ 무안청계점','https://bbq.co.kr/'])assert.ok(html.includes(phrase),phrase);
  assert.doesNotMatch(html,/<h[1-6][^>]*>[^<]*EKODI|Powered by EKODI|1,500원|2% 적립|쿠폰 발급/);
  assert.match(html,/본사의 조리법·공식 매뉴얼 또는 가맹 정책을 대체하지 않습니다/);
  assert.match(html,/rel="noopener noreferrer"/);
});
test('standards page is read only, HEAD empty, CSS mobile friendly',async()=>{
  const head=renderBbqcgServiceStandards(new Request('https://ekodi.kr/bbqcg/service-guide',{method:'HEAD'}));
  assert.equal(await head.text(),'');
  const post=renderBbqcgServiceStandards(new Request('https://ekodi.kr/bbqcg/service-guide',{method:'POST'}));
  assert.equal(post.status,405);
  const css=await bbqcgServiceStandardsCss().text();
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/word-break:keep-all/);
  const worker=await readFile(new URL('../space-worker.js',import.meta.url),'utf8');
  assert.match(worker,/bbqcg\/service-guide/);
  assert.match(worker,/resolved\.source!=='store-user-sites'/);
  assert.match(worker,/bbqcg\/assets\/service-standards\.css/);
});

test('service guide enforces legible BBQ customer theme despite host style collisions', async()=>{
 const page=await renderBbqcgServiceStandards(new Request('https://ekodi.kr/bbqcg/service-guide'));
 const html=await page.text();
 const css=await bbqcgServiceStandardsCss().text();
 assert.match(html,/<body class="bbqcg-service-page">/);
 assert.match(html,/<header class="header" data-ekodi-user-header-root="bbqcg-v1">/);
 assert.match(html,/class="promise-hero"/);
 assert.match(html,/aria-labelledby="standards-title"/);
 assert.match(html,/class="promise-card"/);
 assert.match(html,/class="card-num" aria-hidden="true">01/);
 assert.match(html,/<footer class="foot">/);
 assert.match(html,/<div class="wrap foot-inner">/);
 assert.match(html,/service-standards\.css\?v=20261114b/);
 assert.match(css,/body\.bbqcg-service-page\{[^}]*background:var\(--paper\)!important/);
 assert.match(css,/body\.bbqcg-service-page main#main\{[^}]*background:var\(--paper\)!important/);
 assert.match(css,/\/\* bbqcg-shared-chrome-v1:/);
 assert.match(css,/body \.header\{[^}]*background:#fff!important/);
 assert.match(css,/body\.bbqcg-service-page \.promise-card\{[^}]*background:#fff!important;color:var\(--ink\)!important/);
 assert.match(css,/body\.bbqcg-service-page \.promise-card h2\{[^}]*color:var\(--navy\)!important/);
 assert.match(css,/body\.bbqcg-service-page \.promise-card li\{[^}]*color:#354057!important/);
 assert.match(css,/body\.bbqcg-service-page \.notes\{[^}]*color:var\(--ink\)!important/);
 assert.match(css,/body \.foot \.foot-inner\{[^}]*grid-template-columns/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media print/);
 assert.match(html,/href="\/bbqcg\/resources\/store-promise\.html"/);
 assert.match(html,/href="\/bbqcg\/resources\/qcs-gms-checklist\.csv"/);
 assert.equal(page.headers.get('x-robots-tag'),'noindex,nofollow,noarchive');
});

test('storefront footer follows main centered 1300px content width',async()=>{
 const {bbqCheonggyeCss,renderBbqCheonggyePage}=await import('../bbq-cheonggye-site.js');
 const css=await bbqCheonggyeCss().text();
 assert.match(css,/body \.header \.wrap,body \.foot \.wrap\{width:min\(1300px,calc\(100% - 48px\)\)!important/);
 assert.match(css,/body \.foot \.foot-inner\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 assert.match(css,/body \.foot \.foot-brand\{/);
 assert.match(css,/body \.foot \.links\{display:flex!important;align-items:center!important;justify-content:flex-end!important/);
 assert.match(css,/@media\(max-width:720px\)/);
 const page=await renderBbqCheonggyePage(new Request('https://ekodi.kr/bbqcg'),{}, {name:'BBQ 무안청계점'});
 const html=await page.text();
 assert.match(html,/<footer class="foot"><div class="wrap foot-inner">/);
 assert.match(html,/class="foot-copy"/);
 assert.match(html,/class="foot-brand"/);
 assert.match(html,/href="\/bbqcg\/admin"/);
});
