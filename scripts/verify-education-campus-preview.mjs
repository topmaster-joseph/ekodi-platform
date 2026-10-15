// No-secrets preview: ephemeral browser + loopback static assets, no production mutation.
// This deliberately does not certify the Worker/CSP or role-protected backend.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const BASE='http://127.0.0.1:8765/';
const VIEWPORTS=[320,390,768,1366,1440];
const folder=path.resolve('artifacts/education-campus-preview');
const result={kind:'unprivileged-education-campus-preview',readOnly:true,publicProductionVerified:false,
 startedAt:new Date().toISOString(),profiles:[],ok:false};
await mkdir(folder,{recursive:true});
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of VIEWPORTS){
  const context=await browser.newContext({viewport:{width,height:width<700?800:900},
    isMobile:width<700,hasTouch:width<700,locale:'ko-KR',colorScheme:'light'});
  const page=await context.newPage();
  const evidence={width,passed:false,screenshots:[],errors:[]};
  result.profiles.push(evidence);
  page.on('pageerror',err=>evidence.errors.push(String(err.message).slice(0,400)));
  page.on('response',res=>{if(res.status()>=400&&new URL(res.url()).origin===BASE.slice(0,-1))
    evidence.errors.push('same-origin HTTP '+res.status()+' '+res.url())});
  page.on('requestfailed',req=>{if(new URL(req.url()).origin===BASE.slice(0,-1))
    evidence.errors.push('same-origin network '+req.url())});
  try{
   const home=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30000});
   if(!home||home.status()!==200)throw Error('homepage failed');
   await page.locator('#heroTitle').waitFor({state:'visible'});
   if(await page.locator('.program-card').count()!==4)throw Error('four photographed courses missing');
   if(await page.locator('.campus-header').count()!==1)throw Error('duplicate homepage header');
   const photo=await page.locator('.hero-photo').evaluate(el=>getComputedStyle(el).backgroundImage);
   if(!photo.includes('images.unsplash.com'))throw Error('photographic hero asset missing');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
   if(overflow)throw Error('horizontal scroll on homepage');
   const filename='home-'+width+'.png';
   await page.screenshot({path:path.join(folder,filename),fullPage:true});
   evidence.screenshots.push(filename);
   const portal=await page.goto(BASE+'portal/',{waitUntil:'domcontentloaded',timeout:30000});
   if(!portal||portal.status()!==200)throw Error('cyber campus portal failed');
   await page.locator('#lessonList .lesson-entry').first().waitFor({state:'visible',timeout:15000});
   if(await page.locator('#lessonList .lesson-entry').count()!==4)throw Error('existing four lessons missing');
   await page.locator('[data-panel="enroll"]').click();
   if(await page.locator('#enrollSubmit').isEnabled())throw Error('guest enrolled without verified server');
   if(await page.locator('#manageNav').isVisible())throw Error('unauthorized operator menu visible');
   await page.locator('[data-panel="practice"]').click();
   await page.locator('#practiceChecks label').first().waitFor({state:'visible'});
   if(await page.locator('#practiceChecks label').count()!==4)throw Error('real practice checklist unavailable');
   await page.locator('[data-panel="dashboard"]').click();
   const portalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
   if(portalOverflow)throw Error('horizontal scroll on portal');
   const portalFilename='portal-'+width+'.png';
   await page.screenshot({path:path.join(folder,portalFilename),fullPage:true});
   evidence.screenshots.push(portalFilename);
   if(evidence.errors.length)throw Error(evidence.errors.join('; '));
   evidence.passed=true;
  }finally{await context.close()}
 }
 result.ok=result.profiles.length===5&&result.profiles.every(x=>x.passed);
 if(!result.ok)throw Error('5-width image-led campus preview failed');
 console.log('EKODI campus unprivileged PC/mobile preview: 5/5 passed');
}catch(error){
 result.error=String(error.message).slice(0,1200);
 throw error;
}finally{
 result.finishedAt=new Date().toISOString();
 await writeFile(path.join(folder,'result.json'),JSON.stringify(result,null,2));
 await browser?.close();
}
