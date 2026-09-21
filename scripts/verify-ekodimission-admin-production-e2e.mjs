import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = String(process.env.EKODI_PRODUCTION_ORIGIN || 'https://ekodi.kr').replace(/\/+$/,'');
const activityKey = '260926-chuseok-open-table';
const targetUrl = origin + '/ekodimission/admin/activities?activity=' + activityKey;
const artifactsDir = path.resolve('artifacts/ekodimission-admin-production-e2e');
await fs.mkdir(artifactsDir,{recursive:true});

const activity = {
  id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  activity_key:activityKey,
  activity_type:'event',
  title:'2026 추석 열린식탁',
  starts_at:'2026-09-26T09:00:00+09:00',
  ends_at:'2026-09-26T12:00:00+09:00',
  venue:'EKODI Mission',
  capacity:40,
  status:'published',
  visibility:'public',
  registration_open:true,
};

const participants = [{
  participation_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  activity_id:activity.id,
  activity_key:activityKey,
  activity_title:activity.title,
  person_id:'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  ekodi_id:'EKD-PRODUCTION-E2E-1',
  name:'운영검증 참가자',
  phone:'010-0000-0001',
  email:'mission-e2e@invalid.ekodi',
  status:'applied',
  participant_role:'participant',
  party_size:1,
  companions:[],
  language:'ko',
  dietary_notes:'',
  support_notes:'',
  media_consent:'confirm_on_site',
  follow_up_status:'none',
  follow_up_note:'',
  source_channel:'admin',
  source_ref:'production-ui-synthetic',
  submitted_at:'2026-09-19T14:00:00Z',
  checked_in_at:null,
  relationships:[],
}];

const mutationCalls = [];
const assetResponses = [];
const consoleErrors = [];
const pageErrors = [];

function summary(){
  const result={total:participants.length,applied:0,waitlist:0,confirmed:0,attended:0,no_show:0,cancelled:0};
  for(const item of participants) if(Object.hasOwn(result,item.status)) result[item.status]+=1;
  return result;
}
function snapshot(){
  return {
    workspace:{tenant_id:'11111111-1111-4111-8111-111111111111',slug:'ekodimission',name:'에코디선교회'},
    summary:summary(),
    activities:[activity],
    participants:participants.map(item=>({...item})),
  };
}
function jsonResponse(route,body,status=200){
  return route.fulfill({status,contentType:'application/json; charset=utf-8',body:JSON.stringify(body)});
}
function requestBody(request){
  try{return request.postDataJSON()||{}}catch{return{}}
}

const browser=await chromium.launch({headless:true});

// First verify the real signed-out production surface builds a Mission-scoped
// auth URL that returns to the exact participant-management route. This catches
// regressions where a tenant admin login is accidentally routed through My EKODI.
const signedOutContext=await browser.newContext({viewport:{width:1440,height:1100}});
const signedOutPage=await signedOutContext.newPage();
signedOutPage.setDefaultTimeout(12_000);
signedOutPage.setDefaultNavigationTimeout(20_000);
await signedOutPage.goto(targetUrl,{waitUntil:'domcontentloaded'});
await signedOutPage.waitForFunction(()=>document.querySelector('#pageState')?.textContent?.includes('로그인 필요'));
const loginAnchor=signedOutPage.locator('#mainPanel a.button.primary[href*="/auth/"]').first();
await loginAnchor.waitFor({state:'visible'});
const loginHref=await loginAnchor.getAttribute('href');
if(!loginHref)throw new Error('Mission admin signed-out login link missing');
const loginUrl=new URL(loginHref);
const expectedReturn=new URL(targetUrl);
if(loginUrl.origin!==origin||loginUrl.pathname!=='/auth/'||loginUrl.searchParams.get('site')!=='mission'||loginUrl.searchParams.get('direct')!=='1'){
  throw new Error('Mission admin auth scope is not canonical: '+loginUrl.href);
}
const returnTo=new URL(loginUrl.searchParams.get('return_to')||'');
if(returnTo.origin!==expectedReturn.origin||returnTo.pathname!==expectedReturn.pathname||returnTo.search!==expectedReturn.search){
  throw new Error('Mission admin return_to lost the participant-management route: '+loginUrl.href);
}
await signedOutContext.close();

const context=await browser.newContext({viewport:{width:1440,height:1100}});
const page=await context.newPage();
page.setDefaultTimeout(12_000);
page.setDefaultNavigationTimeout(20_000);

page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text())});
page.on('pageerror',error=>pageErrors.push(String(error?.stack||error?.message||error)));
page.on('response',response=>{
  try{
    const url=new URL(response.url());
    if(url.origin===origin && ['/workspace-admin.js','/workspace-admin.css'].includes(url.pathname)){
      assetResponses.push({path:url.pathname,status:response.status()});
    }
  }catch{}
});

await page.addInitScript(()=>{
  const now=Math.floor(Date.now()/1000);
  sessionStorage.setItem('ekodi-workspace-admin-session',JSON.stringify({
    accessToken:'synthetic-mission-production-ui-token',
    refreshToken:'',
    expiresAt:now+3600,
    user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',email:'mission-ui-e2e@invalid.ekodi'},
  }));
});

await page.route('https://renzehysxirjilvdxacv.supabase.co/rest/v1/rpc/**',async route=>{
  const request=route.request();
  const name=new URL(request.url()).pathname.split('/').pop();
  const body=requestBody(request);

  if(name==='current_site_activity_contexts'){
    return jsonResponse(route,[{
      workspace_key:'tenant:11111111-1111-4111-8111-111111111111',
      site:'mission',
      tenant_id:'11111111-1111-4111-8111-111111111111',
      tenant:'ekodimission',
      workspace_name:'에코디선교회',
      workspace_kind:'mission',
      authorization_role:'tenant_admin',
      activity_role:'mission_operator',
      activity_role_label:'선교회 운영자',
      authority_scope:'tenant',
      platform_admin_active:false,
      operating_model:'customer-site',
    }]);
  }

  if(name==='activity_admin_snapshot'){
    if(body.p_workspace_slug!=='ekodimission') return jsonResponse(route,{message:'wrong workspace'},400);
    return jsonResponse(route,snapshot());
  }

  if(name==='activity_admin_update_participation'){
    const item=participants.find(row=>row.participation_id===body.p_participation_id);
    if(!item)return jsonResponse(route,{message:'PARTICIPATION_NOT_FOUND'},404);
    mutationCalls.push({name,body});
    if(body.p_status)item.status=body.p_status;
    if(body.p_participant_role!==undefined&&body.p_participant_role!==null)item.participant_role=body.p_participant_role;
    if(body.p_party_size!==undefined&&body.p_party_size!==null)item.party_size=Number(body.p_party_size);
    if(Array.isArray(body.p_companions))item.companions=body.p_companions;
    if(body.p_support_notes!==undefined&&body.p_support_notes!==null)item.support_notes=body.p_support_notes;
    if(body.p_follow_up_status!==undefined&&body.p_follow_up_status!==null)item.follow_up_status=body.p_follow_up_status;
    if(body.p_follow_up_note!==undefined&&body.p_follow_up_note!==null)item.follow_up_note=body.p_follow_up_note;
    if(body.p_status==='attended')item.checked_in_at=new Date().toISOString();
    return jsonResponse(route,{ok:true,participation_id:item.participation_id,status:item.status,checked_in_at:item.checked_in_at});
  }

  if(name==='activity_admin_add_participant'){
    mutationCalls.push({name,body});
    if(body.p_privacy_consent!==true)return jsonResponse(route,{message:'PRIVACY_CONSENT_REQUIRED'},400);
    const item={
      participation_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      activity_id:activity.id,
      activity_key:activityKey,
      activity_title:activity.title,
      person_id:'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
      ekodi_id:'EKD-PRODUCTION-E2E-2',
      name:String(body.p_name||''),
      phone:String(body.p_phone||''),
      email:String(body.p_email||''),
      status:String(body.p_status||'applied'),
      participant_role:String(body.p_participant_role||'participant'),
      party_size:Number(body.p_party_size||1),
      companions:Array.isArray(body.p_companions)?body.p_companions:[],
      language:String(body.p_language||'ko'),
      dietary_notes:'',
      support_notes:String(body.p_support_notes||''),
      media_consent:'confirm_on_site',
      follow_up_status:String(body.p_follow_up_status||'none'),
      follow_up_note:String(body.p_follow_up_note||''),
      source_channel:String(body.p_source_channel||'admin'),
      source_ref:'production-ui-synthetic',
      submitted_at:new Date().toISOString(),
      checked_in_at:body.p_status==='attended'?new Date().toISOString():null,
      relationships:[],
    };
    participants.push(item);
    return jsonResponse(route,{ok:true,person_id:item.person_id,participation_id:item.participation_id,status:item.status});
  }

  return jsonResponse(route,{message:'unexpected rpc '+name},500);
});

let fatal=null;
const checks={authSiteMission:true,authReturnToExact:true};
try{
  await page.goto(targetUrl,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#activityPicker');
  await page.waitForFunction(()=>document.querySelector('#pageState')?.textContent?.includes('신청자 관리'));

  checks.url=new URL(page.url()).pathname==='/ekodimission/admin/activities';
  checks.title=(await page.locator('#pageTitle').textContent())?.includes('행사 · 신청자')||false;
  checks.activityPicker=await page.locator('#activityPicker').inputValue()===activityKey;
  checks.rowVisible=await page.getByText('운영검증 참가자',{exact:true}).isVisible();
  checks.relationshipSeparated=await page.getByText('단순 참가자',{exact:true}).isVisible();

  const row=page.locator('[data-activity-row]').filter({hasText:'운영검증 참가자'}).first();
  await row.locator('[data-field="status"]').selectOption('confirmed');
  await row.locator('[data-field="role"]').fill('진행지원');
  await row.locator('[data-field="companions"]').fill('동반자 검증');
  await row.locator('[data-field="followUp"]').selectOption('pending');
  await row.locator('[data-field="followUpNote"]').fill('후속 확인');
  await row.locator('[data-field="supportNotes"]').fill('운영 화면 수정 검증');
  await row.locator('[data-activity-save]').click();
  await page.waitForFunction(()=>document.querySelector('[data-activity-row] [data-field="role"]')?.value==='진행지원');
  checks.saveMutation=mutationCalls.some(call=>call.name==='activity_admin_update_participation'&&call.body.p_status==='confirmed'&&call.body.p_participant_role==='진행지원'&&call.body.p_follow_up_status==='pending');

  const refreshed=page.locator('[data-activity-row]').filter({hasText:'운영검증 참가자'}).first();
  await refreshed.locator('[data-activity-checkin]').click();
  await page.waitForFunction(()=>document.querySelector('[data-activity-row] [data-field="status"]')?.value==='attended');
  checks.checkinMutation=mutationCalls.some(call=>call.name==='activity_admin_update_participation'&&call.body.p_status==='attended');
  checks.checkedIn=!(await page.locator('[data-activity-row]').filter({hasText:'운영검증 참가자'}).first().innerText()).includes('미체크인');

  const form=page.locator('#activityAddForm');
  await form.locator('input[name="name"]').fill('운영검증 신규참가자');
  await form.locator('input[name="phone"]').fill('010-0000-0002');
  await form.locator('input[name="email"]').fill('mission-ui-e2e-2@invalid.ekodi');
  await form.locator('input[name="companions"]').fill('동반자 A, 동반자 B');
  await form.locator('select[name="followUpStatus"]').selectOption('pending');
  await form.locator('input[name="followUpNote"]').fill('후속 예정');
  await form.locator('input[name="privacyConsent"]').check();
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(()=>document.body.innerText.includes('운영검증 신규참가자'));
  checks.addMutation=mutationCalls.some(call=>call.name==='activity_admin_add_participant'&&call.body.p_privacy_consent===true&&call.body.p_source_channel==='admin'&&Array.isArray(call.body.p_companions)&&call.body.p_companions.length===2);
  checks.addedVisible=await page.getByText('운영검증 신규참가자',{exact:true}).isVisible();

  const paths=new Set(assetResponses.filter(item=>item.status===200).map(item=>item.path));
  checks.productionAssets=paths.has('/workspace-admin.js')&&paths.has('/workspace-admin.css');
  checks.noPageErrors=pageErrors.length===0;
  checks.noSeriousConsoleErrors=!consoleErrors.some(text=>/(TypeError|ReferenceError|SyntaxError|uncaught|failed to load module)/i.test(text));

  const failed=Object.entries(checks).filter(([,value])=>value!==true);
  if(failed.length)throw new Error('Mission admin production UI checks failed: '+failed.map(([key])=>key).join(', '));

  await page.screenshot({path:path.join(artifactsDir,'success.png'),fullPage:true});
}catch(error){
  fatal=error;
  await page.screenshot({path:path.join(artifactsDir,'failure.png'),fullPage:true}).catch(()=>{});
}finally{
  const report={
    generatedAt:new Date().toISOString(),
    targetUrl,
    passed:!fatal,
    mode:'production-assets+synthetic-tenant-auth-data; backend verified independently',
    checks,
    mutationCalls,
    assetResponses,
    diagnostics:{pageErrors,consoleErrors:consoleErrors.slice(-40)},
    error:fatal?String(fatal?.stack||fatal?.message||fatal):null,
  };
  await fs.writeFile(path.join(artifactsDir,'report.json'),JSON.stringify(report,null,2));
  await browser.close();
}

if(fatal)throw fatal;
console.log('EKODI Mission tenant-admin production UI E2E passed: render, edit, follow-up, check-in, add-participant, privacy consent, and relationship separation.');
