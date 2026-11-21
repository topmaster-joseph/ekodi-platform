#!/usr/bin/env node
// Read-only, isolated Chromium proof of canonical Education subpage links and QR destinations.
// No personal Opera session, browser profile, instructor token, QR secret, or student record is used.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {learnerUrl} from '../education/study/live/engine/model.js';
import {encodeQr,qrSvg} from '../education/study/live/engine/qr.js';

const ORIGIN='https://ekodi.kr',BASE=ORIGIN+'/edu/';
const OUT=resolve('artifacts/education-deep-link-qr-native');
const report={scope:BASE,policy:'direct-link-only-no-redirect',ok:false,paths:[],qrChecks:[],errors:[],pages:0,requests:0,protected:0};
const inputPaths=[
 '', 'admission/','study/','courses/','learn/','teach/',
 'fields/ai-digital/','fields/safety/','fields/experience/',
 'audiences/staff/','audiences/foreign-workers/','audiences/farmers/','audiences/children/',
 'study/academy/','study/ai-bootcamp/','study/ai-bootcamp/studio/','study/ai-bootcamp/documents/',
 'study/farm-marketing/','study/cold-safety-2026/','pizza-experience/','factchat/',
 'study/live/?c=mnu-factchat-120m-2026','study/live/?c=mnu-factchat-2026',
 'study/live/lab/?c=mnu-factchat-120m-2026','study/live/lab/?c=mnu-factchat-2026',
 'study/live/handout/?c=mnu-factchat-120m-2026','study/live/handout/?c=mnu-factchat-2026',
 'study/live/present/?c=mnu-factchat-120m-2026','study/live/present/?c=mnu-factchat-2026',
 'study/live/guide/','study/live/guide/stats.html','study/live/guide/feedback.html',
 'study/live/feedback/?s=1','study/live/screen-share/',
 'study/live/docs/','study/live/unlock/',
];
const protectedPath=/^\/edu\/(?:teach\/|study\/live\/(?:docs\/|guide\/|unlock\/))/;
const neverVisit=/\/api\/|(?:\?|&)gate=logout|(?:\?|&)action=delete|(?:\?|&)logout=|\/(?:logout|disconnect)(?:\/|\?|$)/;
const allowedCodes=new Set([200,401,403]);
const unique=x=>[...new Set(x)];
function assert(ok,message){if(!ok)throw Error(message)}
function pathOnly(url){const u=new URL(url);return u.pathname+(u.searchParams.has('c')?'?c='+u.searchParams.get('c'):u.searchParams.has('s')?'?s='+u.searchParams.get('s'):'');}
function canonical(value){
 const u=new URL(value,BASE);
 if(u.origin!==ORIGIN||!u.pathname.startsWith('/edu/')||/^\/edu(?:\/edu)+(?=\/|$)/.test(u.pathname))return null;
 if(neverVisit.test(u.pathname+u.search))return null;
 if(u.hash)u.hash='';
 const only=new URLSearchParams();
 for(const key of ['c','s','m','lv','open'])if(u.searchParams.has(key))only.set(key,u.searchParams.get(key));
 u.search=only.toString()?'?'+only.toString():'';
 return u.href;
}
function qrPayload(url,kind){
 const target=new URL(url);
 assert(target.origin===ORIGIN,kind+' QR escaped the canonical EKODI host');
 assert(target.pathname.startsWith('/edu/'),kind+' QR is outside Education');
 assert(!target.pathname.includes('/edu/edu/'),kind+' QR has a duplicated mount');
 const encoded=encodeQr(url),svg=qrSvg(url,{label:kind+' QR'});
 assert(encoded.size>=21&&encoded.modules.length===encoded.size,kind+' QR cannot be encoded');
 assert(svg.includes('<svg')&&svg.includes('<path d="'),kind+' QR SVG is empty');
 report.qrChecks.push({kind,path:target.pathname,qrMatrix:encoded.size});
}
let browser;
try{
 await mkdir(OUT,{recursive:true});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
 const page=await ctx.newPage();
 const navigationQueue=inputPaths.map(path=>BASE+path);
 const attempted=new Set(),checkedLinks=new Set();
 const originCatalog=await ctx.request.get(BASE+'courses/catalog.json',{maxRedirects:0,timeout:22000});
 assert(originCatalog.status()===200,'canonical six-course catalog returned '+originCatalog.status());
 const catalog=await originCatalog.json();
 assert(Array.isArray(catalog.courses)&&catalog.courses.length===6,'six canonical registered courses required');
 for(const course of catalog.courses){
  for(const role of ['courses','learn','teach'])navigationQueue.push(BASE+role+'/'+course.id+'/');
  for(const link of [course.studyUrl,course.learnerTool,...(course.resources||[]).map(r=>r.url)].filter(Boolean)){
   assert(link.startsWith('/edu/'),'catalog still depends on proxy prefix: '+course.id);
   navigationQueue.push(ORIGIN+link);
  }
  if(course.id.startsWith('mnu-factchat')){
   for(const s of (course.id==='mnu-factchat-2026'?[1,2]:[1])){
    const join=learnerUrl(ORIGIN,'/edu/study/live/present/',{c:course.id,s,lv:'basic'});
    qrPayload(join,course.id+' lesson '+s);
    navigationQueue.push(join);
   }
  }
 }
 for(const s of [1,2,3,4,5,6]){
  const feedback=BASE+'study/live/feedback/?s='+s;
  qrPayload(feedback,'anonymous feedback session '+s);
  navigationQueue.push(feedback);
 }
 assert(canonical(BASE+'study/live/screen-share/')===BASE+'study/live/screen-share/','screen sharing QR join page must be direct');
 // Never mint a QR room in this read-only proof. Authenticated room creation and #k
 // fragment checks are separately enforced by verify-education-screen-share-native.mjs.
 const maxPaths=120;
 while(navigationQueue.length&&attempted.size<maxPaths){
  const target=canonical(navigationQueue.shift());
  if(!target||attempted.has(target))continue;
  attempted.add(target);
  const network=await ctx.request.get(target,{maxRedirects:0,timeout:20000,failOnStatusCode:false});
  report.requests++;
  const code=network.status(),loc=network.headers()['location']||'';
  assert(![301,302,303,307,308].includes(code),'redirect-dependent Education link: '+pathOnly(target)+' → '+loc);
  assert(allowedCodes.has(code),'broken Education subpage '+pathOnly(target)+' returned '+code);
  const expectedPrivate=protectedPath.test(new URL(target).pathname);
  if(code===401||code===403){report.protected++;continue;}
  const contentType=String(network.headers()['content-type']||'');
  if(!contentType.includes('text/html'))continue;
  const navigation=await page.goto(target,{waitUntil:'domcontentloaded',timeout:30000});
  assert(navigation?.status()===200,'Chromium navigation failed '+pathOnly(target));
  assert(new URL(page.url()).pathname===new URL(target).pathname,'page URL changed through redirect '+target+' -> '+page.url());
  await page.waitForTimeout(180);
  const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(a=>({href:a.getAttribute('href'),url:a.href})));
  let localLinks=0;
  for(const l of links){
   if(!l.href||l.href.startsWith('#')||/^(?:mailto:|tel:|javascript:|data:)/i.test(l.href))continue;
   const current=new URL(l.url);
   if(current.origin!==ORIGIN||!current.pathname.startsWith('/edu/'))continue;
   assert(!/^\/edu(?:\/edu)+(?=\/|$)/.test(current.pathname),'double /edu link rendered at '+pathOnly(target)+': '+current.pathname);
   const dest=canonical(current.href);
   if(dest&&dest!==target&&!checkedLinks.has(dest)){
    checkedLinks.add(dest);navigationQueue.push(dest);
   }
   localLinks++;
  }
  if(page.locator('#joinQr svg').count){
   const joinText=await page.locator('#joinUrl').count()?await page.locator('#joinUrl').textContent():'';
   const hasQr=await page.locator('#joinQr svg').count();
   if(hasQr&&joinText?.trim()){
    const next=new URL(joinText.trim());
    assert(next.pathname==='/edu/study/live/lab/','displayed QR learner link has wrong landing page');
    assert(next.origin===ORIGIN,'displayed QR learner link has wrong origin');
    qrPayload(next.href,'visible Premium Studio learner QR');
   }
  }
  report.paths.push({path:pathOnly(target),code,links:localLinks});
  report.pages++;
 }
 assert(report.pages>=24,'too few live Education subpages audited: '+report.pages);
 assert(checkedLinks.size>=26,'too few internal links discovered: '+checkedLinks.size);
 // Public QR destinations must be GET 200 on their own canonical route, without
 // requiring a redirect or the student's personal account.
 for(const url of unique(report.qrChecks.map(c=>ORIGIN+c.path))){
  const result=await ctx.request.get(url,{maxRedirects:0,timeout:20000,failOnStatusCode:false});
  assert(result.status()===200,'QR destination is not a direct public page: '+new URL(url).pathname+' '+result.status());
 }
 report.ok=true;report.discovered=checkedLinks.size;report.visited=attempted.size;
 console.log(JSON.stringify({ok:true,pages:report.pages,protected:report.protected,discovered:report.discovered,qr:report.qrChecks.length,requests:report.requests}));
 await ctx.close();
}catch(error){
 report.error=String(error?.stack||error).slice(0,2500);
 console.error(JSON.stringify({ok:false,error:report.error,checked:report.pages,failedPath:report.paths.at(-1)?.path}));
 process.exitCode=1;
}finally{
 await writeFile(resolve(OUT,'result.json'),JSON.stringify(report,null,2));
 await browser?.close();
}
