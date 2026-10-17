import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// EKODI-owned Chromium, READ-ONLY production page with network-isolated
// public calendar fixture. Never writes to production or fabricates Google auth.
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const i=arg.indexOf('=');
  return i<0?[arg.replace(/^--/,''),'true']:[arg.slice(2,i),arg.slice(i+1)];
}));
const origin=String(args.origin||'https://seonammedi.kr').replace(/\/+$/,'');
const roots={
  'https://seonammedi.kr':'/board/notices',
  'https://ekodi.kr':'/seonammedi/board/notices'
};
if(!Object.hasOwn(roots,origin))throw new Error('Origin not on approved EKODI allowlist');
const output=path.resolve(String(args.out||'artifacts/seonammedi-calendar-share-native'));
await fs.mkdir(output,{recursive:true});
const FIXTURE=Object.freeze({
  id:812034657,kind:'event',status:'published',
  title:'EKODI 공유 검증용 일정',eventStart:'2026-10-15T18:00',
  eventEnd:'2026-10-15T20:00',body:'운영 데이터베이스에 등록하지 않은 시험 일정'
});
const date=FIXTURE.eventStart.slice(0,10);
const shareLink=origin+roots[origin]+'?schedule='+FIXTURE.id+'&date='+date;
const shareText='서남권 국립의대 소통센터\n'+FIXTURE.title+'\n일정: 2026.10.15 18:00';
const profiles=[
  {name:'desktop',width:1440,height:900,isMobile:false},
  {name:'mobile',width:390,height:844,isMobile:true}
];
const evidence={
  verification:'EKODI-CALENDAR-SHARE-NATIVE-FIXTURE-001',
  origin,checkedAt:new Date().toISOString(),browser:'EKODI-owned Chromium',
  networkFixture:true,realPublishedEvent:false,
  realGoogleAuthentication:false,realSystemShareSheet:false,
  productionMutationsAllowed:false,results:[],ok:false
};
const must=(yes,reason)=>{if(!yes)throw new Error(reason)};
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const profile of profiles){
    const row={profile:profile.name,viewport:profile.width+'x'+profile.height,ok:false};
    evidence.results.push(row);
    const context=await browser.newContext({
      viewport:{width:profile.width,height:profile.height},
      isMobile:profile.isMobile,hasTouch:profile.isMobile,
      permissions:['clipboard-read','clipboard-write'],
      acceptDownloads:false,serviceWorkers:'block'
    });
    const page=await context.newPage();
    const blockedMutations=[];
    const fixtureRequests=[];
    // navigator.share cannot display an OS share sheet in headless Chromium.
    // Record only the actual UI's arguments, not a falsely reported native sheet.
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,'share',{
        configurable:true,
        value:async options=>{window.__ekodiRecordedShare=options}
      });
    });
    await context.route('**/*',route=>{
      const request=route.request(),method=request.method().toUpperCase();
      const url=new URL(request.url());
      if(method!=='GET'&&method!=='HEAD'&&method!=='OPTIONS'){
        blockedMutations.push({method,path:url.pathname});
        return route.abort('blockedbyclient');
      }
      if(method==='GET'&&url.origin===origin
        &&url.pathname==='/api/seonammedi/calendar'
        &&url.searchParams.has('month')){
        const month=url.searchParams.get('month');
        fixtureRequests.push(month);
        return route.fulfill({
          status:200,contentType:'application/json',
          headers:{'cache-control':'no-store'},
          body:JSON.stringify({ok:true,month,items:month===date.slice(0,7)?[FIXTURE]:[]})
        });
      }
      if(url.origin==='https://ekodi.kr'&&url.pathname.startsWith('/auth/')){
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    try{
      const response=await page.goto(shareLink,{waitUntil:'domcontentloaded',timeout:45000});
      row.httpStatus=response?.status()||0;
      must(response?.ok(),'board_http_'+row.httpStatus);
      const article=page.locator('.seonam-calendar-event.is-shared');
      await article.waitFor({state:'visible',timeout:30000});
      row.scheduleTitle=await article.locator('strong').first().innerText();
      must(row.scheduleTitle===FIXTURE.title,'public_calendar_title_not_rendered');
      row.browserTabTitle=await page.title();
      must(row.browserTabTitle===FIXTURE.title+' · 서남권 국립의대 소통센터','shared_page_title_mismatch');
      must(fixtureRequests.includes('2026-10'),'fixture_calendar_not_requested');
      await article.locator('button.seonam-calendar-copy').click();
      const copied=await page.evaluate(()=>navigator.clipboard.readText());
      row.clipboardMatches=copied===shareText+'\n일정 확인: '+shareLink;
      must(row.clipboardMatches,'title_time_url_clipboard_mismatch');
      await article.locator('button.seonam-calendar-share').click();
      const nativeArgs=await page.evaluate(()=>window.__ekodiRecordedShare||null);
      row.webShareArgumentsMatch=Boolean(nativeArgs?.title?.includes(FIXTURE.title)
        &&nativeArgs.text===shareText&&nativeArgs.url===shareLink);
      must(row.webShareArgumentsMatch,'web_share_arguments_mismatch');
      row.fixtureCalendar=fixtureRequests.slice();
      row.mutatingRequestsBlocked=blockedMutations.length;
      row.blockedRequestPaths=blockedMutations.map(x=>x.method+' '+x.path);
      // Real sites may independently send analytics/impression POST requests.
      // The network firewall blocks ALL of them. Distinguish that safe denial
      // from the share UI itself attempting a protected record mutation.
      must(!blockedMutations.some(x=>/^(?:\/api\/seonammedi\/admin(?:\/|$)|\/(?:seonammedi\/)?board\/api\/(?:posts|replies)(?:\/|$))/.test(x.path)),
        'unexpected_calendar_or_board_mutation_attempt');
      row.horizontalOverflow=await page.evaluate(()=>
        document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
      must(!row.horizontalOverflow,'horizontal_overflow');
      const screenshot=path.join(output,origin.replace(/^https:\/\//,'')+'-'+profile.name+'.png');
      await page.screenshot({path:screenshot,fullPage:true,animations:'disabled'});
      row.screenshot=path.basename(screenshot);
      row.ok=true;
    }catch(error){
      row.error=String(error?.message||error).slice(0,850);
      row.fixtureCalendar=fixtureRequests.slice();
      row.mutatingRequestsBlocked=blockedMutations.length;
      row.blockedRequestPaths=blockedMutations.map(x=>x.method+' '+x.path);
    }finally{
      await context.close();
    }
  }
}catch(error){
  evidence.launchError=String(error?.message||error).slice(0,850);
}finally{
  if(browser)await browser.close().catch(()=>{});
  evidence.ok=evidence.results.length===profiles.length&&evidence.results.every(x=>x.ok);
  const file=path.join(output,origin.replace(/^https:\/\//,'')+'-evidence.json');
  await fs.writeFile(file,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
  if(!evidence.ok)process.exitCode=1;
}