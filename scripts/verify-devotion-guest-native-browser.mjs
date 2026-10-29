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
      await page.waitForTimeout(1800);
      const futureState=await page.evaluate(()=>{
        const el=document.querySelector('[data-ekodi-devotion]');
        const verses=el?.querySelector('.dv-scripture-section');
        const status=el?.querySelector('.dv-status');
        return {verseHidden:verses?.hidden??null,status:status?.textContent?.trim()||'',
          futureNextHidden:el?.querySelector('.dv-datebar a:last-child')?.hidden??null};
      });
      record(device.name+'-future-page-content-private',
        futureState.verseHidden===true&&
        /아직 공개되지|오늘 날짜까지만|접근할 수 없|열람할 수 없/.test(futureState.status),
        {status:futurePage?.status(),...futureState});
      record(device.name+'-pageerror-free',failures.length===0,{failures});
      await page.screenshot({path:path.join(DIR,'devotion-guest-'+device.name+'.png'),fullPage:true});
      report.browsers.push({device:device.name,checks:report.checks.filter(x=>x.name.startsWith(device.name)).length});
    } finally {
      await context.close();
    }
  }
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
