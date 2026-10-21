// EKODI-owned temporary Chromium probe for Education Premium Studio (Instructor Studio, Presenter, Learner Lab).
// Read-only against the server: no account, no secrets, no external browser provider; all state stays in the
// ephemeral browser context, which is destroyed afterwards. Non-GET requests are blocked and recorded.
import fs from 'node:fs/promises';
import path from 'node:path';
import {classifyConsoleSecurityBlock,classifyRequestSecurityBlock,
  classifyMutationSecurityBlock,verifyKnownSecurityBlocks
} from './education-native-security-observations.mjs';

const wantsPreview=process.env.EKODI_EDUCATION_PREVIEW_MODE==='true';
const previewAllowed=wantsPreview&&process.env.GITHUB_EVENT_NAME==='pull_request'&&process.env.CI==='true';
if(wantsPreview&&!previewAllowed)throw new Error('Local preview is restricted to isolated CI pull requests');
const ORIGIN=previewAllowed?'http://127.0.0.1:8765':'https://ekodi.kr';
const PREFIX=previewAllowed?'':'/edu';
const COURSE='mnu-factchat-2026';
const FACTCHAT='https://mokpo.factchat.bot/dashboard/chat/40882';
const R={
  studio:PREFIX+'/study/live/?c='+COURSE,
  presenter:PREFIX+'/study/live/present/?c='+COURSE,
  audience:PREFIX+'/study/live/present/?c='+COURSE+'&view=audience',
  lab:PREFIX+'/study/live/lab/?c='+COURSE,
  entry:PREFIX+'/factchat/',
  bootcamp:PREFIX+'/study/ai-bootcamp/'
};
export const VIEWPORTS=Object.freeze([
  {name:'compact-mobile',width:320,height:640,mobile:true},
  {name:'mobile',width:390,height:844,mobile:true},
  {name:'tablet',width:768,height:1024,mobile:false},
  {name:'desktop',width:1366,height:900,mobile:false},
  {name:'large-desktop',width:1440,height:900,mobile:false},
]);
const fail=message=>{throw new Error('[EKODI EDUCATION LIVE NATIVE] '+message)};
const trim=(value,max=400)=>String(value??'').trim().slice(0,max);
const artifactRoot=path.resolve(process.env.EKODI_EDUCATION_LIVE_ARTIFACT_DIR||'artifacts/education-live-native');
const report={taskId:trim(process.env.EKODI_RELEASE_TASK_ID||'education-live-studio',150),owner:'ekodi-background-browser-worker',
  implementation:'ekodi-owned-ephemeral-chromium',sourceSha:trim(process.env.GITHUB_SHA||'unknown',80),origin:ORIGIN,
  evidenceScope:previewAllowed?'synthetic-local-preview':'real-production',readOnly:true,authenticated:false,ephemeral:true,
  startedAt:new Date().toISOString(),profiles:[],flows:[],captures:[],consoleErrors:[],pageErrors:[],httpErrors:[],requestFailures:[],
  blockedMutations:[],observedSecurityBlocks:[],notesLoadedByLearner:false,ok:false};
const record=(kind,profile,detail)=>report[kind].push({profile,...detail});

function watch(page,profile,{onRequest}={}){
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const value=trim(message.text(),850);const security=classifyConsoleSecurityBlock(value);
    record(security?'observedSecurityBlocks':'consoleErrors',profile,security?{type:'console',reason:security,message:value}:{message:value});
  });
  page.on('pageerror',error=>record('pageErrors',profile,{message:trim(error?.message)}));
  page.on('requestfailed',request=>{
    const info={url:trim(request.url(),700),failure:trim(request.failure()?.errorText,150)};
    // Navigation/teardown cancels in-flight requests (e.g. Shell assets); a cancellation is not a server failure.
    // Real failures still surface through HTTP status, console and page errors.
    if(/net::ERR_ABORTED/.test(info.failure))return;
    const security=classifyRequestSecurityBlock(info.url,info.failure);
    record(security?'observedSecurityBlocks':'requestFailures',profile,security?{type:'request',reason:security,...info}:info);
  });
  page.on('request',request=>onRequest?.(request));
  page.on('response',response=>{if(response.status()>=400)record('httpErrors',profile,{url:trim(response.url()),status:response.status()})});
}
async function guard(context,profile){
  await context.route('**/*',route=>{
    const req=route.request(),method=req.method().toUpperCase(),url=req.url();
    if(url.startsWith('https://mokpo.factchat.bot/'))return route.abort('blockedbyclient');
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      const security=classifyMutationSecurityBlock(method,url);
      record('blockedMutations',profile,{method,url:trim(url,700)});
      if(security)record('observedSecurityBlocks',profile,{type:'mutation',reason:security,method,url:trim(url,700)});
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
}
async function open(page,route){
  const response=await page.goto(ORIGIN+route,{waitUntil:'domcontentloaded',timeout:35000});
  if(!response||response.status()!==200)fail(route+' returned HTTP '+response?.status());
  if(new URL(page.url()).origin!==ORIGIN)fail('redirect escaped Education origin: '+page.url());
  await page.locator('body[data-ready="true"]').waitFor({state:'attached',timeout:20000});
  await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
}
async function overflow(page,label){
  const o=await page.evaluate(()=>({width:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  if(o.width>o.client+2)fail(label+' horizontal overflow '+JSON.stringify(o));
  return o;
}
async function shot(page,name,full=true){
  await fs.mkdir(artifactRoot,{recursive:true});
  const file=name+'.png';await page.screenshot({path:path.join(artifactRoot,file),fullPage:full});report.captures.push(file);
}

async function instructorFlow(browser,profile){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},locale:'ko-KR',acceptDownloads:true});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:ORIGIN}).catch(()=>{});
  await guard(context,profile.name);
  const flow={profile:profile.name,steps:[]};const step=s=>flow.steps.push(s);
  try{
    const studio=await context.newPage();watch(studio,profile.name);
    await open(studio,R.studio);
    await studio.locator('#sessionPicker').selectOption('1');
    if(await studio.locator('#moduleNav .nav-item').count()!==7)fail('session 1 must have 7 timeline blocks');
    step('course+session selected');
    await studio.locator('[data-view="dashboard"]').click();
    const dash=await studio.locator('#view').innerText();
    if(!dash.includes('240분')||!dash.includes('120분 = 30 + 30 + 30 + 30'))fail('dashboard does not prove 240 total / 120 practice minutes');
    if(!dash.includes('가상 수치 표시 금지'))fail('dashboard must refuse fictitious participation numbers');
    step('dashboard verifies 240min and 4x30 practice');
    await studio.locator('#moduleNav [data-module="3"]').click();
    if(!(await studio.locator('#view').innerText()).includes('HWP 문서 업무'))fail('practice module not shown');
    if(await studio.locator('#view .msec').count()!==10)fail('mission must have 10 sections');
    if(await studio.locator('#view .notes').count()<1)fail('instructor notes missing in studio');
    step('mission 10-part structure + notes');
    const presenter=await context.newPage();watch(presenter,profile.name);
    await open(presenter,R.presenter);
    await studio.bringToFront();
    await studio.locator('[data-present-module="3"]').click();
    await presenter.waitForFunction(()=>document.querySelector('#stage')?.innerText.includes('HWP 문서 업무'),null,{timeout:8000});
    step('studio → presenter slide sync');
    await studio.locator('[data-start-practice="hwp"]').click();
    await studio.waitForFunction(()=>/진행 중/.test(document.querySelector('#timerInfo')?.textContent||''),null,{timeout:5000});
    const join=await studio.locator('#joinUrl').innerText();
    if(!join.includes('m=hwp')||!/[?&]e=\d{13}/.test(join))fail('join link lacks mission/timer: '+join);
    if(await studio.locator('#joinQr svg path').count()!==1)fail('QR not rendered');
    await presenter.waitForFunction(()=>/\d\d:\d\d/.test(document.querySelector('#presTimer')?.textContent||''),null,{timeout:5000});
    step('practice timer start + QR join link');
    if((await presenter.locator('#presNotes').innerText()).trim().length<10)fail('presenter notes empty');
    const before=await presenter.locator('#presCounter').innerText();
    await presenter.bringToFront();await presenter.keyboard.press('ArrowRight');
    await studio.waitForFunction(b=>!document.querySelector('#slideNow').textContent.startsWith(b.split(' ')[0]+' /'),before,{timeout:5000});
    step('presenter keyboard → studio sync');
    await presenter.keyboard.press('b');
    await presenter.waitForFunction(()=>document.querySelector('#stage').classList.contains('is-black'),null,{timeout:3000});
    await presenter.keyboard.press('b');
    step('blackout toggle');
    const audience=await context.newPage();watch(audience,profile.name);
    await open(audience,R.audience);
    if(await audience.locator('#presSide').count()!==0)fail('audience view must not contain presenter notes');
    if(await audience.locator('.notes').count()!==0)fail('audience shows notes');
    step('audience view has no presenter notes');
    await shot(presenter,profile.name+'-presenter',false);
    await shot(audience,profile.name+'-audience',false);
    await studio.reload({waitUntil:'domcontentloaded'});await studio.locator('body[data-ready="true"]').waitFor({state:'attached'});
    if(!/진행 중|종료 5분 전|종료 1분 전/.test(await studio.locator('#timerInfo').innerText()))fail('timer not restored after refresh');
    step('refresh restores running timer');
    const [md]=await Promise.all([studio.waitForEvent('download',{timeout:10000}),studio.locator('#exportPlan').click()]);
    if(!md.suggestedFilename().endsWith('.md'))fail('lesson plan export missing');
    await md.delete().catch(()=>{});
    step('lesson plan Markdown export');
    await studio.locator('#timerReset').click().catch(()=>{});
    await shot(studio,profile.name+'-studio');
    flow.overflow=await overflow(studio,profile.name+' studio');
    report.flows.push({...flow,passed:true});
  }finally{await context.close();}
}

async function learnerFlow(browser,profile){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.mobile,hasTouch:profile.mobile,locale:'ko-KR',acceptDownloads:true});
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:ORIGIN}).catch(()=>{});
  await guard(context,profile.name);
  const flow={profile:profile.name,steps:[]};const step=s=>flow.steps.push(s);
  try{
    const page=await context.newPage();
    watch(page,profile.name,{onRequest:req=>{if(/\.notes\.js/.test(req.url()))report.notesLoadedByLearner=true;}});
    const end=Date.now()+20*60000;
    await open(page,R.lab+'&s=1&m=hwp&lv=basic&e='+end);
    if((await page.locator('.tab.is-on').innerText()).indexOf('HWP')<0)fail('QR deep link did not open HWP mission');
    const timer=await page.locator('#labTimer').innerText();
    if(!/^(19|20):\d\d$/.test(timer))fail('learner timer not synced to instructor end: '+timer);
    step('deep link + synced countdown');
    if(profile.mobile&&await page.locator('.pc-only').count()!==1)fail('mobile must show PC-only HWP notice');
    if(await page.locator('.msec').count()!==10)fail('learner mission must have 10 sections');
    await page.locator('#labTrack').selectOption('research');
    if(!(await page.locator('#labView').innerText()).includes('신진연구자'))fail('track switch did not change source');
    step('job track switch');
    const fc=page.locator('a[data-open-tool="factchat"]').first();
    if(await fc.getAttribute('href')!==FACTCHAT||await fc.getAttribute('target')!=='_blank')fail('FactChat link incorrect');
    step('official FactChat link');
    await page.locator('[data-copy="prompt-0"]').click();
    await page.waitForFunction(()=>/복사|선택/.test(document.querySelector('#toast')?.textContent||''),null,{timeout:5000}).catch(()=>fail('copy feedback missing'));
    step('prompt copy');
    const [dl]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.locator('[data-download="0"]').click()]);
    if(!dl.suggestedFilename().endsWith('.txt'))fail('material download missing');
    await dl.delete().catch(()=>{});
    step('material download');
    await page.locator('[data-crit]').first().check();
    await page.locator('textarea[data-memo]').fill('가상 실습 메모');
    await page.waitForTimeout(200);
    await page.reload({waitUntil:'domcontentloaded'});await page.locator('body[data-ready="true"]').waitFor({state:'attached'});
    await page.locator('[data-tab="m:hwp"]').click();
    if(!await page.locator('[data-crit]').first().isChecked())fail('checklist not restored after reload');
    if(await page.locator('textarea[data-memo]').inputValue()!=='가상 실습 메모')fail('memo not restored');
    step('reload / disconnect recovery');
    await page.locator('[data-tab="activity"]').click();
    await page.locator('[data-quiz="0"][data-ans="0"]').click();
    if(!(await page.locator('.quiz-q .result').first().innerText()).includes('정답'))fail('OX quiz feedback missing');
    step('OX quiz');
    await page.locator('[data-tab="record"]').click();
    const [rec]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.locator('#exportRec').click()]);
    if(!rec.suggestedFilename().endsWith('.md'))fail('record export missing');
    await rec.delete().catch(()=>{});
    step('personal record export');
    await page.locator('[data-tab="m:hwp"]').click();
    await shot(page,profile.name+'-learner');
    flow.overflow=await overflow(page,profile.name+' learner');
    const entry=await context.newPage();watch(entry,profile.name);
    const r=await entry.goto(ORIGIN+R.entry,{waitUntil:'domcontentloaded'});if(r?.status()!==200)fail('factchat entry HTTP '+r?.status());
    await overflow(entry,profile.name+' entry');
    report.flows.push({...flow,passed:true});
  }finally{await context.close();}
}

async function layoutProbe(browser,profile){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.mobile,hasTouch:profile.mobile,locale:'ko-KR'});
  await guard(context,profile.name);
  try{
    const page=await context.newPage();watch(page,profile.name);
    const result={name:profile.name,viewport:{width:profile.width,height:profile.height}};
    for(const [k,route] of [['studio',R.studio],['presenter',R.presenter],['lab',R.lab+'&s=2&m=ppt']]){
      await open(page,route);result[k]=await overflow(page,profile.name+' '+k);
    }
    const legacy=await page.goto(ORIGIN+R.bootcamp,{waitUntil:'domcontentloaded'});
    if(legacy?.status()!==200)fail('existing 4x6 bootcamp classroom regression HTTP '+legacy?.status());
    await page.locator('.course-cards .lesson-card').first().waitFor({timeout:15000});
    if(await page.locator('.course-cards .lesson-card').count()!==4)fail('existing bootcamp lost its 4 lessons');
    if(await page.locator('#batchPicker option').count()!==6)fail('existing bootcamp lost its 6 batches');
    result.bootcampRegression='4 lessons / 6 batches intact';
    const known=report.observedSecurityBlocks.filter(x=>x.profile===profile.name);
    const sec=verifyKnownSecurityBlocks({consoleBlocks:known.filter(x=>x.type==='console').map(x=>({message:x.message})),
      requestBlocks:known.filter(x=>x.type==='request').map(x=>({url:x.url,failure:x.failure})),mutations:report.blockedMutations.filter(x=>x.profile===profile.name)});
    if(!sec.ok)fail(profile.name+' '+sec.reason);
    for(const kind of ['requestFailures','pageErrors','consoleErrors','httpErrors'])
      if(report[kind].some(x=>x.profile===profile.name))fail(kind+' on '+profile.name+': '+JSON.stringify(report[kind].filter(x=>x.profile===profile.name).slice(0,3)));
    report.profiles.push({...result,passed:true});
  }finally{await context.close();}
}

async function main(){
  const {chromium}=await import('playwright');
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    for(const profile of VIEWPORTS){
      if(profile.width>=1366)await instructorFlow(browser,profile);
      if(profile.width===320||profile.width===390||profile.width===1366)await learnerFlow(browser,profile);
      await layoutProbe(browser,profile);
    }
    if(report.notesLoadedByLearner)fail('Learner Lab requested instructor notes');
    report.ok=true;
  }catch(error){
    report.error=trim(error?.message||error,1100);
    // Surface the reason as a GitHub annotation (readable without downloading logs/artifacts).
    const esc=v=>String(v).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
    const extra=['consoleErrors','pageErrors','httpErrors','requestFailures'].map(k=>k+'='+JSON.stringify(report[k].slice(0,3))).join(' ');
    console.log('::error title=EKODI Education Live probe::'+esc(report.error+' | '+extra).slice(0,3500));
    throw error;
  }
  finally{
    await browser?.close();report.finishedAt=new Date().toISOString();
    await fs.mkdir(artifactRoot,{recursive:true});
    await fs.writeFile(path.join(artifactRoot,'result.json'),JSON.stringify(report,null,2));
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error);process.exitCode=1});
}
