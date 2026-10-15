import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const profile=process.argv[2]||'desktop';
assert.ok(['desktop','mobile-portrait'].includes(profile));
const viewport=profile==='desktop'?{width:1440,height:900}:{width:390,height:844};
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport,locale:'ko-KR',isMobile:profile==='mobile-portrait',hasTouch:profile==='mobile-portrait'});
const page=await context.newPage();
const errors=[],blockedMutations=[],requestFailures=[];
page.on('pageerror',e=>errors.push(String(e.message).slice(0,250)));
page.on('requestfailed',r=>requestFailures.push({url:r.url().slice(0,260),reason:r.failure()?.errorText}));
await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['GET','HEAD'].includes(request.method())){
    blockedMutations.push({method:request.method(),url:url.pathname});
    await route.abort('blockedbyclient');return;
  }
  await route.continue();
});
const output={device:profile,origin:'https://ekodi.kr',checkedAt:new Date().toISOString(),blockedMutations,requestFailures,pageErrors:errors};
try{
  const response=await page.goto('https://ekodi.kr/ai/#support-programs',{waitUntil:'domcontentloaded',timeout:25000});
  assert.equal(response.status(),200);
  await page.locator('#support-programs').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{
    const t=document.querySelector('#supportStatus')?.textContent||'';
    return /건 중.*건 표시|연결을 확인하지 못했습니다/.test(t);
  },null,{timeout:35000});
  output.feedStatus=await page.locator('#supportStatus').innerText();
  output.renderedNotices=await page.locator('#supportNotices .support-notice').count();
  output.feedConnected=!output.feedStatus.includes('연결을 확인하지 못했습니다');
  assert.equal(output.feedConnected,true,'official grant feed did not load; cannot verify detailed flow');
  assert.ok((await page.locator('#supportNotices').innerText()).length>0);
  if(output.renderedNotices>0){
    const available=page.locator('#supportNotices .support-notice-detail:not([disabled])');
    output.detailEligibleNotices=await available.count();
    assert.ok(output.detailEligibleNotices>0,'feed notices exist but none have usable official HTTPS URLs');
    await available.first().click();
    await page.locator('#support-detail').waitFor({state:'visible',timeout:12000});
    await page.locator('#assistancePlanList .assistance-plan').first().waitFor({state:'visible',timeout:20000});
    output.planCount=await page.locator('#assistancePlanList .assistance-plan').count();
    assert.equal(output.planCount,6);
    const noticeTitle=await page.locator('#supportDetailBody h4').innerText();
    assert.ok(noticeTitle.length>2);
    output.noticeTitle=noticeTitle.slice(0,100);
    await page.locator('#assistancePlanList input[value="information"]').check();
    output.priceSummary=await page.locator('#assistancePriceSummary').innerText();
    output.contractDraft=await page.locator('#assistanceContractText').innerText();
    assert.match(output.contractDraft,/계약 검토용 초안/);
    assert.match(output.priceSummary,/₩0|0원|최종 계약/);
    assert.ok(!(await page.locator('#support-detail').getAttribute('hidden')));
    await page.screenshot({path:'artifacts/ai-support-detail-'+profile+'.png',fullPage:true});
    output.detailFlowChecked=true;
  }else{
    output.detailFlowChecked=false;
    output.reason='공식 지원사업 목록에 표시할 AI 공고가 0건이어서 상세 클릭 검증 불가';
    await page.screenshot({path:'artifacts/ai-support-empty-'+profile+'.png',fullPage:true});
  }
  assert.equal(errors.length,0,'page JS errors');
  output.ok=true;
  console.log(JSON.stringify(output));
}finally{
  await fs.mkdir('artifacts',{recursive:true});
  await fs.writeFile('artifacts/ai-support-detail-'+profile+'.json',JSON.stringify(output,null,2));
  await context.close();await browser.close();
}
