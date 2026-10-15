// EKODI first-party, guest-only, read-only real production acceptance.
// Protects existing security denials; never signs in or sends any write request.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import {classifyConsoleSecurityBlock,classifyRequestSecurityBlock} from './education-native-security-observations.mjs';

const BASE='https://ekodi.kr/edu/';
const PROFILES=[320,390,768,1366,1440].map(width=>({name:String(width),width,height:width<700?840:900,mobile:width<700}));
const folder=path.resolve('artifacts/education-campus-native');
const report={scope:'real-production',base:BASE,readOnly:true,authenticated:false,
  startedAt:new Date().toISOString(),profiles:[],unhandledErrors:[],ok:false};
const fail=text=>{throw new Error('[EKODI EDU CAMPUS NATIVE] '+text)};
const brief=(text,max=320)=>String(text||'').slice(0,max);
function observe(page,entry){
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const msg=brief(message.text(),600);
    const expected=classifyConsoleSecurityBlock(msg);
    if(expected)entry.expectedSecurityBlocks.push({reason:expected,message:msg});
    else entry.consoleErrors.push(msg);
  });
  page.on('pageerror',error=>entry.pageErrors.push(brief(error?.message)));
  page.on('response',response=>{
    if(response.status()>=400)entry.httpErrors.push({url:brief(response.url()),status:response.status()});
  });
  page.on('requestfailed',request=>{
    const info={url:brief(request.url()),failure:brief(request.failure()?.errorText)};
    const expected=classifyRequestSecurityBlock(info.url,info.failure);
    if(expected)entry.expectedSecurityBlocks.push({...info,reason:expected});
    else entry.networkErrors.push(info);
  });
  return page.route('**/*',route=>{
    if(!['GET','HEAD','OPTIONS'].includes(route.request().method().toUpperCase())){
      entry.blockedMutations.push({method:route.request().method(),url:brief(route.request().url())});
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
}
function assertVisible(page,selector){return page.locator(selector).first().waitFor({state:'visible',timeout:15000})}
async function check(browser,profile){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},
    isMobile:profile.mobile,hasTouch:profile.mobile,colorScheme:'light',locale:'ko-KR'});
  const page=await context.newPage();
  const item={width:profile.width,passed:false,screenshots:[],consoleErrors:[],pageErrors:[],
    networkErrors:[],httpErrors:[],blockedMutations:[],expectedSecurityBlocks:[],checks:[]};
  report.profiles.push(item);
  await observe(page,item);
  try{
    const response=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
    if(!response||response.status()!==200)fail('home HTTP '+response?.status());
    await assertVisible(page,'#heroTitle');
    await assertVisible(page,'.program-card');
    if(await page.locator('.program-card').count()!==4)fail('four campus course modules required');
    if(await page.locator('.campus-header').count()!==1)fail('duplicate site fixed headers');
    if(!await page.locator('a[href="./portal/"]').count())fail('integrated portal route not linked');
    const photo=await page.locator('.hero-photo').evaluate(node=>getComputedStyle(node).backgroundImage);
    if(!photo.includes('unsplash.com'))fail('photo-led hero did not render background');
    const sizing=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
    if(sizing.scrollWidth>sizing.clientWidth+2)fail('home horizontal overflow '+JSON.stringify(sizing));
    await fs.mkdir(folder,{recursive:true});
    const homeName='campus-home-'+profile.name+'.png';
    await page.screenshot({path:path.join(folder,homeName),fullPage:true});
    item.screenshots.push(homeName);
    item.checks.push('canonical home, photo hero, four modules, fixed navigation, no overflow');

    const portal=await page.goto(BASE+'portal/',{waitUntil:'domcontentloaded',timeout:35000});
    if(!portal||portal.status()!==200)fail('portal HTTP '+portal?.status());
    await assertVisible(page,'#dashboardTitle');
    await assertVisible(page,'#lessonList');
    await page.locator('[data-panel="enroll"]').click();
    await assertVisible(page,'#enrollTitle');
    if(await page.locator('#enrollSubmit').isEnabled())fail('guest enrollment submit must be disabled');
    await page.locator('[data-panel="practice"]').click();
    await assertVisible(page,'#practiceTitle');
    await assertVisible(page,'#practiceChecks label');
    if(await page.locator('#practiceChecks label').count()!==4)fail('missing authentic lesson verification checklist');
    await page.locator('[data-panel="materials"]').click();
    await assertVisible(page,'#materialsTitle');
    if(await page.locator('#manageNav').isVisible())fail('unverified visitor sees administrator menu');
    await page.locator('[data-panel="dashboard"]').click();
    const count=await page.locator('.lesson-entry').count();
    if(count!==4)fail('expected four real course lessons, got '+count);
    const size=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
    if(size.scrollWidth>size.clientWidth+2)fail('portal horizontal overflow '+JSON.stringify(size));
    const portalName='campus-portal-'+profile.name+'.png';
    await page.screenshot({path:path.join(folder,portalName),fullPage:true});
    item.screenshots.push(portalName);
    item.checks.push('guest dashboard, four lessons, application blocked, practice checklist, notices, admin menu hidden, no overflow');
    // Expected strict CSP denials and read-only telemetry blocks are observed
    // but must remain protected. Any unexpected code/HTTP/network error fails.
    if(item.consoleErrors.length||item.pageErrors.length||
       item.httpErrors.length||item.networkErrors.length)
      fail('unexpected browser failures '+JSON.stringify(item).slice(0,900));
    item.passed=true;
  }finally{await context.close()}
}
await fs.mkdir(folder,{recursive:true});
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const profile of PROFILES)await check(browser,profile);
  report.ok=report.profiles.length===PROFILES.length&&report.profiles.every(x=>x.passed);
  if(!report.ok)fail('full five-viewport native acceptance did not pass');
  console.log('[EKODI EDU CAMPUS NATIVE] all '+report.profiles.length+' real-production profiles passed');
}catch(error){
  report.unhandledErrors.push(brief(error?.message,1500));
  throw error;
}finally{
  report.finishedAt=new Date().toISOString();
  await fs.writeFile(path.join(folder,'result.json'),JSON.stringify(report,null,2));
  if(browser)await browser.close();
}
