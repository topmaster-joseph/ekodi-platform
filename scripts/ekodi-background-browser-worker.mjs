import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://ekodi.kr';
const PROFILE = Object.freeze({
  'compact-mobile': { width:320, height:568, isMobile:true, hasTouch:true },
  'mobile-portrait': { width:390, height:844, isMobile:true, hasTouch:true },
  'mobile-landscape': { width:844, height:390, isMobile:true, hasTouch:true },
  tablet: { width:768, height:1024, isMobile:false, hasTouch:true },
  desktop: { width:1440, height:900, isMobile:false, hasTouch:false },
});
const ACTIONS = new Set(['goto','click','fill','press','waitFor','assertText','snapshot','screenshot']);
const SAFE_KEYS = new Set(['Enter','Tab','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown','Space']);

const clean=(value,max=300)=>String(value??'').trim().slice(0,max);
const now=()=>new Date().toISOString();

function fail(code,message){ const e=new Error(message||code); e.code=code; throw e; }

function safePath(value){
  const raw=clean(value,1200)||'/';
  let url;
  try { url=new URL(raw,ORIGIN); } catch { fail('BROWSER_URL_INVALID','Invalid browser target'); }
  if(url.origin!==ORIGIN) fail('BROWSER_ORIGIN_FORBIDDEN','Browser navigation must stay on canonical ekodi.kr');
  if(url.username||url.password) fail('BROWSER_USERINFO_FORBIDDEN','URL userinfo is forbidden');
  return url.pathname+url.search+url.hash;
}
function selector(value){
  const v=clean(value,300);
  if(!v) fail('BROWSER_SELECTOR_REQUIRED','Selector is required');
  return v;
}
function textValue(value,max=1000){ return String(value??'').slice(0,max); }

export function normalizeTask(raw={}){
  const deviceProfile=clean(raw.deviceProfile,40)||'desktop';
  if(!PROFILE[deviceProfile]) fail('BROWSER_DEVICE_PROFILE_INVALID','Unsupported device profile');
  const actions=Array.isArray(raw.actions)?raw.actions:[];
  if(actions.length>30) fail('BROWSER_TOO_MANY_ACTIONS','Too many browser actions');
  const normalized=actions.map((item,index)=>{
    const type=clean(item?.type,40);
    if(!ACTIONS.has(type)) fail('BROWSER_ACTION_INVALID',`Unsupported browser action at ${index}`);
    if(type==='goto') return {type,path:safePath(item.path||item.url||'/')};
    if(type==='click') return {type,selector:selector(item.selector)};
    if(type==='fill') return {type,selector:selector(item.selector),value:textValue(item.value)};
    if(type==='press'){
      const key=clean(item.key,40);
      if(!SAFE_KEYS.has(key)) fail('BROWSER_KEY_INVALID','Unsupported key');
      return {type,selector:selector(item.selector),key};
    }
    if(type==='waitFor') return {type,selector:selector(item.selector),timeoutMs:Math.min(Math.max(Number(item.timeoutMs)||5000,100),15000)};
    if(type==='assertText') {
      const value=textValue(item.text,500);
      if(!value) fail('BROWSER_ASSERT_TEXT_REQUIRED','assertText requires text');
      return {type,text:value};
    }
    if(type==='screenshot') return {type,name:clean(item.name,80)||`shot-${index+1}`,fullPage:item.fullPage!==false};
    return {type};
  });
  return {
    taskId:clean(raw.taskId,120)||`browser-${Date.now()}`,
    path:safePath(raw.path||'/'),
    deviceProfile,
    allowMutation:raw.allowMutation===true,
    actions:normalized,
    timeoutMs:Math.min(Math.max(Number(raw.timeoutMs)||60000,5000),120000),
  };
}

async function readTask(){
  const file=clean(process.env.EKODI_BROWSER_TASK_FILE,1000);
  if(file) return JSON.parse(await fs.readFile(file,'utf8'));
  const json=process.env.EKODI_BROWSER_TASK_JSON;
  if(json) return JSON.parse(json);
  return { path:'/', deviceProfile:'desktop', actions:[{type:'snapshot'},{type:'screenshot',name:'default'}] };
}

async function ensureDir(dir){ await fs.mkdir(dir,{recursive:true}); }

export async function runTask(rawTask, options={}){
  const task=normalizeTask(rawTask);
  const artifactRoot=path.resolve(options.artifactRoot||process.env.EKODI_BROWSER_ARTIFACT_DIR||'artifacts/background-browser-worker');
  const taskDir=path.join(artifactRoot,task.taskId.replace(/[^a-zA-Z0-9._-]/g,'_'));
  await ensureDir(taskDir);
  const { chromium }=await import('playwright');
  const browser=await chromium.launch({headless:true});
  const device=PROFILE[task.deviceProfile];
  const context=await browser.newContext({
    viewport:{width:device.width,height:device.height},
    isMobile:device.isMobile,
    hasTouch:device.hasTouch,
    acceptDownloads:false,
  });
  const page=await context.newPage();
  const consoleErrors=[],pageErrors=[],requestFailures=[],httpErrorResponses=[],blockedMutations=[];
  page.on('console',msg=>{ if(msg.type()==='error') consoleErrors.push(clean(msg.text(),500)); });
  page.on('pageerror',err=>pageErrors.push({
    name:clean(err?.name||'Error',120),
    message:clean(err?.message||err,500),
    stack:clean(err?.stack||'',2400),
    url:clean(page.url(),500),
  }));
  page.on('requestfailed',req=>requestFailures.push({url:clean(req.url(),500),failure:clean(req.failure()?.errorText,200)}));
  page.on('response',res=>{
    const status=res.status();
    if(status>=400) httpErrorResponses.push({url:clean(res.url(),500),status,statusText:clean(res.statusText(),120),resourceType:clean(res.request().resourceType(),80)});
  });

  await page.route('**/*',async route=>{
    const req=route.request();
    const method=req.method().toUpperCase();
    if(!task.allowMutation && !['GET','HEAD','OPTIONS'].includes(method)){
      blockedMutations.push({method,url:clean(req.url(),500)});
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  const startedAt=now();
  const deadline=Date.now()+task.timeoutMs;
  const results=[];
  const screenshots=[];
  const recoveredNavigations=[];
  const remaining=()=>Math.max(100,deadline-Date.now());
  // Pace mobile read-only verification across canonical services. Never bypass
  // Cloudflare rate limiting or conceal a failure after bounded retries.
  let lastNavigationAt=0;
  const goto=async p=>{
    if(Date.now()>=deadline) fail('BROWSER_TASK_TIMEOUT','Browser task timed out');
    const canonicalPath=safePath(p);
    const target=ORIGIN+canonicalPath;
    for(let attempt=0;attempt<3;attempt++){
      const minimumGap=task.deviceProfile.includes('mobile')?2200:500;
      const pause=Math.max(0,minimumGap-(Date.now()-lastNavigationAt));
      if(pause>0) await page.waitForTimeout(Math.min(pause,remaining()));
      if(Date.now()>=deadline) fail('BROWSER_TASK_TIMEOUT','Browser task timed out');
      const startingResponses=httpErrorResponses.length;
      const startingPageErrors=pageErrors.length;
      const startingConsoleErrors=consoleErrors.length;
      const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:Math.min(30000,remaining())});
      lastNavigationAt=Date.now();
      if(new URL(page.url()).origin!==ORIGIN) fail('BROWSER_REDIRECT_ORIGIN_FORBIDDEN','Navigation escaped canonical origin');
      // Allow critical dynamic imports to settle before evaluating transient status.
      await page.waitForTimeout(Math.min(task.deviceProfile.includes('mobile')?650:250,remaining()));
      const status=response?.status()??null;
      const transient=[429,502,503,504];
      const subresourceErrors=httpErrorResponses.slice(startingResponses).filter(item=>
        item.url.startsWith(ORIGIN+'/') && transient.includes(item.status));
      const transientStatus=transient.includes(status)?status:subresourceErrors[0]?.status;
      if(transientStatus){
        const record={path:canonicalPath,attempt:attempt+1,status:transientStatus,recovered:false,
          pageErrors:pageErrors.slice(startingPageErrors),
          httpErrors:httpErrorResponses.slice(startingResponses)};
        recoveredNavigations.push(record);
        if(attempt===2 || remaining()<4000) fail('BROWSER_NAVIGATION_THROTTLED',
          'Navigation '+canonicalPath+' returned transient HTTP '+transientStatus+' after bounded retry');
        // Keep an explicit recovery trail instead of contaminating the final page's
        // validation with a discarded navigation's errors.
        pageErrors.splice(startingPageErrors);
        consoleErrors.splice(startingConsoleErrors);
        httpErrorResponses.splice(startingResponses);
        const headerRetry=Number(response?.headers()?.['retry-after']||0);
        const backoff=Math.min(12000,Math.max(2500*(attempt+1),Number.isFinite(headerRetry)?headerRetry*1000:0));
        await page.waitForTimeout(Math.min(backoff,remaining()));
        continue;
      }
      if(status!==null && status>=400) fail('BROWSER_NAVIGATION_HTTP_ERROR','Navigation '+canonicalPath+' returned HTTP '+status);
      for(const record of recoveredNavigations) if(record.path===canonicalPath) record.recovered=true;
      return {url:page.url(),status};
    }
    fail('BROWSER_NAVIGATION_THROTTLED','Navigation '+canonicalPath+' exhausted attempts');
  };

  try{
    results.push({type:'initial-goto',...(await goto(task.path))});
    for(let i=0;i<task.actions.length;i++){
      if(Date.now()>=deadline) fail('BROWSER_TASK_TIMEOUT','Browser task timed out');
      const action=task.actions[i];
      if(action.type==='goto'){ results.push({type:'goto',...(await goto(action.path))}); continue; }
      if(action.type==='click'){
        await page.locator(action.selector).first().click({timeout:Math.min(10000,remaining())});
        await page.waitForTimeout(200);
        if(new URL(page.url()).origin!==ORIGIN) fail('BROWSER_REDIRECT_ORIGIN_FORBIDDEN','Click navigation escaped canonical origin');
        results.push({type:'click',selector:action.selector,url:page.url()}); continue;
      }
      if(action.type==='fill'){
        await page.locator(action.selector).first().fill(action.value,{timeout:Math.min(10000,remaining())});
        results.push({type:'fill',selector:action.selector,valueLength:action.value.length}); continue;
      }
      if(action.type==='press'){
        await page.locator(action.selector).first().press(action.key,{timeout:Math.min(10000,remaining())});
        await page.waitForTimeout(150);
        if(new URL(page.url()).origin!==ORIGIN) fail('BROWSER_REDIRECT_ORIGIN_FORBIDDEN','Key navigation escaped canonical origin');
        results.push({type:'press',selector:action.selector,key:action.key,url:page.url()}); continue;
      }
      if(action.type==='waitFor'){
        await page.locator(action.selector).first().waitFor({state:'visible',timeout:Math.min(action.timeoutMs,remaining())});
        results.push({type:'waitFor',selector:action.selector,visible:true}); continue;
      }
      if(action.type==='assertText'){
        const body=(await page.locator('body').innerText({timeout:Math.min(10000,remaining())})).slice(0,100000);
        if(!body.includes(action.text)) fail('BROWSER_ASSERT_TEXT_FAILED',`Expected text not found: ${action.text.slice(0,120)}`);
        results.push({type:'assertText',text:action.text,matched:true}); continue;
      }
      if(action.type==='snapshot'){
        let snap=null;
        for(let attempt=0;attempt<3;attempt++){
          try{
            await page.waitForLoadState('domcontentloaded',{timeout:Math.min(3000,remaining())}).catch(()=>{});
            snap=await page.evaluate(()=>({
              title:document.title,
              url:location.href,
              readyState:document.readyState,
              bodyText:(document.body?.innerText||'').slice(0,4000),
              userAiEntryCount:document.querySelectorAll('[data-ekodi-user-ai-entry]').length,
              scrollWidth:document.documentElement.scrollWidth,
              clientWidth:document.documentElement.clientWidth,
              scrollHeight:document.documentElement.scrollHeight,
              clientHeight:document.documentElement.clientHeight,
            }));
            break;
          }catch(error){
            const transient=/Execution context was destroyed|Cannot find context/i.test(String(error?.message||error));
            if(!transient||attempt===2)throw error;
            await page.waitForTimeout(250);
          }
        }
        results.push({type:'snapshot',...snap,horizontalOverflow:snap.scrollWidth>snap.clientWidth+1}); continue;
      }
      if(action.type==='screenshot'){
        const filename=`${String(i+1).padStart(2,'0')}-${action.name.replace(/[^a-zA-Z0-9._-]/g,'_')}.png`;
        const target=path.join(taskDir,filename);
        await page.screenshot({path:target,fullPage:action.fullPage});
        const stat=await fs.stat(target);
        screenshots.push({name:action.name,file:filename,bytes:stat.size});
        results.push({type:'screenshot',name:action.name,file:filename,bytes:stat.size});
      }
    }

    const finalUrl=page.url();
    if(new URL(finalUrl).origin!==ORIGIN) fail('BROWSER_FINAL_ORIGIN_FORBIDDEN','Final browser origin is not canonical');
    const report={
      ok:true,
      policyId:'EKODI-BROWSER-WORKER-001',
      routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001',
      virtualizationProvider:'ekodi-background-browser-worker',
      virtualizationProviderType:'native',
      mode:'ekodi-owned-background-browser',
      taskId:task.taskId,
      startedAt,
      completedAt:now(),
      canonicalOrigin:ORIGIN,
      finalUrl,
      deviceProfile:task.deviceProfile,
      viewport:{width:device.width,height:device.height},
      headless:true,
      ephemeralContext:true,
      activeUserProfileReused:false,
      clipboardShared:false,
      hostInputInjection:false,
      allowMutation:task.allowMutation,
      blockedMutations,
      recoveredNavigations,
      results,
      screenshots,
      consoleErrors:consoleErrors.slice(0,20),
      pageErrors:pageErrors.slice(0,20),
      requestFailures:requestFailures.slice(0,20),
      httpErrorResponses:httpErrorResponses.slice(0,40),
    };
    await fs.writeFile(path.join(taskDir,'result.json'),JSON.stringify(report,null,2));
    return report;
  } finally {
    await context.close().catch(()=>{});
    await browser.close().catch(()=>{});
  }
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(invoked){
  const task=await readTask();
  runTask(task).then(result=>console.log(JSON.stringify(result))).catch(error=>{
    console.error(JSON.stringify({ok:false,code:error.code||'BROWSER_WORKER_FAILED',message:clean(error.message,500),completedAt:now()}));
    process.exitCode=1;
  });
}
