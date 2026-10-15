// EKODI-owned, read-only Chromium acceptance for the Education material studio.
// No external browser provider, user profile persistence or server-side file upload.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {EKODI_SERVICE_MANIFEST} from '../ekodi-service-manifest.js';
import {classifyConsoleSecurityBlock,classifyRequestSecurityBlock,
  classifyMutationSecurityBlock,verifyKnownSecurityBlocks
} from './education-native-security-observations.mjs';

const registered=new URL(EKODI_SERVICE_MANIFEST.services.find(s=>s.id==='edu').url).origin;
const isPreview=process.env.EKODI_EDUCATION_PREVIEW_MODE==='true';
if(isPreview&&(process.env.CI!=='true'||process.env.GITHUB_EVENT_NAME!=='pull_request')){
  throw new Error('Only read-only pull-request CI may request local preview');
}
const host=isPreview?'http://127.0.0.1:8765':'https://ekodi.kr';
const route=isPreview?'/study/ai-bootcamp/studio/':'/edu/study/ai-bootcamp/studio/';
const profiles=[
  {name:'mobile-320',viewport:{width:320,height:680},isMobile:true},
  {name:'mobile-390',viewport:{width:390,height:844},isMobile:true},
  {name:'tablet-768',viewport:{width:768,height:1024},isMobile:false},
  {name:'desktop-1366',viewport:{width:1366,height:900},isMobile:false},
  {name:'desktop-1440',viewport:{width:1440,height:900},isMobile:false},
];
const folder=path.resolve('artifacts/education-studio-native');
const report={source:process.env.GITHUB_SHA||null,scope:isPreview?'local-preview':'registered-education-production',
  started:new Date().toISOString(),url:host+route,readOnly:true,profiles:[],errors:[],ok:false};
function fail(message){throw new Error('[EKODI MATERIAL STUDIO] '+message)}
async function check(browser,profile){
  const ctx=await browser.newContext({...profile,acceptDownloads:true,locale:'ko-KR'});
  const p=await ctx.newPage();
  const entry={name:profile.name,passed:false,screenshots:[],checks:[],consoleErrors:[],requestsBlocked:[],requestFailures:[],observedSecurityBlocks:[]};
  report.profiles.push(entry);
  p.on('pageerror',e=>entry.consoleErrors.push('pageerror: '+e.message));
  p.on('console',msg=>{
    if(msg.type()!=='error')return;
    const message=msg.text();
    const expected=classifyConsoleSecurityBlock(message);
    if(expected)entry.observedSecurityBlocks.push({type:'console',reason:expected,message});
    else entry.consoleErrors.push(message);
  });
  p.on('requestfailed',req=>{
    const info={url:req.url(),failure:req.failure()?.errorText||''};
    const expected=classifyRequestSecurityBlock(info.url,info.failure);
    if(expected)entry.observedSecurityBlocks.push({type:'request',reason:expected,...info});
    else entry.requestFailures.push(info);
  });
  p.on('response',res=>{if(res.status()>=400)entry.consoleErrors.push('HTTP '+res.status()+' '+res.url())});
  await p.route('**/*',r=>{
    const method=r.request().method();
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      const address=r.request().url();
      entry.requestsBlocked.push({method,url:address});
      const expected=classifyMutationSecurityBlock(method,address);
      if(expected)entry.observedSecurityBlocks.push({type:'mutation',reason:expected,method,url:address});
      return r.abort('blockedbyclient');
    }
    return r.continue();
  });
  try{
    // In production both the canonical apex and legacy worker must remain usable.
    // The apex /edu alias requires a separately guarded shared-site release.
    if(!isPreview){
      const legacy=await p.request.get(registered+'/study/ai-bootcamp/studio/',{timeout:15000});
      if(legacy.status()!==200)fail('registered legacy Education studio not reachable');
      entry.checks.push('legacy Education worker preserved');
    }
    const response=await p.goto(host+route,{waitUntil:'networkidle',timeout:45000});
    if(!response||response.status()!==200)fail(profile.name+' studio HTTP '+response?.status());
    await p.locator('h1').getByText('강의자료 편집 스튜디오').waitFor({timeout:15000});
    const baseline=await p.locator('[data-field="title"]').inputValue();
    if(!baseline.includes('AI 리터러시'))fail('original lesson title not loaded');
    const targets=await p.locator('#studioLesson option').count();
    if(targets!==4||await p.locator('#studioBatch option').count()!==6)fail('4 lesson × 6 group selectors missing');
    entry.checks.push('4 lessons × 6 cohorts');
    await p.locator('[data-field="title"]').fill('사전 검증용 강의 제목');
    if(!await p.locator('#localPreview').getByText('사전 검증용 강의 제목').isVisible())fail('edited lesson not shown in preview');
    await p.locator('#studioLesson').selectOption('2');
    if(await p.locator('[data-field="title"]').inputValue()==='사전 검증용 강의 제목')fail('cohort/session data bleed');
    await p.locator('#studioLesson').selectOption('1');
    if(await p.locator('[data-field="title"]').inputValue()!=='사전 검증용 강의 제목')fail('in-memory edits lost');
    entry.checks.push('per-lesson draft isolation & preview');
    await p.locator('#materialFile').setInputFiles({
      name:'safe-practice.txt',mimeType:'text/plain',
      buffer:Buffer.from('가상 교육 실습 원문입니다. 공식 출처와 원문을 확인합니다.','utf8')
    });
    await p.waitForFunction(()=>(document.querySelector('#sourceExtracted')?.value||'').includes('가상 교육 실습 원문'),null,{timeout:15000});
    await p.locator('#sourceTarget').selectOption('sample');
    await p.locator('#applySource').click();
    await p.locator('[data-preview-tab="practice"]').click();
    if(!await p.locator('#localPreview').getByText(/가상 교육 실습 원문/).isVisible())fail('source not reflected into practice preview');
    entry.checks.push('local file import & practice adaptation');
    await p.locator('#sourceExtracted').fill('연락처 010-1234-5678');
    await p.locator('#applySource').click();
    if(!await p.locator('#sourceState').innerText().then(v=>v.includes('자동 반영 차단')))fail('sensitive data blocking missing');
    entry.checks.push('sensitive-data suspected-pattern blocking');
    await p.locator('[data-preview-tab="slides"]').click();
    if(await p.locator('#localPreview .slidecard').count()!==9)fail('exact nine slide previews missing');
    entry.checks.push('nine-slide lecturer preview');
    await p.locator('#presentDraft').click();
    if(!await p.locator('#studioPresentation').evaluate(el=>el.open))fail('draft presentation did not open');
    if(await p.locator('#studioSlideCounter').innerText()!=='01 / 09')fail('presentation initial counter incorrect');
    for(let i=2;i<=9;i++)await p.keyboard.press('ArrowRight');
    if(await p.locator('#studioSlideCounter').innerText()!=='09 / 09')fail('presentation did not reach slide nine');
    await p.locator('#studioSlideClose').click();
    if(await p.locator('#studioPresentation').evaluate(el=>el.open))fail('draft presentation did not close');
    entry.checks.push('draft-based interactive nine-screen lecture presentation');
    await p.locator('#reviewConfirm').check();
    if(await p.locator('#exportDraft').isDisabled())fail('valid draft with instructor review should enable JSON download');
    const [download]=await Promise.all([p.waitForEvent('download'),p.locator('#exportDraft').click()]);
    if(!download.suggestedFilename().endsWith('_draft.json'))fail('draft file name unexpected');
    const downloaded=await download.path();
    if(!downloaded)fail('JSON download did not complete');
    const content=JSON.parse(await (await import('node:fs/promises')).readFile(downloaded,'utf8'));
    if(content.reviewed!==false||content.fields.title!=='사전 검증용 강의 제목')fail('draft review/edits not preserved safely');
    entry.checks.push('review-gated JSON export, never marked published');
    const overflow=await p.evaluate(()=>({
      scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth
    }));
    if(overflow.scroll>overflow.client+2)fail(profile.name+' horizontally overflows '+JSON.stringify(overflow));
    await mkdir(folder,{recursive:true});
    const filename=profile.name+'.png';
    await p.screenshot({path:path.join(folder,filename),fullPage:true});
    entry.screenshots.push(filename);
    entry.checks.push('responsive no-overflow screenshot');
    const observed=entry.observedSecurityBlocks;
    const verification=verifyKnownSecurityBlocks({
      consoleBlocks:observed.filter(x=>x.type==='console').map(x=>({message:x.message})),
      requestBlocks:observed.filter(x=>x.type==='request').map(x=>({url:x.url,failure:x.failure})),
      mutations:entry.requestsBlocked
    });
    if(!verification.ok)fail(profile.name+' '+verification.reason);
    if(entry.consoleErrors.length||entry.requestFailures.length)
      fail(profile.name+' unexpected browser script, console or network errors');
    entry.passed=true;
  }finally{await ctx.close()}
}
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const profile of profiles)await check(browser,profile);
  report.ok=true;
}catch(error){report.errors.push(error?.message||String(error));process.exitCode=1;console.error(error)}
finally{
  await browser?.close();
  report.finished=new Date().toISOString();
  await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'result.json'),JSON.stringify(report,null,2));
  console.log('EKODI academic studio native verification',JSON.stringify({ok:report.ok,scope:report.scope,profiles:report.profiles.map(p=>({name:p.name,passed:p.passed,checks:p.checks.length})),errors:report.errors}));
}
