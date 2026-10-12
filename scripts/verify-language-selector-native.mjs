// LANG-UI-001: bounded, read-only, EKODI-owned Chromium acceptance evidence.
// Synthetic fetch responses are local to disposable Chromium contexts and are NOT a live publication claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ORIGIN='https://ekodi.kr';
export const LOCALE_SELECTOR='[data-ekodi-language-placement="header"]';
const outputFile=process.env.EKODI_LANGUAGE_EVIDENCE_FILE||'artifacts/native-language-selector/report.json';

export function assessLanguageDOM(snapshot, publishedLocales){
  if(!snapshot?.shellLoaded||!snapshot?.headerReady)return {status:'inconclusive',reason:'shared_shell_or_header_not_observed'};
  if(!Array.isArray(publishedLocales))return {status:'inconclusive',reason:'published_locale_status_unavailable'};
  const unique=[...new Set(publishedLocales.filter(x=>typeof x==='string'))];
  const mustShow=unique.length>=2;
  const count=snapshot.visibleHeaderControls;
  // The effective text/document locale must be among the actually published languages.
  // An English homepage with Korean-only publication is not a successful hidden-selector result.
  const effectiveLocale=String(snapshot.homepageLocale||snapshot.documentLocale||'').trim();
  if(effectiveLocale && !unique.some(locale=>locale.toLowerCase()===effectiveLocale.toLowerCase()||locale==='ko-KR'&&effectiveLocale==='ko'))
    return {status:'fail',reason:'document_locale_not_published'};
  if(snapshot.footerControls>0||snapshot.headerControls>1)return {status:'fail',reason:'duplicate_or_footer_language_controls'};
  if(mustShow && (count!==1||!snapshot.pill||!snapshot.accessible||!snapshot.optionsMatchPublished)){
    return {status:'fail',reason:'published_multilocale_selector_contract'};
  }
  if(!mustShow && (count!==0||snapshot.headerControls!==0)){
    return {status:'fail',reason:'single_locale_selector_leaked'};
  }
  return {status:'pass',reason:mustShow?'published_multilocale_pill':'single_locale_hidden'};
}
function toArray(value){return Array.isArray(value)?value:[];}
async function inspect(page){
  return page.evaluate(()=>{
    const displayed=node=>{
      if(!node)return false;
      const cs=getComputedStyle(node);
      const rect=node.getBoundingClientRect();
      return cs.display!=='none'&&cs.visibility!=='hidden'&&rect.width>0&&rect.height>0;
    };
    const all=[...document.querySelectorAll('[data-ekodi-language-placement="header"]')];
    const footer=[...document.querySelectorAll('footer [data-ekodi-language-control],[data-ekodi-user-footer] [data-ekodi-language-control]')];
    const control=all.find(displayed);
    const select=control?.querySelector('select');
    const opts=[...(select?.options||[])].map(o=>o.value);
    const ready=Array.isArray(window.EKODIUserLanguage?.getReadyLocales?.())?[...window.EKODIUserLanguage.getReadyLocales()]:[];
    const expected=ready.filter(x=>window.EKODIUserLanguage?.supported?.some(l=>l.locale===x));
    return {
      url:location.href,documentLocale:document.documentElement.lang,
      homepageLocale:document.documentElement.dataset.locale||null,
      shellLoaded:!!window.EKODIUserLanguage,headerReady:!!document.querySelector('[data-ekodi-user-header-root]'),
      headerControls:all.length,visibleHeaderControls:all.filter(displayed).length,footerControls:footer.length,
      options:opts,readyLocales:ready,datasetReady:document.documentElement.dataset.ekodiReadyLocales||'',
      pill:!!control&&parseFloat(getComputedStyle(control).borderRadius)>=16,
      accessible:!!select&&!!(select.getAttribute('aria-label')||select.labels?.length),
      optionsMatchPublished:JSON.stringify([...new Set(opts)].sort())===JSON.stringify([...new Set(expected)].sort())
    };
  });
}
function classifyMock(snapshot,wants){
  const duplicates=snapshot.headerControls>1||snapshot.footerControls>0;
  if(duplicates)return 'duplicate_control';
  if(wants==='hidden')return snapshot.headerControls===0&&snapshot.visibleHeaderControls===0?'pass':'not_hidden';
  if(wants==='visible')return snapshot.visibleHeaderControls===1&&snapshot.pill&&snapshot.accessible&&snapshot.optionsMatchPublished?'pass':'not_visible_or_invalid';
  return 'unknown';
}
const sleep=t=>new Promise(r=>setTimeout(r,t));
async function open(page,url){
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
  if(new URL(page.url()).origin!==ORIGIN)throw new Error('canonical_origin_escape');
  if(!response||response.status()>=400)throw new Error('navigation_http_'+String(response?.status()||'none'));
  return response.status();
}
async function fixture(run,chromium){
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const page=await context.newPage();
  const blocked=[];
  await page.route('**/*',route=>{
    const method=route.request().method().toUpperCase();
    if(!['GET','HEAD','OPTIONS'].includes(method)){blocked.push(method);return route.abort('blockedbyclient');}
    return route.continue();
  });
  // Only the exact public i18n status read is intercepted; app scripts/HTML are served from production.
  let respond;
  let mode='hold';
  let requested=false;
  let requestCount=0;
  await page.route('**/api/i18n/v1/status?*',async route=>{
    requested=true;
    requestCount++;
    while(mode==='hold')await new Promise(r=>respond=r);
    if(mode==='failed')return route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'});
    if(mode==='throttled')return route.fulfill({status:429,contentType:'application/json',body:'{"error":"rate_limited"}'});
    if(mode==='malformed')return route.fulfill({status:200,contentType:'application/json',body:'{"message":"missing publishedLocales"}'});
    if(mode==='offline')return route.abort('failed');
    const locales=mode==='single'?['ko-KR']:['ko-KR','en'];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({publishedLocales:locales})});
  });
  const phases=[];
  try{
    await open(page,ORIGIN+'/');
    await page.waitForFunction(()=>!!window.EKODIUserLanguage&&!!document.querySelector('[data-ekodi-user-header-root]'),null,{timeout:8500});
    phases.push({phase:'first-paint-held-readiness',snapshot:await inspect(page)});
    if(!requested)throw new Error('i18n_readiness_request_not_seen');
    mode='multi';respond?.();
    await page.locator(LOCALE_SELECTOR).waitFor({state:'visible',timeout:8500});
    phases.push({phase:'synthetic-multi',snapshot:await inspect(page)});
    mode='failed';
    await page.evaluate(()=>window.EKODIUserLanguage.refreshReadiness());
    await page.waitForTimeout(180);
    phases.push({phase:'synthetic-http503',snapshot:await inspect(page)});
    mode='multi';
    await page.evaluate(()=>window.EKODIUserLanguage.refreshReadiness());
    await page.locator(LOCALE_SELECTOR).waitFor({state:'visible',timeout:5500});
    phases.push({phase:'synthetic-post503-recovery',snapshot:await inspect(page)});
    const countBefore429=requestCount;
    mode='throttled';
    await page.evaluate(()=>window.EKODIUserLanguage.refreshReadiness());
    await page.waitForTimeout(180);
    phases.push({phase:'synthetic-http429',snapshot:await inspect(page)});
    const noAutomatic429Retry=requestCount-countBefore429===1;
    mode='multi';
    await page.evaluate(()=>window.EKODIUserLanguage.refreshReadiness());
    await page.locator(LOCALE_SELECTOR).waitFor({state:'visible',timeout:5500});
    phases.push({phase:'synthetic-post429-recovery',snapshot:await inspect(page)});
    mode='malformed';
    await page.evaluate(()=>window.EKODIUserLanguage.refreshReadiness());
    await page.waitForTimeout(180);
    phases.push({phase:'synthetic-malformed-readiness',snapshot:await inspect(page)});
    mode='single';
    await page.evaluate(()=>window.EKODIUserLanguage.refreshReadiness());
    await page.waitForTimeout(180);
    phases.push({phase:'synthetic-single',snapshot:await inspect(page)});
    mode='offline';
    await page.evaluate(()=>window.EKODIUserLanguage.refreshReadiness());
    await page.waitForTimeout(180);
    phases.push({phase:'synthetic-offline',snapshot:await inspect(page)});
    mode='multi';
    await page.evaluate(()=>window.EKODIUserLanguage.refreshReadiness());
    await page.locator(LOCALE_SELECTOR).waitFor({state:'visible',timeout:5500});
    phases.push({phase:'synthetic-recovery',snapshot:await inspect(page)});
    const expects=['hidden','visible','hidden','visible','hidden','visible','hidden','hidden','hidden','visible'];
    const results=phases.map((p,i)=>({phase:p.phase,result:classifyMock(p.snapshot,expects[i])}));
    run.synthetic={status:results.every(r=>r.result==='pass')&&noAutomatic429Retry?'pass':'fail',results,phases,networkMutationsBlocked:blocked.length,
      noAutomatic429Retry,fixtureOnly:true};
    return run.synthetic.status==='pass';
  }catch(error){
    run.synthetic={status:'inconclusive',reason:String(error.message||error).slice(0,240),phases,fixtureOnly:true};
    return false;
  }finally{await context.close();await browser.close();}
}
async function live(run,chromium){
  const browser=await chromium.launch({headless:true});
  const contexts=[];
  let stopped=false;
  for(const {path:surface,device,service} of [
    {path:'/',device:'desktop',service:'ekodi'},
    {path:'/journal',device:'mobile',service:'journal'},
    {path:'/seonammedi/',device:'desktop',service:'seonammedi'}
  ]){
    if(stopped)break;
    const context=await browser.newContext({viewport:device==='mobile'?{width:390,height:844}:{width:1440,height:900},serviceWorkers:'block'});
    contexts.push(context);
    const page=await context.newPage();
    const api=[];
    const mutations=[];
    await page.route('**/*',route=>{
      const method=route.request().method().toUpperCase();
      if(!['GET','HEAD','OPTIONS'].includes(method)){mutations.push(method);return route.abort('blockedbyclient');}
      return route.continue();
    });
    page.on('response',async response=>{
      if(!response.url().includes('/api/i18n/v1/status?'))return;
      const record={status:response.status(),url:response.url()};
      if(record.status===200){try{const j=await response.json();record.publishedLocales=toArray(j.publishedLocales)}catch{record.malformed=true}}
      api.push(record);
    });
    try{
      await open(page,ORIGIN+surface);
      await page.waitForTimeout(3000);
      const snapshot=await inspect(page);
      const matched=api.filter(r=>{
        try{return new URL(r.url).searchParams.get('service')===service}catch{return false}
      }).at(-1);
      const assessment=assessLanguageDOM(snapshot,matched?.status===200&&!matched.malformed?matched.publishedLocales:null);
      const result={service,path:surface,device,status:assessment.status,reason:assessment.reason,apiStatus:matched?.status||null,apiPublished:matched?.publishedLocales||null,snapshot,blockedMutations:mutations.length};
      run.production.push(result);
      if(api.some(x=>x.status===429)){result.status='inconclusive';result.reason='cloudflare_429_stop';stopped=true;}
      if(run.production.length===1)await page.screenshot({path:outputFile.replace(/report\.json$/,'root-desktop.png'),fullPage:false}).catch(()=>{});
      if(result.status==='inconclusive')await page.screenshot({path:outputFile.replace(/report\.json$/,'inconclusive-'+service+'.png'),fullPage:false}).catch(()=>{});
    }catch(error){
      const msg=String(error.message||error).slice(0,250);
      run.production.push({service,path:surface,device,status:'inconclusive',reason:msg});
      if(/429|403|navigation_http_5/.test(msg))stopped=true;
    }finally{await context.close();}
  }
  await browser.close();
}
export async function runNativeAcceptance(){
  const {chromium}=await import('playwright');
  const report={policy:'LANG-UI-001',owner:'ekodi-background-browser-worker',origin:ORIGIN,readOnly:true,
    ephemeral:true,realProductionAndSyntheticSeparated:true,sourceSha:process.env.GITHUB_SHA||'unknown',
    synthetic:{status:'not_run'},production:[],liveCertified:false,completedAt:null};
  await fs.mkdir(path.dirname(outputFile),{recursive:true});
  try{await fixture(report,chromium)}catch(e){report.synthetic={status:'inconclusive',reason:String(e.message||e).slice(0,250)}}
  try{await live(report,chromium)}catch(e){report.production.push({status:'inconclusive',reason:String(e.message||e).slice(0,250)})}
  report.liveCertified=report.production.length===3&&report.production.every(x=>x.status==='pass');
  report.completedAt=new Date().toISOString();
  await fs.writeFile(outputFile,JSON.stringify(report,null,2));
  console.log(JSON.stringify({policy:report.policy,synthetic:report.synthetic.status,production:report.production.map(x=>({service:x.service,status:x.status,reason:x.reason,apiStatus:x.apiStatus})),liveCertified:report.liveCertified,outputFile}));
  if(report.synthetic.status==='fail'||report.production.some(x=>x.status==='fail'))process.exitCode=1;
  // Unavailable live data is recorded as inconclusive, never misrepresented as success.
  return report;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  await runNativeAcceptance();
}
