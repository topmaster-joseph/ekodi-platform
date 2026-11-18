import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {runTask} from './ekodi-background-browser-worker.mjs';

const ORIGIN = 'https://ekodi.kr';
const DIR = 'artifacts/devotion-guest-native';
const seoulToday = () => {
  const parts = new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type)?.value || '';
  return [part('year'),part('month'),part('day')].join('-');
};
const nextDay = iso => {
  const date = new Date(iso + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0,10);
};
const today = seoulToday(), tomorrow = nextDay(today);
const report = {
  schema:'ekodi.devotion.native.guest.v1', owner:'EKODI Orchestrator',
  startedAt:new Date().toISOString(), source:'EKODI Background Browser Worker',
  deployment:'live', origin:ORIGIN, date:today, nextDate:tomorrow,
  allowMutation:false, guestOnly:true, browsers:[], checks:[], passed:false,
  limitations:['실제 관리자 로그인 세션은 사용하지 않음']
};
const record = (name, passed, evidence={}) => {
  const entry = {name,passed:passed===true,...evidence};
  report.checks.push(entry);
  console.log('[EKODI-NATIVE-GUEST] ' + JSON.stringify(entry));
  if(!entry.passed) throw Error('check_failed:' + name);
};
await fs.mkdir(DIR,{recursive:true});
const nativeChrome = process.env.EKODI_NATIVE_CHROME || undefined;
const browser = await chromium.launch({headless:true,...(nativeChrome?{executablePath:nativeChrome}:{})});
try {
  for (const device of [
    {name:'desktop',width:1440,height:900,isMobile:false},
    {name:'mobile',width:390,height:844,isMobile:true}
  ]) {
    const source = '/ekodimission/devotion?date='+today;
    // The EKODI-native worker validates canonical origin, browser profile,
    // read-only network actions and captures the real production UI.
    const native = await runTask({
      taskId:'devotion-guest-'+device.name,
      path:source,deviceProfile:device.isMobile?'mobile-portrait':'desktop',
      timeoutMs:110000,allowMutation:false,
      actions:[
        {type:'waitFor',selector:'[data-ekodi-devotion] .dv-datebar',timeoutMs:15000},
        {type:'snapshot'},{type:'screenshot',name:'devotion-guest-'+device.name}
      ]
    },{artifactRoot:DIR+'/ekodi-browser'});
    record(device.name+'-native-worker',native.ok===true&&native.ephemeralContext===true&&native.allowMutation===false,
      {ok:native.ok,pageErrors:native.pageErrors?.length||0,screenshots:native.screenshots?.length||0});
    const context = await browser.newContext({
      viewport:{width:device.width,height:device.height},
      isMobile:device.isMobile,hasTouch:device.isMobile,
      acceptDownloads:false
    });
    // Read-only against production: no post, cookies injected, or credentials.
    await context.route('**/*',route=>
      ['GET','HEAD','OPTIONS'].includes(route.request().method())
      ?route.continue():route.abort('blockedbyclient'));
    const page = await context.newPage();
    const failures=[];
    page.on('pageerror',error=>failures.push(String(error.message||error)));
    try {
      const response = await page.goto(ORIGIN+source,{waitUntil:'domcontentloaded',timeout:35000});
      record(device.name+'-landing-200',response?.status()===200,{status:response?.status()});
      await page.locator('[data-ekodi-devotion] .dv-datebar').waitFor({state:'visible',timeout:20000});
      await page.locator('main[data-mission-devotion] .mission-devotion-tools').waitFor({state:'visible',timeout:20000});
      // Wait for a guest auth check to settle if still pending.
      await page.waitForTimeout(2000);
      const state=await page.evaluate(()=>{
        const bar=document.querySelector('main[data-mission-devotion] .mission-devotion-tools');
        const next=document.querySelector('[data-ekodi-devotion] .dv-datebar a:last-child');
        const login=bar?.querySelector('.mission-auth-button:not([hidden])');
        const account=bar?.querySelector('[data-mission-auth-state]');
        const logout=bar?.querySelector('button.mission-auth-button');
        const admin=bar?.querySelector('.dv-adminbar');
        const header=document.querySelector('.mission-site-header');
        return {
          nextHidden:next?.hidden??false,nextHref:next?.getAttribute('href')??null,
          nextTabIndex:next?.tabIndex??null,nextAriaDisabled:next?.getAttribute('aria-disabled'),
          loginVisible:Boolean(login && getComputedStyle(login).display!=='none'),
          loginText:login?.textContent?.trim()||'',
          authText:bar?.innerText?.trim()||'',
          accountHidden:account?.hidden??null,
          logoutHidden:logout?.hidden??null,
          adminHidden:admin?.hidden??null,
          withinHeader:Boolean(login&&header?.contains(login)),
          horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
        };
      });
      record(device.name+'-future-button-not-actionable',
        state.nextHidden&&state.nextHref===null&&state.nextTabIndex===-1&&state.nextAriaDisabled==='true',state);
      record(device.name+'-guest-login-only',
        state.loginVisible&&state.loginText==='로그인'&&
        state.authText==='로그인'&&
        state.accountHidden===true&&state.logoutHidden===true&&state.adminHidden===true,
        {loginText:state.loginText,authText:state.authText,accountHidden:state.accountHidden,
         logoutHidden:state.logoutHidden,adminHidden:state.adminHidden});
      record(device.name+'-login-below-header',state.withinHeader===false,{withinHeader:state.withinHeader});
      record(device.name+'-no-overflow',!state.horizontalOverflow,{horizontalOverflow:state.horizontalOverflow});
      const before=page.url();
      await page.locator('[data-ekodi-devotion] .dv-datebar a:last-child').evaluate(el=>el.click());
      await page.waitForTimeout(400);
      record(device.name+'-disabled-click-stays-put',page.url()===before,{before,after:page.url()});
      // Future API access is always denied by the origin, regardless of the UI.
      const future=await context.request.get(ORIGIN+'/bible/api/bible/devotion?date='+tomorrow,{
        timeout:20000,failOnStatusCode:false
      });
      const futureBody=await future.json().catch(()=>({}));
      record(device.name+'-future-api-denied',
        future.status()===403&&futureBody.error==='future_unavailable',
        {status:future.status(),error:futureBody.error});
      const futurePage=await page.goto(ORIGIN+'/ekodimission/devotion?date='+tomorrow,{
        waitUntil:'domcontentloaded',timeout:35000
      });
      await page.locator('[data-ekodi-devotion] .dv-status').waitFor({state:'attached',timeout:20000});
      if(process.env.EKODI_EXPECT_AUTO_TODAY==='1'){
        // Production release check waits for the actual today URL and visible passage;
        // a screenshot of the old blocked screen is not a passing result.
        await page.waitForFunction(iso=>{
          const date=new URL(location.href).searchParams.get('date');
          const passage=document.querySelector('[data-ekodi-devotion] .dv-scripture-section');
          return date===iso && passage?.hidden===false && (passage?.innerText?.trim().length||0)>30;
        },today,{timeout:18000});
      } else {
        await page.waitForTimeout(1800);
      }
      const futureState=await page.evaluate(()=>{
        const el=document.querySelector('[data-ekodi-devotion]');
        const verses=el?.querySelector('.dv-scripture-section');
        const status=el?.querySelector('.dv-status');
        const date=el?.querySelector('.dv-date');
        return {verseHidden:verses?.hidden??null,status:status?.textContent?.trim()||'',
          visibleVerses:verses?.innerText?.trim().length||0,dateLabel:date?.textContent?.trim()||'',
          nextHidden:el?.querySelector('.dv-datebar a:last-child')?.hidden??null,
          currentUrl:location.href};
      });
      const redirectedToToday=new URL(futureState.currentUrl).searchParams.get('date')===today;
      const stillSecurelyBlocked=new URL(futureState.currentUrl).searchParams.get('date')===tomorrow&&
        futureState.verseHidden===true&&/아직 공개되지|오늘 날짜까지만/.test(futureState.status);
      const todayShown=redirectedToToday&&futureState.verseHidden===false&&futureState.visibleVerses>30;
      // Pull requests may verify against the previous production release.
      // After an official Bible release, the strict run requires auto-return.
      record(device.name+'-future-page-content-private',
        todayShown||stillSecurelyBlocked,
        {requestStatus:futurePage?.status(),redirectedToToday,todayShown,stillSecurelyBlocked,...futureState});
      if(process.env.EKODI_EXPECT_AUTO_TODAY==='1'){
        record(device.name+'-future-auto-returns-to-today',todayShown&&
          /아직 공개되지|오늘 날짜까지만|오늘의 묵상으로 이동/.test(futureState.status),
          {today,redirectedToToday,...futureState});
      }
      record(device.name+'-pageerror-free',failures.length===0,{failures});
      await page.screenshot({path:path.join(DIR,'devotion-guest-'+device.name+'.png'),fullPage:true});

      // Public-site voice UI smoke: real host, real DOM and CSS, no audio output or writes.
      // This is not the instrumented speech-callback loop test below.
      const voiceResponse=await page.goto(ORIGIN+'/ekodichurch/devotion/?date='+today,{
        waitUntil:'domcontentloaded',timeout:35000
      });
      record(device.name+'-church-voice-http',voiceResponse?.status()===200,
        {status:voiceResponse?.status()});
      const speech=page.locator('[data-ekodi-devotion] .dv-speech-tools');
      const loop=page.locator('[data-ekodi-devotion] [data-speech-action="loop"]');
      await loop.waitFor({state:'visible',timeout:22000});
      const initial=await page.evaluate(()=>{
        const row=document.querySelector('[data-ekodi-devotion] .dv-speech-tools');
        const mode=row?.querySelector('.dv-speech-engine select');
        const loop=row?.querySelector('[data-speech-action="loop"]');
        const settings=row?.querySelector('[data-speech-action="settings"]');
        return {engine:mode?.value,engineLabels:[...mode?.options||[]].map(x=>x.textContent.trim()),
          loopVisible:Boolean(loop&&getComputedStyle(loop).display!=='none'),
          loopDisabled:loop?.disabled,pressed:loop?.getAttribute('aria-pressed'),
          settingsExpanded:settings?.getAttribute('aria-expanded')};
      });
      record(device.name+'-device-voice-default-and-loop-off',
        initial.engine==='device' && initial.engineLabels.includes('기기 음성') &&
        initial.loopVisible && initial.loopDisabled===false &&
        initial.pressed==='false' && initial.settingsExpanded==='false',initial);
      await loop.click();
      record(device.name+'-loop-on-click',
        await loop.getAttribute('aria-pressed')==='true' &&
        /켜짐/.test(await loop.innerText()));
      await loop.click();
      record(device.name+'-loop-off-click',
        await loop.getAttribute('aria-pressed')==='false');
      const settings=page.locator('[data-ekodi-devotion] [data-speech-action="settings"]');
      await settings.click();
      record(device.name+'-advanced-device-settings',
        await settings.getAttribute('aria-expanded')==='true' &&
        await speech.locator('.dv-speech-engine select').count()===1 &&
        await speech.locator('.dv-speech-speed select').count()===1);
      const layout=await page.evaluate(()=>{
        const row=document.querySelector('[data-ekodi-devotion] .dv-speech-tools');
        const keys=['loop','pause','stop'];
        const buttons=keys.map(key=>{
          const el=row?.querySelector('[data-speech-action="'+key+'"]');
          const rect=el?.getBoundingClientRect();
          return {key,visible:Boolean(el&&getComputedStyle(el).display!=='none'),
            left:Math.round(rect?.left||0),right:Math.round(rect?.right||0),
            top:Math.round(rect?.top||0),height:Math.round(rect?.height||0)};
        });
        const sameRow=buttons.every(b=>Math.abs(b.top-buttons[0].top)<=3);
        const noOverlap=buttons[0].right<=buttons[1].left+1 &&
          buttons[1].right<=buttons[2].left+1;
        return {buttons,sameRow,noOverlap,
          allWithinViewport:buttons.every(b=>b.left>=-2&&b.right<=innerWidth+2),
          minTouch44:buttons.every(b=>b.height>=44),
          overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};
      });
      record(device.name+'-voice-layout-no-overlap',layout.sameRow&&layout.noOverlap&&
        layout.allWithinViewport&&layout.minTouch44&&!layout.overflow,layout);
      await page.screenshot({path:path.join(DIR,'devotion-voice-'+device.name+'.png'),fullPage:true});

      report.browsers.push({device:device.name,checks:report.checks.filter(x=>x.name.startsWith(device.name)).length});
    } finally {
      await context.close();
    }
  }

  // 320px public Church check, deliberately separate from Mission guest-auth tests.
  const compact=await browser.newContext({
    viewport:{width:320,height:720},isMobile:true,hasTouch:true,acceptDownloads:false
  });
  await compact.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())
    ?route.continue():route.abort('blockedbyclient'));
  try {
    const page=await compact.newPage();
    const response=await page.goto(ORIGIN+'/ekodichurch/devotion/?date='+today,
      {waitUntil:'domcontentloaded',timeout:35000});
    const loop=page.locator('[data-ekodi-devotion] [data-speech-action="loop"]');
    await loop.waitFor({state:'visible',timeout:22000});
    const collapsed=await page.evaluate(()=>{
      const row=document.querySelector('[data-ekodi-devotion] .dv-speech-tools');
      const actions=['pause','stop'];
      return {advanced:row?.dataset.advanced,
        hiddenDisabled:actions.every(name=>{
          const button=row.querySelector('[data-speech-action="'+name+'"]');
          return button?.disabled===true&&getComputedStyle(button).display==='none';
        }),
        loopVisible:getComputedStyle(row.querySelector('[data-speech-action="loop"]')).display!=='none'};
    });
    record('compact-320-collapsed-control-contract',
      collapsed.advanced==='false'&&collapsed.hiddenDisabled&&collapsed.loopVisible,collapsed);
    await page.locator('[data-ekodi-devotion] [data-speech-action="settings"]').click();
    const compactState=await page.evaluate(()=>{
      const row=document.querySelector('[data-ekodi-devotion] .dv-speech-tools');
      const keys=['loop','pause','stop'];
      const boxes=keys.map(k=>{
        const r=row.querySelector('[data-speech-action="'+k+'"]').getBoundingClientRect();
        return {key:k,left:r.left,right:r.right,top:r.top,height:r.height};
      });
      return {engine:row.querySelector('.dv-speech-engine select')?.value,
        overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
        sameRow:boxes.every(x=>Math.abs(x.top-boxes[0].top)<4),
        ordered:boxes[0].right<=boxes[1].left+1&&boxes[1].right<=boxes[2].left+1,
        within:boxes.every(x=>x.left>=-2&&x.right<=innerWidth+2&&x.height>=44),
        boxes:boxes.map(x=>({key:x.key,left:Math.round(x.left),right:Math.round(x.right),
          top:Math.round(x.top),height:Math.round(x.height)}))};
    });
    record('compact-320-live-church-voice-layout',
      response?.status()===200&&compactState.engine==='device'&&
      !compactState.overflow&&compactState.sameRow&&compactState.ordered&&
      compactState.within,compactState);
    await page.screenshot({path:path.join(DIR,'devotion-voice-320.png'),fullPage:true});
  } finally {await compact.close();}

  // Instrumented speech callbacks in a genuine Chromium page against the real
  // deployed JS. This proves event sequencing; it does NOT claim physical audio.
  const probe=await browser.newContext({viewport:{width:1440,height:900},
    acceptDownloads:false});
  await probe.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())
    ?route.continue():route.abort('blockedbyclient'));
  await probe.addInitScript(()=>{
    const evidence={spoken:[],cancelCount:0};
    Object.defineProperty(window,'__ekodiSpeechProbe',{configurable:false,value:evidence});
    const voices=[
      {lang:'ko-KR',name:'Google 한국어',voiceURI:'probe-google-ko',default:true,localService:true},
      {lang:'ko-KR',name:'Microsoft SunHi Online (Natural) - Korean (Korea)',
        voiceURI:'probe-sunhi',localService:false}
    ];
    const synth={
      getVoices:()=>voices,addEventListener:()=>{},
      speak:utterance=>{evidence.spoken.push(utterance);},
      cancel:()=>{evidence.cancelCount++;},pause:()=>{},resume:()=>{}
    };
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});
    Object.defineProperty(window,'SpeechSynthesisUtterance',{
      configurable:true,value:class {constructor(text){this.text=text;}}
    });
  });
  try{
    const page=await probe.newPage();
    await page.goto(ORIGIN+'/ekodichurch/devotion/?date='+today,
      {waitUntil:'domcontentloaded',timeout:35000});
    const loop=page.locator('[data-ekodi-devotion] [data-speech-action="loop"]');
    const play=page.locator('[data-ekodi-devotion] [data-speech-action="play"]');
    const stop=page.locator('[data-ekodi-devotion] [data-speech-action="stop"]');
    await loop.waitFor({state:'visible',timeout:22000});
    const ready=await page.evaluate(()=>{
      const row=document.querySelector('[data-ekodi-devotion] .dv-speech-tools');
      return {engine:row.querySelector('.dv-speech-engine select')?.value,
        voice:row.querySelector('.dv-speech-voice select')?.value,
        spoken:window.__ekodiSpeechProbe.spoken.length,
        loopPressed:row.querySelector('[data-speech-action="loop"]')?.getAttribute('aria-pressed')};
    });
    record('voice-probe-no-autoplay-google-preferred',
      ready.engine==='device'&&ready.voice==='probe-google-ko'&&
      ready.spoken===0&&ready.loopPressed==='false',ready);
    await loop.click();
    record('voice-probe-loop-toggle-does-not-autoplay',
      await loop.getAttribute('aria-pressed')==='true' &&
      await page.evaluate(()=>window.__ekodiSpeechProbe.spoken.length)===0);
    await play.click();
    const count=await page.evaluate(()=>{
      const text=document.querySelector('[data-ekodi-devotion] .dv-speech-status')?.textContent||'';
      return Number(text.split('/')[1]||0);
    });
    record('voice-probe-starts-expected-segments',count>1&&count<=100,{segments:count});
    const first=await page.evaluate(()=>window.__ekodiSpeechProbe.spoken[0]?.text||'');
    for(let n=0;n<count;n++){
      const before=await page.evaluate(()=>window.__ekodiSpeechProbe.spoken.length);
      await page.evaluate(()=>window.__ekodiSpeechProbe.spoken.at(-1)?.onend?.());
      await page.waitForFunction(before=>window.__ekodiSpeechProbe.spoken.length>before,
        before,{timeout:4000});
    }
    const loopState=await page.evaluate(()=>{
      const spoken=window.__ekodiSpeechProbe.spoken;
      return {spokenCount:spoken.length,first:spoken[0]?.text||'',
        restarted:spoken.at(-1)?.text===spoken[0]?.text,
        selectedVoice:spoken[0]?.voice?.name,
        aria:document.querySelector('[data-ekodi-devotion] [data-speech-action="loop"]')
          ?.getAttribute('aria-pressed')};
    });
    record('voice-probe-completion-restarts-first-segment',
      loopState.spokenCount===count+1&&loopState.restarted&&
      loopState.selectedVoice==='Google 한국어'&&loopState.aria==='true',
      {spokenCount:loopState.spokenCount,restarted:loopState.restarted,
        selectedVoice:loopState.selectedVoice,aria:loopState.aria});
    await stop.click();
    const afterStop=await page.evaluate(()=>({
      count:window.__ekodiSpeechProbe.spoken.length,
      canceled:window.__ekodiSpeechProbe.cancelCount,
      aria:document.querySelector('[data-ekodi-devotion] [data-speech-action="loop"]')
        ?.getAttribute('aria-pressed')
    }));
    await page.waitForTimeout(650);
    record('voice-probe-stop-revokes-loop',
      afterStop.aria==='false'&&afterStop.canceled>0&&
      await page.evaluate(()=>window.__ekodiSpeechProbe.spoken.length)===afterStop.count,
      afterStop);
  }finally{await probe.close();}

  report.passed=report.checks.every(check=>check.passed);
} catch(error) {
  report.error=String(error.stack||error);
  process.exitCode=1;
} finally {
  await browser.close();
  report.finishedAt=new Date().toISOString();
  report.passed=report.passed&&report.checks.every(check=>check.passed);
  await fs.writeFile(path.join(DIR,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log('[EKODI-NATIVE-GUEST] SUMMARY '+JSON.stringify({
    passed:report.passed,checks:report.checks.length,failed:report.checks.filter(c=>!c.passed).map(c=>c.name),
    error:report.error||null
  }));
  if(!report.passed)process.exitCode=1;
}
