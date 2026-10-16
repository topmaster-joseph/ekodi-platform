import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// EKODI-owned, read-only, isolated Chromium evidence for issue #4759.
// No production mutation, credential import, user browser, or third-party browser service.
const args=Object.fromEntries(process.argv.slice(2).map(x=>{
  const i=x.indexOf('=');
  return i<0?[x.replace(/^--/,''),'true']:[x.slice(2,i).replace(/^--/,''),x.slice(i+1)];
}));
const origin=String(args.origin||'https://seonammedi.kr').replace(/\/+$/,'');
const paths=Object.freeze({
  'https://seonammedi.kr':{board:'/board/notices',home:'/'},
  'https://ekodi.kr':{board:'/seonammedi/board/notices',home:'/seonammedi/'}
});
if(!Object.hasOwn(paths,origin))throw new Error('Unapproved EKODI origin');
const out=path.resolve(String(args.out||'artifacts/seonammedi-notices-native'));
await fs.mkdir(out,{recursive:true});
const profiles=[{name:'desktop',width:1440,height:900,mobile:false},{name:'mobile',width:390,height:844,mobile:true}];
const expectedNav=['공지','활동이력','관련소식','소통채널','시민의견','조직'];
const result={policy:'EKODI-SEONAM-NOTICES-NATIVE-001',issue:4759,origin,headlessChromium:true,readOnly:true,deviceProfileSource:'EKODI first-party GitHub Actions runner',time:new Date().toISOString(),runs:[],success:false};
const requireThat=(yes,message)=>{if(!yes)throw new Error(message)};
const safe=origin.replace(/^https?:\/\//,'').replace(/[^a-z0-9.-]+/gi,'_');
let browser;
try{
  browser=await chromium.launch({headless:true});
  for(const p of profiles){
    const entry={name:p.name,viewport:p.width+'x'+p.height,ok:false};
    result.runs.push(entry);
    const context=await browser.newContext({viewport:{width:p.width,height:p.height},isMobile:p.mobile,hasTouch:p.mobile,acceptDownloads:false,serviceWorkers:'block'});
    const page=await context.newPage();
    const jsErrors=[];
    page.on('pageerror',error=>jsErrors.push(String(error.message||error).slice(0,300)));
    let authNavigation='';
    await context.route('**/*',route=>{
      const req=route.request(),url=req.url();
      if(url.startsWith('https://ekodi.kr/auth/')){
        authNavigation=url;
        return route.abort('blockedbyclient');
      }
      return ['GET','HEAD','OPTIONS'].includes(req.method().toUpperCase())
        ?route.continue():route.abort('blockedbyclient');
    });
    try{
      const boardUrl=origin+paths[origin].board;
      const response=await page.goto(boardUrl,{waitUntil:'domcontentloaded',timeout:45000});
      entry.http=response?.status()||0;
      requireThat(response?.ok(),'notice_http_'+entry.http);
      await page.locator('body.board-notices').waitFor({state:'attached',timeout:15000});
      await page.waitForFunction(()=>{
        const list=document.querySelector('#list');
        return !!list&&(list.querySelector('.board-row')||list.textContent?.includes('등록된 공지가 없습니다'));
      },null,{timeout:20000});
      const initial=await page.evaluate(()=>{
        const nav=[...document.querySelectorAll('.site-header nav > a')].map(a=>a.textContent.trim());
        const rows=[...document.querySelectorAll('#list .board-row')];
        const images=[...document.querySelectorAll('#list .notice-images img')].map(img=>({
          loaded:img.complete&&img.naturalWidth>0,src:img.currentSrc,
          original:img.closest('a')?.href||'',
          target:img.closest('a')?.target||'',
          rel:img.closest('a')?.rel||''
        }));
        const body=document.querySelector('main')?.getBoundingClientRect();
        const compose=document.querySelector('#writeToggle');
        const labelLines=[...(compose?.querySelectorAll('span')||[])];
        const composeRect=compose?.getBoundingClientRect();
        const composeVisible=compose&&getComputedStyle(compose).display!=='none';
        const adminActionsVisible=[...document.querySelectorAll('#list [data-edit],#list [data-delete]')].some(el=>getComputedStyle(el).display!=='none');
        return {
          navigation:nav,postCount:rows.length,detailCount:document.querySelectorAll('#list details.notice-record').length,expandedCount:document.querySelectorAll('#list details.notice-record[open]').length,imageCount:images.length,images,
          shareCount:document.querySelectorAll('#list button[data-share]').length,
          composeText:compose?.getAttribute('aria-label')||'',composeVisible:Boolean(composeVisible),
          composeLines:labelLines.map(span=>span.textContent.trim()),
          composeLineOffsets:labelLines.map(span=>Math.round(span.getBoundingClientRect().top-(composeRect?.top||0))),
          adminActionsVisible,
          hasSearch:!!document.querySelector('input#noticeSearch'),
          duplicateLoginVisible:[...document.querySelectorAll('#adminLogin')].some(x=>getComputedStyle(x).display!=='none'),
          mainWidth:body?.width||0,
          headerNavFontSize:getComputedStyle(document.querySelector('.site-header nav > a')).fontSize,
          horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2
        };
      });
      entry.navigation=initial.navigation;
      entry.postCount=initial.postCount;
      entry.imageCount=initial.imageCount;
      entry.imageLoaded=initial.images.filter(x=>x.loaded).length;
      entry.horizontalOverflow=initial.horizontalOverflow;
      entry.mainWidth=Math.round(initial.mainWidth);
      entry.noticeFontSize=initial.headerNavFontSize;
      requireThat(JSON.stringify(initial.navigation)===JSON.stringify(expectedNav),'six_menu_order_mismatch');
      requireThat(initial.postCount>0,'no_public_notices_loaded');
      entry.noticeUiVersion=initial.detailCount===initial.postCount?'collapsed-list':'legacy-expanded';
      requireThat(initial.detailCount===0||(initial.detailCount===initial.postCount&&initial.expandedCount===0),'notices_list_mixed_or_open_by_default');
      requireThat(initial.hasSearch,'notice_search_missing');
      entry.composeText=initial.composeText;
      entry.composeLines=initial.composeLines;
      entry.composeTwoRows=initial.composeLineOffsets.length===2&&initial.composeLineOffsets[1]>initial.composeLineOffsets[0]+6;
      requireThat(initial.composeVisible&&initial.composeText==='공지 작성','notice_compose_button_inaccessible');
      requireThat(JSON.stringify(initial.composeLines)===JSON.stringify(['공지','작성'])&&entry.composeTwoRows,'notice_compose_button_not_two_lines');
      requireThat(!initial.adminActionsVisible,'signed_out_notice_admin_actions_visible');
      const adminResponse=await page.request.get(origin+paths[origin].board.replace('/notices','/api/admin/notices'),{timeout:15000});
      const adminPayload=await adminResponse.json().catch(()=>({}));
      entry.unauthenticatedAdminDenied=adminResponse.status()===403&&adminPayload.error==='notices_forbidden';
      requireThat(entry.unauthenticatedAdminDenied,'signed_out_notice_admin_api_not_denied');
      requireThat(initial.shareCount===initial.postCount,'share_control_missing');
      requireThat(!initial.duplicateLoginVisible,'redundant_login_visible');
      requireThat(!initial.horizontalOverflow,'horizontal_overflow');
      requireThat(initial.mainWidth>p.width*.65,'content_width_too_narrow');
      requireThat(initial.imageCount>0,'notice_images_missing');
      if(entry.noticeUiVersion==='collapsed-list')await page.evaluate(()=>{document.querySelectorAll('#list details.notice-record').forEach(el=>el.open=true);document.querySelectorAll('#list .notice-images img').forEach(img=>img.loading='eager')});
      // The site's inner-page image policy hides media; lazy images may never load.
      // Validate safe original links without requiring hidden images to download.
      const afterImages=await page.evaluate(()=>[...document.querySelectorAll('#list .notice-images img')].map(img=>({
        loaded:img.naturalWidth>0,
        imageSrc:img.currentSrc||img.getAttribute('src')||'',original:img.closest('a')?.href||'',
        target:img.closest('a')?.target||'',rel:img.closest('a')?.rel||''
      })));
      entry.imageLoaded=afterImages.filter(i=>i.loaded).length;
      entry.imagesDeferredByPagePolicy=afterImages.filter(i=>!i.loaded).length;
      requireThat(afterImages.every(i=>i.target==='_blank'&&i.rel.includes('noopener')&&i.rel.includes('noreferrer')),'image_original_link_policy');
      requireThat(afterImages.every(i=>i.imageSrc&&i.original&&new URL(i.original).protocol==='https:'),'image_original_link_broken');
      if(entry.noticeUiVersion==='collapsed-list')await page.evaluate(()=>document.querySelectorAll('#list details.notice-record').forEach(el=>el.open=false));

      // Compare first-party site header with standalone board header.
      const home=await context.newPage();
      try{
        const h=await home.goto(origin+paths[origin].home,{waitUntil:'domcontentloaded',timeout:45000});
        requireThat(h?.ok(),'homepage_http_failure');
        const homeHeader=await home.evaluate(()=>{
          const a=[...document.querySelectorAll('.site-header nav > a')];
          return {names:a.map(x=>x.textContent.trim()),fontSize:a[0]?getComputedStyle(a[0]).fontSize:''};
        });
        entry.siteHeader=homeHeader.names;
        entry.siteNavFontSize=homeHeader.fontSize;
        requireThat(JSON.stringify(homeHeader.names)===JSON.stringify(expectedNav),'homepage_header_menu_mismatch');
        requireThat(Math.abs(parseFloat(homeHeader.fontSize)-parseFloat(initial.headerNavFontSize))<=1,'site_board_nav_font_mismatch');
      }finally{await home.close()}

      // User search interaction: a guaranteed nonmatching term must empty results.
      await page.locator('#noticeSearch').fill('EKODI_NATIVE_SEARCH_NONMATCH_4759');
      await page.waitForFunction(()=>document.querySelectorAll('#list .board-row').length===0);
      entry.searchNoMatch=await page.locator('#list .empty').count()===1;
      requireThat(entry.searchNoMatch,'search_nonmatch_did_not_empty');
      await page.locator('#noticeSearch').fill('');
      await page.waitForFunction(count=>document.querySelectorAll('#list .board-row').length===count,initial.postCount);
      entry.searchReset=true;
      const shot=path.join(out,safe+'-'+p.name+'.png');
      await page.screenshot({path:shot,fullPage:true,animations:'disabled'});
      entry.screenshot=path.basename(shot);
      if(entry.noticeUiVersion==='collapsed-list'){
        const firstId=(await page.locator('#list details.notice-record').first().getAttribute('id')||'').replace(/^notice-/, '');
        await page.goto(boardUrl+'?id='+encodeURIComponent(firstId),{waitUntil:'domcontentloaded',timeout:45000});
        await page.waitForFunction(id=>document.querySelector('#notice-'+id)?.open===true,firstId,{timeout:20000});
        entry.sharedDetailOpened=await page.locator('#notice-'+firstId+' .row-body').isVisible();
        requireThat(entry.sharedDetailOpened,'notice_deeplink_did_not_open_detail');
      }

      // Probe only the login redirect; abort before auth server loads.
      const loginReq=page.waitForRequest(req=>req.url().startsWith('https://ekodi.kr/auth/'),{timeout:12000});
      await page.locator('#writeToggle').click({noWaitAfter:true});
      const request=await loginReq;
      authNavigation=request.url();
      const auth=new URL(authNavigation);
      entry.authReturnHost=auth.searchParams.get('return_to')?new URL(auth.searchParams.get('return_to')).origin:'';
      entry.authSite=auth.searchParams.get('site');
      entry.authCompose=auth.searchParams.get('return_to')?.includes('compose=1')||false;
      requireThat(auth.origin==='https://ekodi.kr'&&auth.pathname.startsWith('/auth/'),'auth_redirect_origin');
      requireThat(entry.authReturnHost===origin&&entry.authCompose&&entry.authSite==='seonammedi','auth_compose_return_mismatch');
      entry.javascriptErrors=jsErrors.slice(0,6);
      requireThat(jsErrors.length===0,'page_javascript_error');
      entry.ok=true;
    }catch(error){
      entry.reason=String(error?.message||error).slice(0,600);
      entry.javascriptErrors=jsErrors.slice(0,6);
      const failShot=path.join(out,safe+'-'+p.name+'-failed.png');
      try{await page.screenshot({path:failShot,fullPage:true,timeout:5000});entry.screenshot=path.basename(failShot)}catch{}
    }finally{await context.close()}
  }
}catch(error){result.launchError=String(error?.message||error).slice(0,700)}
finally{
  await browser?.close().catch(()=>{});
  result.success=result.runs.length===profiles.length&&result.runs.every(x=>x.ok);
  await fs.writeFile(path.join(out,safe+'-evidence.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  if(!result.success)process.exitCode=1;
}
