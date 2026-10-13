import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const ARG=Object.fromEntries(process.argv.slice(2).map(s=>{
  const split=s.indexOf('=');
  return split<0?[s.replace(/^--/,''),true]:[s.slice(2,split),s.slice(split+1)];
}));
const origin=String(ARG.origin||'https://ekodi.kr').replace(/\/+$/,'');
const allowed=new Set(['https://ekodi.kr','https://seonammedi.kr','http://127.0.0.1:8765','http://localhost:8765']);
if(!allowed.has(origin))throw new Error('Origin is not approved for read-only EKODI hero verification');
const rootPath=origin==='https://seonammedi.kr'?'/':'/seonammedi/';
const assetPath='/seonammedi/assets/campaign-reconsideration-20261013.png';
const expectedSha='3d30b3faa1db1eeb075a4af8b25887000204ebb26c92f6640c5d70be7205c324';
const screenshotsPath=path.resolve(String(ARG.out||'artifacts/seonammedi-native-hero'));
await fs.mkdir(screenshotsPath,{recursive:true});
const report={
  policy:'EKODI-SEONAMMEDI-NATIVE-HERO-001',
  browser:'ekodi-owned-playwright-chromium',
  readOnly:true,
  origin,
  expectedSha,
  checkedAt:new Date().toISOString(),
  results:[],
  failures:[],
  success:false
};
const profiles=[
  {name:'desktop',width:1440,height:900,isMobile:false},
  {name:'mobile',width:390,height:844,isMobile:true},
];
const must=(condition,reason)=>{if(!condition)throw new Error(reason)};
const safeName=origin.replace(/^https?:\/\//,'').replace(/[^a-z0-9.-]+/gi,'_');
let browser;
try {
  browser=await chromium.launch({headless:true});
  for(const profile of profiles){
    const entry={profile:profile.name,viewport:profile.width+'x'+profile.height};
    report.results.push(entry);
    const context=await browser.newContext({
      viewport:{width:profile.width,height:profile.height},
      isMobile:profile.isMobile,
      hasTouch:profile.isMobile,
      acceptDownloads:false
    });
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',err=>errors.push(String(err?.message||err).slice(0,300)));
    await page.route('**/*',route=>{
      return ['GET','HEAD','OPTIONS'].includes(route.request().method().toUpperCase())
        ?route.continue():route.abort('blockedbyclient');
    });
    try{
      const response=await page.goto(origin+rootPath,{waitUntil:'domcontentloaded',timeout:30000});
      entry.httpStatus=response?.status()??null;
      must(response?.ok(),'page_not_http_2xx_'+entry.httpStatus);
      await page.locator('.campaign-hero-image').waitFor({state:'visible',timeout:12000});
      const assetCheck=await page.request.get(origin+assetPath,{timeout:25000,failOnStatusCode:false});
      entry.assetStatus=assetCheck.status();
      must(assetCheck.ok(),'hero_asset_http_'+entry.assetStatus);
      const assetBody=await assetCheck.body();
      entry.assetBytes=assetBody.length;
      entry.assetSha256=crypto.createHash('sha256').update(assetBody).digest('hex');
      must(entry.assetSha256===expectedSha,'hero_asset_bytes_differ_from_submitted_file');
      await page.waitForFunction(()=>{
        const img=document.querySelector('.campaign-hero-image');
        return img?.complete===true;
      },null,{timeout:15000});
      const evidence=await page.evaluate(()=>{
        const img=document.querySelector('.campaign-hero-image');
        const rect=img?.getBoundingClientRect();
        return {
          imageSrc:img?.currentSrc,
          naturalWidth:img?.naturalWidth,
          naturalHeight:img?.naturalHeight,
          alt:img?.getAttribute('alt')||'',
          displayedWidth:rect?.width||0,
          displayedHeight:rect?.height||0,
          heroDisplay:img?getComputedStyle(img).display:'',
          horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
          viewportWidth:document.documentElement.clientWidth,
          siteHeader:!!document.querySelector('.site-header nav'),
          latestUpdates:!!document.querySelector('#homeLatestUpdates'),
          spotlight:!!document.querySelector('#homeSpotlight'),
          mobileHint:!!document.querySelector('.campaign-hero-mobile-hint'),
          brand:document.querySelector('.brand')?.textContent?.trim().slice(0,100),
          leadingVisibleText:(document.body?.innerText||'').slice(0,140),
          leadingEscapedNewlines:/^(?:\s|\\\\[nrt])+\\\\[nrt]/.test((document.body?.innerText||'').slice(0,140).trimStart())
        };
      });
      Object.assign(entry,evidence);
      // The preserved customer-domain gateway strips the internal /seonammedi mount
      // from browser-visible image URLs. Accept that documented alias, never other assets.
      const expectedBrowserPath=origin==='https://seonammedi.kr'
        ?new Set([assetPath,assetPath.replace(/^\/seonammedi/,'')])
        :new Set([assetPath]);
      must(expectedBrowserPath.has(new URL(entry.imageSrc).pathname),'hero_asset_path_changed');
      must(entry.naturalWidth===1903&&entry.naturalHeight===735,'hero_source_dimensions_mismatch_or_not_loaded');
      must(entry.alt.includes('국립의대'),'hero_accessibility_alt_missing');
      must(entry.heroDisplay==='block','hero_style_missing');
      must(Math.abs(entry.displayedWidth/entry.displayedHeight-1903/735)<0.015,'hero_image_is_cropped_or_distorted');
      must(entry.displayedWidth>=profile.width*0.90,'hero_not_prominent');
      must(!entry.horizontalOverflow,'viewport_horizontal_overflow');
      must(entry.siteHeader&&entry.latestUpdates&&entry.spotlight,'homepage_functionality_missing');
      must(!entry.leadingEscapedNewlines,'literal_escaped_newlines_visible_before_header');
      must(entry.mobileHint,'mobile_magnification_instruction_missing');
      const shot=path.join(screenshotsPath,safeName+'-'+profile.name+'.png');
      await page.screenshot({path:shot,fullPage:true,animations:'disabled'});
      entry.screenshot=path.basename(shot);
      entry.pageErrors=errors.slice(0,8);
      entry.ok=true;
    }catch(error){
      entry.ok=false;
      entry.reason=String(error?.message||error).slice(0,500);
      entry.pageErrors=errors.slice(0,8);
      report.failures.push(profile.name+': '+entry.reason);
      const shot=path.join(screenshotsPath,safeName+'-'+profile.name+'-failed.png');
      try{await page.screenshot({path:shot,fullPage:true,timeout:5000});entry.screenshot=path.basename(shot)}catch{}
    }finally{await context.close();}
  }
}catch(error){report.failures.push('browser: '+String(error?.message||error).slice(0,500))}
finally{
  if(browser)await browser.close().catch(()=>{});
  report.success=report.failures.length===0;
  await fs.writeFile(path.join(screenshotsPath,safeName+'-evidence.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if(!report.success)process.exitCode=1;
}
