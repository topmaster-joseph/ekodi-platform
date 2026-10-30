import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {runTask} from './ekodi-background-browser-worker.mjs';

const base='https://ekodi.kr/ekodimission';
const dir='artifacts/mission-home-native';
await fs.mkdir(dir,{recursive:true});
const results={version:'mission-home-20261030',source:'EKODI Background Browser Worker',
  origin:base,readOnly:true,checks:[],passed:false,startedAt:new Date().toISOString()};
const browser=await chromium.launch({headless:true,
  ...(process.env.EKODI_NATIVE_CHROME?{executablePath:process.env.EKODI_NATIVE_CHROME}:{})});
function verify(label,ok,info={}){
 const row={label,passed:ok===true,...info};
 results.checks.push(row);
 console.log('[EKODI-MISSION-HOME] '+JSON.stringify(row));
 if(!row.passed)throw Error('validation_failed:'+label);
}
try{
 for(const d of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  const firstParty=await runTask({
    taskId:'mission-home-'+d.name,path:'/ekodimission',
    deviceProfile:d.name==='mobile'?'mobile-portrait':'desktop',
    allowMutation:false,timeoutMs:90000,
    actions:[{type:'waitFor',selector:'[data-mission-public-photo]',timeoutMs:15000},
      {type:'snapshot'},{type:'screenshot',name:'mission-home-'+d.name}]
  },{artifactRoot:dir+'/ekodi-worker'});
  verify(d.name+'-ekodi-browser',firstParty.ok===true&&firstParty.allowMutation===false,
    {ok:firstParty.ok,errors:firstParty.pageErrors?.length||0});
  const context=await browser.newContext({viewport:{width:d.width,height:d.height},acceptDownloads:false});
  await context.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?
    r.continue():r.abort('blockedbyclient'));
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  try{
    const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
    verify(d.name+'-public-200',response?.status()===200,{status:response?.status()});
    await page.locator('[data-mission-public-photo]').waitFor({timeout:12000});
    await page.waitForTimeout(1700);
    const layout=await page.evaluate(()=>{
      const rect=x=>{let b=document.querySelector(x)?.getBoundingClientRect();return b?{x:b.x,width:b.width,height:b.height}:null};
      const image=document.querySelector('[data-mission-public-photo-image]');
      const fallback=document.querySelector('[data-mission-photo-fallback]');
      const src=image?.getAttribute('src')||'';
      return {
        main:rect('main'),header:rect('.mission-site-header'),
        footer:rect('.site-footer'),hero:rect('.hero-split'),
        photo:rect('.mission-home-photo'),saturday:rect('[data-mission-saturday]'),
        fallbackVisible:!!fallback && !fallback.hidden,
        imgVisible:!!image && !image.hidden,
        src,
        imageAlt:image?.alt||'',
        bodyOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
        browserZoom:window.devicePixelRatio,
        viewportWidth:document.documentElement.clientWidth
      }
    });
    verify(d.name+'-header-main-footer-aligned',
      Math.abs(layout.header.x-layout.main.x)<3 &&
      Math.abs(layout.footer.x-layout.main.x)<3 &&
      Math.abs(layout.header.width-layout.main.width)<3 &&
      Math.abs(layout.footer.width-layout.main.width)<3,layout);
    verify(d.name+'-content-readable',
      layout.main.width >= (d.name==='desktop'?950:350) &&
      layout.hero.width>0 && layout.photo.height>=220 &&
      layout.photo.width <= layout.hero.width+1 &&
      layout.saturday.width>0 && !layout.bodyOverflow,layout);
    verify(d.name+'-approved-photo-or-honest-fallback',
      layout.fallbackVisible!==layout.imgVisible &&
      (layout.fallbackVisible ? !layout.src :
        /^https:\/\/ekodi\.kr\/ekodimission\/media\/[0-9a-f-]{36}$/i.test(layout.src)),
      {fallbackVisible:layout.fallbackVisible,imgVisible:layout.imgVisible,src:layout.src});
    verify(d.name+'-no-runtime-errors',errors.length===0,{errors});
    await page.screenshot({path:path.join(dir,'home-'+d.name+'.png'),fullPage:true});
  }finally{await context.close()}
 }
 results.passed=true;
}catch(e){results.error=String(e.stack||e);process.exitCode=1}
finally{
 await browser.close();
 results.finishedAt=new Date().toISOString();
 await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(results,null,2));
 console.log('[EKODI-MISSION-HOME] RESULT '+JSON.stringify({passed:results.passed,checks:results.checks.length,error:results.error||null}));
 if(!results.passed)process.exitCode=1;
}