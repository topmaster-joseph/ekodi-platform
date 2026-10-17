// Production-only, read-only visual contract for the publicly deployed six-menu photo layout.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const m=arg.match(/^--([^=]+)=(.*)$/);
  return m?[m[1],m[2]]:[arg.replace(/^--/,''),'true'];
}));
const origin=String(args.origin||'').replace(/\/+$/,'');
const sourceMode=args['source-mode']==='true';
const approvedProduction=['https://seonammedi.kr','https://ekodi.kr'];
const approvedLocal='http://127.0.0.1:8765';
if(sourceMode ? origin!==approvedLocal : !approvedProduction.includes(origin)){
  throw Error('read_only_photo_verifier_disallows_unapproved_origin');
}
// The source preview checks only homepage/hash categories. Standalone boards
// must always be inspected against their actual deployed Worker in live mode.
const base=sourceMode||origin==='https://ekodi.kr'?'/seonammedi/':'/';
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
const report={policy:sourceMode?'EKODI-SEONAMMEDI-PHOTO-SOURCE-001':'EKODI-SEONAMMEDI-PHOTO-LIVE-001',
  origin,mode:sourceMode?'source-preview':'production',readOnly:true,profiles:[],failures:[],
  checkedAt:new Date().toISOString(),success:false};
let browser;
function required(ok,reason){if(!ok)throw Error(reason);}
async function inspect(page,where){
  await page.locator('body.seonam-visual-ready main.seonam-visual-layout').waitFor({state:'attached',timeout:4000});
  if(where.endsWith('-home'))await page.locator('body > .campaign-hero .campaign-hero-image').waitFor({state:'visible',timeout:18000});
  const state=await page.evaluate(()=>{
    const sharedHero=document.querySelector('body > .seonam-visual-hero');
    const img=document.querySelector('body > .campaign-hero .campaign-hero-image');
    const nav=document.querySelector('.seonam-visual-side-nav');
    const main=document.querySelector('main.seonam-visual-layout');
    const left=document.querySelector('.seonam-visual-left');
    const center=document.querySelector('.seonam-visual-content');
    const right=document.querySelector('.seonam-visual-right');
    const header=document.querySelector('body > header.site-header');
    return {
      sharedPhotoPresent:!!sharedHero,
      campaignSrc:img?.currentSrc||'',
      campaignNaturalWidth:img?.naturalWidth||0,
      campaignNaturalHeight:img?.naturalHeight||0,
      campaignVisible:Boolean(img?.getBoundingClientRect().height&&getComputedStyle(img).display!=='none'),
      sideLabels:[...nav?.querySelectorAll('a[data-seonam-visual-key]')||[]].map(a=>a.textContent.trim()),
      active:[...nav?.querySelectorAll('[aria-current="page"]')||[]].map(a=>a.dataset.seonamVisualKey),
      headerSticky:getComputedStyle(header).position==='sticky',
      layoutDisplay:getComputedStyle(main).display,
      leftWidth:left?.getBoundingClientRect().width||0,
      centerWidth:center?.getBoundingClientRect().width||0,
      rightWidth:right?.getBoundingClientRect().width||0,
      width:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,
      calendarWidget:!!right?.querySelector('.seonam-calendar-grid'),
      publicLinks:[...document.querySelectorAll('.site-header .ekodi-six-nav a')].map(a=>a.textContent.trim())
    };
  });
  required(!state.sharedPhotoPresent,'unexpected_shared_photo_'+where);
  const isHome=where.endsWith('-home');
  required(state.campaignVisible===isHome,'home_only_campaign_visibility_mismatch_'+where);
  if(isHome){
    required(state.campaignSrc.includes('campaign-reconsideration-20261013.png'),'incorrect_home_campaign_source_'+where);
    required(state.campaignNaturalWidth===1903&&state.campaignNaturalHeight===735,'home_campaign_dimensions_mismatch_'+where);
  }
  required(state.sideLabels.length===0&&state.active.length===0,'duplicate_left_menu_found_'+where);
  required(JSON.stringify(state.publicLinks)===JSON.stringify(labels),'header_six_menu_labels_mismatch_'+where);
  required(state.headerSticky,'site_header_not_sticky_'+where);
  required(state.leftWidth===0&&state.centerWidth>0&&state.rightWidth>0,'content_or_calendar_missing_or_duplicate_menu_'+where);
  required(state.calendarWidget,'live_schedule_calendar_missing_'+where);
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
    const all=[{key:'home',name:'첫 화면',path:''},
      ...checks.filter(item=>!sourceMode||item.path.startsWith('#'))];
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
        entry.campaignNaturalWidth=state.campaignNaturalWidth;
        entry.layoutDisplay=state.layoutDisplay;
        entry.active=state.active;
        entry.scrollWidth=state.scrollWidth;
        entry.viewportWidth=state.width;
        // Header is validated by inspect(); there is intentionally no side-menu selection.
        required(profile.isMobile?state.layoutDisplay==='flex':state.layoutDisplay==='grid','responsive_columns_mismatch_'+item.key);
        const filename=[origin.replace(/^https?:\/\//,'').replace(/[^a-zA-Z0-9.-]/g,'-'),profile.name,item.key].join('-')+'.png';
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
  const reportPath=path.join(output,sourceMode?'source-photo-evidence.json':'production-photo-evidence.json');
  await fs.writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({policy:report.policy,origin:report.origin,success:report.success,
    mode:report.mode,total:report.profiles.reduce((n,p)=>n+p.results.length,0),
    passed:report.profiles.reduce((n,p)=>n+p.results.filter(x=>x.ok).length,0),
    failures:report.failures,reportPath}));
  if(!report.success)process.exitCode=1;
}
