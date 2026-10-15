// EKODI-owned disposable Chromium acceptance for MNU Bootcamp document editor.
// Pre-approval preview runs in isolated GitHub PR CI; production uses the protected /edu route.
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {DEFAULT_PORTRAIT} from '../education/study/ai-bootcamp/documents/portrait.js';
import {EKODI_SERVICE_MANIFEST} from '../ekodi-service-manifest.js';
import {classifyConsoleSecurityBlock,classifyRequestSecurityBlock,
  classifyMutationSecurityBlock,verifyKnownSecurityBlocks} from './education-native-security-observations.mjs';

const preview=process.env.EKODI_EDUCATION_PREVIEW_MODE==='true';
if(preview&&(process.env.GITHUB_EVENT_NAME!=='pull_request'||process.env.CI!=='true'))
  throw new Error('[EKODI DOCUMENTS] Preview is restricted to isolated read-only pull-request CI');
const origin=preview?'http://127.0.0.1:8765':'https://ekodi.kr';
const route=preview?'/study/ai-bootcamp/documents/':'/edu/study/ai-bootcamp/documents/';
const legacy=new URL(EKODI_SERVICE_MANIFEST.services.find(x=>x.id==='edu').url).origin;
const target=origin+route;
const profiles=[
  {name:'mobile-320',width:320,height:680,isMobile:true},
  {name:'mobile-390',width:390,height:844,isMobile:true},
  {name:'tablet-768',width:768,height:1024,isMobile:false},
  {name:'desktop-1366',width:1366,height:900,isMobile:false},
  {name:'desktop-1440',width:1440,height:900,isMobile:false}
];
const artifactRoot=path.resolve('artifacts/education-documents-native');
const result={sourceSha:process.env.GITHUB_SHA||null,mode:preview?'isolated-synthetic-preview':'real-production',url:target,readOnly:true,
 startedAt:new Date().toISOString(),profiles:[],errors:[],passed:false};
function fail(s){throw new Error('[EKODI DOCUMENTS] '+s)}
const validPhoto=Buffer.from(DEFAULT_PORTRAIT.split(',')[1],'base64');
async function testProfile(browser,profile){
  const ctx=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.isMobile,
    hasTouch:profile.isMobile,locale:'ko-KR',acceptDownloads:true});
  const p=await ctx.newPage();
  const x={name:profile.name,checks:[],requestsBlocked:[],errors:[],captures:[],
    consoleErrors:[],requestFailures:[],observedSecurityBlocks:[],passed:false};
  result.profiles.push(x);
  p.on('pageerror',e=>x.errors.push('pageerror:'+e.message));
  p.on('console',msg=>{
    if(msg.type()!=='error')return;
    const message=msg.text(),known=classifyConsoleSecurityBlock(message);
    if(known)x.observedSecurityBlocks.push({type:'console',reason:known,message});
    else x.consoleErrors.push(message);
  });
  p.on('response',res=>{if(res.status()>=400)x.errors.push('HTTP:'+res.status()+':'+res.url())});
  p.on('requestfailed',req=>{
    const info={url:req.url(),failure:req.failure()?.errorText||''};
    const known=classifyRequestSecurityBlock(info.url,info.failure);
    if(known)x.observedSecurityBlocks.push({type:'request',reason:known,...info});
    else x.requestFailures.push(info);
  });
  await p.route('**/*',r=>{
    const method=r.request().method();
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      const url=r.request().url(),reason=classifyMutationSecurityBlock(method,url);
      x.requestsBlocked.push({method,url});
      if(reason)x.observedSecurityBlocks.push({type:'mutation',reason,method,url});
      return r.abort('blockedbyclient');
    }
    return r.continue();
  });
  try{
    if(!preview){
      const check=await p.request.get(legacy+'/study/ai-bootcamp/documents/',{timeout:15000});
      if(check.status()!==200)fail('legacy Education Worker documents regression '+check.status());
      x.checks.push('legacy worker route 200');
    }
    const nav=await p.goto(target,{waitUntil:'networkidle',timeout:45000});
    if(!nav||nav.status()!==200)fail(profile.name+' documents route '+nav?.status());
    await p.locator('#portraitEditor').waitFor({state:'visible',timeout:12000});
    if(!await p.locator('#portraitEditor').evaluate(el=>el.complete&&el.naturalWidth>0))fail('Drive portrait not rendered');
    if(!await p.locator('#documentPreview').getByText(/경영학박사 학위 취득/).isVisible())fail('verified degree date not displayed');
    x.checks.push('Drive portrait and corrected doctorate');
    await mkdir(artifactRoot,{recursive:true});
    await p.screenshot({path:path.join(artifactRoot,'resume-'+profile.name+'.png'),fullPage:true});
    x.captures.push('resume-'+profile.name+'.png');
    await p.locator('[data-resume="name"]').fill('검증 강사');
    if(!await p.locator('#documentPreview h3').getByText('검증 강사').isVisible())fail('resume edit not previewed');
    await p.locator('[data-resume="summary"]').fill('<script>alert(1)</script> 실습 결과');
    if(await p.locator('#documentPreview script').count())fail('user HTML executed in preview');
    if(!await p.locator('#documentPreview').getByText('<script>alert(1)</script> 실습 결과').isVisible())fail('escaped resume input lost');
    x.checks.push('editable preview HTML escaping');
    const image=p.locator('#photoInput');
    await image.setInputFiles({name:'lecturer.jpg',mimeType:'image/jpeg',buffer:validPhoto});
    await p.locator('#editorStatus').getByText(/사진 교체 완료/).waitFor();
    x.checks.push('in-browser photo replacement without upload');
    const [backup]=await Promise.all([p.waitForEvent('download'),p.locator('#exportJson').click()]);
    if(!backup.suggestedFilename().endsWith('.json'))fail('JSON backup absent');
    const draft=JSON.parse(await readFile(await backup.path(),'utf8'));
    if(draft.schema!=='ekodi-bootcamp-documents-v1'||draft.resume.name!=='검증 강사'||!draft.portrait.startsWith('data:image/jpeg;base64,'))
      fail('JSON backup integrity');
    await backup.delete().catch(()=>{});
    x.checks.push('validated local JSON backup');
    await p.locator('#recipient').fill('receiver@example.org');
    await p.locator('#mailSubject').fill('강사 이력서 검증');
    if(!await p.locator('#makeEml').isDisabled())fail('mail enabled without review');
    await p.locator('#mailReview').check();
    if(await p.locator('#makeEml').isDisabled())fail('mail remains blocked after review');
    await p.locator('[data-resume="name"]').fill('재검토 강사');
    if(!await p.locator('#makeEml').isDisabled())fail('editing after mail review did not invalidate approval');
    await p.locator('#mailReview').check();
    const [eml]=await Promise.all([p.waitForEvent('download'),p.locator('#makeEml').click()]);
    if(!eml.suggestedFilename().endsWith('.eml'))fail('EML download absent');
    const content=await readFile(await eml.path(),'utf8');
    for(const marker of ['To: receiver@example.org','multipart/mixed','multipart/alternative','Content-Disposition: attachment;',
      'Content-ID: <ekodi-instructor-photo>','X-Unsent: 1']){
      if(!content.includes(marker))fail('EML content missing '+marker);
    }
    await eml.delete().catch(()=>{});
    if(!await p.locator('#makeEml').isDisabled())fail('mail review not cleared after draft creation');
    x.checks.push('review-gated MIME email draft, photo part and no auto-send');
    await p.locator('[data-doc="syllabus"]').click();
    if(!await p.locator('#documentPreview').getByText(/4회차/).first().isVisible())fail('syllabus not presented');
    await p.locator('[data-syllabus="session1"]').fill('1회차 검증 실습');
    if(!await p.locator('#documentPreview').getByText('1회차 검증 실습').isVisible())fail('syllabus update not previewed');
    const [html]=await Promise.all([p.waitForEvent('download'),p.locator('#downloadHtml').click()]);
    const doc=await readFile(await html.path(),'utf8');
    if(!doc.includes('1회차 검증 실습')||!doc.includes('<!doctype html>'))fail('standalone syllabus HTML export incorrect');
    await html.delete().catch(()=>{});
    x.checks.push('syllabus field editor and HTML export');
    const overflow=await p.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
    if(overflow.scrollWidth>overflow.clientWidth+2)fail(profile.name+' horizontal overflow '+JSON.stringify(overflow));
    await mkdir(artifactRoot,{recursive:true});
    const name='syllabus-'+profile.name+'.png';
    await p.screenshot({path:path.join(artifactRoot,name),fullPage:true});
    x.captures.push(name);
    const observed=x.observedSecurityBlocks;
    const verification=verifyKnownSecurityBlocks({
      consoleBlocks:observed.filter(i=>i.type==='console').map(i=>({message:i.message})),
      requestBlocks:observed.filter(i=>i.type==='request').map(i=>({url:i.url,failure:i.failure})),
      mutations:x.requestsBlocked
    });
    if(!verification.ok)fail(profile.name+' security classification: '+verification.reason);
    if(x.errors.length||x.consoleErrors.length||x.requestFailures.length)
      fail(profile.name+' unexpected page / console / HTTP / network failures: '+JSON.stringify({
        errors:x.errors,consoleErrors:x.consoleErrors,requestFailures:x.requestFailures
      }).slice(0,1100));
    x.checks.push('five-width visual no-overflow and only known read-only blocked telemetry');
    x.passed=true;
  }finally{await ctx.close()}
}
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const profile of profiles)await testProfile(browser,profile);
  result.passed=true;
}catch(e){console.error(e);result.errors.push(String(e));process.exitCode=1}
finally{
  await browser?.close();
  result.finishedAt=new Date().toISOString();
  await mkdir(artifactRoot,{recursive:true});
  await writeFile(path.join(artifactRoot,'result.json'),JSON.stringify(result,null,2));
  console.log('[EKODI DOCS NATIVE]',JSON.stringify({passed:result.passed,mode:result.mode,profiles:result.profiles.map(x=>({name:x.name,passed:x.passed,checks:x.checks.length})),errors:result.errors}));
}
