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
    page.off('request',observe);
    await page.setViewportSize({width:1440,height:1000});
  }
}
