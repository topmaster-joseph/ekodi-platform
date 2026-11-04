/**
 * EKODI opt-in, isolated PUBLIC government portal read-only browser.
 * Separate from the canonical background worker. No login automation, no
 * browser-profile reuse, no outgoing mutations, no secrets, no submissions.
 * This module MUST NOT be used as evidence of a legal filing receipt.
 */
export const EXTERNAL_PORTAL_BROWSER_POLICY = Object.freeze({
  policyId:'EKODI-EXTERNAL-PORTAL-READ-ONLY-001',
  owner:'ekodi-orchestrator',
  approvedHosts:Object.freeze(['better.fsc.go.kr','www.bok.or.kr']),
  defaultMethods:Object.freeze(['GET','HEAD','OPTIONS']),
  allowMutation:false,
  authRequiredDisposition:'RECORD_AND_CLOSE',
  interactiveSignIn:false,
  persistentUserProfile:false,
});
const allowed = new Set(EXTERNAL_PORTAL_BROWSER_POLICY.approvedHosts);
const goodPath = (host,path) => host === 'better.fsc.go.kr'
  ? (path==='/' || path==='/fsc_new' || path.startsWith('/fsc_new/'))
  : (path==='/' || path==='/portal' || path.startsWith('/portal/'));
const block=code=>Object.freeze({ok:false,code,status:'BLOCKED',canSubmit:false});
export function approveExternalPortalUrl(value){
  if(typeof value!=='string'||value.length>1600)return block('URL_INVALID');
  let url;try{url=new URL(value);}catch{return block('URL_INVALID');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||!allowed.has(url.hostname))return block('ORIGIN_NOT_APPROVED');
  if(!goodPath(url.hostname,url.pathname))return block('PATH_NOT_APPROVED');
  if(/%2f|%5c|\\/i.test(url.pathname))return block('PATH_ENCODING_FORBIDDEN');
  // query and fragment are intentionally excluded from ALL logs and receipts.
  return Object.freeze({ok:true,origin:url.origin,hostname:url.hostname,path:url.pathname,
    url:url.origin+url.pathname,status:'READ_ONLY_APPROVED',canSubmit:false});
}
export function requireExternalPortalTaskGrant(task={}, verifier){
  // Solely to validate permission proposals; NEVER unlocks mutation in this module.
  const target=approveExternalPortalUrl(task.url);
  if(!target.ok)return target;
  const action=String(task.action||'observe');
  if(action==='observe')return Object.freeze({ok:true,status:'READ_ONLY_APPROVED',canSubmit:false,site:target.hostname});
  if(!['prepare','submit'].includes(action))return block('ACTION_UNSUPPORTED');
  // Privileged task claims are not trusted without independent server-side verification.
  if(typeof verifier!=='function'||verifier(task)!==true)return block('SERVER_APPROVAL_REQUIRED');
  return Object.freeze({ok:true,status:'HUMAN_HANDOFF_REQUIRED',canSubmit:false,site:target.hostname,
    explanation:'Authenticated submission is not supported by this read-only browser.'});
}
export function classifyExternalPortalResponse({requestedUrl,finalUrl,statusCode=0,hasLoginForm=false}={}){
  const start=approveExternalPortalUrl(requestedUrl);
  if(!start.ok)return start;
  const final=approveExternalPortalUrl(finalUrl);
  if(!final.ok)return Object.freeze({ok:false,status:'AUTH_REQUIRED',code:'REDIRECT_OUTSIDE_APPROVED_PORTAL',canSubmit:false});
  if(final.hostname!==start.hostname)return block('PORTAL_HOST_CHANGED');
  if(hasLoginForm||/\/(login|signin|auth|memberLogin)(\/|$)/i.test(final.path))
    return Object.freeze({ok:false,status:'AUTH_REQUIRED',code:'OWNER_AUTHENTICATION_REQUIRED',canSubmit:false,
      safeOrigin:final.origin,safePath:final.path});
  if(statusCode>=400||statusCode<200)return Object.freeze({ok:false,status:'HTTP_ERROR',code:'HTTP_'+statusCode,canSubmit:false});
  return Object.freeze({ok:true,status:'PUBLIC_READ_VERIFIED',safeOrigin:final.origin,safePath:final.path,canSubmit:false});
}

export async function visitExternalPublicPortal({url,timeoutMs=20000,launchBrowser}={}){
  const validated=approveExternalPortalUrl(url);
  if(!validated.ok)return validated;
  if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)return block('TIMEOUT_INVALID');
  // No self-provided credentials; the caller may provide a test-only injected
  // browser factory for synthetic tests. Production defaults to Playwright Chromium.
  let browser;
  try{
    const factory=launchBrowser || (async()=>{
      const {chromium}=await import('playwright');return chromium.launch({headless:true});
    });
    browser=await factory();
    const context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block',
      permissions:[],ignoreHTTPSErrors:false,javaScriptEnabled:true});
    try{
      const page=await context.newPage();
      await page.route('**/*',route=>{
        const request=route.request();
        const target=approveExternalPortalUrl(request.url());
        const method=request.method().toUpperCase();
        if(!target.ok || target.hostname!==validated.hostname ||
          !EXTERNAL_PORTAL_BROWSER_POLICY.defaultMethods.includes(method))return route.abort('blockedbyclient');
        return route.continue();
      });
      const response=await page.goto(validated.url,{waitUntil:'domcontentloaded',timeout:timeoutMs});
      const loginForm=(await page.locator('input[type="password"]').count())>0;
      const result=classifyExternalPortalResponse({requestedUrl:url,finalUrl:page.url(),
        statusCode:response?.status()??0,hasLoginForm:loginForm});
      // Never return scraped form data, cookies, screenshot, card fields, URL query, or credentials.
      return Object.freeze({...result,policyId:EXTERNAL_PORTAL_BROWSER_POLICY.policyId,
        isolatedContext:true,submitted:false,sessionReused:false});
    }finally{await context.close().catch(()=>{});}
  }catch(error){return Object.freeze({ok:false,status:'BROWSER_FAILURE',code:'NAVIGATION_OR_RUNTIME_FAILED',
    submitted:false,canSubmit:false});}
  finally{if(browser)await browser.close().catch(()=>{});}
}
