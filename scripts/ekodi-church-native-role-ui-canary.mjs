import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
// 공유 감사 분류기. 메서드와 URL 을 완전일치로 보므로 분류되지 않는 쓰기 요청은
// 전과 같이 치명적으로 남는다.
import {classifyMutationSecurityBlock} from './education-native-security-observations.mjs';

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
const checks=[],errors=[],httpErrors=[],blockedMethods=[],blockedMutations=[];
let intercepted=0;
let preflights=0;
let assetStatus=null;
const consoleErrors=[],requestFailures=[];
let decision='allowed';
try{
  const context=await browser.newContext({
    viewport:{width:390,height:844},
    acceptDownloads:false,
    serviceWorkers:'block',
    permissions:[]
  });
  const page=await context.newPage();
  await page.addInitScript(()=>{
    const initial=window.addEventListener;
    window.__ekodiNativeFocusRegistrations=0;
    window.addEventListener=function(type,listener,...rest){
      if(type==='focus')window.__ekodiNativeFocusRegistrations++;
      return initial.call(this,type,listener,...rest);
    };
  });
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text().slice(0,200))});
  page.on('requestfailed',req=>{const url=new URL(req.url());requestFailures.push({path:url.pathname.slice(0,100),failure:req.failure()?.errorText?.slice(0,70)})});
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,180)));
  page.on('response',response=>{
    if(new URL(response.url()).pathname.endsWith('/church-worship-admin.js'))assetStatus=response.status();
    if(response.status()>=400){
      const url=new URL(response.url());
      httpErrors.push({status:response.status(),path:url.pathname.slice(0,100)});
    }
  });
  // Route registration order matters: the capability route below overrides this
  // catch-all and guarantees the fake token never reaches the real API.
  await page.route('**/*',async route=>{
    const method=route.request().method().toUpperCase();
    if(route.request().headers().authorization?.includes(FAKE_TOKEN)){
      blockedMethods.push('fixture-leak-blocked');
      return route.abort('blockedbyclient');
    }
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      // 메서드만 기록하면 2026-11-08 푸터 방문통계 비콘과 실제 쓰기를 구분할 수
      // 없다. URL 까지 기록해 공유 분류기가 판정하게 한다.
      blockedMutations.push({method,url:route.request().url().slice(0,300)});
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await page.route(url=>url.origin===API_ORIGIN&&url.pathname===API_PATH&&url.searchParams.get('scope')==='worship-access',async route=>{
    const req=route.request();
    // A cross-origin request can require a CORS OPTIONS preflight.
    // Both requests are isolated to this allowlisted capability endpoint.
    if(req.method()==='OPTIONS'){
      preflights++;
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
  // 주보·PPT 구역([data-church-weekly] = section.church-weekly-focus#weekly-worship)은
  // 교회 홈의 압축 내비게이션 때문에 열기 전에는 display:none 이다
  // (church-section-nav.js 가 해시를 보고 church-section-active 를 토글하고,
  // church-compact-navigation.css 가 나머지 구역을 display:none!important 로 둔다).
  // 열지 않고 그 안의 날짜 선택을 조작하면 "element is not visible" 로 30초 뒤
  // 시간초과한다 — 실행 43219675210 에서 실제로 그랬다. 운영 결함이 아니라 검사가
  // 틀린 화면 상태를 본 것이므로, 방문자와 같은 방식으로 구역을 먼저 연다.
  await page.evaluate(()=>{location.hash='#weekly-worship';});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#weekly-worship')).display!=='none',
    null,{timeout:12000});
  // Read-only real production checks: dated packet switching and responsive UI.
  // No synthetic bearer is present until after these checks finish.
  const weekly=page.locator('[data-church-weekly]');
  await weekly.waitFor({state:'attached',timeout:12000});
  const picker=weekly.locator('[data-weekly-date]');
  await page.waitForFunction(()=>document.querySelector('[data-weekly-date]')?.options.length>=2,null,{timeout:15000});
  const guestWorship=[];
  for(const device of [{name:'mobile',width:390,height:844},{name:'desktop',width:1440,height:900}]){
    await page.setViewportSize({width:device.width,height:device.height});
    for(const entry of [
      {date:'2026-10-11',title:'모두가 듣도록, 다음 세대까지'},
      {date:'2026-10-18',title:'품 안에서, 세상으로'}
    ]){
      await picker.selectOption(entry.date);
      await page.waitForFunction(({date,title})=>{
        const select=document.querySelector('[data-weekly-date]');
        const heading=document.querySelector('[data-weekly-title]');
        const bulletin=document.querySelector('[data-weekly-bulletin]');
        return select?.value===date&&heading?.textContent?.trim()===title&&bulletin?.getAttribute('href')==='/ekodichurch/worship/'+date+'/';
      },entry,{timeout:12000});
      const state=await page.evaluate(()=>{
        const root=document.querySelector('[data-church-weekly]');
        const area=root?.getBoundingClientRect();
        const bulletin=root.querySelector('[data-weekly-bulletin]')?.getAttribute('href');
        const stage=root.querySelector('[data-weekly-slides]')?.getAttribute('href');
        const operator=root.querySelector('[data-weekly-broadcast]')?.getAttribute('href');
        return {date:root.querySelector('[data-weekly-date]')?.value,
          width:window.innerWidth,rootWidth:area?.width,
          rootLeft:area?.left,rootRight:area?.right,
          guestEditHidden:root.querySelector('[data-church-worship-admin]')?.hidden===true,
          bulletin,stage,operator};
      });
      assert.equal(state.date,entry.date);
      assert.equal(state.guestEditHidden,true,'guest edit capability must never appear when switching dates');
      assert.ok(state.rootLeft>=-2&&state.rootRight<=state.width+2,'weekly panel must fit the '+device.name+' viewport');
      assert.equal(state.bulletin,'/ekodichurch/worship/'+entry.date+'/');
      assert.equal(state.stage,state.bulletin+'?view=stage');
      assert.equal(state.operator,state.bulletin+'?view=operator');
      guestWorship.push({device:device.name,...state});
    }
  }
  await page.setViewportSize({width:390,height:844});
  const release=await page.evaluate(async()=>{
    const res=await fetch('/ekodichurch/church-release.json',{cache:'no-store'});
    if(!res.ok)throw Error('Church production release marker unavailable');
    return res.json();
  });
  assert.equal(release.sourceRepository,'topmaster-joseph/ekodi-church');
  assert.match(release.sourceSha,/^[a-f0-9]{40}$/);
  const admin=page.locator('[data-church-worship-admin]');
  assert.equal(await admin.count(),1,'there must be one contextual manager link');
  assert.equal(await admin.getAttribute('href'),'/ekodichurch/admin/worship');
  assert.equal(await admin.evaluate(el=>el.hidden),true,'visitor must not see management');
  checks.push({step:'real production guest UI',result:'hidden',intercepted,guestWorship,releaseSourceSha:release.sourceSha});
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
    const clientState=await page.evaluate(()=>({
      focusRegistrations:window.__ekodiNativeFocusRegistrations,
      scriptUrl:[...document.scripts].find(x=>x.src.endsWith('/church-worship-admin.js'))?.src||'',
      permissionRequestOrigin:'https://renzehysxirjilvdxacv.supabase.co',
      tokenCondition:!!(JSON.parse(sessionStorage.getItem('ekodi-church-pastor-session')||'null')?.accessToken),
      scriptResources:performance.getEntriesByType('resource').filter(x=>x.name.includes('church-worship-admin.js')).map(x=>({transferSize:x.transferSize,responseStatus:x.responseStatus}))
    }));
    console.error('EKODI_NATIVE_CHURCH_ROLE_DIAGNOSTIC='+JSON.stringify({intercepted,preflights,assetStatus,state,clientState,scriptErrors:errors,consoleErrors,requestFailures,httpErrors:httpErrors.slice(0,10)}));
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
  // 가짜 토큰 누출은 분류 대상이 아니다 — 항상 실패해야 한다. 메시지를 분리해
  // 누출과 떠돌이 쓰기 요청을 혼동하지 않게 한다.
  assert.deepEqual(blockedMethods,[],'fixture token must never reach the network');
  const unexpectedMutations=blockedMutations.filter(item=>classifyMutationSecurityBlock(item.method,item.url)===null);
  assert.deepEqual(unexpectedMutations,[],'ordinary public site must not perform mutations');
  console.log('EKODI_NATIVE_CHURCH_ROLE_UI_CANARY='+JSON.stringify({
    mode:'EKODI-owned Chromium',origin:ORIGIN,
    realUserAuthenticated:false,serverRoleResponsesSimulated:true,
    dataMutations:false,originalUserProfileReused:false,
    checks,unrelatedHttpErrors:httpErrors,scriptErrors:errors
  }));
  await fs.writeFile(path.join(artifactDir,'result.json'),JSON.stringify({
    ok:true,mode:'ekodi-owned-headless-chromium',
    realUserAuthenticated:false,serverRoleResponsesSimulated:true,
    origin:ORIGIN,checks,guestWorship,releaseSourceSha:release.sourceSha,
    unrelatedHttpErrors:httpErrors,scriptErrors:errors,
    screenshotNames:['guest.png','synthetic-allowed.png','synthetic-revoked.png'],
    limits:'Does not verify an actual Google account; production API real HTTP 401/403 are covered by separate live-canary.'
  },null,2));
  await context.close();
}finally{await browser.close();}
