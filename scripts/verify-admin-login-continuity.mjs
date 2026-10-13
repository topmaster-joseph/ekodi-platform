// EKODI protected production verification: post-Google central token handoff continuity.
// Uses only the existing workflow's short-lived, server-validated E2E_ADMIN_TOKEN.
// This verifies the Admin handoff, not the Google account-picker/OAuth consent UI.
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const token=String(process.env.E2E_ADMIN_TOKEN||'').trim();
if(!/^[a-f0-9]{64}$/i.test(token))throw new Error('E2E_SESSION_REQUIRED');
const origin='https://ekodi.kr';
const root=origin+'/admin/';
const nested=origin+'/admin/services/common-services';
const reportFile=path.resolve('artifacts/admin-authenticated-e2e/login-continuity.json');
await fs.mkdir(path.dirname(reportFile),{recursive:true});

let browser;
let stage='init';
let deniedRedirects=0;
let passed=false;
const stages=[];
const mark=name=>{stage=name;stages.push(name);console.log('[EKODI][ADMIN-CONTINUITY] '+name)};
function sameAdminSurface(raw){
  const u=new URL(raw);
  return u.origin===origin && (u.pathname==='/admin'||u.pathname.startsWith('/admin/'));
}
async function assertAuthenticatedSession(request){
  const response=await request.get(origin+'/api/session',{
    headers:{authorization:'Bearer '+token,accept:'application/json','cache-control':'no-store'},
    timeout:12000,failOnStatusCode:false
  });
  if(!response.ok())throw new Error('SESSION_HTTP_DENIED');
  const data=await response.json().catch(()=>({}));
  if(data?.authenticated!==true||data?.role!=='super_admin')throw new Error('SESSION_NOT_SUPER_ADMIN');
}
async function waitForAdmin(page){
  await page.waitForFunction(expected=>{
    const app=document.querySelector('#app');
    const login=document.querySelector('#loginScreen');
    const auth=sessionStorage.getItem('ekodi-auth-token');
    return auth===expected && Boolean(window.EKODIAdminCore) &&
      app?.hidden===false && login?.hidden===true &&
      document.querySelector('#apiState')?.textContent?.includes('정상');
  },token,{timeout:20000});
  if(!sameAdminSurface(page.url()))throw new Error('ADMIN_SURFACE_LOST');
  if(new URL(page.url()).hash.includes('ekodi_admin_token'))throw new Error('HANDOFF_FRAGMENT_NOT_CLEARED');
}
try{
  mark('start');
  browser=await chromium.launch({headless:true,timeout:20000});
  const context=await browser.newContext({viewport:{width:1280,height:850}});
  context.setDefaultNavigationTimeout(15000);
  const page=await context.newPage();
  page.on('framenavigated',frame=>{
    if(frame!==page.mainFrame())return;
    const u=new URL(frame.url());
    if(u.origin!==origin||u.pathname.startsWith('/auth'))deniedRedirects++;
  });
  await assertAuthenticatedSession(context.request);
  mark('central-session-confirmed');

  // One use of the session handoff fragment is the same browser entry contract
  // that the Google callback sends. Never log, trace or persist this URL.
  await page.goto(root+'?route=common-services#ekodi_admin_token='+encodeURIComponent(token),
    {waitUntil:'domcontentloaded',timeout:15000});
  await waitForAdmin(page);
  mark('handoff-confirmed');

  await page.goto(nested,{waitUntil:'domcontentloaded',timeout:15000});
  await waitForAdmin(page);
  if(new URL(page.url()).pathname!=='/admin/services/common-services')
    throw new Error('CANONICAL_NESTED_ROUTE_LOST');
  mark('nested-route-confirmed');

  await page.reload({waitUntil:'domcontentloaded',timeout:15000});
  await waitForAdmin(page);
  if(new URL(page.url()).pathname!=='/admin/services/common-services')
    throw new Error('RELOAD_ROUTE_LOST');
  await assertAuthenticatedSession(context.request);
  if(deniedRedirects!==0)throw new Error('LOGIN_REDIRECT_DETECTED');
  mark('reload-session-confirmed');
  passed=true;
}catch(error){
  // Only an allowlisted stage and a categorical outcome are reported.
  const codes=new Set(['SESSION_HTTP_DENIED','SESSION_NOT_SUPER_ADMIN','ADMIN_SURFACE_LOST','HANDOFF_FRAGMENT_NOT_CLEARED','CANONICAL_NESTED_ROUTE_LOST','RELOAD_ROUTE_LOST','LOGIN_REDIRECT_DETECTED']);
  const reason=codes.has(error?.message)?error.message:'BROWSER_OR_RUNTIME_FAILURE';
  stages.push('FAILED_'+reason);
  console.error('[EKODI][ADMIN-CONTINUITY] FAIL stage='+stage+' code='+reason);
  process.exitCode=1;
}finally{
  await fs.writeFile(reportFile,JSON.stringify({
    passed,completedStages:stages,redirectToLoginDetected:deniedRedirects>0,
    canonicalOrigin:origin,verifiedRoute:'/admin/services/common-services',
    testKind:'issued-central-session-handoff-not-interactive-google-oauth'
  },null,2));
  await browser?.close().catch(()=>{});
}
if(passed)console.log('[EKODI][ADMIN-CONTINUITY] PASS');
