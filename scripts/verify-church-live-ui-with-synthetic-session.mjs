import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const HOME='https://ekodi.kr/ekodichurch/';
const API_ORIGIN='https://renzehysxirjilvdxacv.supabase.co';
const evidence={kind:'EKODI-native-Chromium-Church-UI-simulated-auth',livePage:HOME,
  note:'Only UI states are simulated: no real Google admin bearer or server-side positive role result is claimed.',
  steps:[],liveRequests:[],simulatedCapabilityRequests:[],pageErrors:[]};
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:false});
  const page=await context.newPage();
  let allow=false;
  page.on('pageerror',e=>evidence.pageErrors.push(String(e?.message||e).slice(0,260)));
  page.on('response',res=>{
    if(res.status()>=400)evidence.liveRequests.push({status:res.status(),url:new URL(res.url()).pathname.slice(0,120)});
  });
  await page.route('**/*',async route=>{
    const req=route.request();
    const u=new URL(req.url());
    if(!['GET','HEAD','OPTIONS'].includes(req.method().toUpperCase())){
      return route.abort('blockedbyclient');
    }
    if(u.origin===API_ORIGIN && u.pathname==='/functions/v1/church-pastor-api' &&
       u.searchParams.get('scope')==='worship-access'){
      evidence.simulatedCapabilityRequests.push({scope:'worship-access',
        hadBearer:/^Bearer local-church-ui-test-noncredential$/.test(req.headers().authorization||''),
        decision:allow?'200 synthetic':'403 synthetic'});
      return route.fulfill({status:allow?200:403,contentType:'application/json',
        headers:{'cache-control':'no-store','access-control-allow-origin':'https://ekodi.kr'},
        body:JSON.stringify(allow?{ok:true,permissions:{worship:true},churchSlug:'ekodi-church'}:{error:'ROLE_NOT_ALLOWED'})});
    }
    // Keep synthetic tokens away from any real server, including future page scripts.
    if(req.headers().authorization?.includes('local-church-ui-test-noncredential')){
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  let loaded=false;
  for(let attempt=0;attempt<2;attempt++){
    const response=await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:22000});
    if(response?.status()===200){loaded=true;break;}
    if(response?.status()!==429 && response?.status()!==503)throw Error('Homepage failed HTTP '+response?.status());
    if(attempt===1)throw Error('Cloudflare throttle: '+response.status());
    await page.waitForTimeout(3500);
  }
  assert.ok(loaded,'canonical Church site did not load');
  const link=page.locator('[data-church-worship-admin]');
  await link.waitFor({state:'attached',timeout:10000});
  // Church is an intentional one-page accordion: #worship is display:none
  // until the visitor follows the corresponding in-page navigation link.
  await page.evaluate(()=>{location.hash='#worship';});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#worship')).display!=='none',null,{timeout:8000});
  await page.evaluate(()=>document.querySelector('.schedule.reveal')?.scrollIntoView({block:'center'}));
  await page.waitForTimeout(1200);
  evidence.worshipSchedule=await page.evaluate(()=>{
    const s=document.querySelector('.schedule.reveal'),el=document.querySelector('[data-church-worship-admin]');
    return {scheduleExists:!!s,classes:s?.className||'',scheduleRect:s?.getBoundingClientRect().toJSON(),
      linkHidden:el?.hidden,linkDisplay:el?getComputedStyle(el).display:'',
      scriptLoaded:[...document.scripts].some(x=>x.src.includes('script.js')),
      readyState:document.readyState,scrollY,viewportHeight:innerHeight,
      ancestors:(()=>{
        const out=[];let p=el;
        while(p&&out.length<9){
          const cs=getComputedStyle(p);
          out.push({node:p.tagName,classes:p.className,display:cs.display,visibility:cs.visibility,
            opacity:cs.opacity,rect:p.getBoundingClientRect().toJSON()});
          p=p.parentElement;
        }
        return out;
      })()};
  });
  console.log('EKODI_CHURCH_SCHEDULE_DIAGNOSTIC='+JSON.stringify({schedule:evidence.worshipSchedule,pageErrors:evidence.pageErrors}));
  assert.equal(await link.isVisible(),false,'guest must never see management link');
  evidence.steps.push({name:'guest-hidden-on-real-site',pass:true});

  // Synthetic token is placed only in this isolated, ephemeral test browser.
  await page.evaluate(()=>{
    const now=Math.floor(Date.now()/1000);
    sessionStorage.setItem('ekodi-church-pastor-session',
      JSON.stringify({accessToken:'local-church-ui-test-noncredential',expiresAt:now+1800}));
  });
  allow=true;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('[data-church-worship-admin]')?.hidden===false,
    null,{timeout:10000});
  if(!await link.isVisible()){
    const style=await link.evaluate(el=>({
      hidden:el.hidden,cssDisplay:getComputedStyle(el).display,
      visibility:getComputedStyle(el).visibility,
      parentDisplay:getComputedStyle(el.parentElement).display,
      parentVisibility:getComputedStyle(el.parentElement).visibility,
      rect:el.getBoundingClientRect().toJSON()
    }));
    evidence.renderingDiagnostic=style;
    throw Error('Permitted link remains visually hidden '+JSON.stringify(style));
  }
  assert.equal(await link.getAttribute('href'),'/ekodichurch/admin/worship');
  evidence.steps.push({name:'mocked-allowed-capability-shows-control',pass:true});

  allow=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await page.waitForFunction(()=>document.querySelector('[data-church-worship-admin]')?.hidden===true,
    null,{timeout:10000});
  evidence.steps.push({name:'mocked-revocation-hides-control',pass:true});

  allow=true;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(()=>document.querySelector('[data-church-worship-admin]')?.hidden===false,
    null,{timeout:10000});
  await page.evaluate(()=>{
    sessionStorage.removeItem('ekodi-church-pastor-session');
    window.dispatchEvent(new Event('ekodi:auth-logout'));
  });
  await page.waitForFunction(()=>document.querySelector('[data-church-worship-admin]')?.hidden===true,
    null,{timeout:10000});
  evidence.steps.push({name:'logout-hides-control',pass:true});

  assert.ok(evidence.simulatedCapabilityRequests.some(x=>x.hadBearer&&x.decision==='200 synthetic'),
    'UI must actually call server with the local synthetic session');
  assert.ok(evidence.simulatedCapabilityRequests.some(x=>x.decision==='403 synthetic'),
    'UI must re-check server capability on revocation');
  assert.equal(evidence.pageErrors.length,0,'Browser page JavaScript threw errors');
  evidence.pass=true;
  await context.close();
}finally{
  await browser.close();
  await mkdir('artifacts/church-worship-ui',{recursive:true});
  await writeFile('artifacts/church-worship-ui/evidence.json',JSON.stringify(evidence,null,2));
}
console.log('EKODI_CHURCH_NATIVE_UI_PROOF='+JSON.stringify(evidence));
