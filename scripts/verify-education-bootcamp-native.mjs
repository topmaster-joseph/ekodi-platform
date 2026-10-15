// EKODI-owned temporary Chromium probe for the public Education classroom.
// Read-only; no user profile, external browser provider, account, secrets or background persistence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {EKODI_SERVICE_MANIFEST} from '../ekodi-service-manifest.js';
import {classifyConsoleSecurityBlock,classifyRequestSecurityBlock,
  classifyMutationSecurityBlock,verifyKnownSecurityBlocks
} from './education-native-security-observations.mjs';

// Reuse the existing registered Education boundary; never mint a new hostname.
export const ORIGIN=new URL(EKODI_SERVICE_MANIFEST.services.find(row=>row.id==='edu').url).origin;
export const ROUTE='/study/ai-bootcamp/';
const wantsPreview=process.env.EKODI_EDUCATION_PREVIEW_MODE==='true';
const previewAllowed=wantsPreview&&process.env.GITHUB_EVENT_NAME==='pull_request'&&process.env.CI==='true';
if(wantsPreview&&!previewAllowed)throw new Error('Local preview is restricted to isolated CI pull requests');
const TARGET_ORIGIN=previewAllowed?'http://127.0.0.1:8765':'https://ekodi.kr';
const TARGET_ROUTE=previewAllowed?ROUTE:'/edu'+ROUTE;
export const VIEWPORTS=Object.freeze([
  {name:'compact-mobile',width:320,height:640,mobile:true},
  {name:'mobile',width:390,height:844,mobile:true},
  {name:'tablet',width:768,height:1024,mobile:false},
  {name:'desktop',width:1366,height:900,mobile:false},
  {name:'large-desktop',width:1440,height:900,mobile:false},
]);
const FILES=Object.freeze(['catalog.js','classroom.js','classroom.css','data/sample.csv']);
const CATEGORIES=Object.freeze(['overview','lecture','practice','resources','operations','instructor']);
const fail=message=>{throw new Error('[EKODI EDUCATION NATIVE] '+message)};
const trim=(value,max=400)=>String(value??'').trim().slice(0,max);
const artifactRoot=path.resolve(process.env.EKODI_EDUCATION_NATIVE_ARTIFACT_DIR||'artifacts/education-native');
const report={taskId:trim(process.env.EKODI_RELEASE_TASK_ID||'education-classroom-production',150),
  owner:'ekodi-background-browser-worker',implementation:'ekodi-owned-ephemeral-chromium',
  sourceSha:trim(process.env.GITHUB_SHA||'unknown',80),origin:TARGET_ORIGIN,
  evidenceScope:previewAllowed?'synthetic-local-preview':'real-production',readOnly:true,
  authenticated:false,ephemeral:true,startedAt:new Date().toISOString(),profiles:[],
  captures:[],consoleErrors:[],pageErrors:[],httpErrors:[],requestFailures:[],blockedMutations:[],observedSecurityBlocks:[],ok:false};
const record=(kind,profile,detail)=>report[kind].push({profile:profile.name,...detail});

async function checkAssets(page){
  const results=[];
  for(const file of FILES){
    const response=await page.request.get(TARGET_ORIGIN+TARGET_ROUTE+file,{timeout:15000});
    if(response.status()!==200)fail('asset '+file+' returned HTTP '+response.status());
    results.push({file,status:response.status(),type:response.headers()['content-type']||''});
  }
  return results;
}
async function checkProfile(browser,profile){
  const context=await browser.newContext({
    viewport:{width:profile.width,height:profile.height},
    isMobile:profile.mobile,hasTouch:profile.mobile,acceptDownloads:true,
    locale:'ko-KR',colorScheme:'dark'
  });
  const page=await context.newPage();
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const value=trim(message.text(),850);
    const security=classifyConsoleSecurityBlock(value);
    record(security?'observedSecurityBlocks':'consoleErrors',profile,
      security?{type:'console',reason:security,message:value}:{message:value});
  });
  page.on('pageerror',error=>record('pageErrors',profile,{message:trim(error?.message)}));
  page.on('requestfailed',request=>{
    const info={url:trim(request.url(),700),failure:trim(request.failure()?.errorText,150)};
    const security=classifyRequestSecurityBlock(info.url,info.failure);
    record(security?'observedSecurityBlocks':'requestFailures',profile,
      security?{type:'request',reason:security,...info}:info);
  });
  page.on('response',response=>{if(response.status()>=400)record('httpErrors',profile,{url:trim(response.url()),status:response.status(),resourceType:trim(response.request().resourceType(),60)})});
  await page.route('**/*',route=>{
    const req=route.request(),method=req.method().toUpperCase();
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      const security=classifyMutationSecurityBlock(method,req.url());
      record('blockedMutations',profile,{method,url:trim(req.url(),700)});
      if(security)record('observedSecurityBlocks',profile,{type:'mutation',reason:security,method,url:trim(req.url(),700)});
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  try{
    if(!previewAllowed){
      const legacy=await page.request.get(ORIGIN+ROUTE,{timeout:15000});
      if(legacy.status()!==200)fail('legacy Education classroom compatibility failed HTTP '+legacy.status());
    }
    const response=await page.goto(TARGET_ORIGIN+TARGET_ROUTE,{waitUntil:'domcontentloaded',timeout:35000});
    if(!response||response.status()!==200)fail(profile.name+' classroom returned HTTP '+response?.status());
    if(new URL(page.url()).origin!==TARGET_ORIGIN)fail('redirect escaped Education origin');
    await page.locator('[data-view="overview"]').waitFor({state:'visible',timeout:15000});
    await page.locator('.course-cards .lesson-card').first().waitFor({state:'visible',timeout:15000});
    if(await page.locator('.course-cards .lesson-card').count()!==4)fail('not exactly four lesson cards');
    if(await page.locator('[data-view]').count()!==CATEGORIES.length)fail('not exactly six categories');
    const optionCount=await page.locator('#batchPicker option').count();
    if(optionCount!==6)fail('not exactly six batches');
    const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    if(overflow.width>overflow.client+2)fail(profile.name+' horizontal overflow '+JSON.stringify(overflow));
    await fs.mkdir(artifactRoot,{recursive:true});
    const shot=profile.name+'.png';
    await page.screenshot({path:path.join(artifactRoot,shot),fullPage:true});
    report.captures.push(shot);
    const assets=await checkAssets(page);
    for(const category of CATEGORIES){
      await page.locator('[data-view="'+category+'"]').click();
      if(await page.locator('[data-view="'+category+'"]').getAttribute('aria-pressed')!=='true')
        fail(profile.name+' category not interactive '+category);
    }
    await page.locator('[data-view="operations"]').click();
    if(await page.locator('.class-table tbody tr').count()!==24)fail('24-session schedule missing');
    const operationsButton=page.locator('button[data-export="schedule"]');
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:15000}),operationsButton.click()]);
    if(!download.suggestedFilename().endsWith('.csv'))fail('schedule CSV download missing');
    await download.delete().catch(()=>{});
    for(let batchIndex=0;batchIndex<6;batchIndex++){
      const id='ABCDEF'[batchIndex];
      await page.locator('#batchPicker').selectOption(id);
      const content=await page.locator('#classroomContent').innerText();
      if(!content.includes('선택된 세트 '+id))fail('batch '+id+' was not displayed');
    }
    const slideCounts=[];
    for(let lesson=1;lesson<=4;lesson++){
      await page.locator('#lessonPicker').selectOption(String(lesson));
      await page.locator('[data-view="practice"]').click();
      if(await page.locator('.verify-check').count()!==4)fail('lesson '+lesson+' verification checklist missing');
      await page.locator('#presentButton').click();
      const dialog=page.locator('#presentDialog');
      if(!await dialog.evaluate(el=>el.open))fail('lesson '+lesson+' presentation did not open');
      const counter=await page.locator('#slideCounter').innerText();
      if(counter!=='1 / 9')fail('slide deck mismatch: '+counter);
      for(let i=2;i<=9;i++)await page.keyboard.press('ArrowRight');
      const last=await page.locator('#slideCounter').innerText();
      if(last!=='9 / 9')fail('lesson '+lesson+' did not reach final slide: '+last);
      await page.locator('#closeSlideButton').click();
      if(await dialog.evaluate(el=>el.open))fail('presentation dialog did not close');
      slideCounts.push(9);
    }
    const known=report.observedSecurityBlocks.filter(x=>x.profile===profile.name);
    const securityResult=verifyKnownSecurityBlocks({
      consoleBlocks:known.filter(x=>x.type==='console').map(x=>({message:x.message})),
      requestBlocks:known.filter(x=>x.type==='request').map(x=>({url:x.url,failure:x.failure})),
      mutations:report.blockedMutations.filter(x=>x.profile===profile.name)
    });
    if(!securityResult.ok)fail(profile.name+' '+securityResult.reason);
    if(report.requestFailures.some(x=>x.profile===profile.name))fail('unexpected network failure on '+profile.name);
    if(report.pageErrors.some(x=>x.profile===profile.name))fail('page script exceptions on '+profile.name);
    if(report.consoleErrors.some(x=>x.profile===profile.name))fail('console errors on '+profile.name);
    if(report.httpErrors.some(x=>x.profile===profile.name))fail('HTTP 4xx/5xx on '+profile.name);
    report.profiles.push({name:profile.name,viewport:{width:profile.width,height:profile.height},categories:6,lessons:4,batches:6,sessionRows:24,slideCounts,assets,overflow,securityBlocks:known.length,passed:true});
  }finally{
    await context.close();
  }
}
async function main(){
  const {chromium}=await import('playwright');
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    for(const profile of VIEWPORTS)await checkProfile(browser,profile);
    report.ok=true;
  }catch(error){report.error=trim(error?.message||error,1100);throw error}
  finally{
    await browser?.close();
    report.finishedAt=new Date().toISOString();
    await fs.mkdir(artifactRoot,{recursive:true});
    await fs.writeFile(path.join(artifactRoot,'result.json'),JSON.stringify(report,null,2));
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1});
}