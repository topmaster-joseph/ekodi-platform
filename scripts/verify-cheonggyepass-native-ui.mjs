// EKODI-owned Chromium UI verification against real production HTML/scripts.
// All authentication, intake writes, and reads of private intake records are
// fulfilled with IN-MEMORY SYNTHETIC fixtures. NEVER sends a synthetic bearer
// or a mutation to production. NOT real Google/OAuth or persisted CRUD proof.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const ORIGIN='https://ekodi.kr';
const ADMIN=ORIGIN+'/cheonggyepass/admin';
const API='/api/cheonggyepass/vendor-intake';
const AUTH='/api/local-access/cheonggye-pass/me';
const OUTPUT='artifacts/cheonggyepass-native-ui';
const profiles=[
  {name:'pc',width:1440,height:900,isMobile:false},
  {name:'mobile',width:390,height:844,isMobile:true},
];
const report={
  kind:'EKODI_CHEONGGYEPASS_NATIVE_SYNTHETIC_UI',
  verification:'real production HTML and scripts; simulated identity and intake API only',
  realGoogleLogin:false,
  productionWrites:0,
  liveD1R2Persistence:false,
  chromium:'first-party isolated',
  startedAt:new Date().toISOString(),
  profiles:[],
  passed:false,
};
const fail=(message)=>{throw new Error(message)};
const fixtureId=()=>crypto.randomUUID();
const seeded=()=>[{
  id:fixtureId(),delivery:'github_pr',vendorName:'OTHER_SYNTHETIC_VENDOR',
  actorEmail:'external-other@qa.invalid',sourceUrl:'https://github.com/example/other/pull/1',
  sourceRef:'a'.repeat(40),apiBaseUrl:'',documentationUrl:'',capabilities:[],
  status:'submitted',uploaded:false,artifactSha256:'',artifactSize:0,
  createdAt:'2026-10-18T00:00:00Z',updatedAt:'2026-10-18T00:00:00Z',
}];
const roleInfo={
  vendor:{
    authenticated:true,platform:false,email:'synthetic-vendor@qa.invalid',
    role:'external_vendor',canManageAccess:false,
    capabilities:['tenant.dashboard.read','tenant.integration.inspect','tenant.integration.test'],
  },
  admin:{
    authenticated:true,platform:true,email:'synthetic-admin@qa.invalid',
    role:'super_admin',canManageAccess:true,capabilities:['*'],
  },
};
const syntheticToken='EKODI_LOCAL_ONLY_SYNTHETIC_NOT_A_REAL_TOKEN';
const fixtureReply=(route,payload,status=200)=>route.fulfill({
  status,contentType:'application/json; charset=utf-8',
  headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'},
  body:JSON.stringify(payload),
});
async function installRoutes(context,state,actor){
  await context.route('**/*',async route=>{
    const req=route.request();
    const url=new URL(req.url());
    const method=req.method().toUpperCase();
    const headers=req.headers();
    const bearer=String(headers.authorization||'');
    const authorized=bearer==='Bearer '+syntheticToken;
    if(url.origin===ORIGIN&&url.pathname===AUTH){
      if(!authorized)return fixtureReply(route,{code:'REGION_AUTH_REQUIRED'},401);
      state.authCalls.push({actor,method});
      return fixtureReply(route,{...roleInfo[actor],scope:{slug:'cheonggye-pass'}});
    }
    if(url.origin===ORIGIN&&url.pathname.startsWith(API)){
      assert.equal(authorized,true,'synthetic API must carry isolated bearer');
      state.calls.push({actor,method,path:url.pathname,contentType:headers['content-type']||''});
      const match=url.pathname.match(/^\/api\/cheonggyepass\/vendor-intake(?:\/([a-f0-9-]{36})\/(upload|review))?\/?$/i);
      if(!match)return fixtureReply(route,{code:'TEST_ROUTE_MISMATCH'},404);
      const id=match[1],operation=match[2],isAdmin=actor==='admin';
      if(method==='GET'&&!id){
        const rows=state.items.filter(item=>isAdmin||item.actorEmail===roleInfo[actor].email);
        return fixtureReply(route,{
          ok:true,programId:'cheonggye-pass',financialExecutionEnabled:false,
          uploadEnabled:true,canReview:isAdmin,
          items:rows.map(item=>isAdmin?item:(()=>{const {actorEmail,...own}=item;return own})()),
        });
      }
      if(method==='POST'&&!id){
        assert.equal(headers['x-ekodi-intake-request'],'1');
        assert.match(headers['idempotency-key']||'',/^[a-f0-9-]{36}$/i);
        const body=req.postDataJSON();
        assert.ok(['github_pr','zip','external_api'].includes(body.delivery));
        const now=new Date().toISOString();
        const item={
          id:fixtureId(),delivery:body.delivery,vendorName:body.vendorName,
          actorEmail:roleInfo[actor].email,sourceUrl:body.sourceUrl||'',
          sourceRef:body.sourceRef||'',apiBaseUrl:body.apiBaseUrl||'',
          documentationUrl:body.documentationUrl||'',capabilities:body.capabilities||[],
          status:'submitted',uploaded:false,artifactSha256:'',artifactSize:0,
          createdAt:now,updatedAt:now,
        };
        state.items.unshift(item);
        return fixtureReply(route,{ok:true,item,next:body.delivery==='zip'?'upload_zip':'review'},201);
      }
      const item=state.items.find(row=>row.id===id);
      if(!item)return fixtureReply(route,{ok:false,error:'Not found'},404);
      if(method==='POST'&&operation==='upload'){
        assert.equal(item.actorEmail,roleInfo[actor].email);
        assert.equal(item.delivery,'zip');
        assert.equal(headers['content-type'],'application/zip');
        const data=req.postDataBuffer();
        assert.ok(data.length>=22&&data.length<=8*1024*1024);
        assert.equal(data.slice(0,4).toString('hex'),'504b0304');
        item.status='quarantined';item.uploaded=true;
        item.artifactSize=data.length;item.artifactSha256=crypto.createHash('sha256').update(data).digest('hex');
        return fixtureReply(route,{
          ok:true,id:item.id,status:'quarantined',sha256:item.artifactSha256,
          size:data.length,scanStatus:'not_scanned',activation:false,
        },201);
      }
      if(method==='POST'&&operation==='review'){
        assert.equal(actor,'admin');
        const body=req.postDataJSON();
        assert.ok(String(body.note||'').length>=5);
        assert.ok(['rejected','review_pending','approved_for_testing'].includes(body.status));
        if(item.delivery==='zip'&&body.status==='approved_for_testing')
          return fixtureReply(route,{code:'INTAKE_SCAN_ATTESTATION_REQUIRED'},409);
        item.status=body.status;item.reviewNote=body.note;
        return fixtureReply(route,{ok:true,id:item.id,status:item.status,activation:false});
      }
      return fixtureReply(route,{code:'TEST_METHOD_NOT_ALLOWED'},405);
    }
    if(url.origin===ORIGIN&&url.pathname==='/auth/'){
      state.authRedirects.push({url:url.href,method});
      return route.fulfill({status:200,contentType:'text/html; charset=utf-8',
        body:'<!doctype html><title>Unexecuted Google login</title><p>Test-only auth destination; no Google sign-in was attempted.</p>'});
    }
    // Important: a test bearer or a write to ANY real service fails closed.
    if(bearer.includes('EKODI_LOCAL_ONLY_SYNTHETIC')||
        !['GET','HEAD','OPTIONS'].includes(method)){
      state.unexpectedNetwork.push({method,origin:url.origin,path:url.pathname});
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
}
function setupContext(browser,profile){
  return browser.newContext({
    viewport:{width:profile.width,height:profile.height},
    isMobile:profile.isMobile,hasTouch:profile.isMobile,
    deviceScaleFactor:1,locale:'ko-KR',acceptDownloads:false,serviceWorkers:'block',
  });
}
const observedErrors=(page)=>{const issues=[];page.on('pageerror',error=>issues.push(String(error.message||error).slice(0,250)));return issues};
async function visitWithAuth(browser,profile,state,actor){
  const context=await setupContext(browser,profile);
  await context.addInitScript(token=>sessionStorage.setItem('ekodi-auth-token',token),syntheticToken);
  await installRoutes(context,state,actor);
  const page=await context.newPage();page.setDefaultTimeout(12000);
  const errors=observedErrors(page);
  const res=await page.goto(ADMIN,{waitUntil:'domcontentloaded',timeout:24000});
  assert.equal(res?.status(),200,'actual EKODI page must return 200');
  await page.locator('[data-pass-vendor-intake]').waitFor({state:'visible',timeout:12000});
  assert.equal(await page.locator('html').getAttribute('data-region-auth-ready'),'1');
  assert.equal(await page.locator('[data-pass-intake-form]').isVisible(),true);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=2,actor+' / '+profile.name+' horizontal overflow '+overflow);
  assert.equal(errors.length,0,actor+' / '+profile.name+' JS exceptions');
  return {page,context,errors,overflow};
}
async function vendorJourney(page,state,profile){
  const form=page.locator('[data-pass-intake-form]');
  const list=page.locator('[data-pass-intake-list]');
  const initial=await list.locator('.pass-submission').count();
  assert.equal(initial,0,'vendor must not see another vendor record');
  await form.locator('[name="vendorName"]').fill('QA GitHub PR '+profile.name);
  await form.locator('[name="sourceUrl"]').fill('https://github.com/example/cheonggye-qa/pull/31');
  await form.locator('[name="sourceRef"]').fill('b'.repeat(40));
  await form.locator('button[type=submit]').click();
  await list.locator('.pass-submission').first().waitFor({state:'visible'});
  assert.equal(await list.locator('.pass-submission').count(),1);
  assert.ok((await list.textContent()).includes('QA GitHub PR '+profile.name));

  await form.locator('[name="delivery"]').selectOption('external_api');
  assert.equal(await form.locator('[data-pass-github]').isVisible(),false);
  assert.equal(await form.locator('[data-pass-api]').isVisible(),true);
  await form.locator('[name="vendorName"]').fill('QA API '+profile.name);
  await form.locator('[name="apiBaseUrl"]').fill('https://api.vendor.co.kr/v1');
  await form.locator('[name="documentationUrl"]').fill('https://docs.vendor.co.kr/openapi');
  await form.locator('[name="capabilities"]').fill('merchant-sync,benefit-sync');
  await form.locator('button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-pass-intake-list] .pass-submission').length===2);
  assert.ok(state.items.some(item=>item.delivery==='external_api'&&item.actorEmail===roleInfo.vendor.email));

  await form.locator('[name="delivery"]').selectOption('zip');
  assert.equal(await form.locator('[data-pass-zip-field]').isVisible(),true);
  await form.locator('[name="vendorName"]').fill('QA ZIP '+profile.name);
  // Harmless signature-only browser fixture, never extracted or transmitted.
  const zipFixture=Buffer.alloc(32);Buffer.from([0x50,0x4b,0x03,0x04]).copy(zipFixture);
  await form.locator('[data-pass-zip]').setInputFiles({
    name:'synthetic-no-executable-code.zip',mimeType:'application/zip',buffer:zipFixture,
  });
  await form.locator('button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-pass-intake-list] .pass-submission').length===3);
  const zip=state.items.find(item=>item.delivery==='zip'&&item.actorEmail===roleInfo.vendor.email);
  assert.equal(zip?.status,'quarantined');
  assert.equal(zip?.uploaded,true);
  assert.equal(zip?.artifactSize,32);
  assert.equal(await list.locator('.pass-review').count(),0,'vendor cannot see review controls');
  await page.screenshot({path:OUTPUT+'/'+profile.name+'-vendor.png',fullPage:true,animations:'disabled'});
  return {count:await list.locator('.pass-submission').count(),zipSimulated:true};
}
async function adminJourney(page,state,profile){
  const list=page.locator('[data-pass-intake-list]');
  await page.waitForFunction(()=>document.querySelectorAll('[data-pass-intake-list] .pass-submission').length>=4);
  assert.equal(await list.locator('.pass-submission').count(),4,'admin must see vendor plus other vendor');
  const outsider=list.locator('.pass-submission').filter({hasText:'OTHER_SYNTHETIC_VENDOR'});
  assert.equal(await outsider.count(),1);
  const pr=list.locator('.pass-submission').filter({hasText:'QA GitHub PR '+profile.name});
  assert.equal(await pr.count(),1);
  await pr.locator('select').selectOption('rejected');
  await pr.locator('input').fill('실제 공급업체 소스·라이선스 검증 대기');
  await pr.locator('button').click();
  await page.waitForFunction(({name})=>[...document.querySelectorAll('[data-pass-intake-list] .pass-submission')].some(el=>el.textContent.includes(name)&&el.textContent.includes('반려')),{name:'QA GitHub PR '+profile.name},{timeout:12000});
  const item=state.items.find(entry=>entry.delivery==='github_pr'&&entry.vendorName==='QA GitHub PR '+profile.name);
  assert.equal(item?.status,'rejected');
  const zip=list.locator('.pass-submission').filter({hasText:'QA ZIP '+profile.name});
  const opts=await zip.locator('select option').evaluateAll(nodes=>nodes.map(n=>n.value));
  assert.ok(!opts.includes('approved_for_testing'),'ZIP scanning bypass must remain unavailable');
  await page.screenshot({path:OUTPUT+'/'+profile.name+'-admin.png',fullPage:true,animations:'disabled'});
  return {visibleCount:await list.locator('.pass-submission').count(),prReview:'rejected',zipUnsafeApprovalVisible:false};
}
async function guestJourney(browser,profile,state){
  const context=await setupContext(browser,profile);
  await installRoutes(context,state,'vendor');
  const page=await context.newPage();
  const errors=observedErrors(page);
  const response=await page.goto(ADMIN,{waitUntil:'domcontentloaded',timeout:24000});
  assert.equal(response?.status(),200);
  await page.waitForURL(/\/auth\/\?/, {timeout:12000});
  const auth=new URL(page.url());
  assert.equal(auth.pathname,'/auth/');
  assert.equal(auth.searchParams.get('direct'),'1');
  assert.equal(auth.searchParams.get('return_to'),ADMIN);
  assert.equal(auth.searchParams.get('site'),'portal');
  assert.equal(state.authRedirects.length>=1,true);
  assert.equal(errors.length,0);
  await context.close();
  return {redirectToLogin:true,retainedPath:true,actualGoogleLogin:false};
}
await fs.mkdir(OUTPUT,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  for(const profile of profiles){
    const result={profile:profile.name,viewport:profile.width+'x'+profile.height,passed:false};
    report.profiles.push(result);
    const state={items:seeded(),calls:[],authCalls:[],authRedirects:[],unexpectedNetwork:[]};
    let vendor,admin;
    try{
      result.signedOut=await guestJourney(browser,profile,state);
      vendor=await visitWithAuth(browser,profile,state,'vendor');
      result.vendor=await vendorJourney(vendor.page,state,profile);
      result.vendorOverflow=vendor.overflow;
      await vendor.context.close();vendor=null;
      admin=await visitWithAuth(browser,profile,state,'admin');
      result.admin=await adminJourney(admin.page,state,profile);
      result.adminOverflow=admin.overflow;
      await admin.context.close();admin=null;
      assert.equal(state.authCalls.filter(v=>v.actor==='vendor').length>=1,true);
      assert.equal(state.authCalls.filter(v=>v.actor==='admin').length>=1,true);
      assert.equal(state.unexpectedNetwork.length,0,'no test bearer/write reached a real endpoint');
      assert.equal(state.calls.filter(c=>c.method==='POST'&&c.path===API).length,3);
      assert.equal(state.calls.some(c=>c.method==='POST'&&c.path.endsWith('/upload')),true);
      assert.equal(state.calls.some(c=>c.method==='POST'&&c.path.endsWith('/review')),true);
      result.syntheticEndpointCalls=state.calls.length;
      result.passed=true;
    }catch(error){
      result.error=String(error?.message||error).slice(0,1000);
      throw error;
    }finally {
      await vendor?.context.close().catch(()=>{});
      await admin?.context.close().catch(()=>{});
    }
  }
  report.passed=report.profiles.every(row=>row.passed);
}finally{
  await browser.close();
  report.finishedAt=new Date().toISOString();
  await fs.writeFile(OUTPUT+'/report.json',JSON.stringify(report,null,2)+'\n');
  console.log('EKODI_PASS_NATIVE_SYNTHETIC_UI='+JSON.stringify(report));
}
if(!report.passed)process.exitCode=1;
