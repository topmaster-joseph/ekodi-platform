import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CANONICAL_ORIGIN = 'https://ekodi.kr';
// Development staging verification (#6739): an explicit, fixed allowlist of the
// isolated development-account staging hosts. Selectable only when the runner
// declares EKODI_BROWSER_ENVIRONMENT=development; the default stays ekodi.kr.
const DEVELOPMENT_STAGING_ORIGINS = Object.freeze([
  'https://ekodi-admin-staging.ekodi-development.workers.dev',
  'https://ekodi-my-staging.ekodi-development.workers.dev',
]);
export function resolveBrowserOrigin(env=process.env){
  const requested=String(env.EKODI_BROWSER_ORIGIN||'').trim();
  if(!requested||requested===CANONICAL_ORIGIN) return CANONICAL_ORIGIN;
  if(env.EKODI_BROWSER_ENVIRONMENT!=='development'||!DEVELOPMENT_STAGING_ORIGINS.includes(requested)){
    const e=new Error('Browser origin must be ekodi.kr or an allowlisted development staging host');
    e.code='BROWSER_ORIGIN_FORBIDDEN'; throw e;
  }
  return requested;
}
const ORIGIN = resolveBrowserOrigin();
// Cloudflare Access service token, attached only to same-origin staging requests.
const STAGING_ACCESS = ORIGIN!==CANONICAL_ORIGIN && process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET
  ? Object.freeze({'cf-access-client-id':process.env.CF_ACCESS_CLIENT_ID,'cf-access-client-secret':process.env.CF_ACCESS_CLIENT_SECRET})
  : null;
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
/** Early, synthetic-only paint observers. No URLs, element details, user data or events leave this page. */
export function installSyntheticPaintObservers(){
  const metrics={lcpCandidateMs:null,layoutShiftSumToSettle:null};
  Object.defineProperty(window,'__EKODI_SYNTHETIC_PAINT__',{value:metrics,configurable:false});
  if(typeof PerformanceObserver!=='function')return;
  const supported=PerformanceObserver.supportedEntryTypes||[];
  if(supported.includes('largest-contentful-paint')){
    try{
      new PerformanceObserver(list=>{
        for(const entry of list.getEntries()){
          if(Number.isFinite(entry.startTime)&&entry.startTime>=0)
            metrics.lcpCandidateMs=Math.round(entry.startTime);
        }
      }).observe({type:'largest-contentful-paint',buffered:true});
    }catch{}
  }
  if(supported.includes('layout-shift')){
    metrics.layoutShiftSumToSettle=0;
    try{
      new PerformanceObserver(list=>{
        for(const entry of list.getEntries()){
          if(!entry.hadRecentInput&&Number.isFinite(entry.value)&&entry.value>=0)
            metrics.layoutShiftSumToSettle=Math.round((metrics.layoutShiftSumToSettle+entry.value)*10000)/10000;
        }
      }).observe({type:'layout-shift',buffered:true});
    }catch{metrics.layoutShiftSumToSettle=null;}
  }
}

/** Synthetic page.goto(domcontentloaded) timing only (excludes pacing/settle); not LCP or real-user p75. */
export function summarizeNativeNavigationPerformance(samples=[]) {
  const values=samples.map(s=>Number(s.elapsedMs)).filter(n=>Number.isFinite(n)&&n>=0).sort((a,b)=>a-b);
  if(!values.length)return {navigations:0,p50Ms:null,p95Ms:null,maxMs:null};
  const pct=p=>values[Math.min(values.length-1,Math.max(0,Math.ceil(p*values.length)-1))];
  return {navigations:values.length,p50Ms:pct(0.50),p95Ms:pct(0.95),maxMs:values.at(-1)};
}


function fail(code,message){ const e=new Error(message||code); e.code=code; throw e; }

/** Navigation guard: evaluated at the network interception layer, before a
 * redirect or popup document request can leave the owned browser. */
export function shouldBlockNativeTopLevelNavigation(rawUrl, allowedOrigin=ORIGIN) {
  try {
    const url=new URL(String(rawUrl??''));
    return !['https:','http:'].includes(url.protocol) || url.origin!==allowedOrigin ||
      Boolean(url.username||url.password);
  } catch { return true; }
}

/** Keep useful browser evidence without preserving authentication URLs, tokens,
 * emails or phone numbers. Sanitization happens BEFORE writing/returning JSON. */
export function redactNativeBrowserUrl(raw) {
  try {
    const value=String(raw??'');
    const relative=value.startsWith('/')&&!value.startsWith('//');
    const u=new URL(value, CANONICAL_ORIGIN);
    if(u.protocol!=='https:' && u.protocol!=='http:') return '[redacted-url]';
    let pathname=u.pathname;
    // Cloudflare challenges embed bearer-like nonces in path segments.
    if(pathname.startsWith('/cdn-cgi/challenge-platform/'))
      pathname='/cdn-cgi/challenge-platform/[redacted]';
    else pathname=pathname.split('/').map(segment=>{
      const decoded=segment.replace(/%[0-9a-f]{2}/ig,'');
      return (decoded.length>46 || /(?:token|session|credential|secret|key|auth|jwt)/i.test(decoded) &&
        decoded.length>16) ? '[redacted]' : segment;
    }).join('/');
    // Query values and fragments can contain state, one-time codes and PII.
    return (relative?'':u.origin)+pathname;
  } catch { return '[redacted-url]'; }
}
function redactNativeDiagnostic(value) {
  return String(value??'')
    .replace(/https?:\/\/[^\s"'<>]+/g, s=>redactNativeBrowserUrl(s))
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi,'$1[redacted]')
    .replace(/((?:api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|session|authorization)\s*[:=]\s*)[^\s,;]+/gi,'$1[redacted]')
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,'[redacted-email]')
    .replace(/(?:\+82[\s-]?)?0?1\d[\s-]?\d{3,4}[\s-]?\d{4}/g,'[redacted-phone]');
}
export function sanitizeNativeBrowserFailure(error) {
  const code=/^[A-Z][A-Z0-9_]{2,64}$/.test(String(error?.code||''))?error.code:'BROWSER_WORKER_FAILED';
  return sanitizeNativeBrowserReceipt({ok:false,code,message:clean(error?.message||'Browser task failed',500),completedAt:now()});
}

export function sanitizeNativeBrowserReceipt(report) {
  const urlFields=new Set(['url','finalUrl','path','targetUrl']);
  const visit=(value,key='',depth=0)=>{
    if(depth>12) return '[redacted-depth]';
    if(typeof value==='string'){
      if(key==='canonicalOrigin') return value===CANONICAL_ORIGIN ? value : '[redacted-origin]';
      if(urlFields.has(key)) return redactNativeBrowserUrl(value);
      return redactNativeDiagnostic(value);
    }
    if(Array.isArray(value)) return value.map(item=>visit(item,'',depth+1));
    if(value&&typeof value==='object') return Object.fromEntries(
      Object.entries(value).map(([k,v])=>[k,visit(v,k,depth+1)]));
    return value;
  };
  return visit(report);
}


function safePath(value){
  const raw=clean(value,1200)||'/';
  let url;
  try { url=new URL(raw,ORIGIN); } catch { fail('BROWSER_URL_INVALID','Invalid browser target'); }
  if(url.origin!==ORIGIN) fail('BROWSER_ORIGIN_FORBIDDEN',ORIGIN===CANONICAL_ORIGIN?'Browser navigation must stay on canonical ekodi.kr':'Browser navigation must stay on the allowlisted staging origin');
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
  // A GitHub-hosted isolated runner already includes signed system Chromium.
  // This explicit allowlist prevents arbitrary executable selection and avoids
  // downloading an additional browser for every read-only EKODI sandbox test.
  const runtimeBrowser=clean(process.env.EKODI_NATIVE_CHROME||'',180);
  if(runtimeBrowser&&!['/usr/bin/chromium','/usr/bin/google-chrome'].includes(runtimeBrowser))
    fail('BROWSER_EXECUTABLE_FORBIDDEN','Native browser path must be the installed runner Chromium');
  // Preserve canonical locked-down default browser startup exactly; the
  // allowlisted system Chromium is an opt-in, never a silent security fallback.
  const browser=runtimeBrowser
    ? await chromium.launch({headless:true,executablePath:runtimeBrowser})
    : await chromium.launch({headless:true});
  const device=PROFILE[task.deviceProfile];
  const context=await browser.newContext({
    viewport:{width:device.width,height:device.height},
    isMobile:device.isMobile,
    hasTouch:device.hasTouch,
    acceptDownloads:false,
  });
  const page=await context.newPage();
  // Install prior to each document request: getEntriesByType() cannot retrieve LCP.
  await page.addInitScript(installSyntheticPaintObservers);
  const consoleErrors=[],pageErrors=[],requestFailures=[],httpErrorResponses=[],blockedMutations=[],blockedExternalNavigations=[];
  let quotaCircuit=null;
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
    if(status===429 && new URL(res.url()).origin===ORIGIN) quotaCircuit={status,path:clean(new URL(res.url()).pathname,200),resourceType:clean(res.request().resourceType(),40)};
  });

  // Context routing covers both the initial tab and popups; page.route alone
  // cannot intercept every newly opened top-level document request.
  context.on('page',opened=>{if(opened!==page) opened.close().catch(()=>{});});
  await context.route('**/*',async route=>{
    const req=route.request();
    const method=req.method().toUpperCase();
    let mainFrameNavigation=false;
    if(req.isNavigationRequest()){
      try { mainFrameNavigation=req.frame().parentFrame()===null; }
      catch { mainFrameNavigation=true; } // popup's first document
    }
    if(mainFrameNavigation && shouldBlockNativeTopLevelNavigation(req.url())){
      // No URLs, query strings, host names or auth state enter the receipt.
      blockedExternalNavigations.push({code:'BROWSER_REDIRECT_ORIGIN_FORBIDDEN'});
      return route.abort('blockedbyclient');
    }
    if(quotaCircuit) return route.abort('blockedbyclient'); // CF-QUOTA-001: stop new production requests
    if(!task.allowMutation && !['GET','HEAD','OPTIONS'].includes(method)){
      blockedMutations.push({method,url:clean(req.url(),500)});
      return route.abort('blockedbyclient');
    }
    if(STAGING_ACCESS && new URL(req.url()).origin===ORIGIN)
      return route.continue({headers:{...req.headers(),...STAGING_ACCESS}});
    return route.continue();
  });

  const startedAt=now();
  const deadline=Date.now()+task.timeoutMs;
  // Omit query values, response bodies and credentials from the quota evidence.
  const quotaDetails=()=>quotaCircuit?' path='+quotaCircuit.path+' resource='+quotaCircuit.resourceType:'';
  const results=[];
  const screenshots=[];
  const recoveredNavigations=[];
  const navigationTimings=[];
  const remaining=()=>Math.max(100,deadline-Date.now());
  // Pace both desktop and mobile read-only navigation across canonical sites.
  // Avoid the previous 500ms desktop burst (12 registered routes) and keep
  // CF-QUOTA-001 immediate circuit break with no retry on 429 or Error 1027.
  let lastNavigationAt=0;
  const goto=async p=>{
    if(quotaCircuit) fail('CF_QUOTA_CIRCUIT_OPEN','CF-QUOTA-001 circuit open before navigation'+quotaDetails()+'; no retry');
    if(Date.now()>=deadline) fail('BROWSER_TASK_TIMEOUT','Browser task timed out');
    const canonicalPath=safePath(p);
    const target=ORIGIN+canonicalPath;
    // Do not include the required Cloudflare request pacing in page-load metrics.
    let pacingWaitMs=0;
    for(let attempt=0;attempt<3;attempt++){
      const minimumGap=2200;
      const pause=Math.max(0,minimumGap-(Date.now()-lastNavigationAt));
      if(pause>0){
        const paceStartedAt=Date.now();
        await page.waitForTimeout(Math.min(pause,remaining()));
        pacingWaitMs+=Date.now()-paceStartedAt;
      }
      if(Date.now()>=deadline) fail('BROWSER_TASK_TIMEOUT','Browser task timed out');
      const documentReadyStartedAt=Date.now();
      const startingResponses=httpErrorResponses.length;
      const startingPageErrors=pageErrors.length;
      const startingConsoleErrors=consoleErrors.length;
      let response;
      try {
        response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:Math.min(30000,remaining())});
      } catch(error) {
        if(blockedExternalNavigations.length) fail('BROWSER_REDIRECT_ORIGIN_FORBIDDEN','External top-level navigation blocked before request');
        if(quotaCircuit) fail('CF_QUOTA_CIRCUIT_OPEN','CF-QUOTA-001 circuit open during navigation'+quotaDetails()+'; no retry');
        throw error;
      }
      const domContentLoadedElapsedMs=Date.now()-documentReadyStartedAt;
      lastNavigationAt=Date.now();
      if(new URL(page.url()).origin!==ORIGIN) fail('BROWSER_REDIRECT_ORIGIN_FORBIDDEN','Navigation escaped canonical origin');
      const status=response?.status()??null;
      if(status===429 || quotaCircuit)
        fail('CF_QUOTA_CIRCUIT_OPEN','CF-QUOTA-001 circuit open: HTTP 429'+quotaDetails()+'; no retry or further requests');
      if(status!==null && status>=400) {
        const text=await page.locator('body').innerText({timeout:Math.min(2000,remaining())}).catch(()=>'');
        if(/Error 1027|temporarily rate limited|reached their plan limits/i.test(text.slice(0,2500)))
          fail('CF_QUOTA_CIRCUIT_OPEN','CF-QUOTA-001 circuit open: Cloudflare 1027; no retry or further requests');
      }
      // Allow dynamic imports to settle only while the quota circuit remains closed.
      const settleStartedAt=Date.now();
      await page.waitForTimeout(Math.min(task.deviceProfile.includes('mobile')?650:250,remaining()));
      const settleWaitMs=Date.now()-settleStartedAt;
      if(quotaCircuit) fail('CF_QUOTA_CIRCUIT_OPEN','CF-QUOTA-001 circuit open after navigation'+quotaDetails()+'; no retry');
      const transient=[502,503,504];
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
      // Read only numeric Navigation/Paint Timing entries; never collect URLs,
      // queries, resource names, user IDs, cookies or session details.
      const browserTiming=await page.evaluate(()=>{
        const nav=performance.getEntriesByType('navigation')[0];
        const fcp=performance.getEntriesByType('paint').find(entry=>entry.name==='first-contentful-paint');
        const millis=value=>Number.isFinite(value)&&value>=0?Math.round(value):null;
        return {
          ttfbMs:nav?millis(nav.responseStart-nav.requestStart):null,
          domContentLoadedMs:nav?millis(nav.domContentLoadedEventEnd-nav.startTime):null,
          fcpMs:fcp?millis(fcp.startTime):null,
          // The 250/650ms synthetic settle is not a final page-lifetime LCP/CLS.
          lcpCandidateMs:Number.isFinite(window.__EKODI_SYNTHETIC_PAINT__?.lcpCandidateMs)
            ?window.__EKODI_SYNTHETIC_PAINT__.lcpCandidateMs:null,
          layoutShiftSumToSettle:Number.isFinite(window.__EKODI_SYNTHETIC_PAINT__?.layoutShiftSumToSettle)
            ?window.__EKODI_SYNTHETIC_PAINT__.layoutShiftSumToSettle:null,
        };
      }).catch(()=>({ttfbMs:null,domContentLoadedMs:null,fcpMs:null,lcpCandidateMs:null,layoutShiftSumToSettle:null}));
      navigationTimings.push({path:canonicalPath,elapsedMs:domContentLoadedElapsedMs,
        pacingWaitMs,settleWaitMs,ttfbMs:browserTiming.ttfbMs,
        domContentLoadedMs:browserTiming.domContentLoadedMs,fcpMs:browserTiming.fcpMs,
        lcpCandidateMs:browserTiming.lcpCandidateMs,layoutShiftSumToSettle:browserTiming.layoutShiftSumToSettle,
        attempts:attempt+1,status});
      return {url:page.url(),status};
    }
    fail('BROWSER_NAVIGATION_THROTTLED','Navigation '+canonicalPath+' exhausted attempts');
  };

  try{
    results.push({type:'initial-goto',...(await goto(task.path))});
    for(let i=0;i<task.actions.length;i++){
      if(quotaCircuit) fail('CF_QUOTA_CIRCUIT_OPEN','CF-QUOTA-001 circuit open during browser actions'+quotaDetails()+'; no further requests');
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
              userAiEntryCount:document.querySelectorAll('aside[data-ekodi-user-ai-entry],.ekodi-user-ai-entry').length,
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

    if(quotaCircuit) fail('CF_QUOTA_CIRCUIT_OPEN','CF-QUOTA-001 circuit open before success receipt'+quotaDetails()+'; no false PASS');
    if(blockedExternalNavigations.length) fail('BROWSER_REDIRECT_ORIGIN_FORBIDDEN','External top-level navigation blocked before request');
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
      blockedExternalNavigationCount:blockedExternalNavigations.length,
      recoveredNavigations,
      performance:summarizeNativeNavigationPerformance(navigationTimings),
      navigationTimings,
      results,
      screenshots,
      consoleErrors:consoleErrors.slice(0,20),
      pageErrors:pageErrors.slice(0,20),
      requestFailures:requestFailures.slice(0,20),
      httpErrorResponses:httpErrorResponses.slice(0,40),
    };
    const safeReport=sanitizeNativeBrowserReceipt(report);
    await fs.writeFile(path.join(taskDir,'result.json'),JSON.stringify(safeReport,null,2));
    return safeReport;
  } finally {
    await context.close().catch(()=>{});
    await browser.close().catch(()=>{});
  }
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(invoked){
  // A malformed task file also needs the same redacted failure envelope.
  Promise.resolve().then(readTask).then(runTask)
    .then(result=>console.log(JSON.stringify(result)))
    .catch(error=>{
      console.error(JSON.stringify(sanitizeNativeBrowserFailure(error)));
      process.exitCode=1;
    });
}
