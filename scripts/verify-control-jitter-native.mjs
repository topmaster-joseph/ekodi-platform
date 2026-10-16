/**
 * EKODI first-party production Control geometry diagnostics.
 * Read-only: no account credentials, no production command submission, no DOM text.
 * Compare actual element rectangles at fixed intervals, not just visual screenshots.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin=process.env.EKODI_CONTROL_ORIGIN||'https://ekodi.kr';
if(origin!=='https://ekodi.kr')throw new Error('Unapproved diagnostic origin');
const output=path.resolve('artifacts/control-jitter');
await fs.mkdir(output,{recursive:true});
const profiles=[
  {name:'desktop',width:1440,height:900,isMobile:false,hasTouch:false},
  {name:'mobile',width:390,height:844,isMobile:true,hasTouch:true},
];
const selectors={
  rail:'#controlRail',main:'.control-main',header:'.topbar',
  chat:'#viewChat',conversation:'#conversation',composer:'.composer-wrap',
  input:'#commandInput',heading:'#emptyState h1'
};
const browser=await chromium.launch({headless:true});
const report={version:1,origin,startedAt:new Date().toISOString(),profiles:[],success:true};
const compact=n=>Math.round(n*100)/100;
let errors=0;
try{
  for(const profile of profiles){
    const context=await browser.newContext({
      viewport:{width:profile.width,height:profile.height},
      isMobile:profile.isMobile,hasTouch:profile.hasTouch,
      serviceWorkers:'block',acceptDownloads:false,
      locale:'ko-KR',deviceScaleFactor:1
    });
    const page=await context.newPage();
    const entry={profile:profile.name,viewport:[profile.width,profile.height],ok:false,errors:[]};
    report.profiles.push(entry);
    page.on('pageerror',err=>entry.errors.push(('pageerror: '+err.message).slice(0,180)));
    try{
      const resp=await page.goto(origin+'/control?native_idle_jitter_probe=1',{
        waitUntil:'domcontentloaded',timeout:30000
      });
      entry.http=resp?.status()||0;
      if(entry.http!==200)throw new Error('Control HTTP '+entry.http);
      await page.locator('#commandInput').waitFor({state:'visible',timeout:12000});
      await page.evaluate(async()=>{
        if(document.fonts?.ready)await document.fonts.ready;
      });
      await page.waitForTimeout(1200); // settle fonts/first paint before measuring
      await page.evaluate(()=>{
        const stats={layoutShifts:[],mutations:0,resizeEvents:0,scrollEvents:0,visibilityChanges:0};
        window.__ekodiControlLayoutProbe=stats;
        if('PerformanceObserver' in window){
          try{
            const observer=new PerformanceObserver(list=>{
              for(const e of list.getEntries()){
                if(!e.hadRecentInput)stats.layoutShifts.push({
                  value:Math.round(e.value*1000000)/1000000,
                  when:Math.round(e.startTime)
                });
              }
            });
            observer.observe({type:'layout-shift',buffered:false});
            stats.observer=observer;
          }catch{}
        }
        const mount=document.querySelector('.control-shell');
        if(mount){
          stats.domObserver=new MutationObserver(batch=>{stats.mutations+=batch.length});
          stats.domObserver.observe(mount,{attributes:true,childList:true,subtree:true});
        }
        const tick=()=>stats.resizeEvents++;
        window.addEventListener('resize',tick,{passive:true});
        window.addEventListener('scroll',()=>stats.scrollEvents++,{passive:true});
        document.addEventListener('visibilitychange',()=>stats.visibilityChanges++);
      });
      const run=async(label,milliseconds)=>{
        return await page.evaluate(async({selectors,milliseconds,label})=>{
          const keys=Object.keys(selectors);
          const point=()=>{
            const rectangles={};
            for(const key of keys){
              const node=document.querySelector(selectors[key]);
              if(!node)continue;
              const r=node.getBoundingClientRect();
              rectangles[key]=[r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100);
            }
            return{
              t:Math.round(performance.now()),
              xy:[scrollX,scrollY],size:[innerWidth,innerHeight],
              bodyHeight:document.body.scrollHeight,
              docHeight:document.documentElement.scrollHeight,
              vv:window.visualViewport?
                [window.visualViewport.width,window.visualViewport.height,window.visualViewport.offsetTop].map(v=>Math.round(v*100)/100)
                :null,
              rectangles
            };
          };
          const samples=[point()];
          const until=performance.now()+milliseconds;
          while(performance.now()<until){
            await new Promise(resolve=>setTimeout(resolve,150));
            samples.push(point());
          }
          return{label,samples};
        },{selectors,milliseconds,label});
      };
      entry.idle=await run('idle',9000);
      await page.screenshot({path:path.join(output,profile.name+'-idle.png'),animations:'disabled'});
      // This only changes the local unsent text, never calls the Control submit endpoint.
      await page.locator('#commandInput').fill('EKODI 화면 안정성 테스트 '+('가나다라마바사 '.repeat(15)));
      entry.input=await run('input-local-only',3000);
      await page.locator('#commandInput').fill('');
      entry.afterClear=await run('after-clear',1500);
      entry.diagnostics=await page.evaluate(()=>{
        const s=window.__ekodiControlLayoutProbe||{};
        s.observer?.disconnect();s.domObserver?.disconnect();
        return{layoutShifts:s.layoutShifts||[],mutations:s.mutations||0,
          resizeEvents:s.resizeEvents||0,scrollEvents:s.scrollEvents||0,
          visibilityChanges:s.visibilityChanges||0};
      });
      const summarize=phase=>{
        const samples=phase.samples;
        const keys=Object.keys(selectors);
        const result={count:samples.length,delta:{}};
        const varying=array=>array.length?compact(Math.max(...array)-Math.min(...array)):0;
        for(const key of keys){
          const available=samples.map(x=>x.rectangles[key]).filter(Boolean);
          if(available.length===0)continue;
          result.delta[key]=['x','y','width','height'].map((label,i)=>[label,varying(available.map(x=>x[i]))]);
        }
        result.scrollY=varying(samples.map(x=>x.xy[1]));
        result.scrollX=varying(samples.map(x=>x.xy[0]));
        result.innerWidth=varying(samples.map(x=>x.size[0]));
        result.innerHeight=varying(samples.map(x=>x.size[1]));
        result.visualViewportHeight=varying(samples.map(x=>x.vv?.[1]||0));
        return result;
      };
      entry.idleSummary=summarize(entry.idle);
      entry.inputSummary=summarize(entry.input);
      entry.afterClearSummary=summarize(entry.afterClear);
      const mainKeys=['rail','main','header','chat','composer','input','heading'];
      const idleDrift=mainKeys.some(key=>
        (entry.idleSummary.delta[key]||[]).some(([axis,delta])=>delta>1)
      );
      const idleScroll=entry.idleSummary.scrollY>1||entry.idleSummary.scrollX>1;
      const idleViewport=entry.idleSummary.innerHeight>1||entry.idleSummary.visualViewportHeight>1;
      const idleShifts=entry.diagnostics.layoutShifts.filter(x=>x.when<=entry.idle.samples.at(-1).t)
        .reduce((sum,x)=>sum+x.value,0);
      entry.verdict={idleDrift,idleScroll,idleViewport,layoutShiftScore:compact(idleShifts)};
      entry.ok=!idleDrift&&!idleScroll&&!idleViewport&&!entry.errors.length;
      if(!entry.ok)errors++;
      // Do not upload input contents, cookies, origin response text or storage.
      for(const phase of ['idle','input','afterClear'])delete entry[phase];
    }catch(error){
      entry.ok=false;entry.errors.push(String(error.message||error).slice(0,300));errors++;
    }finally{
      await context.close();
    }
  }
}finally{
  await browser.close();
}
report.success=errors===0;
report.finishedAt=new Date().toISOString();
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
for(const p of report.profiles){
  process.stdout.write(JSON.stringify({profile:p.profile,http:p.http,ok:p.ok,
    verdict:p.verdict,idleSummary:p.idleSummary,diagnostics:p.diagnostics,
    errors:p.errors})+'\n');
}
if(!report.success)process.exitCode=1;
