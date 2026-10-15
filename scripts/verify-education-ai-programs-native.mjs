// EKODI-native Chromium browser acceptance for source-derived six-program library.
// Ephemeral read-only context; no personal profiles, no external automated browsing provider.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {EKODI_SERVICE_MANIFEST} from '../ekodi-service-manifest.js';
import {classifyConsoleSecurityBlock,classifyRequestSecurityBlock,
  classifyMutationSecurityBlock,verifyKnownSecurityBlocks} from './education-native-security-observations.mjs';
const isPreview=process.env.EKODI_EDUCATION_PREVIEW_MODE==='true';
if(isPreview&&(process.env.CI!=='true'||process.env.GITHUB_EVENT_NAME!=='pull_request'))
  throw Error('Preview only inside authorized pull-request CI');
const origin=isPreview?'http://127.0.0.1:8765':'https://ekodi.kr';
const pathAt=isPreview?'/study/ai-bootcamp/programs/':'/edu/study/ai-bootcamp/programs/';
const url=origin+pathAt;
const legacy=new URL(EKODI_SERVICE_MANIFEST.services.find(x=>x.id==='edu').url).origin+'/study/ai-bootcamp/programs/';
const profiles=[['mobile-320',320,680],['mobile-390',390,844],['tablet-768',768,1024],['desktop-1366',1366,900],['desktop-1440',1440,900]];
const folder=path.resolve('artifacts/education-programs-native');
const report={url,mode:isPreview?'isolated-preview':'production',sourceSha:process.env.GITHUB_SHA||'',profiles:[],ok:false,errors:[]};
const fail=message=>{throw Error('[EKODI PROGRAM LIBRARY] '+message)};
async function validate(browser,[name,width,height]){
  const context=await browser.newContext({viewport:{width,height},locale:'ko-KR',isMobile:width<600,acceptDownloads:false});
  const page=await context.newPage();
  const sample={name,width,height,passed:false,checks:[],consoleErrors:[],pageErrors:[],requestFailures:[],httpErrors:[],blockedMutations:[],knownSecurityBlocks:[]};
  report.profiles.push(sample);
  page.on('pageerror',e=>sample.pageErrors.push(e.message));
  page.on('console',m=>{
    if(m.type()!=='error')return;
    const message=m.text(),kind=classifyConsoleSecurityBlock(message);
    if(kind)sample.knownSecurityBlocks.push({type:'console',reason:kind,message});
    else sample.consoleErrors.push(message);
  });
  page.on('requestfailed',r=>{
    const info={url:r.url(),failure:r.failure()?.errorText||''},kind=classifyRequestSecurityBlock(info.url,info.failure);
    if(kind)sample.knownSecurityBlocks.push({type:'request',reason:kind,...info});
    else sample.requestFailures.push(info);
  });
  page.on('response',r=>{
    if(r.status()>=400&&new URL(r.url()).origin===origin)
      sample.httpErrors.push({url:r.url(),status:r.status()});
  });
  await page.route('**/*',r=>{
    const method=r.request().method().toUpperCase();
    if(['GET','HEAD','OPTIONS'].includes(method))return r.continue();
    const address=r.request().url();sample.blockedMutations.push({method,url:address});
    const kind=classifyMutationSecurityBlock(method,address);
    if(kind)sample.knownSecurityBlocks.push({type:'mutation',reason:kind,method,url:address});
    return r.abort('blockedbyclient');
  });
  try{
    if(!isPreview&&name==='desktop-1366'){
      const response=await page.request.get(legacy,{timeout:15000});
      if(response.status()!==200)fail('legacy Education Worker library missing '+response.status());
      sample.checks.push('original Education Worker path');
    }
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
    if(response?.status()!==200)fail(name+' page HTTP '+response?.status());
    await page.locator('#programOptions button').first().waitFor({timeout:20000});
    if(await page.locator('#programOptions button').count()!==6)fail('expected exactly 6 program choices');
    if(await page.locator('#sessionOptions button').count()!==4)fail('expected exactly 4 session tabs');
    sample.checks.push('six curricula and four session navigation');
    const titles=[
      '슬기로운 AI 윤리 생활','AIoT 스마트 가로등','똑똑한 드로잉 로봇',
      '절대 지지 않는 가위바위보','모두의 스마트팜',
      '바이브코딩으로 만드는 아두이노 스마트팜'
    ];
    for(let i=0;i<6;i++){
      await page.locator('#programOptions button').nth(i).click();
      if(await page.locator('#selectedTitle').innerText()!==titles[i])fail('program mismatch '+i);
      for(let session=0;session<4;session++){
        await page.locator('#sessionOptions button').nth(session).click();
        if(await page.locator('#lessonDetails li').count()<3)fail('source details missing '+i+' '+session);
      }
    }
    sample.checks.push('all 24 session detail lists');
    await page.locator('#programOptions button').nth(3).click();
    await page.locator('#sessionOptions button').nth(3).click();
    if(!await page.locator('#lessonTitleNote').isVisible())fail('source blank title incorrectly fabricated');
    sample.checks.push('unfilled fourth source title made explicit');
    await page.locator('#programOptions button').nth(0).click();
    await page.locator('#programPresent').click();
    if(!await page.locator('#programPresentation').evaluate(e=>e.open))fail('presenter missing');
    for(let n=2;n<=4;n++)await page.keyboard.press('ArrowRight');
    if(await page.locator('#presentCounter').innerText()!=='4 / 4')fail('presenter navigation stopped early');
    await page.locator('#closePresentation').click();
    sample.checks.push('four session read-only presenter');
    if(await page.locator('#programPrintAll section').count()!==4)fail('print lacks four sessions');
    sample.checks.push('four-session print outline');
    await page.goto(url+'?program=vibe-arduino-youth&session=2',{waitUntil:'domcontentloaded'});
    await page.locator('#selectedTitle').getByText('바이브코딩으로 만드는 아두이노 스마트팜').waitFor({timeout:10000});
    if(await page.locator('#lessonIndex').innerText()!=='SESSION 02 / 04')fail('deep-link session not restored');
    sample.checks.push('stable direct deep links');
    const measure=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    if(measure.scroll>measure.client+2)fail(name+' horizontal overflow '+JSON.stringify(measure));
    await mkdir(folder,{recursive:true});
    await page.screenshot({path:path.join(folder,name+'.png'),fullPage:true});
    const known=sample.knownSecurityBlocks;
    const v=verifyKnownSecurityBlocks({
      consoleBlocks:known.filter(x=>x.type==='console').map(x=>({message:x.message})),
      requestBlocks:known.filter(x=>x.type==='request').map(x=>({url:x.url,failure:x.failure})),
      mutations:sample.blockedMutations
    });
    if(!v.ok||sample.consoleErrors.length||sample.pageErrors.length||sample.requestFailures.length||sample.httpErrors.length)
      fail(name+' unexpected browser error: '+JSON.stringify({v,console:sample.consoleErrors,page:sample.pageErrors,request:sample.requestFailures,http:sample.httpErrors}).slice(0,650));
    sample.passed=true;
  }finally{await context.close()}
}
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const profile of profiles)await validate(browser,profile);
  report.ok=true;
}catch(e){report.errors.push(String(e?.message||e));process.exitCode=1;console.error(e)}
finally{
  await browser?.close();
  await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'result.json'),JSON.stringify(report,null,2));
  console.log('EKODI program library acceptance',JSON.stringify({ok:report.ok,mode:report.mode,profiles:report.profiles.map(x=>({name:x.name,passed:x.passed,checks:x.checks.length})),errors:report.errors}));
}
