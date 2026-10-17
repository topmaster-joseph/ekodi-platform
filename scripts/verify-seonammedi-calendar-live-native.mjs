import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// First-party browser: real published calendar GET and real on-screen share
// interaction. NO database modification, Google token, or mocked event data.
const args=Object.fromEntries(process.argv.slice(2).map(x=>{
  const i=x.indexOf('=');
  return i<0?[x.replace(/^--/,''),'true']:[x.slice(2,i),x.slice(i+1)];
}));
const origin=String(args.origin||'https://seonammedi.kr').replace(/\/+$/,'');
const paths={
  'https://seonammedi.kr':'/board/notices',
  'https://ekodi.kr':'/seonammedi/board/notices'
};
if(!Object.hasOwn(paths,origin))throw new Error('Unapproved EKODI public origin');
const month=String(args.month||'2026-10');
if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Invalid month');
const out=path.resolve(String(args.out||'artifacts/seonammedi-calendar-live'));
await fs.mkdir(out,{recursive:true});
const profiles=[
  {name:'desktop',width:1440,height:900,mobile:false},
  {name:'mobile',width:390,height:844,mobile:true}
];
const report={
  policy:'EKODI-SEONAMMEDI-REAL-PUBLIC-CALENDAR-SHARE-001',
  origin,month,checkedAt:new Date().toISOString(),
  realPublishedEvent:true,fixtureResponse:false,googleAdminLogin:false,
  actualMobileOsShareSheet:false,productionMutation:false,
  runs:[],success:false
};
const must=(ok,message)=>{if(!ok)throw new Error(message)};
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const profile of profiles){
    const result={device:profile.name,viewport:profile.width+'x'+profile.height,ok:false};
    report.runs.push(result);
    const context=await browser.newContext({
      viewport:{width:profile.width,height:profile.height},
      isMobile:profile.mobile,hasTouch:profile.mobile,
      permissions:['clipboard-read','clipboard-write'],
      serviceWorkers:'block',acceptDownloads:false
    });
    const page=await context.newPage();
    const blocked=[];
    // Headless Chromium cannot display an actual OS share sheet. Capture the
    // real UI arguments at the browser API boundary, not a fake success sheet.
    await page.addInitScript(()=>{
      Object.defineProperty(navigator,'share',{
        configurable:true,
        value:async data=>{window.__ekodiRealEventShareArgs=data}
      });
    });
    await context.route('**/*',route=>{
      const req=route.request(),method=req.method().toUpperCase(),url=new URL(req.url());
      if(!['GET','HEAD','OPTIONS'].includes(method)){
        blocked.push({method,path:url.pathname});
        return route.abort('blockedbyclient');
      }
      if(url.origin==='https://ekodi.kr'&&url.pathname.startsWith('/auth/')){
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    try{
      const board=origin+paths[origin];
      const first=await page.goto(board,{waitUntil:'domcontentloaded',timeout:45000});
      must(first?.ok(),'board_http_'+(first?.status()||0));
      const live=await page.evaluate(async month=>{
        const response=await fetch('/api/seonammedi/calendar?month='+encodeURIComponent(month),{cache:'no-store'});
        return {status:response.status,body:await response.json()};
      },month);
      must(live.status===200&&live.body?.ok===true,'public_calendar_api_unavailable');
      const rows=Array.isArray(live.body?.items)?live.body.items:[];
      result.publicEventCount=rows.filter(e=>e?.kind==='event').length;
      const event=rows.find(e=>e?.kind==='event'&&Number.isSafeInteger(Number(e.id))
        &&Number(e.id)>0&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(e.eventStart||'')));
      if(!event){
        result.reason='no_real_public_event_available';
        continue;
      }
      const date=String(event.eventStart).slice(0,10),time=String(event.eventStart).slice(11,16);
      const link=board+'?schedule='+event.id+'&date='+date;
      const title=String(event.title||'일정').replace(/[\r\n\t\u2028\u2029]+/g,' ').replace(/\s+/g,' ').trim().slice(0,180)||'일정';
      result.realEvent={id:event.id,title,date,time};
      const direct=await page.goto(link,{waitUntil:'domcontentloaded',timeout:45000});
      must(direct?.ok(),'shared_link_http_'+(direct?.status()||0));
      const item=page.locator('.seonam-calendar-event.is-shared');
      await item.waitFor({state:'visible',timeout:35000});
      result.eventFocused=true;
      result.tabTitle=await page.title();
      must(result.tabTitle===title+' · 서남권 국립의대 소통센터','event_tab_title_mismatch');
      const buttons=await item.locator('button').allInnerTexts();
      must(buttons.includes('공유')&&buttons.includes('링크 복사'),'share_controls_missing');
      await item.locator('button.seonam-calendar-copy').click();
      const clipboard=await page.evaluate(()=>navigator.clipboard.readText());
      const expected='서남권 국립의대 소통센터 일정\n'+title+'\n'+date.replaceAll('-','.')+' '+time+'\n일정 확인: '+link;
      result.clipboardMatches=clipboard===expected;
      must(result.clipboardMatches,'real_calendar_clipboard_mismatch');
      await item.locator('button.seonam-calendar-share').click();
      const share=await page.evaluate(()=>window.__ekodiRealEventShareArgs||null);
      result.shareArgumentsMatch=Boolean(share?.title===title+' · 서남권 국립의대 소통센터'
        &&share.text==='서남권 국립의대 소통센터 일정\n'+title+'\n'+date.replaceAll('-','.')+' '+time
        &&share.url===link);
      must(result.shareArgumentsMatch,'real_calendar_share_args_mismatch');
      must(!blocked.some(x=>/(?:\/admin\/|\/api\/posts(?:\/|$)|\/api\/replies(?:\/|$))/.test(x.path)),
        'unexpected_protected_mutation_attempt');
      result.blockedBackgroundWrites=blocked.map(x=>x.method+' '+x.path);
      result.noHorizontalOverflow=await page.evaluate(()=>
        document.documentElement.scrollWidth<=document.documentElement.clientWidth+2);
      must(result.noHorizontalOverflow,'horizontal_overflow');
      const shot=path.join(out,origin.replace('https://','')+'-'+profile.name+'.png');
      await page.screenshot({path:shot,fullPage:true,animations:'disabled'});
      result.screenshot=path.basename(shot);
      result.ok=true;
    }catch(error){
      result.reason=String(error?.message||error).slice(0,750);
      result.blockedBackgroundWrites=blocked.map(x=>x.method+' '+x.path);
    }finally{
      await context.close();
    }
  }
}catch(error){
  report.launchError=String(error?.message||error).slice(0,750);
}finally{
  await browser?.close().catch(()=>{});
  report.success=report.runs.length===profiles.length&&report.runs.every(x=>x.ok);
  await fs.writeFile(path.join(out,origin.replace('https://','')+'-evidence.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if(!report.success)process.exitCode=1;
}
