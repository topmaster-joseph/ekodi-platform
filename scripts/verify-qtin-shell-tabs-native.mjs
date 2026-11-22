// First-party isolated Chromium QA for shared QTIN Church/Mission shells and category tabs.
// Fixture mode uses synthetic inventory; production mode reads real GET endpoints only.
// The test never signs in, sends a payment, writes a checkout order or opens user Opera tabs.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdir} from 'node:fs/promises';
import {renderOrderPage} from '../qtin-order-worker.js';

const mode=process.argv.includes('--production')?'production':'fixture';
const report=[];
const sampleNames=[
  ['Adult 1','큐티인(QTIN)(작은글씨)'],['Adult 2','큐티인(QTIN)(큰글씨)'],
  ['Youth','QTin Teens'],['Children','어린이 큐티인'],
  ['Preschool','QTin Stars']
];
const sample=Object.freeze({
  campaign:{id:'2026-12',year:2026,month:12,state:'open',opensAt:'2026-11-20T15:00:00Z',closesAt:'2026-11-25T14:59:00Z'},
  payment:{ready:false,testMode:false,widget:false},
  products:sampleNames.map(([id,series],i)=>({
    id,series,qtmItemId:'synthetic-'+i,name:series+' 2026년 12월호',
    salePrice:3000+i*500,listPrice:4000+i*500,imageUrl:'',productUrl:'https://www.qtm.or.kr/'
  }))
});
const chrome=process.env.CHROME_BIN;
assert.ok(chrome,'CHROME_BIN must provide a first-party Chromium executable');
const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  await mkdir('/tmp/qtin-shell-tabs-proof',{recursive:true});
  for(const org of ['church','mission']){
    for(const width of [390,1366]){
      const page=await browser.newPage();
      const blockedWrites=[];
      try{
        await page.setViewport({width,height:width===390?844:900,deviceScaleFactor:1});
        await page.setRequestInterception(true);
        page.on('framenavigated',frame=>{
          if(frame===page.mainFrame())console.log('QTIN_BROWSER_NAV='+JSON.stringify({mode,org,width,url:frame.url().split('?')[0]}));
        });
        page.on('request',req=>{
          const u=new URL(req.url());
          if(mode==='fixture' && req.method()==='GET' &&
             u.origin==='https://ekodi.kr' && u.pathname==='/qtin/'+org){
            void req.respond({status:200,contentType:'text/html; charset=utf-8',body:renderOrderPage(sample,{org,scriptNonce:'synthetic-local-ui-proof'})});
            return;
          }
          if(!['GET','HEAD','OPTIONS'].includes(req.method())){
            blockedWrites.push({method:req.method(),category:u.pathname.startsWith('/qtin/api/orders')?'order-write':'auth-or-background'});
            void req.abort('blockedbyclient');return;
          }
          if(mode==='fixture'||u.origin!=='https://ekodi.kr'){
            void req.abort('blockedbyclient');return;
          }
          void req.continue();
        });
        await page.goto('https://ekodi.kr/qtin/'+org,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForSelector('.qtin-site-header .qtin-site-brand',{timeout:20000});
        const initial=await page.evaluate(()=>{
          const nav=document.querySelector('.qtin-site-menu nav');
          const header=document.querySelector('.qtin-site-header');
          const footer=document.querySelector('.qtin-site-footer');
          const wrap=document.querySelector('main.wrap');
          const books=[...document.querySelectorAll('.book')];
          const tabs=[...document.querySelectorAll('[data-qtin-tab]')];
          return{
            branded:header?.textContent||'',
            footerText:footer?.textContent||'',
            navCount:nav?.querySelectorAll('a').length||0,
            selectedTab:tabs.find(tab=>tab.getAttribute('aria-selected')==='true')?.dataset.qtinTab||'',
            tabCount:tabs.length,
            bookCount:books.length,
            headerWidth:header?.getBoundingClientRect().width,
            footerWidth:footer?.getBoundingClientRect().width,
            contentWidth:wrap?.getBoundingClientRect().width,
            horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,
            hasPurchaseForm:!!document.querySelector('#account')&&!!document.querySelector('#buyerForm'),
            activeNav:!!nav?.querySelector('a[aria-current="page"]'),
            mobileMenuVisible:getComputedStyle(document.querySelector('.qtin-site-menu summary')).display!=='none'
          };
        });
        assert.equal(initial.horizontalOverflow,false,'QTIN must not horizontally overflow');
        assert.equal(initial.hasPurchaseForm,true,'keep account and buyer application');
        assert.equal(initial.activeNav,true,'organization shell must show selected QTIN menu');
        assert.ok(initial.navCount>=6,'match Church or Mission site navigation');
        assert.ok(initial.headerWidth>=width-3,'site header must span full viewport');
        assert.ok(initial.footerWidth>=width-3,'site footer must span full viewport');
        assert.ok(initial.contentWidth>=(width===390?width-34:1000),'page should use legible wide content instead of tiny centered column');
        assert.equal(initial.mobileMenuVisible,width===390,'responsive menu accessibility');
        assert.ok(initial.branded.includes(org==='church'?'에코디교회':'에코디선교회'));
        assert.ok(initial.footerText.includes(org==='church'?'에코디교회 정찬균':'에코디선교회'));
        if(mode==='fixture')assert.equal(initial.bookCount,5);
        if(initial.bookCount){
          assert.equal(initial.selectedTab,'all');
          assert.ok(initial.tabCount>=2);
          await page.click('[data-qtin-tab="adult"]');
          let filtered=await page.evaluate(()=>({
            visible:[...document.querySelectorAll('.book')].filter(el=>getComputedStyle(el).display!=='none').length,
            selected:document.querySelector('[data-qtin-tab][aria-selected="true"]')?.dataset.qtinTab,
            total:document.querySelector('#count')?.textContent
          }));
          if(mode==='fixture')assert.equal(filtered.visible,2);
          assert.equal(filtered.selected,'adult');
          await page.click('.book:not([hidden]) button[data-step="1"]');
          if(mode==='fixture'){
            await page.click('[data-qtin-tab="youth"]');
            await page.click('.book:not([hidden]) button[data-step="1"]');
            await page.click('[data-qtin-tab="all"]');
            const totals=await page.evaluate(()=>({
              adult:document.querySelector('.book[data-audience="adult"] input[type="number"]')?.value??null,
              youth:document.querySelector('.book[data-audience="youth"] input[type="number"]')?.value??null,
              count:document.querySelector('#count')?.textContent,
              total:document.querySelector('#total')?.textContent,
              cardAudiences:[...document.querySelectorAll('.book')].map(x=>x.dataset.audience),
              currentUrl:location.pathname,
              bookCount:document.querySelectorAll('.book').length
            }));
            console.log('QTIN_SYNTHETIC_TAB_DIAGNOSTIC='+JSON.stringify({org,width,totals}));
            assert.equal(totals.adult,'1');
            assert.equal(totals.youth,'1');
            assert.equal(totals.count,'2권','quantity persists after switching tabs');
            assert.notEqual(totals.total,'0원');
            // Test keyboard selection of the adjacent group.
            await page.focus('[data-qtin-tab="all"]');
            await page.keyboard.press('ArrowRight');
            const chosen=await page.$eval('[data-qtin-tab][aria-selected="true"]',el=>el.dataset.qtinTab);
            assert.equal(chosen,'adult');
          }
        }
        if(width===390){
          await page.click('.qtin-site-menu summary');
          const opened=await page.$eval('.qtin-site-menu',el=>el.open);
          assert.equal(opened,true,'mobile site menu must open by keyboard-capable native disclosure');
        }
        await page.screenshot({path:'/tmp/qtin-shell-tabs-proof/'+mode+'-'+org+'-'+width+'.png',fullPage:false});
        assert.equal(blockedWrites.some(x=>x.category==='order-write'),false,'no orders or charges in this test');
        report.push({mode,org,width,initial:{...initial,branded:undefined,footerText:undefined},blockedRequests:blockedWrites.length,result:'pass'});
      }finally{await page.close();}
    }
  }
  console.log('EKODI_QTIN_SHELL_TABS_PROOF='+JSON.stringify({status:'pass',mode,devices:report}));
}finally{await browser.close();}
