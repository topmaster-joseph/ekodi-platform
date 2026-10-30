// Read-only interaction contract for the actual served Search Visibility panel.
// The caller provides an isolated synthetic admin session; this test never writes provider data.
import path from 'node:path';

export async function verifySearchVisibilityInteractions(page,artifactsDir,results) {
  const panel=page.locator('#ekodiSearchVisibility');
  const rows=panel.locator('[data-sv-rows] tr');
  const detail=panel.locator('[data-sv-manage-panel]');
  const filter=panel.locator('#sv-category-filter');
  const search=panel.locator('#sv-search');
  const forbiddenWrites=[];
  // All Google results below are deterministic UI-only fixtures. The isolated
  // browser never authenticates to Google or contacts the real provider API.
  const googleReadRequests=[];
  let googleScenario='not_configured';
  const googleRoute=/^https:\\/\\/ekodi\\.kr\\/api\\/control\\/search-visibility\\?googleSiteUrl=/;
  const mockGoogleRead=async route=>{
    const request=route.request(),url=new URL(request.url());
    if(request.method()!=='GET')throw new Error('Google Search Console metrics UI attempted a mutation');
    googleReadRequests.push({siteUrl:url.searchParams.get('googleSiteUrl'),method:request.method()});
    const selected=await panel.locator('#sv-provider-site').inputValue();
    if(url.searchParams.get('googleSiteUrl')!==selected)
      throw new Error('Google Search Console query escaped the selected public site');
    const google=googleScenario==='not_configured'
      ? {state:'not_configured'}
      : googleScenario==='no_rows'
        ? {state:'connected',property:selected,period:{startDate:'2026-09-01',endDate:'2026-09-28'},
          metrics:null,sitemaps:[]}
        : {state:'connected',property:selected,period:{startDate:'2026-09-01',endDate:'2026-09-28'},
          metrics:{clicks:12,impressions:120,ctrPercent:10,avgPosition:4.5},
          sitemaps:[{path:selected.replace(/\\/$/,'')+'/sitemap.xml'}]};
    await route.fulfill({status:200,contentType:'application/json; charset=utf-8',
      body:JSON.stringify({ok:true,google})});
  };
  const observe=request=>{
    try {
      const url=new URL(request.url());
      if(url.origin==='https://ekodi.kr' && url.pathname==='/api/control/search-visibility'
        && !['GET','HEAD','OPTIONS'].includes(request.method()))
        forbiddenWrites.push(request.method()+' '+url.pathname);
    } catch {}
  };
  page.on('request',observe);
  try {
    await page.waitForFunction(()=>{
      const root=document.querySelector('#ekodiSearchVisibility');
      return root && !root.hidden && !root.classList.contains('hidden-panel')
        && root.querySelectorAll('[data-sv-rows] tr button[aria-label$=" 상세 관리"]').length>0;
    },null,{timeout:20000});
    const initial=await rows.count();
    if(initial<2)throw new Error('Search Visibility public inventory has fewer than two sites');
    if(!(await detail.evaluate(el=>el.hidden)))throw new Error('Site detail shown before Manage selection');
    const headers=(await panel.locator('.sv-table').first().locator('th').allTextContents()).map(s=>s.trim());
    if(headers.join('|')!=='번호|분류|사이트|주소|SEO|AEO·GEO|검색등록|관리')
      throw new Error('Search Visibility compact columns drifted: '+headers.join('|'));
    const groups=await filter.locator('option').evaluateAll(items=>items.map(x=>x.value).filter(Boolean));
    if(!groups.length)throw new Error('Search Visibility category filter options missing');
    const group=groups[0];
    await filter.selectOption(group);
    await page.waitForFunction(category=>{
      const items=[...document.querySelectorAll('#ekodiSearchVisibility [data-sv-rows] tr')];
      return items.length>0 && items.every(row=>row.children[1]?.textContent===category);
    },group,{timeout:7000});
    if(await rows.count()>initial)throw new Error('Category filter increased result count');
    const firstName=(await rows.first().locator('.sv-site-name').textContent())?.trim();
    if(!firstName)throw new Error('Filtered site name missing');
    await search.fill(firstName);
    await page.waitForFunction(name=>{
      const items=[...document.querySelectorAll('#ekodiSearchVisibility [data-sv-rows] tr')];
      return items.length>0 && items.every(row=>
        row.querySelector('.sv-site-name')?.textContent?.toLowerCase().includes(name.toLowerCase()));
    },firstName,{timeout:7000});
    const first=rows.first(),url=await first.locator('.sv-site-url a').getAttribute('href');
    if(!url||await first.locator('button').count()!==1)throw new Error('Site row requires one Manage button and a URL');
    const oneLine=await first.locator('td').evaluateAll(items=>
      items.length===8 && items.every(td=>getComputedStyle(td).whiteSpace==='nowrap'));
    if(!oneLine)throw new Error('Site row contains wrapped or missing cells');
    await first.locator('button').click();
    await page.waitForFunction(expected=>{
      const root=document.querySelector('#ekodiSearchVisibility');
      const selected=root?.querySelector('[data-sv-manage-panel]');
      return selected&&!selected.hidden
        && root.querySelector('[data-sv-manage-path]')?.textContent===expected
        && root.querySelectorAll('[data-sv-provider-rows] tr').length>0;
    },new URL(url,page.url()).href,{timeout:7000});
    const title=await panel.locator('[data-sv-manage-name]').textContent();
    if(!title?.includes(firstName)||!title.includes(group))throw new Error('Manage opened another site');
    // Verify the newly released Google Search Console button using only
    // Playwright synthetic read-only responses, never production provider data.
    const googleButton=panel.locator('[data-sv-google-read]');
    await googleButton.waitFor({state:'visible',timeout:7000});
    if((await googleButton.textContent())?.trim()!=='Google 실측 조회')
      throw new Error('Google Search Console operator button missing or mislabeled');
    const siteSelect=panel.locator('#sv-provider-site');
    if(!(await siteSelect.inputValue()))throw new Error('Google Search Console site selection missing');
    await page.route(googleRoute,mockGoogleRead);
    await googleButton.click();
    await panel.locator('[data-sv-google-status]').filter({
      hasText:'Google Search Console 읽기 전용 서비스 계정이 아직 서버에 연결되지 않았습니다.'
    }).waitFor({timeout:7000});
    if((await panel.locator('[data-sv-google-summary]').textContent())?.trim())
      throw new Error('Disconnected Search Console displayed invented metrics');
    googleScenario='connected';
    await googleButton.click();
    await panel.locator('[data-sv-google-summary]').filter({
      hasText:/검색 클릭 12회 · 노출 120회 · CTR 10\\.00% · 평균 순위 4\\.5/
    }).waitFor({timeout:7000});
    if(!(await panel.locator('[data-sv-google-summary]').textContent())?.includes(
      '전체 페이지 색인 완료나 AI 검색 인용을 의미하지 않습니다'
    ))throw new Error('Google metrics disclaimer missing or misleading');
    googleScenario='no_rows';
    await googleButton.click();
    await panel.locator('[data-sv-google-summary]').filter({
      hasText:'현재 기간에 반환된 검색 성과 행이 없어 실측치를 확정할 수 없습니다.'
    }).waitFor({timeout:7000});
    if(googleReadRequests.length!==3||googleReadRequests.some(x=>x.method!=='GET'))
      throw new Error('Unexpected Google Search Console metric request count or method');
    results.push({id:'search-visibility-google-readonly',group:'ai',kind:'synthetic-readonly-ui',
      ok:true,detail:'button and selected-site GET; disconnected, measured and missing-data fixtures; no provider API or writes'});
    await page.screenshot({path:path.join(artifactsDir,'search-visibility-google-ui-synthetic.png'),fullPage:false});
    await page.screenshot({path:path.join(artifactsDir,'search-visibility-desktop.png'),fullPage:false});
    await page.setViewportSize({width:390,height:844});
    const mobile=await panel.evaluate(root=>{
      const bounds=root.getBoundingClientRect(),wrap=root.querySelector('.sv-scroll');
      return {left:bounds.left,right:bounds.right,width:innerWidth,
        scrolls:wrap.scrollWidth>wrap.clientWidth,overflowX:getComputedStyle(wrap).overflowX};
    });
    if(mobile.left < -2 || mobile.right>mobile.width+2 || !mobile.scrolls
       || !['auto','scroll'].includes(mobile.overflowX))
      throw new Error('Search Visibility mobile table overflow contract failed: '+JSON.stringify(mobile));
    await page.screenshot({path:path.join(artifactsDir,'search-visibility-mobile-390.png'),fullPage:false});
    await panel.locator('[data-sv-manage-close]').click();
    if(!(await detail.evaluate(el=>el.hidden)))throw new Error('Manage close failed');
    await search.fill('');
    await filter.selectOption('');
    if(await rows.count()!==initial)throw new Error('Reset failed to restore original inventory');
    if(forbiddenWrites.length)throw new Error('Unexpected search provider mutation: '+forbiddenWrites.join(', '));
    results.push({id:'search-visibility-interactions',group:'ai',kind:'read-only-interaction',ok:true,
      detail:'public registry, category/search filter, eight single-line cells, Manage, mobile scroll, close/reset; no writes'});
    console.log('[PROD-E2E] search-visibility: category/search/Manage/mobile/close/reset passed (read-only)');
  } finally {
    await page.unroute(googleRoute,mockGoogleRead);
    page.off('request',observe);
    await page.setViewportSize({width:1440,height:1000});
  }
}
