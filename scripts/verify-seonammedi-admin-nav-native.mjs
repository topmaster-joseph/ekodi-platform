// EKODI-owned Chromium: live SeonamMedi admin route / responsive acceptance.
// First-party HTML, CSS, JS are real; only admin data is synthetic and fulfilled
// inside an isolated browser. No real credentials, cookies, writes or personal data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const roots=[
  {label:'canonical',origin:'https://ekodi.kr',prefix:'/seonammedi'},
  {label:'customer',origin:'https://seonammedi.kr',prefix:''}
];
const devices=[
  {label:'320',width:320,height:720},
  {label:'390',width:390,height:844},
  {label:'768',width:768,height:1024},
  {label:'1366',width:1366,height:850},
  {label:'1440',width:1440,height:900}
];
const out=path.resolve('artifacts/seonammedi-admin-nav-native');
await fs.mkdir(out,{recursive:true});
const result={policy:'EKODI-SEONAMMEDI-ADMIN-NAV-NATIVE-001',readOnly:true,syntheticAdmin:true,externalProvider:false,tests:[],failures:[],ok:false};
const expectedPermissions={finance:true,pages:true,voices:false,notices:false,health:false,channels:false,content:false,timeline:false};
const expectedMinutes=[{id:1,title:'검증용 회의록',meetingAt:'2026-11-04T09:00:00.000Z',attendees:'',body:'',status:'shared',viewerCount:0,showViewers:false,shareToken:'sample-only-test-token'}];
const forbiddenMethod=new Set(['POST','PUT','PATCH','DELETE']);
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const root of roots)for(const device of devices){
    const record={root:root.label,viewport:device.label,checks:[],errors:[]};
    result.tests.push(record);
    const context=await browser.newContext({viewport:{width:device.width,height:device.height},acceptDownloads:false,serviceWorkers:'block'});
    const page=await context.newPage();
    let blockedWrites=0;
    try{
      await page.addInitScript(()=>{
        window.__copiedMinuteUrl='';
        Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedMinuteUrl=String(text)}}});
      });
      await page.route('**/*',async route=>{
        const request=route.request();
        const method=request.method().toUpperCase();
        if(forbiddenMethod.has(method)){blockedWrites++;return route.abort('blockedbyclient')}
        let target;
        try{target=new URL(request.url())}catch{return route.abort('blockedbyclient')}
        if(target.origin!==root.origin)return route.abort('blockedbyclient');
        const url=target.pathname;
        if(url==='/api/seonammedi/admin/me'){
          return route.fulfill({status:200,contentType:'application/json',headers:{'cache-control':'no-store'},
            body:JSON.stringify({ok:true,email:'synthetic-test@example.invalid',role:'manager',platform:false,publicStatus:'public',permissions:expectedPermissions})});
        }
        if(url==='/api/seonammedi/admin/minutes'){
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,items:expectedMinutes})});
        }
        if(url.startsWith('/api/seonammedi/admin/')){
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,items:[],item:{data:{}}})});
        }
        return route.continue();
      });
      const entry=root.origin+root.prefix+'/admin/';
      const response=await page.goto(entry+'?panel=finance',{waitUntil:'domcontentloaded',timeout:30000});
      if(!response?.ok())throw Error('admin_html_http_'+String(response?.status()));
      await page.waitForFunction(()=>document.querySelector('[data-panel="finance"]')?.classList.contains('active')&&
        document.getElementById('financeSummary')?.textContent?.includes('내부합계'),{timeout:20000});
      async function assertActive(panel){
        const data=await page.evaluate(()=>{
          const all=[...document.querySelectorAll('.sidebar-menu [data-panel-target]')];
          const current=all.filter(el=>el.classList.contains('active'));
          const panels=[...document.querySelectorAll('.panel-page')].filter(el=>!el.hidden&&el.classList.contains('active'));
          const button=document.querySelector('.panel-page.active .heading>.secondary');
          const rect=button?.getBoundingClientRect();
          return{selected:current.map(el=>el.dataset.panelTarget),aria:current.map(el=>el.getAttribute('aria-current')),
            panels:panels.map(el=>el.dataset.panel),overflow:document.documentElement.scrollWidth>window.innerWidth+1,
            button:button?{width:Math.round(rect.width),height:Math.round(rect.height),nowrap:getComputedStyle(button).whiteSpace,scrollWidth:button.scrollWidth,clientWidth:button.clientWidth}:null};
        });
        if(JSON.stringify(data.selected)!==JSON.stringify([panel])||data.aria[0]!=='page'||JSON.stringify(data.panels)!==JSON.stringify([panel]))
          throw Error('nav_active_state_'+panel);
        if(data.overflow)throw Error('viewport_horizontal_overflow_'+panel);
        if(data.button&&(data.button.width<80||data.button.height>56||data.button.nowrap!=='nowrap'||data.button.scrollWidth>data.button.clientWidth+1))
          throw Error('refresh_button_wrapped_'+panel);
        if(new URL(page.url()).searchParams.get('panel')!==panel)throw Error('panel_url_not_preserved_'+panel);
      }
      await assertActive('finance');record.checks.push('finance_direct_link');
      // Finance is a content-level tab surface. Verify each pane has one active
      // tab and exactly one visible content section, without extra HTTP requests.
      for(const tab of ['summary','ledger','manual','import']){
        await page.locator('[data-finance-tab="'+tab+'"]').click();
        const state=await page.evaluate(()=>{
          const tabs=[...document.querySelectorAll('[data-finance-tab]')];
          const panes=[...document.querySelectorAll('[data-finance-pane]')];
          return {selected:tabs.filter(x=>x.getAttribute('aria-selected')==='true').map(x=>x.dataset.financeTab),
            visible:panes.filter(x=>!x.hidden).map(x=>x.dataset.financePane),
            panel:new URLSearchParams(location.search).get('panel'),
            financeTab:new URLSearchParams(location.search).get('financeTab')||'summary'};
        });
        if(state.selected.length!==1||state.selected[0]!==tab||
          state.visible.length!==1||state.visible[0]!==tab||
          state.panel!=='finance'||state.financeTab!==tab)throw Error('finance_subtab_inconsistent_'+tab);
      }
      await page.locator('[data-finance-tab="summary"]').click();
      record.checks.push('finance_tabs_display_and_route');

      await page.locator('.sidebar-menu [data-panel-target="minutes"]').click();
      await page.waitForFunction(()=>document.querySelector('#minutesList .admin-item'),{timeout:16000});
      await assertActive('minutes');record.checks.push('minutes_click_and_load');
      await page.locator('#minutesList button[data-copy]').first().click();
      const copied=await page.evaluate(()=>window.__copiedMinuteUrl);
      const expectedLink=root.origin+root.prefix+'/minutes/?token=sample-only-test-token';
      if(copied!==expectedLink)throw Error('shared_minute_link_wrong_mount');
      record.checks.push('minutes_share_link_mount');
      await page.reload({waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForFunction(()=>document.querySelector('#minutesList .admin-item')&&document.querySelector('[data-panel="minutes"].active'),{timeout:16000});
      await assertActive('minutes');record.checks.push('minutes_reload');
      await page.locator('.sidebar-menu [data-panel-target="finance"]').click();
      await assertActive('finance');
      await page.goBack({waitUntil:'domcontentloaded',timeout:20000});
      await page.waitForFunction(()=>document.querySelector('[data-panel="minutes"].active'),{timeout:10000});
      await assertActive('minutes');record.checks.push('back_history');
      if(blockedWrites!==0)throw Error('unexpected_admin_mutation');
      record.ok=true;
    }catch(error){
      record.ok=false;
      const reason=String(error?.message||error).replace(/https?:\/\/[^\s]+/g,'[redacted-url]').slice(0,180);
      record.errors.push(reason);result.failures.push(root.label+'/'+device.label+': '+reason);
    }finally{record.blockedWrites=blockedWrites;await context.close()}
  }
}catch(error){result.failures.push('chromium: '+String(error?.message||error).slice(0,150))}
finally{
  await browser?.close().catch(()=>{});
  result.ok=result.failures.length===0;
  result.total=result.tests.length;result.passed=result.tests.filter(x=>x.ok).length;
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:result.ok,total:result.total,passed:result.passed,failures:result.failures}));
  if(!result.ok)process.exitCode=1;
}
