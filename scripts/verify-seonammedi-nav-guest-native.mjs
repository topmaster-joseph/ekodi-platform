import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const LABELS=['활동이력','관련소식','소통채널','시민의견','공지','조직'];
const ROOTS=[
  {name:'canonical',origin:'https://ekodi.kr',prefix:'/seonammedi'},
  {name:'customer',origin:'https://seonammedi.kr',prefix:''}
];
const ROUTES=['/','/board/voices','/board/notices','/board/finance','/minutes/','/admin/'];
const DEVICES=[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}];
const out=path.resolve(process.env.EKODI_NAV_AUDIT_OUTPUT||'artifacts/seonammedi-nav-guest');
await fs.mkdir(out,{recursive:true});
const report={policy:'EKODI-SEONAMMEDI-NAV-GUEST-001',owner:'ekodi-native-browser',readOnly:true,startedAt:new Date().toISOString(),expectedLabels:LABELS,results:[],errors:[],passed:false};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
try {
  browser=await chromium.launch({headless:true});
  for(const root of ROOTS)for(const device of DEVICES){
    const context=await browser.newContext({
      viewport:{width:device.width,height:device.height},isMobile:device.name==='mobile',
      hasTouch:device.name==='mobile',acceptDownloads:false
    });
    const page=await context.newPage();
    const jsErrors=[],mutations=[];
    page.on('pageerror',e=>jsErrors.push(String(e?.message||e).slice(0,200)));
    await page.route('**/*',route=>{
      const req=route.request(),method=req.method().toUpperCase();
      if(!['GET','HEAD','OPTIONS'].includes(method)){
        mutations.push({method,url:req.url().slice(0,250)});
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    try {
      for(let i=0;i<ROUTES.length;i++){
        const suffix=ROUTES[i];
        const target=root.origin+root.prefix+suffix;
        const record={origin:root.name,device:device.name,path:suffix,url:target};
        report.results.push(record);
        try {
          let response=null;
          for(let attempt=0;attempt<2;attempt++){
            response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:25000});
            if(![429,502,503,504].includes(response?.status()))break;
            if(attempt===0)await pause(3000);
          }
          record.http=response?.status()??0;
          if(record.http<200||record.http>=400)throw Error('page_http_'+record.http);
          await pause(350);
          record.actualUrl=page.url();
          const observed=await page.evaluate(()=>{
            const nav=document.querySelector('header.site-header nav[aria-label="주요 메뉴"]');
            const top=nav?Array.from(nav.children).flatMap(el=>{
              if(el.matches('a'))return [{label:el.textContent.trim(),href:el.getAttribute('href')}];
              if(el.matches('.nav-group')) {
                const link=el.querySelector(':scope > a');
                return link?[{label:link.textContent.trim(),href:link.getAttribute('href')}]:[];
              }
              return [];
            }):[];
            const groups=nav?Array.from(nav.querySelectorAll('.nav-group')).map(group=>({
              parent:group.querySelector(':scope > a')?.textContent.trim()||'',
              entries:Array.from(group.querySelectorAll('.nav-submenu a')).map(a=>({label:a.textContent.trim(),href:a.getAttribute('href')})),
              button:!!group.querySelector(':scope > button[aria-expanded]')
            })):[];
            return {top,groups,
              horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
              heroOriginalPresent:!!document.querySelector('.campaign-hero-image'),
              heroLoaded:(()=>{const img=document.querySelector('.campaign-hero-image');return !!img?.complete&&img.naturalWidth===1903&&img.naturalHeight===735})(),
              writeButtonVisible:(()=>{const b=document.getElementById('writeToggle');return !!b&&b.getBoundingClientRect().width>0})(),
              editorShownWithoutLogin:(()=>{const el=document.getElementById('writeForm');return !!el&&!el.hidden&&getComputedStyle(el).display!=='none'})(),
              authButtonVisible:!!document.querySelector('#adminLogin'),
              minutesGuestGate:!!document.querySelector('#viewerForm'),
              minutesPrivateContentHidden:(()=>{const el=document.querySelector('#minutes');return !!el?.hidden})(),
              adminLoginPrompt:!!document.querySelector('#adminIdentity')
            };
          });
          Object.assign(record,observed);
          const violations=[];
          const actualLabels=record.top.map(x=>x.label);
          const publicSurface=!['/minutes/','/admin/'].includes(suffix);
          record.topLevelMatches=JSON.stringify(actualLabels)===JSON.stringify(LABELS);
          if(publicSurface&&!record.topLevelMatches)violations.push('menu_labels_mismatch: '+JSON.stringify(actualLabels));
          if(record.horizontalOverflow)violations.push('horizontal_overflow');
          if(publicSurface&&!record.groups.find(x=>x.parent==='공지')?.entries.some(x=>x.label==='회계'))violations.push('finance_not_under_notices');
          if(publicSurface&&!record.groups.find(x=>x.parent==='공지')?.entries.some(x=>x.label==='회의록'))violations.push('minutes_not_under_notices');
          if(publicSurface&&record.groups.find(x=>x.parent==='소통채널')?.entries.some(x=>x.label==='유튜브')!==true)violations.push('social_submenus_missing');
          if(suffix==='/'&&(!record.heroOriginalPresent||!record.heroLoaded))violations.push('original_campaign_hero_regression');
          if(suffix==='/board/voices'&&record.editorShownWithoutLogin)violations.push('guest_composer_exposed');
          if(suffix==='/board/voices'&&record.authButtonVisible)violations.push('guest_login_button_before_write');
          if(suffix==='/minutes/'&&(!record.minutesGuestGate||!record.minutesPrivateContentHidden))violations.push('minutes_guest_privacy_gate_missing');
          if(suffix==='/board/voices'){
            if(!record.writeButtonVisible){
              violations.push('guest_write_entry_missing');
            } else {
              // No credentials entered, no posting. Click only to confirm that
              // anonymous writers are first handed to the canonical login gate.
              const loginNavigations=[];
              const observe=frame=>{
                if(frame===page.mainFrame())loginNavigations.push(frame.url());
              };
              page.on('framenavigated',observe);
              try {
                await page.locator('#writeToggle').click({timeout:5000});
                await pause(2200);
                record.loginNavigations=loginNavigations.slice(-6).map(url=>{
                  // Strip any auth query payloads from retained evidence.
                  const u=new URL(url);return u.origin+u.pathname+(u.searchParams.get('site')?'?site='+u.searchParams.get('site'):'');
                });
                record.guestLoginRedirect=loginNavigations.some(url=>{
                  try{const u=new URL(url);return u.origin==='https://ekodi.kr'&&
                    u.pathname.startsWith('/auth/')&&u.searchParams.get('site')==='seonammedi'}catch{return false}
                });
                if(!record.guestLoginRedirect)violations.push('guest_write_did_not_open_canonical_login');
              }catch(error){violations.push('guest_write_login_click_failed: '+String(error.message||error).slice(0,160))}
              finally{page.off('framenavigated',observe)}
            }
          }
          record.violations=violations;
          if(violations.length)throw Error(violations.join('; '));
          record.ok=true;
          if(i===0||i===1){
            const file=root.name+'-'+device.name+'-'+(i===0?'home':'voices')+'.png';
            await page.screenshot({path:path.join(out,file),fullPage:true,animations:'disabled'});
            record.screenshot=file;
          }
        }catch(e){
          record.ok=false;record.reason=String(e.message||e).slice(0,400);
          report.errors.push(root.name+'/'+device.name+suffix+': '+record.reason);
          try{if(!record.screenshot){const file=root.name+'-'+device.name+'-'+i+'-failed.png';await page.screenshot({path:path.join(out,file),fullPage:true,timeout:5000});record.screenshot=file}}catch{}
        }
        await pause(device.name==='mobile'?1300:600);
      }
    }finally{
      report.results.filter(x=>x.origin===root.name&&x.device===device.name).forEach(x=>{
        x.jsErrors=jsErrors.slice(0,5);x.blockedMutations=mutations.length;
      });
      await context.close();
    }
  }
}catch(e){report.errors.push('native_chromium: '+String(e.message||e).slice(0,350))}
finally{
  if(browser)await browser.close().catch(()=>{});
  report.passed=report.errors.length===0;
  report.finishedAt=new Date().toISOString();
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,surfaceCount:report.results.length,successCount:report.results.filter(x=>x.ok).length,errors:report.errors,artifactPath:out}));
  if(!report.passed)process.exitCode=1;
}
// Post-merge read-only audit rerun for guarded release PR #4627.

// Fresh operational witness after successful canonical Shared Site Core run #38385650879.
