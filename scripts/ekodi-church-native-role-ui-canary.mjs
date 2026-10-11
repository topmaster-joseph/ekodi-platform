import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// First-party EKODI isolated browser. The browser loads actual production UI,
// but never receives a real user's session or sends a fabricated token upstream.
// Only the specifically allowlisted worship capability response is intercepted.
const ORIGIN='https://ekodi.kr';
const PAGE=ORIGIN+'/ekodichurch/';
const API_ORIGIN='https://renzehysxirjilvdxacv.supabase.co';
const API_PATH='/functions/v1/church-pastor-api';
const FAKE_TOKEN='ekodi-native-canary-fixture-not-a-user';
const artifactDir=path.resolve('artifacts/ekodi-church-native-ui');
await fs.mkdir(artifactDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const checks=[],errors=[],httpErrors=[],blockedMethods=[];
let intercepted=0;
let decision='allowed';
try{
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    acceptDownloads:false,
    serviceWorkers:'block',
    permissions:[]
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,180)));
  page.on('response',response=>{
    if(response.status()>=400){
      const url=new URL(response.url());
      httpErrors.push({status:response.status(),path:url.pathname.slice(0,100)});
    }
  });
  // Route registration order matters: the capability route below overrides this
  // catch-all and guarantees the fake token never reaches the real API.
  await page.route('**/*',async route=>{
    const method=route.request().method().toUpperCase();
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      blockedMethods.push(method);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.route(url=>url.origin===API_ORIGIN&&url.pathname===API_PATH&&url.searchParams.get('scope')==='worship-access',async route=>{
    const req=route.request();
    // A cross-origin request can require a CORS OPTIONS preflight.
    // Both requests are isolated to this allowlisted capability endpoint.
    if(req.method()==='OPTIONS'){
      return route.fulfill({status:204,headers:{
        'access-control-allow-origin':ORIGIN,
        'access-control-allow-methods':'GET, OPTIONS',
        'access-control-allow-headers':'authorization, apikey, accept, content-type',
        'access-control-max-age':'0'
      }});
    }
    intercepted++;
    assert.equal(req.method(),'GET');
    assert.equal(req.headers().authorization,'Bearer '+FAKE_TOKEN);
    const ok=decision==='allowed';
    await route.fulfill({
      status:ok?200:403,
      contentType:'application/json',
      headers:{'access-control-allow-origin':ORIGIN,'access-control-allow-headers':'authorization,apikey,accept,content-type','cache-control':'no-store'},
      body:JSON.stringify(ok?{ok:true,permissions:{worship:true},churchSlug:'ekodi-church'}:{error:'ROLE_NOT_ALLOWED'})
    });
  });
  const landing=await page.goto(PAGE,{waitUntil:'domcontentloaded',timeout:25000});
  assert.equal(landing?.status(),200,'live Church public homepage must respond 200');
  assert.equal(new URL(page.url()).origin,ORIGIN,'must remain at canonical EKODI origin');
  await page.waitForFunction(()=>document.readyState==='complete',null,{timeout:15000});
  const admin=page.locator('[data-church-worship-admin]');
  assert.equal(await admin.count(),1,'there must be one contextual manager link');
  assert.equal(await admin.getAttribute('href'),'/ekodichurch/admin/worship');
  assert.equal(await admin.evaluate(el=>el.hidden),true,'visitor must not see management');
  checks.push({step:'real production guest UI',result:'hidden',intercepted});
  await page.screenshot({path:path.join(artifactDir,'guest.png')});

  await page.evaluate(token=>{
    sessionStorage.setItem('ekodi-church-pastor-session',JSON.stringify({
      accessToken:token,expiresAt:Math.floor(Date.now()/1000)+3600
    }));
    window.dispatchEvent(new Event('focus'));
  },FAKE_TOKEN);
  try{
    await page.waitForFunction(()=>document.querySelector('[data-church-worship-admin]')?.hidden===false,null,{timeout:12000});
  }catch(error){
    const state=await page.evaluate(()=>({
      hasSyntheticSession:!!sessionStorage.getItem('ekodi-church-pastor-session'),
      adminHidden:document.querySelector('[data-church-worship-admin]')?.hidden??null,
      adminScriptLoaded:!![...document.scripts].find(x=>x.src.endsWith('/church-worship-admin.js'))
    }));
    console.error('EKODI_NATIVE_CHURCH_ROLE_DIAGNOSTIC='+JSON.stringify({intercepted,state,pageErrorCount:errors.length,requestHttpStatus:httpErrors.map(x=>x.status).slice(0,12)}));
    throw error;
  }
  assert.equal(await admin.evaluate(el=>el.hidden),false);
  assert.equal(intercepted,1);
  checks.push({step:'in-browser synthetic server-authorized response',result:'visible',intercepted});
  await page.screenshot({path:path.join(artifactDir,'synthetic-allowed.png')});

  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('[data-church-worship-admin]')?.hidden===false,null,{timeout:12000});
  assert.equal(await admin.count(),1,'revalidation must not duplicate admin links');
  checks.push({step:'focus revalidation and DOM reuse',result:'visible-one-link',intercepted});

  decision='revoked';
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('[data-church-worship-admin]')?.hidden===true,null,{timeout:12000});
  assert.equal(await admin.evaluate(el=>el.hidden),true);
  checks.push({step:'in-browser synthetic permission revocation',result:'hidden',intercepted});
  await page.screenshot({path:path.join(artifactDir,'synthetic-revoked.png')});

  const beforeLogout=intercepted;
  await page.evaluate(()=>{
    sessionStorage.removeItem('ekodi-church-pastor-session');
    window.dispatchEvent(new Event('ekodi:auth-logout'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(350);
  assert.equal(await admin.evaluate(el=>el.hidden),true);
  assert.equal(intercepted,beforeLogout,'logout without a token must not probe the API');
  checks.push({step:'in-browser synthetic logout',result:'hidden-no-API-call',intercepted});
  assert.deepEqual(blockedMethods,[],'ordinary public site must not perform mutations');
  console.log('EKODI_NATIVE_CHURCH_ROLE_UI_CANARY='+JSON.stringify({
    mode:'EKODI-owned Chromium',origin:ORIGIN,
    realUserAuthenticated:false,serverRoleResponsesSimulated:true,
    dataMutations:false,originalUserProfileReused:false,
    checks,unrelatedHttpErrors:httpErrors,scriptErrors:errors
  }));
  await fs.writeFile(path.join(artifactDir,'result.json'),JSON.stringify({
    ok:true,mode:'ekodi-owned-headless-chromium',
    realUserAuthenticated:false,serverRoleResponsesSimulated:true,
    origin:ORIGIN,checks,
    unrelatedHttpErrors:httpErrors,scriptErrors:errors,
    screenshotNames:['guest.png','synthetic-allowed.png','synthetic-revoked.png'],
    limits:'Does not verify an actual Google account; production API real HTTP 401/403 are covered by separate live-canary.'
  },null,2));
  await context.close();
}finally{await browser.close();}
