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
              adminLoginPrompt:!!document.querySelector('#adminIdentity'),
              financePrivateGate:!!document.getElementById('financeAdminOnly')
            };
          });
          Object.assign(record,observed);
          const violations=[];
          const actualLabels=record.top.map(x=>x.label);
          const publicSurface=!['/minutes/','/admin/'].includes(suffix);
          record.topLevelMatches=JSON.stringify(actualLabels)===JSON.stringify(LABELS);
          if(publicSurface&&!record.topLevelMatches)violations.push('menu_labels_mismatch: '+JSON.stringify(actualLabels));
          if(record.horizontalOverflow)violations.push('horizontal_overflow: '+JSON.stringify(record.overflowGeometry||[]).slice(0,420));
          // Notice is a direct standalone-board link on every public entry, never a category/dropdown.
          // Other central categories continue to show their own valid social shortcuts.
          const noticeLink=record.top.find(x=>x.label==='공지');
          const expectedNoticePath=root.prefix+'/board/notices';
          let resolvedNoticePath='';
          try{if(noticeLink?.href)resolvedNoticePath=new URL(noticeLink.href,target).pathname.replace(/[/]$/,'')}catch{}
          record.directNoticePath=resolvedNoticePath;
          if(publicSurface&&resolvedNoticePath!==expectedNoticePath)violations.push('notice_direct_path_mismatch');
          if(publicSurface&&record.centralCategory.noticeTrigger)violations.push('notice_category_click_interception');
          const socialGroup=record.groups.find(x=>x.parent==='소통채널');
          const centralValid=record.centralCategory.present&&record.centralCategory.initiallyHidden;
          const socialEntries=socialGroup?.entries||(centralValid?record.centralCategory.entries:[]);
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
          // Finance rows and totals are never available to anonymous visitors,
          // regardless of the legacy URL or which customer-domain mount is used.
          // Read-only GET probes keep the audit credential-free and record only status codes.
          // Category/Notice navigation above can leave the page on the NOTICE board.
          // Restore the actual citizen-voice page before exercising its write login:
          // both boards expose #writeToggle, but Notice uses admin purpose by design.
          if(suffix==='/board/voices'){
            const expectedVoiceUrl=root.origin+root.prefix+'/board/voices';
            const current=new URL(page.url());
            const correctContext=current.origin===root.origin&&current.pathname.replace(/\\/+$/,'')===root.prefix+'/board/voices';
            if(!correctContext){
              const restored=await page.goto(expectedVoiceUrl,{waitUntil:'domcontentloaded',timeout:25000});
              if(!restored?.ok())throw Error('guest_voice_context_restore_http_'+String(restored?.status()||0));
            }
            if(!await page.locator('body.board-voices #writeToggle').isVisible().catch(()=>false)){
              throw Error('guest_voice_context_not_restored');
            }
            record.voiceContextRestored=true;
          }
          if(suffix==='/board/finance'){
            if(!record.financePrivateGate)violations.push('finance_guest_admin_only_marker_missing');
            record.financeGuestApiStatuses={};
            for(const endpoint of ['/board/api/finance','/board/api/finance/summary','/board/api/admin/finance']){
              let status=0;
              try{
                for(let attempt=0;attempt<2;attempt++){
                  const response=await page.request.get(root.origin+root.prefix+endpoint,{timeout:12000,maxRedirects:0});
                  status=response.status();
                  if(![429,502,503,504].includes(status)||attempt===1)break;
                  await pause(3000);
                }
              }catch{status=0}
              record.financeGuestApiStatuses[endpoint]=status;
              if(status!==401&&status!==403)violations.push('finance_guest_api_access_contract_'+endpoint+'_'+status);
            }
          }
          if(suffix==='/board/voices'&&record.editorShownWithoutLogin)violations.push('guest_composer_exposed');
          if(suffix==='/board/voices'&&record.authButtonVisible)violations.push('guest_login_button_before_write');
          if(suffix==='/minutes/'&&(!record.minutesGuestGate||!record.minutesPrivateContentHidden))violations.push('minutes_guest_privacy_gate_missing');
          if(suffix==='/board/voices'){
            // Verify actual public server authorization on both mounts without credentials.
            record.guestVoiceApiStatuses={};
            for(const endpoint of ['/board/api/auth/session','/board/api/admin/posts']){
              let status=0;
              try{status=(await page.request.get(root.origin+root.prefix+endpoint,{timeout:12000,maxRedirects:0})).status()}catch{}
              record.guestVoiceApiStatuses[endpoint]=status;
              if(endpoint.endsWith('/auth/session')&&status!==401)violations.push('guest_voice_session_gate_'+status);
              if(endpoint.endsWith('/admin/posts')&&status!==401&&status!==403)violations.push('guest_voice_admin_gate_'+status);
            }
            if(!record.writeButtonVisible){
              violations.push('guest_write_entry_missing');
            } else {
              // No credentials entered, no posting. Click only to confirm that
              // anonymous writers are first handed to the canonical login gate.
              const loginNavigations=[];
              const expectedReturn=root.origin+root.prefix+'/board/voices?compose=1';
              const requestIntent={login:false,returnPath:false,purpose:false,complete:false};
              // Record only non-sensitive boolean diagnostics for the outbound auth request.
              const composeRequestHints={requests:0,returnToPresent:false,purposePresent:false,returnOriginMatches:false,returnPathMatches:false,composeFlagPresent:false,returnPathCategory:'not-observed',purposeCategory:'not-observed'};
              const observe=frame=>{
                if(frame===page.mainFrame())loginNavigations.push(frame.url());
              };
              // Capture the *outgoing navigation request* before the auth app
              // rewrites its address. Only booleans survive in the report.
              const observeAuthRequest=request=>{
                try{
                  if(!request.isNavigationRequest()||request.frame()!==page.mainFrame())return;
                  const u=new URL(request.url());
                  if(u.origin!=='https://ekodi.kr'||u.pathname!=='/auth/'||
                     u.searchParams.get('site')!=='seonammedi')return;
                  const matchesReturn=u.searchParams.get('return_to')===expectedReturn;
                  const matchesPurpose=u.searchParams.get('purpose')==='seonammedi-board-write';
                  requestIntent.login=true;
                  requestIntent.returnPath ||= matchesReturn;
                  requestIntent.purpose ||= matchesPurpose;
                  requestIntent.complete ||= matchesReturn&&matchesPurpose;
                  if(typeof composeRequestHints!=='undefined'){
                    composeRequestHints.requests+=1;
                    composeRequestHints.returnToPresent ||= u.searchParams.has('return_to');
                    composeRequestHints.purposePresent ||= u.searchParams.has('purpose');
                    // Fixed allowlist categories only: never retain raw purpose, return URL or path.
                    if(composeRequestHints.purposeCategory==='not-observed'){
                      const purpose=u.searchParams.get('purpose');
                      composeRequestHints.purposeCategory=purpose==='seonammedi-board-write'?'write':
                        purpose==='seonammedi-board-admin'?'admin':purpose?'other':'missing';
                    }
                    const returnTo=u.searchParams.get('return_to');
                    if(returnTo)try{
                      const dest=new URL(returnTo),expected=new URL(expectedReturn);
                      // Distinguish a trailing slash from the wrong domain-specific board prefix.
                      // All report fields are allowlisted labels; no untrusted path leaves the runner.
                      if(composeRequestHints.returnPathCategory==='not-observed'){
                        const stripSlash=pathname=>pathname.replace(/\/+$/,'')||'/';
                        const expectedPath=stripSlash(expected.pathname),actualPath=stripSlash(dest.pathname);
                        const oppositePath=expectedPath.startsWith('/seonammedi/')?'/board/voices':'/seonammedi/board/voices';
                        composeRequestHints.returnPathCategory=dest.pathname===expected.pathname?'exact':
                          actualPath===expectedPath?'trailing-slash':
                          actualPath===oppositePath?'alternate-origin-route':
                          actualPath.endsWith('/board/voices')?'other-voice-prefix':'other';
                      }
                      composeRequestHints.returnOriginMatches ||= dest.origin===expected.origin;
                      composeRequestHints.returnPathMatches ||= dest.pathname===expected.pathname;
                      composeRequestHints.composeFlagPresent ||= dest.searchParams.get('compose')==='1';
                    }catch{}
                  }
                }catch{}
              };
              page.on('framenavigated',observe);
              page.on('request',observeAuthRequest);
              try {
                await page.locator('body.board-voices #writeToggle').click({timeout:5000});
                await pause(2200);
                record.loginNavigations=loginNavigations.slice(-6).map(url=>{
                  // Strip any auth query payloads from retained evidence.
                  const u=new URL(url);return u.origin+u.pathname+(u.searchParams.get('site')?'?site='+u.searchParams.get('site'):'');
                });
                record.guestLoginRedirect=requestIntent.login||loginNavigations.some(url=>{
                  try{const u=new URL(url);return u.origin==='https://ekodi.kr'&&
                    u.pathname.startsWith('/auth/')&&u.searchParams.get('site')==='seonammedi'}catch{return false}
                });
                if(!record.guestLoginRedirect)violations.push('guest_write_did_not_open_canonical_login');
                const composeAuthUrls=loginNavigations.flatMap(url=>{
                  try{const u=new URL(url);return u.origin==='https://ekodi.kr'&&u.pathname==='/auth/'&&u.searchParams.get('site')==='seonammedi'?[u]:[]}catch{return[]}
                });
                // Only record safe boolean checks, never the OAuth URL, tokens or private query.
                record.composeAuthSignals={...composeRequestHints};
                record.composeReturnPathMatches=requestIntent.returnPath||composeAuthUrls.some(u=>u.searchParams.get('return_to')===expectedReturn);
                record.composePurposeMatches=requestIntent.purpose||composeAuthUrls.some(u=>u.searchParams.get('purpose')==='seonammedi-board-write');
                record.composeReturnMatches=requestIntent.complete||composeAuthUrls.some(u=>
                  u.searchParams.get('return_to')===expectedReturn&&u.searchParams.get('purpose')==='seonammedi-board-write'
                );
                if(!record.composeReturnMatches)violations.push(record.composeReturnPathMatches?'guest_compose_purpose_mismatch':'guest_compose_original_return_lost');
              }catch(error){violations.push('guest_write_login_click_failed: '+String(error.message||error).slice(0,160))}
              finally{page.off('framenavigated',observe);page.off('request',observeAuthRequest)}
            }
            // Test the distinct administrator intent without credentials, POST or mutation.
            const manageNavigations=[];
            const onManageNav=frame=>{if(frame===page.mainFrame())manageNavigations.push(frame.url())};
            try{
              await page.goto(target,{waitUntil:'domcontentloaded',timeout:25000});
              page.on('framenavigated',onManageNav);
              await page.locator('#voiceAdminLogin').click({timeout:6000});
              // Include the final location in addition to observed navigation events.
              manageNavigations.push(page.url());
              await pause(2200);
              const expectedManage=root.origin+root.prefix+'/board/voices?manage=1';
              record.manageReturnMatches=manageNavigations.some(url=>{
                try{const u=new URL(url);return u.origin==='https://ekodi.kr'&&u.pathname==='/auth/'&&
                  u.searchParams.get('site')==='seonammedi'&&u.searchParams.get('return_to')===expectedManage}catch{return false}
              });
              if(!record.manageReturnMatches)violations.push('guest_manage_original_return_lost');
            }catch(error){violations.push('guest_manage_login_click_failed: '+String(error.message||error).slice(0,160))}
            finally{page.off('framenavigated',onManageNav)}
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
