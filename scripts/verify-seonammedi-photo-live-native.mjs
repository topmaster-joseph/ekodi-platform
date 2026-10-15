// Production-only, read-only visual contract for the publicly deployed six-menu photo layout.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const m=arg.match(/^--([^=]+)=(.*)$/);
  return m?[m[1],m[2]]:[arg.replace(/^--/,''),'true'];
}));
const origin=String(args.origin||'').replace(/\/+$/,'');
if(!['https://seonammedi.kr','https://ekodi.kr'].includes(origin)){
  throw Error('read_only_photo_verifier_disallows_unapproved_origin');
}
const base=origin.endsWith('ekodi.kr')?'/seonammedi/':'/';
const output=path.resolve(String(args.out||'artifacts/seonammedi-production-photo-proof'));
const labels=['공지','활동이력','관련소식','소통채널','시민의견','조직'];
const checks=[
  {key:'notices',name:'공지',path:'board/notices'},
  {key:'committee',name:'활동이력',path:'#committee-activity'},
  {key:'timeline',name:'관련소식',path:'#timeline'},
  {key:'channels',name:'소통채널',path:'#channels'},
  {key:'voices',name:'시민의견',path:'board/voices'},
  {key:'organization',name:'조직',path:'#organization'}
];
await fs.mkdir(output,{recursive:true});
const report={policy:'EKODI-SEONAMMEDI-PHOTO-LIVE-001',origin,readOnly:true,profiles:[],failures:[],checkedAt:new Date().toISOString(),success:false};
let browser;
function required(ok,reason){if(!ok)throw Error(reason);}
async function inspect(page,where){
  await page.locator('body.seonam-visual-ready main.seonam-visual-layout').waitFor({state:'attached',timeout:4000});
  await page.waitForFunction(()=>{
    const img=document.querySelector('.seonam-visual-hero img.seonam-visual-photo');
    return img?.complete===true;
  },null,{timeout:18000});
  const state=await page.evaluate(()=>{
    const hero=document.querySelector('body > .seonam-visual-hero');
    const img=hero?.querySelector('img.seonam-visual-photo');
    const nav=document.querySelector('.seonam-visual-side-nav');
    const main=document.querySelector('main.seonam-visual-layout');
    const left=document.querySelector('.seonam-visual-left');
    const center=document.querySelector('.seonam-visual-content');
    const right=document.querySelector('.seonam-visual-right');
    const header=document.querySelector('body > header.site-header');
    return {
      heroExists:!!hero,
      photoSrc:img?.currentSrc||'',
      photoNaturalWidth:img?.naturalWidth||0,
      photoNaturalHeight:img?.naturalHeight||0,
      photoVisible:Boolean(img?.getBoundingClientRect().height&&getComputedStyle(img).display!=='none'),
      caption:hero?.querySelector('.seonam-visual-photo-credit')?.textContent||'',
      sideLabels:[...nav?.querySelectorAll('a[data-seonam-visual-key]')||[]].map(a=>a.textContent.trim()),
      active:[...nav?.querySelectorAll('[aria-current="page"]')||[]].map(a=>a.dataset.seonamVisualKey),
      headerSticky:getComputedStyle(header).position==='sticky',
      layoutDisplay:getComputedStyle(main).display,
      leftWidth:left?.getBoundingClientRect().width||0,
      centerWidth:center?.getBoundingClientRect().width||0,
      rightWidth:right?.getBoundingClientRect().width||0,
      width:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,
      noticeWidget:!!right?.querySelector('.seonam-visual-recent-notices'),
      publicLinks:[...document.querySelectorAll('.site-header .ekodi-six-nav a')].map(a=>a.textContent.trim())
    };
  });
  required(state.heroExists,'photo_hero_missing_'+where);
  required(state.photoSrc.startsWith('https://images.unsplash.com/'),'photo_source_missing_'+where);
  required(state.photoNaturalWidth>0&&state.photoNaturalHeight>0,'photo_not_rendered_'+where);
  required(state.photoVisible,'photo_not_visible_'+where);
  required(state.caption.includes('설립 예정 시설 아님'),'photo_reference_disclosure_missing_'+where);
  required(JSON.stringify(state.sideLabels)===JSON.stringify(labels),'six_side_menu_labels_mismatch_'+where);
  required(state.headerSticky,'site_header_not_sticky_'+where);
  required(state.leftWidth>0&&state.centerWidth>0&&state.rightWidth>0,'layout_region_missing_'+where);
  required(state.noticeWidget,'live_notice_panel_missing_'+where);
  required(state.scrollWidth<=state.width+1,'horizontal_overflow_'+where);
  return state;
}
try{
  browser=await chromium.launch({headless:true});
  for(const profile of [
    {name:'pc',width:1440,height:900,isMobile:false},
    {name:'mobile',width:390,height:844,isMobile:true}
  ]){
    const row={profile:profile.name,results:[]};
    report.profiles.push(row);
    const context=await browser.newContext({
      viewport:{width:profile.width,height:profile.height},
      isMobile:profile.isMobile,hasTouch:profile.isMobile,acceptDownloads:false
    });
    await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method().toUpperCase())
      ?route.continue():route.abort('blockedbyclient'));
    // Read-only bootstrap asset response evidence: if the home layout is absent,
    // distinguish HTTP routing, content-type, CSP and JavaScript runtime errors.
    if(profile.name==='pc'){
      const scriptUrl=origin+base+'board/ui/central-category.js';
      try{
        const asset=await context.request.get(scriptUrl,{timeout:12000,failOnStatusCode:false});
        const sample=(await asset.text()).slice(0,160);
        row.assetProbe={status:asset.status(),contentType:asset.headers()['content-type']||'',
          hasCategoryScript:sample.includes('Central category tabs'),sample:sample.replace(/\s+/g,' ').slice(0,80)};
      }catch(err){row.assetProbe={error:String(err?.message||err).slice(0,220)};}
      console.log('SEONAM-PHOTO-ASSET-PROBE '+JSON.stringify({origin,scriptUrl,...row.assetProbe}));
    }
    const all=[{key:'home',name:'첫 화면',path:''},...checks];
    for(const item of all){
      // New tab for every route: hash-only navigations otherwise return a null
      // response and can conceal the actual HTTP result for a subpage.
      const page=await context.newPage();
      const entry={page:item.name,key:item.key,uri:base+item.path,scriptResponses:[],pageErrors:[]};
      page.on('response',response=>{
        if(response.url().includes('board/ui/central-category.js')){
          entry.scriptResponses.push({url:response.url(),status:response.status(),
            contentType:response.headers()['content-type']||''});
        }
      });
      page.on('requestfailed',request=>{
        if(request.url().includes('board/ui/central-category.js'))
          entry.scriptRequestFailure=String(request.failure()?.errorText||'unknown').slice(0,180);
      });
      page.on('pageerror',error=>entry.pageErrors.push(String(error?.message||error).slice(0,280)));
      row.results.push(entry);
      try{
        const url=origin+base+item.path;
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
        entry.status=response?.status()??null;
        required(response?.ok(),'page_http_'+entry.status);
        const state=await inspect(page,profile.name+'-'+item.key);
        entry.photoNaturalWidth=state.photoNaturalWidth;
        entry.layoutDisplay=state.layoutDisplay;
        entry.active=state.active;
        entry.scrollWidth=state.scrollWidth;
        entry.viewportWidth=state.width;
        if(item.key!=='home')required(state.active.includes(item.key),'selected_side_menu_not_active_'+item.key);
        required(profile.isMobile?state.layoutDisplay==='flex':state.layoutDisplay==='grid','responsive_columns_mismatch_'+item.key);
        const filename=[origin.replace(/^https?:\/\//,''),profile.name,item.key].join('-')+'.png';
        await page.screenshot({path:path.join(output,filename),animations:'disabled',fullPage:false});
        entry.image=filename;
        entry.ok=true;
      }catch(error){
        entry.ok=false;
        entry.reason=String(error?.message||error).slice(0,430);
        entry.bootstrap=await page.evaluate(()=>({
          header:!!document.querySelector('body > header.site-header'),
          main:!!document.querySelector('body > main'),
          initialized:document.documentElement.dataset.seonamVisualInitialized||'',
          bodyClass:document.body?.className||'',
          categoryScripts:[...document.querySelectorAll('script[src]')]
            .map(node=>node.src).filter(src=>src.includes('board/ui/central-category.js'))
        })).catch(()=>null);
        report.failures.push(profile.name+'/'+item.key+': '+entry.reason+
          ' scripts='+JSON.stringify(entry.scriptResponses)+
          ' errors='+JSON.stringify(entry.pageErrors)+
          ' bootstrap='+JSON.stringify(entry.bootstrap));
      }finally{
        await page.close().catch(()=>{});
      }
    }
    await context.close();
  }
}catch(error){report.failures.push('chromium: '+String(error?.message||error).slice(0,450));}
finally{
  if(browser)await browser.close().catch(()=>{});
  report.success=report.failures.length===0;
  const reportPath=path.join(output,'production-photo-evidence.json');
  await fs.writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({policy:report.policy,origin:report.origin,success:report.success,
    total:report.profiles.reduce((n,p)=>n+p.results.length,0),
    passed:report.profiles.reduce((n,p)=>n+p.results.filter(x=>x.ok).length,0),
    failures:report.failures,reportPath}));
  if(!report.success)process.exitCode=1;
}
