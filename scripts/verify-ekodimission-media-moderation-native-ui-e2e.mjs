import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// Production HTML and JS are GET-only. All identity/data changes are synthetic
// Playwright route.fulfill calls; no production account, JWT or media is touched.
const origin=String(process.env.EKODI_PRODUCTION_ORIGIN||'https://ekodi.kr').replace(/\/+$/,'');
const archivePath='/ekodimission/activities/260926-chuseok-open-table/archive';
const url=origin+archivePath;
const dir=path.resolve('artifacts/ekodimission-media-native-ui-e2e');
await fs.mkdir(dir,{recursive:true});
const fakeId='d0d0d0d0-aaaa-4aaa-8aaa-000000000001';
const fakeToken='synthetic-native-e2e-not-an-auth-credential';
const fixture='<article class="service-card activity-result-card" data-media-card data-media-id="'+fakeId+'"><a href="https://media.invalid/fixture" rel="noopener noreferrer"><h2>합성 관리자 검증 미디어</h2></a></article>';

let fatal=null;
const results=[];
const browser=await chromium.launch({headless:true});

async function testViewport(width,height){
  const calls=[],attempts=[],errors=[];
  const context=await browser.newContext({viewport:{width,height}});
  // Never let synthetic mutation requests reach the production network.
  await context.route('**/*',async route=>{
    const req=route.request();
    if(!['GET','HEAD'].includes(req.method())){
      attempts.push({method:req.method(),path:new URL(req.url()).pathname});
      return route.fulfill({status:599,contentType:'application/json',body:'{"ok":false,"error":"unmocked_mutation_blocked"}'});
    }
    return route.continue();
  });
  await context.route(url,async route=>{
    const live=await route.fetch({timeout:20000});
    if(live.status()!==200)throw new Error('Live Mission archive GET returned '+live.status());
    let html=await live.text();
    if(!html.includes('data-activity-archive')||!html.includes('data-media-list'))throw new Error('Real Mission archive template absent');
    const marker=/(<div class="service-grid" data-media-list>)[\s\S]*?(<\/div><\/section><\/main>)/;
    if(!marker.test(html))throw new Error('Mission archive data-media-list structure changed');
    html=html.replace(marker,(_all,prefix,suffix)=>prefix+fixture+suffix);
    return route.fulfill({response:live,body:html,headers:{...live.headers(),'cache-control':'no-store'}});
  });

  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(String(error?.message||error)));
  await page.addInitScript(token=>sessionStorage.setItem('ekodi-auth-token',token),fakeToken);

  await context.route('**/ekodimission/api/admin/me',async route=>{
    const auth=route.request().headers().authorization||'';
    calls.push({type:'me',authorized:auth==='Bearer '+fakeToken});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,authenticated:true,permissions:{media:true}})});
  });
  await context.route('**/ekodimission/api/admin/activity-rpc',async route=>{
    const req=route.request(),body=req.postDataJSON();
    calls.push({type:'moderation',method:req.method(),authorization:req.headers().authorization===('Bearer '+fakeToken),body});
    return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"hidden":true}'});
  });
  await context.route('**/ekodimission/api/activities/*/media',async route=>{
    const req=route.request(),body=req.postDataJSON();
    calls.push({type:'anonymous-retry',method:req.method(),body});
    return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({ok:false,error:'media_moderated',message:'관리자가 숨긴 항목은 다시 공개할 수 없습니다.'})});
  });

  const checks={};
  let error=null;
  try{
    const resp=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    checks.liveArchiveStatus=resp?.status()===200;
    await page.locator('[data-media-card][data-media-id="'+fakeId+'"] [data-media-hide]').waitFor({state:'visible'});
    checks.adminButtonVisible=true;
    checks.syntheticAuthScoped=calls.some(x=>x.type==='me'&&x.authorized);
    await page.locator('[data-media-card][data-media-id="'+fakeId+'"] [data-media-hide]').click();
    await page.waitForFunction(id=>document.querySelector('[data-media-card][data-media-id="'+id+'"]')===null,fakeId);
    checks.hiddenCardRemoved=await page.locator('[data-media-card]').count()===0;
    checks.emptyArchiveMessage=await page.getByText('표시할 결과가 없습니다.').isVisible();
    checks.authorizedHideRpc=calls.some(c=>c.type==='moderation'&&c.method==='POST'&&c.authorization&&c.body?.rpc==='activity_admin_hide_media_link'&&c.body.args?.p_workspace_slug==='ekodimission'&&c.body.args?.p_media_id===fakeId&&c.body.args?.p_hidden===true);

    // Attacker re-submission is synthetic and blocked from reaching PROD.
    const form=page.locator('[data-media-submit]');
    await form.locator('input[name="url"]').fill('https://media.invalid/fixture');
    await form.locator('input[name="publicConsent"]').check();
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-media-status]')?.textContent?.includes('다시 공개할 수 없습니다'));
    checks.retryRejectedInUi=true;
    checks.retryConsentAttestation=calls.some(c=>c.type==='anonymous-retry'&&c.body?.publicConsent===true&&c.body?.url==='https://media.invalid/fixture');
    checks.noUnmockedMutations=attempts.length===0;
    checks.noScriptErrors=errors.length===0;
    checks.noHorizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth);
    const failures=Object.entries(checks).filter(([,ok])=>ok!==true).map(([name])=>name);
    if(failures.length)throw new Error('Mission synthetic media browser checks failed: '+failures.join(', '));
    await page.screenshot({path:path.join(dir,'synthetic-'+width+'-success.png'),fullPage:true});
  }catch(err){
    error=String(err?.stack||err);
    await page.screenshot({path:path.join(dir,'synthetic-'+width+'-failure.png'),fullPage:true}).catch(()=>{});
  }finally{
    results.push({viewport:{width,height},url,mode:'real-production-GET-assets+intercepted-synthetic-auth-and-mutations',checks,calls,unmockedMutations:attempts,errors,error});
    await context.close();
  }
  if(error)throw new Error(error);
}
try{
  await testViewport(390,844);
  await testViewport(1440,900);
}catch(err){fatal=err}
finally{
  await fs.writeFile(path.join(dir,'report.json'),JSON.stringify({generatedAt:new Date().toISOString(),url,passed:!fatal,results,error:fatal?String(fatal):null},null,2));
  await browser.close();
}
if(fatal)throw fatal;
console.log('EKODI Mission synthetic moderator UI: 390px and 1440px success; no PROD write or real authentication.');
