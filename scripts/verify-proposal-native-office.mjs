// Dedicated browser-local export proof. No upload, authenticated state, or server writes.
// Distinct from the EKODI default read-only browser worker: explicit one-shot
// blob download acceptance applies only inside an isolated CI Chromium context.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const origin='https://ekodi.kr';
const target=origin+'/proposal/';
const artifactDir=path.resolve('artifacts/proposal-native-production/office');
await fs.mkdir(artifactDir,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true,serviceWorkers:'block'});
const page=await context.newPage();
const badResponses=[],pageErrors=[],blockedMutations=[];
page.on('pageerror',e=>pageErrors.push(String(e.message||e).slice(0,250)));
page.on('response',res=>{if(res.status()>=400)badResponses.push({status:res.status(),path:new URL(res.url()).pathname.slice(0,150)});});
await page.route('**/*',async route=>{
 const request=route.request(),method=request.method().toUpperCase(),url=request.url();
 // Local generated blob links are not network requests and are not routed.
 if(!['GET','HEAD','OPTIONS'].includes(method)){blockedMutations.push(method);return route.abort('blockedbyclient');}
 if(!url.startsWith(origin+'/'))return route.abort('blockedbyclient');
 return route.continue();
});
const saved=[];
try{
 const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:25000});
 assert.equal(response?.status(),200,'Canonical proposal must return 200');
 assert.equal(new URL(page.url()).pathname,'/proposal/');
 await page.locator('#titleInput').fill('EKODI 내부 파일 생성 검증');
 await page.locator('#ideaInput').fill('공개 페이지에서 브라우저 전용 Word, Excel, PowerPoint 출력 검증');
 await page.locator('#generateBtn').click();
 await page.locator('#status').getByText('제안서 목차가 구성됐습니다.',{exact:false}).waitFor({timeout:10000});
 await page.locator('#budgetRows .budget-name').first().fill('샘플 강사료');
 await page.locator('#budgetRows .budget-quantity').first().fill('2');
 await page.locator('#budgetRows .budget-unitcost').first().fill('250000');
 await page.locator('#calculateBudget').click();
 assert.match(await page.locator('#budgetResult').innerText(),/500,000원/);
 for(const [selector,extension] of [['#exportDocx','.docx'],['#exportXlsx','.xlsx'],['#exportPptx','.pptx']]){
  const pending=page.waitForEvent('download',{timeout:15000});
  await page.locator(selector).click();
  const download=await pending;
  const filename=download.suggestedFilename();
  assert.ok(filename.endsWith(extension),'Wrong export extension: '+filename);
  const dest=path.join(artifactDir,'proposal-native'+extension);
  await download.saveAs(dest);
  const stat=await fs.stat(dest);
  assert.ok(stat.size>350,'Empty generated Office file: '+extension);
  saved.push({extension,filename,bytes:stat.size,localFile:path.basename(dest)});
 }
 assert.deepEqual(blockedMutations,[],'No user data may be submitted to production');
 assert.deepEqual(badResponses,[],'All live assets must load');
 assert.deepEqual(pageErrors,[],'No browser JavaScript errors');
 await fs.writeFile(path.join(artifactDir,'receipt.json'),JSON.stringify({
  ok:true,source:'https://ekodi.kr/proposal/',mode:'isolated-ekodi-chromium-sample-only',
  sampleBudgetTotal:500000,files:saved,networkWriteAttempts:0,pageErrors:0,
  officeAppCompatibility:'not-tested'
 },null,2));
 console.log('EKODI_NATIVE_PROPOSAL_OFFICE='+JSON.stringify({ok:true,files:saved}));
}finally{await context.close();await browser.close();}
