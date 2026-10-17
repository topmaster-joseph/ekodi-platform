import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {seasonalPortalResponse} from '../seasonal-workforce/route.mjs';
import {seasonalOperationsResponse} from '../seasonal-workforce/operations-api.mjs';

// First-party EKODI Chromium: read-only verification, no accounts, applicant data or writes.
const ORIGIN='https://ekodi.kr',BASE='/ekodibiz/seasonal-workers';
const MODE=process.argv.includes('--mode=source')?'source':process.argv.includes('--mode=live')?'live':null;
if(!MODE)throw new Error('Explicit --mode=source (branch preview) or --mode=live (after release) is required');
const OUT=path.resolve('artifacts/seasonal-workforce-native');
const PROFILES=[{name:'desktop',width:1440,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}];
const PAGES=[['/','농가의 일손과 근로자의 권리'],['/demand','농가 수요조사'],
 ['/mou','국제협력 · MOU 자료관리'],['/learning','교육 · 오리엔테이션'],
 ['/housing','숙소 · 생활 점검'],['/entry','입국 · 배정 절차'],
 ['/help','민원 · 상담 안내'],['/reports','통계 · 보고서'],
 ['/office','기관별 운영공간']];
const must=(value,reason)=>{if(!value)throw Error(reason)};
await fs.mkdir(OUT,{recursive:true});
const evidence={policy:'EKODI-SEASONAL-NATIVE-PUBLIC-001',origin:ORIGIN,
 browser:'EKODI-owned Playwright Chromium',mode:MODE,
 productionSiteVerified:MODE==='live',sourceCodePreview:MODE==='source',
 readOnly:true,realGoogleAuthentication:false,
 municipalDataMutation:false,legalGovernmentAuthorityVerified:false,
 at:new Date().toISOString(),profiles:[],success:false};
let browser;
try{
 browser=await chromium.launch({headless:true,timeout:45000});
 for(const device of PROFILES){
  const row={profile:device.name,viewport:device.width+'x'+device.height,
   steps:[],blockedWrites:[],blockedExternal:[],pageErrors:[],ok:false};
  evidence.profiles.push(row);
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},
   isMobile:device.mobile,hasTouch:device.mobile,acceptDownloads:false,serviceWorkers:'block'});
  await context.route('**/*',route=>{
   const req=route.request(),method=req.method().toUpperCase();
   let url;try{url=new URL(req.url())}catch{return route.abort('blockedbyclient')}
   if(url.origin!==ORIGIN){row.blockedExternal.push(url.origin);return route.abort('blockedbyclient')}
   if(!['GET','HEAD','OPTIONS'].includes(method)){
    row.blockedWrites.push({method,path:url.pathname});return route.abort('blockedbyclient')
   }
   if(MODE==='source'){
    if(!(url.pathname===BASE||url.pathname.startsWith(BASE+'/')))return route.abort('blockedbyclient');
    const input=new Request(req.url(),{method});
    const response=url.pathname.startsWith(BASE+'/api/')
      ?await seasonalOperationsResponse(input,{})
      :seasonalPortalResponse(input);
    if(!response)return route.abort('blockedbyclient');
    return route.fulfill({status:response.status,
      headers:Object.fromEntries(response.headers.entries()),
      body:await response.text()});
   }
   return route.continue();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>row.pageErrors.push(String(error.message||error).slice(0,300)));
  const step=(name,details)=>row.steps.push({name,ok:true,...details});
  const shot=async name=>{
   const nameOnly=device.name+'-'+name+'.png';
   await page.screenshot({path:path.join(OUT,nameOnly),fullPage:true,
    animations:'disabled',timeout:20000});
   return nameOnly;
  };
  try{
   for(const [route,heading] of PAGES){
    const url=ORIGIN+BASE+route;
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    must(response?.status()===200,'http_failure_'+route+'_'+(response?.status()||0));
    const h1=await page.locator('h1').first().innerText({timeout:15000});
    must(h1.includes(heading),'wrong_heading_'+route+':'+h1.slice(0,80));
    const layout=await page.evaluate(()=>{
     const html=document.documentElement,nav=document.querySelector('.swp-nav');
     return {documentWidth:html.scrollWidth,viewportWidth:html.clientWidth,
      navCount:nav?.querySelectorAll('a').length||0,
      stylesheet:[...document.styleSheets].some(s=>s.href?.endsWith('/seasonal-workers/theme.css')),
      proposal:document.body.innerText.includes('제안용')};
    });
    must(layout.documentWidth<=layout.viewportWidth+2,'horizontal_overflow_'+route+'_'+JSON.stringify(layout));
    must(layout.navCount>=8&&layout.stylesheet&&layout.proposal,'site_chrome_missing_'+route);
    const detail={route,http:200,width:layout.documentWidth};
    if(['/','/demand','/mou','/office'].includes(route))
     detail.screenshot=await shot(route==='/'?'home':route.slice(1));
    step('route',detail);
    if(route==='/demand'){
     await page.locator('#demand-crop').selectOption('양파');
     await page.locator('#demand-workers').fill('6');
     await page.locator('#demand-start').fill('2026-11');
     await page.locator('#demand-months').selectOption('4');
     await page.locator('#demand-housing').selectOption('준비 완료');
     await page.locator('#demand-translate').selectOption('필요');
     await page.locator('#swp-demand-form button[type=submit]').click();
     must((await page.locator('#swp-demand-result').innerText()).includes('24인·개월'),'demand_math_failed');
     await page.locator('#swp-demand-reset').click();
     must(await page.locator('#swp-demand-result').isHidden(),'demand_reset_failed');
     step('nonpersistent-demand-calculator',{personMonths:24,reset:true});
    }
    if(route==='/mou'){
     await page.locator('[data-mou-filter="협약서"]').click();
     must(await page.locator('[data-mou-row]:visible').count()===1,'mou_filter_failed');
     await page.locator('[data-mou="협약서"]').click();
     must((await page.locator('#swp-mou-preview').innerText()).includes('기본 협약 양식'),'mou_preview_failed');
     await page.locator('[data-mou-filter="전체"]').click();
     must(await page.locator('[data-mou-row]:visible').count()===4,'mou_filter_restore_failed');
     step('mou-sample-filter-preview',{filteredCount:1,restored:4,actualSignedAgreements:false});
    }
    if(route==='/learning'){
     await page.locator('[data-check-progress]').first().check();
     must((await page.locator('#swp-check-status').innerText()).includes('1 / 4'),'education_check_failed');
     step('learning-local-checkbox',{completed:1,total:4});
    }
    if(route==='/housing'){
     await page.locator('[data-housing-check]').first().check();
     await page.locator('[data-housing-check]').nth(1).check();
     must((await page.locator('#swp-housing-status').innerText()).includes('2 / 5'),'housing_check_failed');
     step('housing-local-checkbox',{completed:2,total:5});
    }
    if(route==='/reports'){
     await page.locator('#swp-metric-workers').fill('4');
     await page.locator('#swp-metric-months').fill('3');
     await page.locator('#swp-metric-form button[type=submit]').click();
     must((await page.locator('#swp-metric-result').innerText()).includes('12인·개월'),'report_math_failed');
     step('report-anonymous-calculator',{personMonths:12,actualOfficialStats:false});
    }
    if(route==='/office'){
     const login=await page.locator('#login-link').getAttribute('href');
     must(login?.startsWith('/auth/?site=admin&return_to='),'login_link_missing');
     must(new URL(login,ORIGIN).searchParams.get('return_to')===url,'nested_return_url_lost');
     must(await page.locator('#office-data').isHidden(),'private_data_visible_without_admin');
     step('office-login-return-private-ui',{authenticated:false,privateDataHidden:true});
    }
   }
   const api=await context.request.get(ORIGIN+BASE+'/api/v1/tenants/muan/demands',
    {timeout:20000,failOnStatusCode:false});
   must(api.status()===503,'api_not_disabled_'+api.status());
   const json=await api.json();
   must(json?.ok===false&&json.error==='applications_not_enabled','api_fail_closed_mismatch');
   must(!row.blockedWrites.length,'unexpected_mutation_attempt');
   must(!row.pageErrors.length,'javascript_errors_'+JSON.stringify(row.pageErrors));
   step('operations-gate',{status:503,error:'applications_not_enabled'});
   row.ok=true;
  }catch(error){
   row.error=String(error.message||error).slice(0,750);
   try{row.failureScreenshot=await shot('failure')}catch{}
  }finally{await context.close()}
 }
}catch(error){evidence.launchError=String(error.message||error).slice(0,750)}
finally{
 await browser?.close().catch(()=>{});
 evidence.success=evidence.profiles.length===PROFILES.length&&evidence.profiles.every(x=>x.ok);
 await fs.writeFile(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({policy:evidence.policy,mode:MODE,
  productionSiteVerified:evidence.productionSiteVerified,success:evidence.success,
  profiles:evidence.profiles.map(x=>({name:x.profile,steps:x.steps.length,ok:x.ok,
   error:x.error||null,blockedWrites:x.blockedWrites,pageErrors:x.pageErrors})),
  launchError:evidence.launchError||null}));
 if(!evidence.success)process.exitCode=1;
}
