import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const LABELS=['공지','활동이력','관련소식','소통채널','시민의견','조직'];
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
            const centralPanel=document.querySelector('#central-category-panel');
            const centralContract=document.querySelector('#central-category-link-contract');
            const centralLinks=centralContract?Array.from(centralContract.content.querySelectorAll('a')).map(a=>({label:a.textContent.trim(),href:a.getAttribute('href')})):[];
            const centralCategory={present:!!centralPanel,initiallyHidden:!!centralPanel?.hidden,noticeTrigger:!!nav?.querySelector('[data-category-menu="공지"]'),entries:centralLinks};
            return {top,groups,centralCategory,
              horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
              // Report only geometry and class/id names, never private page text.
              overflowGeometry:Array.from(document.body.querySelectorAll('*'))
                .map(el=>({el,box:el.getBoundingClientRect()}))
                .filter(x=>x.box.width>0&&x.box.right>document.documentElement.clientWidth+2)
                .slice(0,8).map(x=>({tag:x.el.tagName.toLowerCase(),id:String(x.el.id||'').slice(0,45),className:typeof x.el.className==='string'?x.el.className.slice(0,70):'',right:Math.round(x.box.right),width:Math.round(x.box.width)})),
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
          if(record.horizontalOverflow)violations.push('horizontal_overflow: '+JSON.stringify(record.overflowGeometry||[]).slice(0,420));
          // Home and independent boards expose central content tabs; legacy dropdowns remain supported.
          // Both layouts must expose real notice, minutes, finance and social links.
          const noticeGroup=record.groups.find(x=>x.parent==='공지');
          const socialGroup=record.groups.find(x=>x.parent==='소통채널');
          const centralValid=record.centralCategory.present&&record.centralCategory.initiallyHidden&&true;
          const noticeEntries=noticeGroup?.entries||(centralValid?record.centralCategory.entries:[]);
          const socialEntries=socialGroup?.entries||(centralValid?record.centralCategory.entries:[]);
          if(publicSurface&&!noticeEntries.some(x=>x.label==='공지사항'))violations.push('notice_submenu_missing');
          if(publicSurface&&!socialEntries.some(x=>x.label==='유튜브'))violations.push('social_submenus_missing');
          if(publicSurface&&!socialEntries.some(x=>x.label==='인스타그램'))violations.push('instagram_link_missing');
          if(publicSurface&&!socialEntries.some(x=>x.label==='페이스북'||x.label==='페이스북 그룹'))violations.push('facebook_link_missing');
          // Exercise real top-menu transitions before Notice, not only the isolated Notice link.
          // Every action stays read-only and uses the same first-party Chromium context.
          if(suffix==='/'&&centralValid){
            const contexts=[
              {label:'활동이력',selector:'a[data-view-link="committee"]'},
              {label:'관련소식',selector:'a[data-view-link="status"]'},
              {label:'소통채널',selector:'a[data-view-link="channels"]'},
              {label:'시민의견',selector:'a[href*="board/voices"]'},
              {label:'조직',selector:'a[data-view-link="organization"]'}
            ];
            const expectedPath=root.prefix+'/board/notices';
            record.noticeAfterCategory=[];
            for(const item of contexts){
              await page.locator('header.site-header nav '+item.selector).first().click({timeout:6000});
              await page.locator('header.site-header nav a[href*="board/notices"]').first().click({timeout:8000});
              await page.waitForURL(url=>url.origin===root.origin&&url.pathname.replace(/[/]$/,'')===expectedPath,{timeout:10000});
              const actualPath=new URL(page.url()).pathname.replace(/[/]$/,'');
              const ok=actualPath===expectedPath;
              record.noticeAfterCategory.push({from:item.label,path:actualPath,ok});
              if(!ok)throw Error('notice_after_'+item.label+'_unexpected_path_'+actualPath);
              let homeResponse;
              for(let attempt=0;attempt<2;attempt++){
                homeResponse=await page.goto(target,{waitUntil:'domcontentloaded',timeout:25000});
                if(![429,502,503,504].includes(homeResponse?.status()))break;
                if(attempt===0)await pause(3000);
              }
              if(!homeResponse?.ok())throw Error('notice_context_return_home_http_'+String(homeResponse?.status()||0));
            }
          }
          if((suffix==='/'||suffix.startsWith('/board/'))&&centralValid){
            try{
              await page.locator('header.site-header nav a[href*="board/notices"]').first().click({timeout:5000});
              record.centralNoticeOpen=new URL(page.url()).pathname.includes('/board/notices');
              if(!record.centralNoticeOpen)violations.push('central_notice_category_not_open_with_links');
            }catch(error){violations.push('central_notice_category_click_failed:'+String(error.message||error).slice(0,160))}
          }
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
