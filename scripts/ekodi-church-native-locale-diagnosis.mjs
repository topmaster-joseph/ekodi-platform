import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// EKODI-owned isolated Chromium diagnostic. Read-only, no persistent login,
// no external browser provider, and no user-controlled JavaScript task.
const origin='https://ekodi.kr';
const locales=['ko-KR','en','my','kac','vi','mn','id','zh-CN','ja'];
const evidence=[];
const browser=await chromium.launch({headless:true});
let unsuccessful=0;
try {
  for (const locale of locales) {
    const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:false});
    const page=await context.newPage();
    const errors=[],httpErrors=[],blocked=[];
    page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,240)));
    page.on('response',r=>{if(r.status()>=400)httpErrors.push({status:r.status(),url:r.url().slice(0,180)});});
    await page.route('**/*',async route=>{
      if(!['GET','HEAD','OPTIONS'].includes(route.request().method().toUpperCase())){
        blocked.push(route.request().method());
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const url=new URL('/ekodichurch/?lang='+encodeURIComponent(locale),origin);
    const item={locale,requested:url.pathname+url.search,checkpoints:[],errors,httpErrors,blocked};
    try {
      const response=await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:25000});
      item.httpStatus=response?.status();
      if(new URL(page.url()).origin!==origin)throw new Error('escaped canonical origin');
      for(const [stage,ms] of [['initial',500],['settled',4500]]) {
        await page.waitForTimeout(ms);
        item.checkpoints.push(await page.evaluate(stage=>{
          const src=document.documentElement;
          const body=document.body;
          const visibleText=(body?.innerText||'').slice(0,35000);
          const clone=body?.cloneNode(true);
          clone?.querySelectorAll('[data-ekodi-language-control]').forEach(x=>x.remove());
          const detachedText=(clone?.innerText||'').slice(0,35000);
          return {stage,lang:src.lang,extendedLocale:window.EKODIChurchExtendedI18n?.getLocale?.()??null,
            coreLocale:window.EKODIChurchI18n?.getLocale?.()??null,
            publicHub:Boolean(window.__EKODI_CHURCH_LIFE_HUB_I18N__),
            extendedBoot:Boolean(window.__EKODI_CHURCH_EXTENDED_I18N__),
            title:document.title.slice(0,120),
            koreanVisible:/[가-힣]/.test(visibleText),
            koreanInDetachedClone:/[가-힣]/.test(detachedText),
            detachedKoreanExcerpt:(detachedText.match(/.{0,25}[가-힣].{0,30}/)||[])[0]??'',
            koreanExcerpt:(visibleText.match(/.{0,25}[가-힣].{0,30}/)||[])[0]??'',
            languageOptions:[...(document.querySelector('[data-ekodi-language-control] select')?.options||[])].map(x=>x.value),
            hiddenWorshipControl:document.querySelector('[data-church-worship-admin]')?.hidden??null,
            bodyChars:visibleText.length,
            readyState:document.readyState
          };
        },stage));
      }
    }catch(e){item.error=String(e?.message||e).slice(0,500);}
    evidence.push(item);
    const final=item.checkpoints.at(-1);
    const success=item.httpStatus===200 && final?.lang===locale &&
      ( !['my','kac','vi','mn','id'].includes(locale) || final.extendedLocale===locale ) &&
      (locale==='ko-KR'||!final.koreanVisible) && item.errors.length===0;
    item.success=Boolean(success);
    if(!success)unsuccessful++;
    console.log(JSON.stringify({locale,success:item.success,checks:item.checkpoints,
      pageErrors:item.errors,failedHttp:item.httpErrors.slice(0,6),error:item.error||null}));
    await context.close();
  }
}finally {await browser.close();}
const dest=path.resolve('artifacts/background-browser-worker/church-locales');
await fs.mkdir(dest,{recursive:true});
await fs.writeFile(path.join(dest,'diagnosis.json'),JSON.stringify({
  mode:'ekodi-owned-background-browser',canonicalOrigin:origin,
  authenticated:false,allowMutation:false,headless:true,ephemeralContext:true,
  checkedAt:new Date().toISOString(),failures:unsuccessful,evidence
},null,2));
console.log('EKODI_OWN_NATIVE_DIAGNOSTIC '+JSON.stringify({checked:evidence.length,failures:unsuccessful,artifact:dest+'/diagnosis.json'}));
// Diagnostic records failures; it is not a release gate and never reports a failed
// language as verified. The release workflow keeps its existing stricter gate.
