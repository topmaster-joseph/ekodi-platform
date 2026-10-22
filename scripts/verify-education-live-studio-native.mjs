// EKODI-owned temporary Chromium probe for Education Premium Studio (Instructor Studio, Presenter, Learner Lab).
// Read-only against the server: no account, no stored secrets, no external browser provider; all state stays in the
// ephemeral browser context, which is destroyed afterwards. Non-GET requests are blocked and recorded.
import fs from 'node:fs/promises';
import path from 'node:path';
import {classifyConsoleSecurityBlock,classifyRequestSecurityBlock,
  classifyMutationSecurityBlock,verifyKnownSecurityBlocks
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
// Instructor gallery stills are served by YouTube's image CDN. Their availability is outside EKODI's control,
// so a failure there is evidence (externalMediaWarnings), not a release blocker. Everything else stays strict.
const EXTERNAL_MEDIA=/^https:\/\/i\.ytimg\.com\//;

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
// The deployed access mode comes from the same Worker config that was released (EDU_INSTRUCTOR_GATE_MODE).
async function deployedGateMode(){
  const toml=await fs.readFile(new URL('../wrangler.education.toml',import.meta.url),'utf8');
  return /EDU_INSTRUCTOR_GATE_MODE\s*=\s*"open"/i.test(toml)?'open':'locked';
}
// Locked: without a session the instructor studio, presenter and notes must be refused. Open: they load
// without any password. Either way the learner lab stays public and frameable only by the same origin.
async function gateProbe(browser){
  const mode=await deployedGateMode();
  const context=await browser.newContext({locale:'ko-KR'});
  await guard(context,'gate');
  try{
    const page=await context.newPage();
    const result={};
    result.mode=mode;
    if(mode==='open'){
      for(const [k,route] of [['studio',R.studio],['presenter',R.presenter]]){
        const r=await page.goto(ORIGIN+route,{waitUntil:'domcontentloaded',timeout:35000});
        result[k]=r?.status();
        if(r?.status()!==200)fail('open mode: '+k+' must load without a password, got '+r?.status());
        if(await page.locator('input[type="password"]').count()!==0)fail('open mode: '+k+' still shows a password form');
      }
      const lab=await context.request.get(ORIGIN+R.lab,{failOnStatusCode:false});
      result.lab=lab.status();
      if(lab.status()!==200)fail('learner lab must stay public, got '+lab.status());
      report.gate={...result,passed:true};
      return;
    }
    for(const [k,route] of [['studio',R.studio],['presenter',R.presenter],['audience',R.audience]]){
      const r=await page.goto(ORIGIN+route,{waitUntil:'domcontentloaded',timeout:35000});
      result[k]=r?.status();
      if(r?.status()!==401)fail('unauthenticated '+k+' must be locked (401), got '+r?.status());
      if(await page.locator('input[type="password"][name="password"]').count()!==1)fail(k+' lock page lacks the password field');
      if(await page.locator('#presNotes,#view .notes').count()!==0)fail(k+' lock page leaked instructor content');
    }
    for(const asset of ['/study/live/courses/'+COURSE+'.notes.js','/study/live/instructor.js','/study/live/present.js']){
      const r=await context.request.get(ORIGIN+PREFIX+asset,{failOnStatusCode:false,maxRedirects:0});
      result[asset]=r.status();
      if(r.status()!==401)fail('unauthenticated '+asset+' must be refused (401), got '+r.status());
      if(/talk|answer/.test(await r.text()))fail(asset+' leaked content without a session');
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
    await presenter.waitForFunction(()=>document.querySelector('#stage')?.innerText.includes('HWP 문서 업무'),null,{timeout:8000});
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
    await shot(presenter,profile.name+'-presenter',false);
    await shot(audience,profile.name+'-audience',false);
    await reopen(studio);
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
  const flow={profile:profile.name,steps:[]};const step=s=>{flow.steps.push(s);report.lastSteps=[profile.name,...flow.steps.slice(-3)];};
  try{
    const page=await context.newPage();
    watch(page,profile.name,{onRequest:req=>{if(/\.notes\.js/.test(req.url()))report.notesLoadedByLearner=true;}});
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
    if(await page.locator('.msec').count()!==10)fail('learner mission must have 10 sections');
    await page.locator('#labTrack').selectOption('research');
    if(!(await page.locator('#labView').innerText()).includes('신진연구자'))fail('track switch did not change source');
    step('job track switch');
    const fc=page.locator('a[data-open-tool="factchat"]').first();
    if(await fc.getAttribute('href')!==FACTCHAT||await fc.getAttribute('target')!=='_blank')fail('FactChat link incorrect');
    step('official FactChat link');
    const [dl]=await Promise.all([page.waitForEvent('download',{timeout:10000}),page.locator('#stepCard [data-download="0"]').click()]);
    if(!dl.suggestedFilename().endsWith('.txt'))fail('material download missing');
    await dl.delete().catch(()=>{});
    step('material download');
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
    if(!(await page.locator('#stepCard').innerText()).includes('프롬프트'))fail('prompt step not shown');
    await page.locator('#stepCard [data-copy="step-prompt"]').first().click();
    await page.waitForFunction(()=>/복사|선택/.test(document.querySelector('#toast')?.textContent||''),null,{timeout:5000}).catch(()=>fail('copy feedback missing'));
    if(/edu/.test(await page.locator('#dockLabel').innerText()))fail('router rewrote dock text');
    step('guided steps + prompt copy');
    await page.locator('[data-step="4"]').click();
    await page.locator('[data-sample="hwp"]').click();
    await page.waitForFunction(()=>document.querySelectorAll('#verifyOut .finding.risk').length>0,null,{timeout:5000}).catch(()=>fail('result checker found no risk in the known-bad sample'));
    const findings=await page.locator('#verifyOut').innerText();
    if(!/원문에 없는/.test(findings))fail('checker output missing invented-value finding');
    await page.locator('#stepCard [data-crit]').first().check();
    step('result checker flags invented values');
    await page.waitForTimeout(200);
    await reopen(page);
    if(!/^5 \/ 6/.test(await page.locator('#dockLabel').innerText()))fail('step position not restored after reload');
    if(!await page.locator('#stepCard [data-crit]').first().isChecked())fail('checklist not restored after reload');
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
    await page.locator('[data-step="0"]').click();
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

async function layoutProbe(browser,profile){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},isMobile:profile.mobile,hasTouch:profile.mobile,locale:'ko-KR'});
  await guard(context,profile.name);
  await authorize(context);
  try{
    const page=await context.newPage();watch(page,profile.name);
    const result={name:profile.name,viewport:{width:profile.width,height:profile.height}};
    for(const [k,route,dock] of [['studio',R.studio,false],['presenter',R.presenter,false],['lab',R.lab+'&s=2&m=ppt',true],['entry',R.entry,false]]){
      await open(page,route,{ready:k!=='entry'});result[k]=await overflow(page,profile.name+' '+k);
      if(k!=='presenter')result[k+'Chrome']=await chromeCheck(page,profile.name+' '+k,{mobile:profile.mobile,dock});
    }
    await open(page,R.audience);
    const aud=await page.evaluate(()=>({visibleHeaders:[...document.querySelectorAll('header')].filter(h=>h.getBoundingClientRect().height>0&&getComputedStyle(h).display!=='none').length,sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth}));
    if(aud.visibleHeaders!==0||aud.sw>aud.cw+2)fail(profile.name+' audience view shows a header or overflows '+JSON.stringify(aud));
    result.audience=aud;
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
    await gateProbe(browser);
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
