#!/usr/bin/env node
// Real canonical /edu verification after guarded promotion: anonymous catalog, audience,
 // learner content, fail-closed teacher access. No privileged or student records are created.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const base='https://ekodi.kr/edu';
const folder=resolve('artifacts/education-course-hub-native');
const evidence={ok:false,base,widths:[],checks:[],courseId:'foreign-worker-cold-safety-2026'};
let browser;
const fail=msg=>{throw Error(msg)};
try{
 await mkdir(folder,{recursive:true});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,768,1366,1440]){
  const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(String(err.message)));
  const response=await page.goto(base+'/courses/',{waitUntil:'domcontentloaded',timeout:30000});
  if(response?.status()!==200)fail('catalog status '+response?.status()+' at '+width);
  await page.getByRole('heading',{name:'교육과정 통합안내'}).waitFor({timeout:16000});
  const count=await page.locator('.hub-course-card').count();
  if(count!==6)fail('expected six canonical course cards at '+width+', got '+count);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  if(overflow>4)fail('horizontal overflow at '+width+'px: '+overflow);
  if(errors.length)fail('catalog JS error at '+width+': '+errors.slice(0,3).join(';'));
  if(width===390){
   // Guard the real defect: the shared canonical proxy already prefixes JSON
   // course links with /edu and the UI must not produce /edu/edu/... URLs.
   const overview=await page.goto(base+'/courses/mnu-factchat-2026/',{waitUntil:'domcontentloaded',timeout:30000});
   if(overview?.status()!==200)fail('FactChat course overview status '+overview?.status());
   const originalStudy=page.getByRole('link',{name:'기존 과정 안내·학습 페이지'});
   await originalStudy.waitFor({timeout:12000});
   const href=await originalStudy.getAttribute('href');
   const canonical=new URL(href,page.url());
   if(canonical.origin!=='https://ekodi.kr'||canonical.pathname!=='/edu/study/live/')
      fail('course original link contains double Education mount: '+canonical.href);
   const oldLinks=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href).filter(h=>/\/edu\/edu(?:\/|$)/.test(new URL(h).pathname)));
   if(oldLinks.length)fail('Double prefix remains in course detail: '+oldLinks.join('; '));
   const studyResponse=await ctx.request.get(canonical.href);
   if(studyResponse.status()!==200)fail('actual course original study target does not resolve: '+studyResponse.status());
   evidence.checks.push({courseResourceCanonical:true,originalStudy200:true});
   const filter=await page.goto(base+'/fields/safety/',{waitUntil:'domcontentloaded',timeout:30000});
   if(filter?.status()!==200)fail('safety field status '+filter?.status());
   await page.getByRole('heading',{name:'안전·보건 교육'}).waitFor({timeout:12000});
   if(await page.locator('.hub-course-card').count()!==1)fail('safety catalog should have one canonical course');
   const audience=await page.goto(base+'/audiences/foreign-workers/',{waitUntil:'domcontentloaded'});
   if(audience?.status()!==200)fail('foreign worker audience status '+audience?.status());
   await page.getByRole('heading',{name:'외국인 근로자 교육'}).waitFor({timeout:12000});
   if(await page.locator('.hub-course-card').count()!==1)fail('foreign worker audience catalog must not duplicate course');
   const learner=await page.goto(base+'/learn/foreign-worker-cold-safety-2026/',{waitUntil:'domcontentloaded'});
   if(learner?.status()!==200)fail('learner status '+learner?.status());
   await page.locator('#hubSlideTitle').waitFor({timeout:12000});
   if(!(await page.locator('#hubProgress').innerText()).includes('한랭질환'))fail('learner stages missing');
   if(!(await page.locator('.hub-stage').innerText()).includes('1 /'))fail('student presentation step missing');
   const write=await ctx.request.put(base+'/teach/live-state',{headers:{'content-type':'application/json','origin':base.replace('/edu','')},data:{courseId:'foreign-worker-cold-safety-2026',step:1}});
   if(write.status()!==403)fail('anonymous teacher write was allowed '+write.status());
   const teacher=await page.goto(base+'/teach/',{waitUntil:'domcontentloaded'});
   if(teacher?.status()!==401)fail('teacher room did not reject anonymous '+teacher?.status());
   await page.getByRole('heading',{name:'강사 운영실 인증'}).waitFor({timeout:12000});
   const roster=await ctx.request.get(base+'/teach/instructors');
   if(roster.status()!==403)fail('teacher registration leaks without admin '+roster.status());
   evidence.checks.push({filtered:true,audience:true,learner:true,studentWriteDenied:true,teacherDenied:true,registryDenied:true});
  }
  await page.goto(base+'/courses/',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'교육과정 통합안내'}).waitFor({timeout:12000});
  await page.screenshot({path:resolve(folder,'hub-'+width+'.png'),fullPage:true});
  evidence.widths.push({width,count,overflow});
  await ctx.close();
 }
 evidence.ok=true;console.log(JSON.stringify(evidence));
}catch(e){evidence.error=String(e.stack||e).slice(0,2200);console.error(JSON.stringify(evidence));process.exitCode=1}
finally{await writeFile(resolve(folder,'result.json'),JSON.stringify(evidence,null,2));await browser?.close()}
