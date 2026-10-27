// EKODI-owned temporary Chromium probe for Education Premium Studio (Instructor Studio, Presenter, Learner Lab).
// Read-only against the server: no account, no stored secrets, no external browser provider; all state stays in the
// ephemeral browser context, which is destroyed afterwards. Non-GET requests are blocked and recorded.
import fs from 'node:fs/promises';
import path from 'node:path';
import {classifyConsoleSecurityBlock,classifyRequestSecurityBlock,
  classifyMutationSecurityBlock,verifyKnownSecurityBlocks,observeCloudflareJsDetections
} from './education-native-security-observations.mjs';
import {mintGateToken,GATE_COOKIE} from '../education-instructor-gate.js';

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
  startedAt:new Date().toISOString(),profiles:[],flows:[],captures:[],rateLimited:[],consoleErrors:[],pageErrors:[],httpErrors:[],requestFailures:[],externalMediaWarnings:[],
  blockedMutations:[],observedSecurityBlocks:[],notesLoadedByLearner:false,ok:false};
const record=(kind,profile,detail)=>report[kind].push({profile,...detail});
// Instructor gallery stills (YouTube) and mood-slide photos (Unsplash) come from third-party image CDNs.
// so a failure there is evidence (externalMediaWarnings), not a release blocker. Everything else stays strict.
const EXTERNAL_MEDIA=/^https:\/\/(i\.ytimg\.com|images\.unsplash\.com)\//;

function watch(page,profile,{onRequest}={}){
  page.on('console',message=>{
    if(message.type()!=='error')return;
    const value=trim(message.text(),850);
    if(EXTERNAL_MEDIA.test(message.location()?.url||'')){record('externalMediaWarnings',profile,{type:'console',url:trim(message.location().url),message:value});return;}
    if(/status of 429\b/.test(value)){record('rateLimited',profile,{type:'console',message:value});return;}
    const security=classifyConsoleSecurityBlock(value);
    record(security?'observedSecurityBlocks':'consoleErrors',profile,security?{type:'console',reason:security,message:value}:{message:value});
  });
  page.on('pageerror',error=>record('pageErrors',profile,{message:trim(error?.message)}));
  page.on('requestfailed',request=>{
    const info={url:trim(request.url(),700),failure:trim(request.failure()?.errorText,150)};
    // Navigation/teardown cancels in-flight requests (e.g. Shell assets); a cancellation is not a server failure.
    // Real failures still surface through HTTP status, console and page errors.
    if(/net::ERR_ABORTED/.test(info.failure))return;
    if(EXTERNAL_MEDIA.test(request.url())){record('externalMediaWarnings',profile,{type:'request',...info});return;}
    const security=classifyRequestSecurityBlock(info.url,info.failure);
    record(security?'observedSecurityBlocks':'requestFailures',profile,security?{type:'request',reason:security,...info}:info);
  });
  page.on('request',request=>onRequest?.(request));
  page.on('response',response=>{
    const status=response.status();
    if(status===429){page.__ekodiRateLimited=Number(response.headers()['retry-after'])||60;record('rateLimited',profile,{url:trim(response.url()),status});return;}
    if(status>=400&&EXTERNAL_MEDIA.test(response.url())){record('externalMediaWarnings',profile,{url:trim(response.url()),status});return;}
    if(status>=400)record('httpErrors',profile,{url:trim(response.url()),status});
  });
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
// Instructor surfaces are password-gated. The release workflow rotates EDU_GATE_SIGNING_KEY and hands it to
// this step only (masked), so the probe mints its own short-lived instructor session: no password is stored.
async function authorize(context){
  const key=process.env.EDU_GATE_SIGNING_KEY||'';
  if(key.length<32)fail('EDU_GATE_SIGNING_KEY is not available to the probe; instructor surfaces cannot be verified');
  const origin=new URL(ORIGIN);
  await context.addCookies([{name:GATE_COOKIE,value:await mintGateToken(key),domain:origin.hostname,path:(PREFIX||'')+'/study/live',httpOnly:true,secure:origin.protocol==='https:',sameSite:'Lax'}]);
}
// Instructor decision 2026-10-25: only the instructor notes (talk track + answer keys) are password-protected.
// The studio and presenter open without a password and show a locked notes panel until the instructor unlocks
// the notes at /study/live/unlock/. Open mode (no instructor-chosen password) serves the notes as well.
const NOTES_ASSET='/study/live/courses/'+COURSE+'.notes.js';
async function deployedGateMode(context){
  const r=await context.request.get(ORIGIN+PREFIX+NOTES_ASSET,{failOnStatusCode:false,maxRedirects:0});
  if(r.status()===200)return 'open';
  if(r.status()===401)return 'locked';
  fail('instructor notes answered '+r.status()+' without a session (expected 200 open or 401 locked)');
}
async function gateProbe(browser){
  const context=await browser.newContext({locale:'ko-KR'});
  observeCloudflareJsDetections(context);
  await guard(context,'gate');
  try{
    const page=await context.newPage();
    const result={};
    const mode=await deployedGateMode(context);
    result.mode=mode;
    for(const [k,route,sel] of [['studio',R.studio,'#view [data-notes-locked]'],['presenter',R.presenter,'#presNotes [data-notes-locked]']]){
      const r=await page.goto(ORIGIN+route,{waitUntil:'domcontentloaded',timeout:35000});
      result[k]=r?.status();
      if(r?.status()!==200)fail(k+' must open without a password, got '+r?.status());
      await page.locator('body[data-ready="true"]').waitFor({state:'attached',timeout:30000}).catch(()=>fail(k+' did not finish loading without a password'));
      if(await page.locator('input[type="password"]').count()!==0)fail(k+' still shows a password form');
      const lockedPanel=await page.locator(sel).count();
      result[k+'NotesLocked']=lockedPanel>0;
      if(mode==='locked'&&!lockedPanel)fail(k+' must show the locked-notes panel without a session');
      if(mode==='open'&&lockedPanel)fail(k+' shows locked notes although notes are open');
    }
    if(mode==='locked'){
      const notes=await context.request.get(ORIGIN+PREFIX+NOTES_ASSET,{failOnStatusCode:false,maxRedirects:0});
      if(/talk|answer/.test(await notes.text()))fail('notes leaked content without a session');
      const r=await page.goto(ORIGIN+PREFIX+'/study/live/unlock/?c='+encodeURIComponent(COURSE)+'&back=present',{waitUntil:'domcontentloaded',timeout:35000});
      result.unlock=r?.status();
      if(r?.status()!==401)fail('unlock page must ask for the password (401), got '+r?.status());
      if(await page.locator('input[type="password"][name="password"]').count()!==1)fail('unlock page lacks the password field');
      if(!(await page.locator('#gateTitle').innerText()).includes('강사 노트 열기'))fail('unlock page title is not 「강사 노트 열기」');
    }
    const lab=await context.request.get(ORIGIN+R.lab,{failOnStatusCode:false});
    result.lab=lab.status();
    if(lab.status()!==200)fail('learner lab must stay public, got '+lab.status());
    if(!/frame-ancestors 'self'/.test(lab.headers()['content-security-policy']||''))fail('learner lab must be frameable by the same-origin presenter only');
    report.gate={...result,passed:true};
  }finally{await context.close();}
}
async function open(page,route,{ready=true}={}){
  // Production traffic protection may answer a burst of headless requests with 429 + Retry-After.
  // Respect it (never bypass), reload, and fail if the page still is not ready after two retries.
  for(let attempt=0;;attempt++){
    page.__ekodiRateLimited=0;
    const response=await page.goto(ORIGIN+route,{waitUntil:'domcontentloaded',timeout:35000});
    const status=response?.status();
    let ok=status===200;
    if(ok&&new URL(page.url()).origin!==ORIGIN)fail('redirect escaped Education origin: '+page.url());
    if(ok&&ready)ok=await page.locator('body[data-ready="true"]').waitFor({state:'attached',timeout:20000}).then(()=>true,()=>false);
    if(ok)break;
    const wait=status===429?(Number(response.headers()['retry-after'])||60):page.__ekodiRateLimited;
    if(!wait||attempt>=2)fail(route+(status!==200?' returned HTTP '+status:' did not become ready')+(page.__ekodiRateLimited?' after rate limiting':''));
    report.rateLimitRetries=(report.rateLimitRetries||0)+1;
    await page.waitForTimeout(Math.min(Math.max(wait,5),65)*1000);
  }
  await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
}
// A refresh is a new navigation: it gets the same 429/Retry-After handling as the first visit.
async function reopen(page){
  const url=page.url();
  if(!url.startsWith(ORIGIN))fail('cannot refresh outside the Education origin: '+url);
  await open(page,url.slice(ORIGIN.length));
}
async function overflow(page,label){
  const o=await page.evaluate(()=>({width:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  if(o.width>o.client+2)fail(label+' horizontal overflow '+JSON.stringify(o));
  return o;
}
// Sticky top bar must stay compact, sit at the top while scrolling, never cover content, and the bottom dock
// must never hide the end of the page. Also confirms the self-hosted Pretendard font is in use.
async function chromeCheck(page,label,{mobile=false,dock=false}={}){
  const r=await page.evaluate(async({dock})=>{
    await document.fonts.ready;
    const top=document.querySelector('.lv-top');const h=top?Math.round(top.getBoundingClientRect().height):0;
    window.scrollTo(0,600);await new Promise(r=>setTimeout(r,250));
    const t=top?top.getBoundingClientRect():{top:-1,bottom:0};
    const probeY=Math.ceil(t.bottom)+4;const under=document.elementFromPoint(Math.floor(innerWidth/2),probeY);
    const covered=!!(under&&top&&top.contains(under));
    window.scrollTo(0,document.documentElement.scrollHeight);await new Promise(r=>setTimeout(r,250));
    let hidden=false;
    if(dock){const d=document.querySelector('.dock');const main=document.querySelector('main');const last=main?.lastElementChild;
      if(d&&last)hidden=last.getBoundingClientRect().bottom>d.getBoundingClientRect().top+1;}
    window.scrollTo(0,0);
    return {h,stickyTop:Math.round(t.top),covered,hidden,font:document.fonts.check('16px "Pretendard Variable"'),family:getComputedStyle(document.body).fontFamily.slice(0,30)};
  },{dock});
  if(!r.font||!/Pretendard/.test(r.family))fail(label+' Pretendard font not active '+JSON.stringify(r));
  if(r.h>(mobile?72:80))fail(label+' top bar too tall '+r.h+'px');
  if(r.stickyTop!==0)fail(label+' top bar not pinned while scrolling '+JSON.stringify(r));
  if(r.covered)fail(label+' content hidden under top bar');
  if(r.hidden)fail(label+' page end hidden under bottom dock');
  return r;
}
async function shot(page,name,full=true){
  await fs.mkdir(artifactRoot,{recursive:true});
  const file=name+'.png';await page.screenshot({path:path.join(artifactRoot,file),fullPage:full});report.captures.push(file);
}

async function instructorFlow(browser,profile){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},locale:'ko-KR',acceptDownloads:true});
  observeCloudflareJsDetections(context);
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:ORIGIN}).catch(()=>{});
  await guard(context,profile.name);
  await authorize(context);
  const flow={profile:profile.name,steps:[]};const step=s=>{flow.steps.push(s);report.lastSteps=[profile.name,...flow.steps.slice(-3)];};
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
    // A practice module may open with a photo mood slide before its title slide.
    await presenter.waitForFunction(()=>{const st=document.querySelector('#stage');return !!st&&(st.innerText.includes('HWP 문서 업무')||!!st.querySelector('.slide-mood'));},null,{timeout:8000})
      .catch(()=>fail('studio → presenter did not show the practice module'));
    step('studio → presenter slide sync');
    await studio.locator('[data-start-practice="hwp"]').click();
    await studio.waitForFunction(()=>/진행 중/.test(document.querySelector('#timerInfo')?.textContent||''),null,{timeout:5000});
    const join=await studio.locator('#joinUrl').innerText();
    if(!join.includes('m=hwp')||!/[?&]e=\d{13}/.test(join))fail('join link lacks mission/timer: '+join);
    if(await studio.locator('#joinQr svg > path').count()!==1||await studio.locator('#joinQr svg rect path').count()!==0)fail('QR not rendered as a top-level SVG path');
    await presenter.waitForFunction(()=>/\d\d:\d\d/.test(document.querySelector('#presTimer')?.textContent||''),null,{timeout:5000});
    step('practice timer start + QR join link');
    if((await presenter.locator('#presNotes').innerText()).trim().length<10)fail('presenter notes empty');
    const before=await presenter.locator('#presCounter').innerText();
    await presenter.bringToFront();await presenter.keyboard.press('ArrowRight');
    await studio.waitForFunction(b=>!document.querySelector('#slideNow').textContent.startsWith(b.split(' ')[0]+' /'),before,{timeout:5000});
    step('presenter keyboard → studio sync');
    const stage=await presenter.evaluate(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),vw:innerWidth};});
    if(stage.w<stage.vw*0.45||stage.h<200)fail('presenter slide stage collapsed '+JSON.stringify(stage));
    step('presenter slide stage visible');
    await presenter.keyboard.press('b');
    await presenter.waitForFunction(()=>document.querySelector('#stage').classList.contains('is-black'),null,{timeout:3000});
    await presenter.keyboard.press('b');
    step('blackout toggle');
    const audience=await context.newPage();watch(audience,profile.name);
    await open(audience,R.audience);
    if(await audience.locator('#presSide').count()!==0)fail('audience view must not contain presenter notes');
    if(await audience.locator('.notes').count()!==0)fail('audience shows notes');
    const aStage=await audience.evaluate(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),fit:Math.round(Math.min(innerWidth,innerHeight*16/9))};});
    if(aStage.w<aStage.fit*0.9)fail('audience slide not filling the screen '+JSON.stringify(aStage));
    step('audience view has no presenter notes');
    // Stage switching: 2 = learner lab demo, 3 = lecture + lab side by side, 1 = back to the lecture.
    // The audience window follows through the shared live state.
    if(await presenter.locator('#pFactchat').count()!==1)fail('presenter lacks the FactChat switch');
    const frameReady=async(page,label)=>{
      await page.locator('#stage iframe.stage-embed').waitFor({state:'attached',timeout:8000}).catch(()=>fail(label+': lab iframe missing'));
      await page.frameLocator('#stage iframe.stage-embed').locator('body[data-ready="true"]').waitFor({state:'attached',timeout:25000}).catch(()=>fail(label+': embedded lab did not load (framing blocked?)'));
      return page.evaluate(()=>{const f=document.querySelector('#stage iframe.stage-embed').getBoundingClientRect(),s=document.querySelector('#stage').getBoundingClientRect();return {fw:Math.round(f.width),fh:Math.round(f.height),sw:Math.round(s.width),sh:Math.round(s.height)};});
    };
    await presenter.bringToFront();await presenter.keyboard.press('2');
    const pLab=await frameReady(presenter,'presenter lab');
    if(pLab.fw<pLab.sw*0.9||pLab.fh<pLab.sh*0.9)fail('lab demo does not fill the stage '+JSON.stringify(pLab));
    const aLab=await frameReady(audience,'audience lab');
    if(aLab.fw<aLab.sw*0.9||aLab.fh<200)fail('audience lab demo too small '+JSON.stringify(aLab));
    if(await presenter.frameLocator('#stage iframe.stage-embed').locator('header.ekodi-user-ui-header:visible').count()!==0)fail('embedded lab must not show the shared header');
    step('stage: lecture → learner lab (presenter + audience)');
    await presenter.keyboard.press('3');
    await presenter.locator('#stage .stage-split .split-slide .slide').waitFor({timeout:5000}).catch(()=>fail('split view lacks the slide'));
    await audience.locator('#stage .stage-split .split-slide .slide').waitFor({timeout:5000}).catch(()=>fail('audience split view lacks the slide'));
    await frameReady(audience,'audience split');
    await shot(presenter,profile.name+'-presenter-split',false);
    step('stage: lecture + lab side by side');
    await presenter.keyboard.press('1');
    await audience.waitForFunction(()=>!document.querySelector('#stage iframe')&&document.querySelector('#stage .slide'),null,{timeout:5000}).catch(()=>fail('audience did not return to the lecture slide'));
    step('stage: back to lecture');
    // AI demo card: institutional FactChat runs only after Super Administrator sign-in (no credentials here).
    if(await presenter.locator('#aiCard').count()!==1)fail('presenter lacks the AI demo card');
    if(!(await presenter.locator('#aiRun').isDisabled()))fail('AI run must stay disabled without an admin session');
    if(ORIGIN==='https://ekodi.kr'){
      const href=await presenter.locator('#aiLogin').getAttribute('href')||'';
      const u=href?new URL(href):null;
      if(!u||u.origin+u.pathname!=='https://ekodi.kr/auth/'||u.searchParams.get('site')!=='admin'||!/^https:\/\/ekodi\.kr\/edu\/study\/live\/present\//.test(u.searchParams.get('return_to')||''))fail('AI demo login link incorrect: '+href);
    }
    await presenter.keyboard.press('4');
    await audience.locator('#stage .slide-ai').waitFor({timeout:5000}).catch(()=>fail('audience did not switch to the AI result stage'));
    await presenter.keyboard.press('1');
    await audience.waitForFunction(()=>!document.querySelector('#stage .slide-ai'),null,{timeout:5000}).catch(()=>fail('audience did not leave the AI stage'));
    step('AI demo card gated by admin sign-in; AI stage mirrors to audience');
    // 「정답 공개」: the studio reveals the review answer on the presenter + audience stage; A hides it.
    await studio.bringToFront();
    await studio.locator('#moduleNav [data-module="6"]').click();
    await studio.locator('#view [data-answer-toggle="s1-review"]').first().click().catch(()=>fail('studio lacks the 「정답 공개」 button on the review step'));
    await audience.locator('#stage .answer-reveal').waitFor({timeout:6000}).catch(()=>fail('audience did not show the revealed answer'));
    if(!(await audience.locator('#stage .answer-reveal').innerText()).includes('보류'))fail('revealed answer text mismatch');
    await presenter.locator('#pAnswer[aria-pressed="true"]').waitFor({timeout:5000}).catch(()=>fail('presenter answer button did not reflect the reveal'));
    await audience.waitForTimeout(500);
    await shot(audience,profile.name+'-audience-answer',false);
    await presenter.bringToFront();await presenter.keyboard.press('a');
    await audience.waitForFunction(()=>!document.querySelector('#stage .answer-reveal'),null,{timeout:5000}).catch(()=>fail('A key did not hide the answer'));
    step('answer reveal: studio → audience, A hides');
    await shot(presenter,profile.name+'-presenter',false);
    await shot(audience,profile.name+'-audience',false);
    await reopen(studio);
    if(!/진행 중|종료 5분 전|종료 1분 전/.test(await studio.locator('#timerInfo').innerText()))fail('timer not restored after refresh');
    step('refresh restores running timer');
    const [md]=await Promise.all([studio.waitForEvent('download',{timeout:10000}),studio.locator('#exportPlan').click()]);
    if(!md.suggestedFilename().endsWith('.md'))fail('lesson plan export missing');
    await md.delete().catch(()=>{});
    step('lesson plan Markdown export');
    // Learner handout: lecture content only (practice materials excluded), printable and downloadable.
    const handoutHref=await studio.locator('#openHandout').getAttribute('href')||'';
    if(!/\/study\/live\/handout\/\?c=/.test(handoutHref))fail('studio handout link incorrect: '+handoutHref);
    const handout=await context.newPage();watch(handout,profile.name);
    await open(handout,new URL(handoutHref,ORIGIN+'/').href.replace(ORIGIN,''));
    await handout.locator('#hoSession').selectOption('all');
    if(await handout.locator('#handout .ho-module').count()<8)fail('handout lacks lecture modules');
    const hoText=await handout.locator('#handout').innerText();
    if(/\[가상 AI 요약|프롬프트 ①|가상 원문/.test(hoText))fail('handout leaked practice material');
    const [hoFile]=await Promise.all([handout.waitForEvent('download',{timeout:10000}),handout.locator('#hoDownload').click()]);
    if(!hoFile.suggestedFilename().endsWith('.html'))fail('handout download missing');
    await hoFile.delete().catch(()=>{});
    await handout.close();
    step('learner handout (lecture only) renders and downloads');
    await studio.locator('#timerReset').click().catch(()=>{});
    await shot(studio,profile.name+'-studio');
    flow.overflow=await overflow(studio,profile.name+' studio');
    report.flows.push({...flow,passed:true});
  }finally{await context.close();}
}

async function learnerFlow(browser,profile){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.mobile,hasTouch:profile.mobile,locale:'ko-KR',acceptDownloads:true});
  observeCloudflareJsDetections(context);
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:ORIGIN}).catch(()=>{});
  await guard(context,profile.name);
  const flow={profile:profile.name,steps:[]};const step=s=>{flow.steps.push(s);report.lastSteps=[profile.name,...flow.steps.slice(-3)];};
  try{
    const page=await context.newPage();
    watch(page,profile.name,{onRequest:req=>{if(/\.notes\.js/.test(req.url()))report.notesLoadedByLearner=true;}});
    // Session 2 stays closed until session 1's practices are done (or the instructor's QR opens it).
    await open(page,R.lab+'&s=2');
    if(await page.locator('#labView .lock-panel').count()!==1)fail('session 2 must be locked before session 1 practice is finished');
    if(!(await page.locator('#labTabsWrap').isHidden()))fail('locked session must not expose its practice menu');
    step('session 2 locked until session 1 is done');
    const end=Date.now()+20*60000;
    await open(page,R.lab+'&s=1&m=hwp&lv=basic&e='+end);
    if((await page.locator('.tab.is-on').innerText()).indexOf('HWP')<0)fail('QR deep link did not open HWP mission');
    const timer=await page.locator('#labTimer').innerText();
    if(!/^(19|20):\d\d$/.test(timer))fail('learner timer not synced to instructor end: '+timer);
    step('deep link + synced countdown');
    // After the shared basics, everyone practises at the same time in their own field: a first-time learner
    // arriving from the QR picks a field before the mission opens.
    if(await page.locator('#labView .pick-tile').count()!==7)fail('practice must open with the 7-field picker for a first-time learner');
    if(!(await page.locator('#dockAction').isDisabled()))fail('dock must wait for the field choice');
    await page.locator('#labView [data-pick-track="academic"]').click();
    if(!(await page.locator('#labView').innerText()).includes('수강'))fail('picked field did not load its source');
    step('field picker at practice start');
    if(profile.mobile&&await page.locator('.pc-only').count()!==1)fail('mobile must show PC-only HWP notice');
    if(await page.locator('#labView [data-step-sec]').count()!==6)fail('learner mission must show its 6 steps as sections');
    if(await page.locator('text=전체 안내 보기').count()!==0)fail('the long reference block must be gone');
    if(await page.locator('#labSubnav [data-sec-go]').count()!==6)fail('sticky detailed order must list the 6 steps');
    // Compact settings: one summary line that opens to field, role and level.
    await page.locator('#labSettings > summary').click();
    await page.locator('#labTrack').selectOption('research');
    if(!(await page.locator('#labView').innerText()).includes('신진연구자'))fail('track switch did not change source');
    if(await page.locator('#labRole option').count()!==4)fail('role select must offer 전체 + 3 roles');
    await page.locator('#labRole').selectOption({index:2});
    if(!/연구·산학협력 · /.test(await page.locator('#setSummary').innerText()))fail('settings summary lacks the chosen role');
    if(await page.locator('#labLevel option').count()!==5)fail('5 levels expected');
    await page.locator('#labSettings > summary').click();
    step('field / role / level settings');
    const fc=page.locator('a[data-open-tool="factchat"]').first();
    if(await fc.getAttribute('href')!==FACTCHAT||await fc.getAttribute('target')!=='_blank')fail('FactChat link incorrect');
    step('official FactChat link');
    // Material opens on screen (no download) with copy and copy-and-open-FactChat.
    await page.locator('#sec-step-0 [data-view-material="0"]').click();
    await page.locator('#matSheet:not([hidden])').waitFor({timeout:5000}).catch(()=>fail('material sheet did not open'));
    if(!(await page.locator('#matText').innerText()).includes('신진연구자'))fail('material sheet shows the wrong text');
    if(await page.locator('#matSheet [data-sheet-copy-open]').count()!==1)fail('material sheet lacks copy-and-open FactChat');
    await page.locator('#matSheet [data-sheet-copy]').click();
    await page.waitForFunction(()=>/복사|선택/.test(document.querySelector('#toast')?.textContent||''),null,{timeout:5000}).catch(()=>fail('material copy feedback missing'));
    await page.locator('#matSheet [data-sheet-close]').click();
    if(!(await page.locator('#matSheet').isHidden()))fail('material sheet did not close');
    step('material view + copy on screen');
    // Adjustable timer: the instructor's end time can be moved by the learner.
    const t0=await page.locator('#labTimer').innerText();
    await page.locator('[data-timer-add="60000"]').click();
    const t1=await page.locator('#labTimer').innerText();
    const secs=t=>{const [m,s2]=t.split(':').map(Number);return m*60+s2;};
    if(Math.abs(secs(t1)-secs(t0)-60)>3)fail('timer +1분 did not move the end time '+t0+' → '+t1);
    step('adjustable timer');
    // Guided practice: dock advances 준비 → FactChat 열기 → 프롬프트 ①
    const dockState=()=>page.evaluate(()=>{const a=document.querySelector('#dockAction');const r=a?.getBoundingClientRect();
      const hit=r?document.elementFromPoint(r.left+r.width/2,r.top+r.height/2):null;
      return {label:document.querySelector('#dockLabel')?.innerText.replace(/\s+/g,' ').slice(0,80),mode:a?.dataset.mode,text:a?.textContent,
        hit:hit?(hit.id||hit.tagName)+'.'+String(hit.className).slice(0,40):'none',tab:document.querySelector('.tab.is-on')?.textContent,vh:innerHeight,top:r&&Math.round(r.top)};});
    const before=await dockState();
    await page.locator('#dockAction').click();
    await page.waitForFunction(()=>/^2 \/ 6/.test(document.querySelector('#dockLabel')?.innerText||''),null,{timeout:5000})
      .catch(async()=>fail('dock did not advance to step 2 before='+JSON.stringify(before)+' after='+JSON.stringify(await dockState())));
    await page.locator('#dockNext').click();
    await page.waitForFunction(()=>/^3 \/ 6/.test(document.querySelector('#dockLabel')?.innerText||''),null,{timeout:5000}).catch(()=>fail('dock next did not reach the prompt step'));
    if(await page.locator('#labSubnav [aria-current="true"]').getAttribute('data-sec-go')!=='sec-step-2')fail('sticky order did not follow the step');
    await page.locator('#sec-step-2 [data-copy="step-prompt-2"]').click();
    await page.waitForFunction(()=>/복사|선택/.test(document.querySelector('#toast')?.textContent||''),null,{timeout:5000}).catch(()=>fail('copy feedback missing'));
    if(/edu/.test(await page.locator('#dockLabel').innerText()))fail('router rewrote dock text');
    step('guided steps + prompt copy');
    await page.locator('#labSubnav [data-sec-go="sec-step-4"]').click();
    await page.waitForFunction(()=>/^5 \/ 6/.test(document.querySelector('#dockLabel')?.innerText||''),null,{timeout:5000}).catch(()=>fail('tapping a step title did not select it'));
    await page.locator('[data-sample="hwp"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#verifyOut .finding.risk').length>0,null,{timeout:5000}).catch(()=>fail('result checker found no risk in the known-bad sample'));
    const findings=await page.locator('#verifyOut').innerText();
    if(!/원문에 없는/.test(findings))fail('checker output missing invented-value finding');
    await page.locator('#sec-step-4 [data-crit]').first().check();
    step('result checker flags invented values');
    await page.waitForTimeout(200);
    await reopen(page);
    if(!/^5 \/ 6/.test(await page.locator('#dockLabel').innerText()))fail('step position not restored after reload');
    if(!await page.locator('#sec-step-4 [data-crit]').first().isChecked())fail('checklist not restored after reload');
    if(!(await page.locator('textarea[data-result="hwp"]').inputValue()).includes('가상 AI 출력'))fail('pasted result not restored');
    if(await page.locator('#verifyOut .finding').count()<1)fail('checker findings not restored');
    step('reload / disconnect recovery');
    await page.locator('#dockNext').click();
    await page.locator('textarea[data-memo]').fill('가상 실습 메모');
    await page.locator('[data-finish="hwp"]').click();
    if(!(await page.locator('[data-tab="m:hwp"]').innerText()).includes('완료'))fail('mission completion not marked');
    step('mission completion');
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
    await page.locator('#labSubnav [data-sec-go="sec-step-0"]').click();
    await shot(page,profile.name+'-learner',false);
    flow.overflow=await overflow(page,profile.name+' learner');
    const entry=await context.newPage();watch(entry,profile.name);
    const r=await entry.goto(ORIGIN+R.entry,{waitUntil:'domcontentloaded'});if(r?.status()!==200)fail('factchat entry HTTP '+r?.status());
    await overflow(entry,profile.name+' entry');
    await entry.waitForSelector('#instructorSlot .ins-card',{timeout:10000}).catch(()=>fail('instructor card not rendered on entry page'));
    const intro=await entry.evaluate(()=>({text:document.querySelector('#instructorSlot')?.innerText||'',figures:document.querySelectorAll('#instructorSlot .ins-gallery figure a[href^="https://"]').length}));
    if(!/목사/.test(intro.text)||!/박사/.test(intro.text))fail('instructor titles missing on entry page');
    if(intro.figures!==3)fail('instructor gallery expected 3 linked stills, saw '+intro.figures);
    flow.steps.push('entry instructor intro: titles + 3-item activity gallery');
    report.flows.push({...flow,passed:true});
  }finally{await context.close();}
}

// Cross-surface regression is retained once, not on every layout profile.
// Repeated navigation to the same bootcamp's catalog.js over five Premium Studio
// viewports used to trip the existing HTTP 429 protection late in the release.
// We never bypass that protection: observe Retry-After, back off, and fail closed
// when the legitimate bootcamp cannot render its 4x6 class structure.
async function bootcampRegressionProbe(browser){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR'});
  observeCloudflareJsDetections(context);
  await guard(context,'bootcamp-regression');
  try{
    const page=await context.newPage();watch(page,'bootcamp-regression');
    for(let attempt=0;attempt<3;attempt++){
      const errorOffsets=Object.fromEntries(['pageErrors','consoleErrors','httpErrors','requestFailures']
        .map(kind=>[kind,report[kind].length]));
      page.__ekodiRateLimited=0;
      const response=await page.goto(ORIGIN+R.bootcamp,{waitUntil:'domcontentloaded',timeout:35000});
      const status=response?.status();
      if(status===200&&new URL(page.url()).origin!==ORIGIN)fail('existing bootcamp redirect escaped Education origin');
      const ready=status===200&&await page.locator('.course-cards .lesson-card').first()
        .waitFor({state:'visible',timeout:12000}).then(()=>true,()=>false);
      if(ready){
        for(const kind of Object.keys(errorOffsets)){
          const errors=report[kind].slice(errorOffsets[kind]).filter(item=>item.profile==='bootcamp-regression');
          if(errors.length)fail('bootcamp regression '+kind+' after render: '+JSON.stringify(errors.slice(0,2)));
        }
        const lessons=await page.locator('.course-cards .lesson-card').count();
        const batches=await page.locator('#batchPicker option').count();
        if(lessons!==4)fail('existing bootcamp lost its 4 lessons');
        if(batches!==6)fail('existing bootcamp lost its 6 batches');
        report.bootcampRegression={passed:true,lessons,batches,attempts:attempt+1,route:R.bootcamp};
        return;
      }
      const observed=page.__ekodiRateLimited;
      const retryAfter=status===429?Number(response.headers()['retry-after']):0;
      const delay=retryAfter||observed;
      if(!Number.isFinite(delay)||delay<=0||attempt>=2){
        fail('existing 4x6 bootcamp regression did not render (HTTP '+status+
          ', attempt '+(attempt+1)+(observed?', rate-limited':'')+')');
      }
      // A Retry-After above the bounded CI budget must not be shortened or bypassed.
      if(delay>180)fail('existing bootcamp rate limit Retry-After exceeds bounded verification budget: '+delay+'s');
      report.rateLimitRetries=(report.rateLimitRetries||0)+1;
      await page.waitForTimeout(Math.max(delay,5)*1000);
    }
  }finally{await context.close();}
}

async function layoutProbe(browser,profile){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.mobile,hasTouch:profile.mobile,locale:'ko-KR'});
  observeCloudflareJsDetections(context);
  await guard(context,profile.name);
  await authorize(context);
  try{
    const page=await context.newPage();watch(page,profile.name);
    const result={name:profile.name,viewport:{width:profile.width,height:profile.height}};
    for(const [k,route,dock] of [['studio',R.studio,false],['presenter',R.presenter,false],['lab',R.lab+'&s=2&m=ppt&open=1',true],['entry',R.entry,false]]){
      await open(page,route,{ready:k!=='entry'});result[k]=await overflow(page,profile.name+' '+k);
      if(k!=='presenter')result[k+'Chrome']=await chromeCheck(page,profile.name+' '+k,{mobile:profile.mobile,dock});
    }
    await open(page,R.audience);
    const aud=await page.evaluate(()=>({visibleHeaders:[...document.querySelectorAll('header')].filter(h=>h.getBoundingClientRect().height>0&&getComputedStyle(h).display!=='none').length,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
    if(aud.visibleHeaders!==0||aud.sw>aud.cw+2)fail(profile.name+' audience view shows a header or overflows '+JSON.stringify(aud));
    result.audience=aud;
    // The dedicated native bootcamp suite already checks all five viewports in the preceding release step.
    // Do not repeat its four-lesson/six-batch asset fetch for every Premium Studio viewport.
    result.bootcampRegression=report.bootcampRegression?.passed===true?'verified once + dedicated native suite':'unverified';
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
    await gateProbe(browser);
    await bootcampRegressionProbe(browser);
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
    const extra=['consoleErrors','pageErrors','httpErrors','requestFailures','rateLimited'].map(k=>k+'='+JSON.stringify(report[k].slice(-3))).join(' ')+' lastFlowSteps='+JSON.stringify(report.lastSteps||[]);
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
