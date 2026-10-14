import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

// Read-only first-party production proof; execute only after successful protected deployment.
const targets=[
  {name:'customer',base:'https://seonammedi.kr',prefix:''},
  {name:'canonical',base:'https://ekodi.kr',prefix:'/seonammedi'}
];
const routes=['/','/board/voices','/board/notices','/board/finance'];
const devices=[{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}];
const destination=path.resolve(process.env.EKODI_NAV_VISUAL_OUTPUT||'artifacts/seonammedi-dropdown-visual');
await fs.mkdir(destination,{recursive:true});
const report={policy:'SEONAMMEDI-SHARED-SIX-NAV-DROPDOWN-001',owner:'EKODI first-party Chromium',readOnly:true,results:[],errors:[]};
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const target of targets)for(const device of devices){
    const context=await browser.newContext({
      viewport:{width:device.width,height:device.height},
      hasTouch:device.name==='mobile',isMobile:device.name==='mobile'
    });
    const page=await context.newPage();
    await page.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method().toUpperCase())?route.continue():route.abort('blockedbyclient'));
    try{
      for(const route of routes){
        const url=target.base+target.prefix+route;
        const entry={site:target.name,device:device.name,route,url};
        report.results.push(entry);
        try{
          const res=await page.goto(url,{waitUntil:'networkidle',timeout:30000});
          if(!res||res.status()>=400)throw Error('http_'+(res?.status()??0));
          await page.mouse.move(0,0);
          entry.styles=await page.evaluate(()=>{
            const nav=document.querySelector('header.site-header nav.ekodi-six-nav');
            const groups=nav?Array.from(nav.querySelectorAll(':scope > .nav-group')):[];
            return {
              exists:!!nav,
              labels:nav?Array.from(nav.children).map(child=>child.matches('a')?child.textContent.trim():child.querySelector(':scope > a')?.textContent.trim()).filter(Boolean):[],
              dropdowns:groups.map(group=>{
                const button=group.querySelector(':scope > button'),submenu=group.querySelector(':scope > .nav-submenu');
                return {name:group.querySelector(':scope > a')?.textContent.trim(),display:submenu?getComputedStyle(submenu).display:null,background:button?getComputedStyle(button).backgroundColor:null};
              }),
              horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1
            };
          });
          if(!entry.styles.exists)throw Error('missing_six_menu_header');
          if(entry.styles.labels.join('|')!=='활동이력|관련소식|소통채널|시민의견|공지|조직')throw Error('six_menu_labels_mismatch');
          if(entry.styles.dropdowns.length!==4)throw Error('dropdown_group_count_mismatch');
          if(entry.styles.dropdowns.some(group=>group.display!=='none'))throw Error('closed_submenu_visible:'+JSON.stringify(entry.styles.dropdowns));
          if(entry.styles.dropdowns.some(group=>!['transparent','rgba(0, 0, 0, 0)'].includes(group.background)))throw Error('dark_dropdown_toggle:'+JSON.stringify(entry.styles.dropdowns));
          if(entry.styles.horizontalOverflow)throw Error('page_horizontal_overflow');
          const toggle=page.getByRole('button',{name:'공지 세부메뉴 열기'});
          const group=toggle.locator('xpath=..');
          await toggle.click({timeout:5000});
          const open=await group.locator(':scope > .nav-submenu').evaluate(el=>getComputedStyle(el).display!=='none');
          if(!open)throw Error('dropdown_does_not_open');
          entry.openOnActivation=open;
          entry.ok=true;
        }catch(error){
          entry.ok=false;
          entry.error=String(error.message||error).slice(0,600);
          report.errors.push(target.name+'/'+device.name+route+': '+entry.error);
          try{const shot=target.name+'-'+device.name+'-'+route.replace(/\W/g,'-')+'.png';await page.screenshot({path:path.join(destination,shot),fullPage:true,timeout:5000});entry.screenshot=shot}catch{}
        }
      }
    }finally{await context.close()}
  }
}catch(error){report.errors.push('chromium: '+String(error.message||error))}
finally{
  if(browser)await browser.close().catch(()=>{});
  report.passed=report.results.length===16&&report.errors.length===0;
  await fs.writeFile(path.join(destination,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,count:report.results.length,success:report.results.filter(x=>x.ok).length,errors:report.errors}));
  if(!report.passed)process.exitCode=1;
}
