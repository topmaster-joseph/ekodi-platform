import test from 'node:test';import assert from 'node:assert/strict';
import {EXTERNAL_PORTAL_BROWSER_POLICY,approveExternalPortalUrl,requireExternalPortalTaskGrant,
classifyExternalPortalResponse,visitExternalPublicPortal} from '../scripts/ekodi-approved-external-portal-browser.mjs';
const fsc='https://better.fsc.go.kr/fsc_new/request/writeForm.do?secret=neverlog';
test('exact FSC host path is permitted only for read-only public inspection',()=>{const r=approveExternalPortalUrl(fsc);assert.equal(r.ok,true);assert.equal(r.canSubmit,false);assert.equal(r.path,'/fsc_new/request/writeForm.do');assert.equal(r.path.includes('secret'),false)});
test('BOK portal is approved but arbitrary domains are not',()=>{assert.equal(approveExternalPortalUrl('https://www.bok.or.kr/portal/main/contents.do').ok,true);assert.equal(approveExternalPortalUrl('https://evil.example/fsc_new/').ok,false)});
test('no lookalike host, malformed URL, port, http or url userinfo',()=>{for(const url of ['https://better.fsc.go.kr.evil.com/fsc_new/','http://better.fsc.go.kr/fsc_new/','https://u:p@better.fsc.go.kr/fsc_new/','https://better.fsc.go.kr:4430/fsc_new/','javascript:alert(1)','https://better.fsc.go.kr/not-approved'])assert.equal(approveExternalPortalUrl(url).ok,false,url)});
test('default automatic permission is observe-only',()=>{const r=requireExternalPortalTaskGrant({url:fsc});assert.equal(r.status,'READ_ONLY_APPROVED');assert.equal(r.canSubmit,false)});
test('submit is not unlocked by client-side claimed authorization',()=>{const r=requireExternalPortalTaskGrant({url:fsc,action:'submit',approved:true});assert.equal(r.code,'SERVER_APPROVAL_REQUIRED')});
test('even verified task authorizer cannot unlock POST or submission here',()=>{const r=requireExternalPortalTaskGrant({url:fsc,action:'submit'},()=>true);assert.equal(r.status,'HUMAN_HANDOFF_REQUIRED');assert.equal(r.canSubmit,false)});
test('login form requires owner authentication and closes',()=>{const r=classifyExternalPortalResponse({requestedUrl:fsc,finalUrl:fsc,statusCode:200,hasLoginForm:true});assert.equal(r.status,'AUTH_REQUIRED');assert.equal(r.canSubmit,false)});
test('off-domain redirects are denied',()=>{const r=classifyExternalPortalResponse({requestedUrl:fsc,finalUrl:'https://sso.gov.kr/login',statusCode:302});assert.equal(r.status,'AUTH_REQUIRED')});
test('successful public GET yields redacted URL result',()=>{const r=classifyExternalPortalResponse({requestedUrl:fsc,finalUrl:fsc,statusCode:200});assert.equal(r.status,'PUBLIC_READ_VERIFIED');assert.equal(JSON.stringify(r).includes('secret'),false)});
test('browser fixture blocks mutation and uses ephemeral context',async()=>{
 let closed=0,aborted=0,continued=0;
 const launcher=async()=>({newContext:async options=>{assert.equal(options.acceptDownloads,false);assert.equal(options.serviceWorkers,'block');return {newPage:async()=>({route:async(_glob,handler)=>{
 await handler({request:()=>({url:()=>fsc,method:()=> 'POST'}),abort:async()=>{aborted++},continue:async()=>{continued++}});
 },goto:async()=>({status:()=>200}),url:()=>fsc,locator:()=>({count:async()=>0})}),close:async()=>{closed++}}},close:async()=>{closed++}});
 const r=await visitExternalPublicPortal({url:fsc,launchBrowser:launcher});assert.equal(r.status,'PUBLIC_READ_VERIFIED');assert.equal(r.submitted,false);assert.equal(aborted,1);assert.equal(continued,0);assert.equal(closed,2);
});
test('invalid user supplied browser timeout denied',async()=>{const r=await visitExternalPublicPortal({url:fsc,timeoutMs:120000});assert.equal(r.code,'TIMEOUT_INVALID')});
test('browser remains strictly read-only by policy',()=>{assert.equal(EXTERNAL_PORTAL_BROWSER_POLICY.allowMutation,false);assert.equal(EXTERNAL_PORTAL_BROWSER_POLICY.interactiveSignIn,false);assert.equal(EXTERNAL_PORTAL_BROWSER_POLICY.persistentUserProfile,false)});
