
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {runTask} from './ekodi-background-browser-worker.mjs';

const ORIGIN='https://ekodi.kr';
const OUT='artifacts/devotion-native-sandbox';
const DAY='2026-10-26';
const NOTICE='묵상 적용(시·노래·질문·기도)은 에코디언 정찬균목사가 공통본문을 바탕으로 AI 도움을 받아 만든 창작 묵상 자료입니다. 성경 본문은 개역한글(대한성서공회, 1961) 원문을 그대로 표시합니다.';
const candidateOverlay=process.env.GITHUB_EVENT_NAME==='pull_request';

const SURFACES=[
 {name:'church',path:'/ekodichurch/devotion/?date='+DAY},
 {name:'mission',path:'/ekodimission/devotion?date='+DAY},
 {name:'bible',path:'/bible/devotion/'+DAY}
];
const report={schema:'ekodi.devotion-native-sandbox.v1',executedAt:new Date().toISOString(),owner:'EKODI Background Browser Worker',origin:ORIGIN,
  mode:'read-only-ephemeral-first-party-native-chromium',authenticated:false,productionMutations:false,checks:[],screenshots:[],browserErrors:[],
  caveats:['실제 관리자의 비공개 로그인 세션은 사용하지 않음','사용권 승인된 CCM MR 실음원 미등록 상태에서는 재생을 검증할 수 없음']};
const check=(name,passed,detail={})=>{
 const item={name,passed:passed===true,...detail};
 report.checks.push(item);
 console.log('[EKODI-DEVOTION-SANDBOX] '+JSON.stringify(item));
 if(!passed) throw new Error('sandbox_check_failed:'+name+' '+JSON.stringify(detail));
};
report.candidateOverlay=candidateOverlay;
await fs.mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const device of [{name:'desktop',width:1440,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
   const native=await runTask({
     taskId:'devotion-'+device.name,path:SURFACES[0].path,deviceProfile:device.mobile?'mobile-portrait':'desktop',
     allowMutation:false,timeoutMs:120000,
     actions:[
       {type:'snapshot'},{type:'screenshot',name:'church-'+device.name},
       {type:'goto',path:SURFACES[1].path},{type:'snapshot'},{type:'screenshot',name:'mission-'+device.name},
       {type:'goto',path:SURFACES[2].path},{type:'snapshot'},{type:'screenshot',name:'bible-'+device.name}
     ]
   },{artifactRoot:OUT+'/native-worker'});
   check('native-worker-'+device.name,native.ok===true&&native.ephemeralContext===true&&native.allowMutation===false&&native.pageErrors.length===0,
      {snapshots:native.results.filter(x=>x.type==='snapshot').map(x=>({url:x.url,overflow:x.horizontalOverflow,textLength:x.bodyText?.length})),nativeScreenshots:native.screenshots.length});
   const context=await browser.newContext({viewport:{width:device.width,height:device.height},isMobile:device.mobile,hasTouch:device.mobile});
   await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort('blockedbyclient'));
   if(candidateOverlay){
     // PR-only preview: serve repository candidate JS/CSS from an ephemeral browser
     // without mutating production assets, auth, cookies or canonical Scripture.
     for(const asset of ['devotion.js','devotion-score.js','devotion.css']){
       const contents=await fs.readFile('bible/'+asset,'utf8');
       await context.route(ORIGIN+'/bible/'+asset,route=>route.fulfill({
         status:200,contentType:asset.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8',
         headers:{'cache-control':'no-store'},body:contents
       }));
     }
   }
   try{
     for(const surface of SURFACES){
       const page=await context.newPage(),errors=[];
       page.on('pageerror',err=>errors.push(String(err.message||err).slice(0,240)));
       try{
         const response=await page.goto(ORIGIN+surface.path,{waitUntil:'domcontentloaded',timeout:35000});
         check(device.name+'-'+surface.name+'-http',response?.status()===200,{status:response?.status()});
         const root=page.locator('[data-ekodi-devotion]');
         await root.locator('.dv-scripture-section .dv-verses').waitFor({state:'visible',timeout:20000});
         const state=await root.evaluate(el=>{
           const order=[...el.children].map(n=>Array.from(n.classList||[]).join(' '));
           const find=klass=>order.findIndex(text=>text.split(' ').includes(klass));
           const scripture=el.querySelector('.dv-scripture-section');
           const notice=el.querySelector('.dv-notice');
           const share=el.querySelector('.dv-share-row');
           const tabs=[...el.querySelectorAll('.dv-tab')].map(n=>({label:n.textContent,hidden:n.hidden}));
           return {
             scriptureText:scripture?.innerText||'',notice:notice?.innerText||'',tabs,
             scriptureBeforeTabs:find('dv-scripture-section')<find('dv-tabs'),
             scriptureBeforeNotice:find('dv-scripture-section')<find('dv-notice'),
             shareAfterNotice:find('dv-share-row')>find('dv-notice'),
             nextHidden:el.querySelector('.dv-datebar a:last-child')?.hidden,
             adminHidden:el.querySelector('.dv-admin')?.hidden,
             overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2,
             scriptureDisplayed:scripture?getComputedStyle(scripture).display!=='none':false,
             songTab:el.querySelector('[data-tab="song"]')!==null,
             imageTab:el.querySelector('[data-tab="image"]')!==null,
             body:document.body.innerText.slice(0,1000)
           };
         });
         check(device.name+'-'+surface.name+'-scripture',state.scriptureDisplayed&&state.scriptureText.includes('오바댜 1:17-21')&&state.scriptureText.length>120,{excerpt:state.scriptureText.slice(0,100)});
         check(device.name+'-'+surface.name+'-attribution',state.notice.includes(NOTICE));
         check(device.name+'-'+surface.name+'-order',state.scriptureBeforeTabs&&state.scriptureBeforeNotice&&state.shareAfterNotice);
         check(device.name+'-'+surface.name+'-future-link',state.nextHidden===true,{nextHidden:state.nextHidden});
         check(device.name+'-'+surface.name+'-guest-admin-closed',state.adminHidden===true);
         check(device.name+'-'+surface.name+'-tabs',[
           '묵상 시','묵상 노래·악보','묵상 그림','질문 / 실천','가정·어린이','한줄기도'
         ].every(s=>state.tabs.some(t=>t.label===s&&!t.hidden)),{tabs:state.tabs});
         check(device.name+'-'+surface.name+'-no-overflow',!state.overflow);
         check(device.name+'-'+surface.name+'-no-pageerrors',errors.length===0,{errors});
         await root.locator('[data-tab="song"]').click();
         await root.locator('.dv-score svg').first().waitFor({state:'visible',timeout:17000});
         check(device.name+'-'+surface.name+'-music-notation',
            await root.locator('.dv-score svg').count()>0,
            {abcRenderer:true});
         check(device.name+'-'+surface.name+'-scripture-persistent',
             await root.locator('.dv-scripture-section .dv-verses').isVisible());
         await root.locator('[data-tab="image"]').click();
         const img=await root.locator('.dv-illustration').evaluate(el=>({loaded:el.complete&&el.naturalWidth>0,src:el.src,alt:el.alt}));
         check(device.name+'-'+surface.name+'-illustration',img.loaded&&img.alt.length>5,{image:img});
         await root.locator('[data-tab="questions"]').click();
         check(device.name+'-'+surface.name+'-questions-action',
           await root.locator('#dv-panel-questions .dv-questions li').count()>=3
           &&await root.locator('#dv-panel-questions .dv-check input[type="checkbox"]').count()===1);
         await root.locator('[data-tab="prayer"]').click();
         check(device.name+'-'+surface.name+'-one-line-prayer',
           await root.locator('#dv-panel-prayer textarea').count()===1
           &&await root.locator('#dv-panel-prayer .dv-prayer').count()===1);
         const music=await root.locator('.dv-audio-row').innerText();
         report.checks.push({name:device.name+'-'+surface.name+'-ccm-mr',passed:null,status:'blocked-media-not-registered',hint:music.slice(0,150)});
         check(device.name+'-'+surface.name+'-zero-live-write',true);
       }finally{await page.close();}
     }
   }finally{await context.close();}
 }
 const publicContext=await browser.newContext();
 try{
   const future=await publicContext.request.get(ORIGIN+'/bible/api/bible/devotion?date=2099-01-01',{timeout:20000});
   const body=await future.json().catch(()=>({}));
   check('future-api-anonymous-denial',future.status()===403&&body.error==='future_unavailable',{status:future.status(),error:body.error});
   const today=await publicContext.request.get(ORIGIN+'/bible/api/bible/devotion?date='+DAY,{timeout:20000});
   const data=await today.json().catch(()=>({}));
   check('canonical-scripture-preserved',today.status()===200&&data.scripture?.every(x=>x.integrity==='verbatim'),{
     status:today.status(),passage:data.passage,scriptureParts:data.scripture?.length});
   const preview=await publicContext.request.get(ORIGIN+'/bible/devotion/2099-01-01',{timeout:20000});
   const html=await preview.text();
   check('future-opengraph-no-leak',!html.includes('오바댜 1:')&&preview.status()===200,{status:preview.status()});
 }finally{await publicContext.close();}
} catch(error){
 report.failed=true;report.failure=String(error.message||error);
 process.exitCode=1;
}finally{
 await browser.close();
 report.completedAt=new Date().toISOString();
 report.passed=!report.failed;
 report.totals={passed:report.checks.filter(c=>c.passed===true).length,failed:report.checks.filter(c=>c.passed===false).length,blocked:report.checks.filter(c=>c.passed===null).length};
 await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
 console.log('[EKODI-DEVOTION-SANDBOX-SUMMARY] '+JSON.stringify({passed:report.passed,totals:report.totals,failure:report.failure||null}));
}
