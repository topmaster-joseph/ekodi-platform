import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderBbqCheonggyePage, bbqCheonggyeCss } from '../bbq-cheonggye-site.js';
import { renderBbqcgServiceStandards, bbqcgServiceStandardsCss, bbqcgHomeWithResources } from '../bbqcg-service-standards.js';
import { BBQCG_CHROME_VERSION, BBQCG_PUBLIC_NAV, renderBbqcgHeader, renderBbqcgFooter, bbqcgSharedChromeCss } from '../bbqcg-shared-chrome.js';

const base='https://ekodi.kr/bbqcg';
const matchOne=(html,tag,cls)=>{
  const re=new RegExp('<'+tag+' class="'+cls+'">[\\s\\S]*?<\\/'+tag+'>','g');
  const found=[...html.matchAll(re)];
  assert.equal(found.length,1,tag+' '+cls+' must occur exactly once');
  return found[0][0];
};

test('one authored header/footer is rendered byte-identically on storefront and service guide',async()=>{
 const storefront=await bbqcgHomeWithResources(await renderBbqCheonggyePage(new Request(base),{},{}));
 const promise=renderBbqcgServiceStandards(new Request(base+'/service-guide'));
 const home=await storefront.text();
 const guide=await promise.text();
 const canonicalHeader=renderBbqcgHeader();
 const canonicalFooter=renderBbqcgFooter();
 assert.equal(matchOne(home,'header','header'),canonicalHeader);
 assert.equal(matchOne(guide,'header','header'),canonicalHeader);
 assert.equal(matchOne(home,'footer','foot'),canonicalFooter);
 assert.equal(matchOne(guide,'footer','foot'),canonicalFooter);
 assert.equal((home.match(/<nav class="nav"/g)||[]).length,1);
 assert.equal((guide.match(/<nav class="nav"/g)||[]).length,1);
 assert.match(home,/id="bbqcg-promise-heading"/);
 assert.match(guide,/id="standards-title"/);
 assert.match(guide,/id="materials"/);
 assert.equal(promise.headers.get('x-robots-tag'),'noindex,nofollow,noarchive');
 assert.equal(storefront.headers.get('x-robots-tag'),'noindex,nofollow,noarchive');
});

test('canonical six-link site navigation never becomes a page-specific or duplicate menu',()=>{
 assert.equal(BBQCG_CHROME_VERSION,'bbqcg-shared-chrome-v1');
 assert.deepEqual(BBQCG_PUBLIC_NAV.map(x=>x.label),[
   '매장안내','BBQ 메뉴','주문하기','매장소식','품질약속·자료실','오시는 길'
 ]);
 assert.deepEqual(BBQCG_PUBLIC_NAV.map(x=>x.href),[
   '/bbqcg#guide','/bbqcg#menu','/bbqcg#order','/bbqcg#notice',
   '/bbqcg/service-guide','/bbqcg#directions'
 ]);
 const header=renderBbqcgHeader();
 assert.equal((header.match(/<nav class="nav"/g)||[]).length,1);
 for(const item of BBQCG_PUBLIC_NAV){
   assert.equal(header.split('href="'+item.href+'"').length-1,1,item.label);
 }
 const footer=renderBbqcgFooter();
 assert.equal((footer.match(/class="foot-copy"/g)||[]).length,1);
 assert.match(footer,/EKODI \(에코디\)\. All rights reserved/);
 assert.match(footer,/href="https:\/\/bbq\.co\.kr\/"/);
 assert.match(footer,/href="\/bbqcg\/admin"/);
 assert.doesNotMatch(footer,/\/pizzamaru|\/yogurt|\/jadam/);
});

test('both independently served stylesheets append the same immutable chrome rules',async()=>{
 const [storeCss,promiseCss]=await Promise.all([
   bbqCheonggyeCss().text(),
   bbqcgServiceStandardsCss().text()
 ]);
 const css=bbqcgSharedChromeCss();
 const start='/* bbqcg-shared-chrome-v1:';
 for(const page of [storeCss,promiseCss]){
   assert.ok(page.includes(start));
   assert.equal(page.slice(page.indexOf(start)),css.slice(css.indexOf(start)));
 }
 assert.match(css,/body \.header \.wrap,body \.foot \.wrap\{width:min\(1300px/);
 assert.match(css,/body \.header \.nav/);
 assert.match(css,/body \.foot \.foot-inner/);
 assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/overflow-x:auto!important/);
 assert.match(css,/grid-template-columns:1fr!important/);
 assert.match(promiseCss,/body\.bbqcg-service-page main#main\{[^}]*background:var\(--paper\)!important/);
 assert.doesNotMatch(promiseCss,/body\.bbqcg-service-page main#main\{[^}]*background:transparent!important/);
});

test('public guide remains read-only; shared footer attribution and visit metrics stay in its own grid',async()=>{
 const shell=await readFile(new URL('../shell/user-ui-footer.js',import.meta.url),'utf8');
 assert.match(shell,/bbqCenteredFooterHost\(footer\)/);
 assert.match(shell,/footer\.querySelector\('\.foot-inner,\.promise-footer-inner'\)/);
 assert.match(shell,/data-ekodi-footer-traffic/);
 assert.match(shell,/EKODI \(에코디\)\. All rights reserved/);
 assert.equal(renderBbqcgServiceStandards(new Request(base+'/service-guide',{method:'POST'})).status,405);
 const head=renderBbqcgServiceStandards(new Request(base+'/service-guide',{method:'HEAD'}));
 assert.equal(await head.text(),'');
 const html=await (await renderBbqcgServiceStandards(new Request(base+'/service-guide'))).text();
 assert.doesNotMatch(html,/Powered by EKODI|쿠폰 발행|고객 전화번호|임직원 기록/);
});
