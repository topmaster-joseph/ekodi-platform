// Native Chrome proof for the independent Church–Mission public calendar.
// Called only by the authorized, receipt-gated Church Pages release workflow.
// Public read-only inspection: it never signs in, posts events or changes data.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const sha=String(process.env.CHURCH_SOURCE_SHA||'').trim();
const chrome=String(process.env.CHROME_BIN||'').trim();
assert.match(sha,/^[0-9a-f]{40}$/,'guarded release must bind an exact source SHA');
assert.ok(chrome,'Chrome executable must be resolved by the release worker');
const origin='https://ekodi.kr';
const route='/ekodichurch/schedule/';
const locales=['ko-KR','en','zh-CN','ja','my','kac','vi','mn','id'];
const devices=[
  {name:'mobile-320',width:320,height:740},
  {name:'desktop-1366',width:1366,height:900}
];
const proof=[];
const browser=await puppeteer.launch({
  executablePath:chrome,headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage']
});
try{
  const page=await browser.newPage();
  // Register before navigation so an asynchronous canonical shell replacement
  // cannot be mistaken for a successfully localized standalone page.
  await page.evaluateOnNewDocument(()=>{
    window.addEventListener('ekodi:church-shell-synced',()=>{window.__ekodiCalendarShellSynced=true});
  });
  const jsErrors=[];
  page.on('pageerror',error=>jsErrors.push(String(error)));
  for(const device of devices){
    await page.setViewport({width:device.width,height:device.height,deviceScaleFactor:1});
    for(const locale of locales){
      const url=origin+route+'?lang='+encodeURIComponent(locale)+'&release='+sha;
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      // In the Kachin/Jinghpaw slot an explicit English fallback is visible
      // until a checked language pack exists; do not claim it is Kachin.
      // The canonical standalone Korean HTML intentionally uses lang="ko";
      // other standalone locale selections use explicit BCP-47 tags.
      const expectedLang=locale==='kac'?'en':locale==='ko-KR'?'ko':locale;
      await page.waitForFunction(expected=>{
        const month=document.querySelector('[data-church-calendar-month]')?.textContent?.trim()||'';
        const buttons=document.querySelectorAll('.church-calendar-day');
        const home=document.querySelector('.church-schedule-intro > h1')?.textContent?.trim()||'';
        const syncedNav=document.querySelector('#main-nav a')?.textContent?.trim()||'';
        const waitingForCalendar=/달력 불러오는 중|Loading calendar/.test(month);
        const translated=expected==='ko'||(!/[가-힣]/.test(home)&&!/[가-힣]/.test(syncedNav));
        return document.documentElement.lang===expected&&buttons.length>=28&&!waitingForCalendar&&translated;
      },{timeout:25000,polling:150},expectedLang);
      // Wait for the real shared-header fetch and its localization reapply;
      // loading the initial translated HTML alone is insufficient.
      await page.waitForFunction(()=>window.__ekodiCalendarShellSynced===true,{timeout:18000,polling:150});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const state=await page.evaluate(()=>{
        const t=selector=>document.querySelector(selector)?.textContent?.trim()||'';
        const labels=[...document.querySelectorAll('.church-calendar-legend span')].map(x=>x.textContent?.trim()||'');
        const nav=[...document.querySelectorAll('#main-nav a')].map(x=>x.textContent?.trim()||'');
        const footer=[...document.querySelectorAll('.church-footer-legal a')].map(x=>x.textContent?.trim()||'');
        const manager=document.querySelector('[data-church-public-manage]');
        const editor=document.querySelector('[data-church-schedule]');
        return {
          lang:document.documentElement.lang,
          fallback:document.documentElement.dataset.translationFallback||'',
          heading:t('.church-schedule-intro > h1'),
          month:t('[data-church-calendar-month]'),
          nav,footer,labels,
          overflow:document.documentElement.scrollWidth>innerWidth+1,
          guestEditorHidden:!editor||editor.hidden,
          guestManagerHidden:!manager||manager.hidden,
          calendarDays:document.querySelectorAll('.church-calendar-day').length
        };
      });
      assert.equal(state.lang,expectedLang,locale+' '+device.name+' page locale');
      assert.equal(state.guestEditorHidden,true,'guest source editor visible '+locale);
      assert.equal(state.guestManagerHidden,true,'guest manager UI visible '+locale);
      assert.equal(state.overflow,false,'calendar horizontally clipped '+locale+' '+device.name);
      assert.ok(state.calendarDays>=28,'calendar days missing '+locale);
      assert.equal(state.labels.length,2,'both origin legends required '+locale);
      assert.ok(state.heading&&state.month&&state.nav.length>=5,'standalone calendar chrome missing '+locale);
      if(locale==='kac')assert.equal(state.fallback,'en','Jinghpaw English fallback must be honestly identified');
      if(locale!=='ko-KR'){
        const chromeText=[state.heading,state.month,...state.nav,...state.footer,...state.labels].join(' ');
        assert.doesNotMatch(chromeText,/[가-힣]/,locale+' untranslated public page chrome after shell sync');
      }
      if((locale==='ko-KR'||locale==='en')){
        // Public entries from both independent sources are present only when
        // published; move within a three-month window to avoid hardcoded dates.
        for(const source of ['ekodichurch','ekodimission']){
          await page.click('[data-church-calendar-today]');
          const clazz=source==='ekodichurch'?'has-church-event':'has-mission-event';
          let found=false;
          for(let shift=0;shift<3;shift++){
            const selector='.church-calendar-day.'+clazz;
            if(await page.$(selector)){
              await page.click(selector);
              const result=await page.evaluate(src=>{
                const row=[...document.querySelectorAll('[data-church-schedules-list] li')]
                  .find(x=>x.querySelector('.church-schedule-origin-'+src));
                const link=row?.querySelector('a.church-shared-link');
                const h=link?.getAttribute('href')||'';
                return {
                  badge:row?.querySelector('.church-schedule-origin')?.getAttribute('aria-label')||'',
                  original:link?.hasAttribute('data-ekodi-user-content')||false,
                  href:h,
                  selected:document.querySelector('.church-calendar-day[aria-pressed="true"]')?.dataset.date||''
                };
              },source);
              assert.ok(result.badge,'clicked day lacks source badge '+source+' '+locale);
              assert.ok(result.selected,'selected date not reflected after click '+locale);
              assert.equal(result.original,true,'original authored event title flag missing');
              assert.match(result.href,source==='ekodichurch'?/^\/ekodichurch(?:\/|\?|$)/:/^\/ekodimission(?:\/|\?|$)/,'origin event URL escaped its tenant');
              found=true;
              break;
            }
            await page.click('[data-church-calendar-next]');
          }
          assert.equal(found,true,'no published '+source+' date found within 3 months '+locale);
        }
        if(device.name==='mobile-320'){
          await page.screenshot({path:'/tmp/church-approved-layout-proof/'+device.name+'-'+locale+'-calendar.png',fullPage:false});
        }
      }
      proof.push({locale,device:device.name,...state});
    }
  }
  assert.deepEqual(jsErrors,[],'standalone calendar Chromium script errors');
  console.log('EKODI_CHURCH_STANDALONE_CALENDAR_NATIVE_PROOF='+JSON.stringify({release:sha,count:proof.length,results:proof,pageErrors:jsErrors}));
}finally{
  await browser.close();
}
