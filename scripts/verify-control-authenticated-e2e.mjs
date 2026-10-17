// Authenticated, bounded Control acceptance. Reuses the workflow's short-lived
// server-issued super-admin session and never performs protected release changes.
// This is a token-handoff test, NOT an interactive Google OAuth consent test.
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const session=String(process.env.E2E_ADMIN_TOKEN||'').trim();
if(!/^[a-f0-9]{64}$/i.test(session))throw new Error('CONTROL_E2E_AUTH_REQUIRED');
const origin='https://ekodi.kr';
const reportPath=path.resolve('artifacts/admin-authenticated-e2e/control-auth-continuity.json');
await fs.mkdir(path.dirname(reportPath),{recursive:true});
const report={
  passed:false,kind:'issued-super-admin-session-not-interactive-google-oauth',
  authenticatedProfiles:[],controlReturnVerified:false,sessionReloadVerified:false,
  previewOnlyVerified:false,assistReplyVerified:false,executedMutation:false,
  errorCode:null
};
let browser;
try{
  browser=await chromium.launch({headless:true,timeout:20000});
  for(const profile of [
    {id:'desktop',width:1280,height:850},
    {id:'mobile',width:390,height:844}
  ]){
    const context=await browser.newContext({viewport:{width:profile.width,height:profile.height}});
    const page=await context.newPage();
    page.setDefaultTimeout(20000);
    const errors=[];
    page.on('pageerror',err=>errors.push(String(err?.message||err).slice(0,150)));
    const proof=await context.request.get(origin+'/api/session',{
      headers:{authorization:'Bearer '+session},failOnStatusCode:false,timeout:12000
    });
    if(proof.status()!==200)throw new Error('SESSION_HTTP_DENIED');
    const identity=await proof.json().catch(()=>({}));
    if(identity.authenticated!==true||identity.role!=='super_admin')throw new Error('SESSION_ROLE_DENIED');
    // The real callback uses this one-time handoff into the requesting same-origin tab.
    // Never print this URL, record a HAR, or persist the session outside its browser context.
    await page.goto(origin+'/control#ekodi_admin_token='+encodeURIComponent(session),{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#authState')?.textContent==='최고관리자 세션');
    const snapshot=await page.evaluate(()=>({
      route:location.pathname,hash:location.hash,
      auth:document.querySelector('#authState')?.textContent,
      loginHidden:document.querySelector('#controlLoginLink')?.hidden,
      commandVisible:!!document.querySelector('#commandInput'),
      releaseOptIn:document.querySelector('#orchestratorRelease')?.checked,
      overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth
    }));
    if(snapshot.route!=='/control'||snapshot.hash||!snapshot.loginHidden||
       !snapshot.commandVisible||snapshot.releaseOptIn||snapshot.overflow)throw new Error('CONTROL_HANDOFF_OR_LAYOUT_FAILED');
    report.authenticatedProfiles.push(profile.id);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('#authState')?.textContent==='최고관리자 세션');
    if(new URL(page.url()).pathname!=='/control'||new URL(page.url()).hash)throw new Error('CONTROL_RELOAD_ROUTE_LOST');
    report.sessionReloadVerified=true;
    if(profile.id==='desktop'){
      // The preview route must be non-mutating and explicitly unauthorized for execution.
      await page.locator('#commandInput').fill('EKODI Control E2E: AI 경로만 읽기 전용으로 점검해줘.');
      const previewResponse=page.waitForResponse(r=>r.url().endsWith('/api/control/ai/v8/sovereignty/preview')&&r.request().method()==='POST',{timeout:45000});
      await page.locator('#aiRoutePreview').click();
      const preview=await previewResponse;
      if(preview.status()!==200)throw new Error('CONTROL_PREVIEW_HTTP_FAILED');
      const result=await preview.json().catch(()=>({}));
      if(result.previewOnly!==true||result.executionAuthorized!==false)throw new Error('CONTROL_PREVIEW_AUTHORITY_FAILED');
      report.previewOnlyVerified=true;
      // Conversation mode still makes a real authenticated Assist call but never
      // queues a production task or requests a deploy.
      await page.locator('#executeNow').uncheck();
      await page.locator('#commandInput').fill('EKODI Control E2E 확인: 로그인·대화 연결만 검증하고 수정이나 배포는 하지 마세요.');
      const assistResponse=page.waitForResponse(r=>r.url().endsWith('/api/control/ai/assist')&&r.request().method()==='POST',{timeout:90000});
      await page.locator('#sendButton').click();
      const assist=await assistResponse;
      if(assist.status()!==200)throw new Error('CONTROL_ASSIST_HTTP_FAILED');
      const answered=await assist.json().catch(()=>({}));
      if(!String(answered.reply||'').trim())throw new Error('CONTROL_ASSIST_EMPTY_REPLY');
      await page.waitForFunction(()=>document.querySelectorAll('#messages .turn.assistant').length>0);
      report.assistReplyVerified=true;
    }
    if(errors.length)throw new Error('CONTROL_BROWSER_RUNTIME_ERROR');
    await context.close();
  }
  report.controlReturnVerified=report.authenticatedProfiles.length===2;
  report.passed=report.controlReturnVerified&&report.sessionReloadVerified&&report.previewOnlyVerified&&report.assistReplyVerified;
}catch(err){
  const allowed=new Set(['SESSION_HTTP_DENIED','SESSION_ROLE_DENIED','CONTROL_HANDOFF_OR_LAYOUT_FAILED','CONTROL_RELOAD_ROUTE_LOST','CONTROL_PREVIEW_HTTP_FAILED','CONTROL_PREVIEW_AUTHORITY_FAILED','CONTROL_ASSIST_HTTP_FAILED','CONTROL_ASSIST_EMPTY_REPLY','CONTROL_BROWSER_RUNTIME_ERROR']);
  report.errorCode=allowed.has(err?.message)?err.message:'BROWSER_OR_NETWORK_FAILURE';
  process.exitCode=1;
}finally{
  await browser?.close().catch(()=>{});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2));
}
if(report.passed)console.log('[EKODI][CONTROL-AUTH-E2E] PASS desktop mobile login reload preview assist (no deployment)');
else console.error('[EKODI][CONTROL-AUTH-E2E] FAIL '+report.errorCode);
