// EKODI-owned Chromium, read-only real-service desktop/mobile acceptance.
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base='https://ekodi.kr/ekodipay';
const output='artifacts/ekodipay-native';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
let failed=false;
try{
 for(const device of [
  {name:'desktop',width:1440,height:900,isMobile:false,deviceScaleFactor:1},
  {name:'mobile',width:390,height:844,isMobile:true,deviceScaleFactor:1}
 ]){
  const context=await browser.newContext({viewport:{width:device.width,height:device.height},
    isMobile:device.isMobile,deviceScaleFactor:device.deviceScaleFactor,locale:'ko-KR'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message.slice(0,140)));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text().slice(0,140));});
  const response=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:20000});
  const status=response?.status()||0;
  const title=await page.title();
  const heading=await page.locator('h1').first().textContent().catch(()=>'');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth).catch(()=>10000);
  const links=await page.locator('main a[href]').count();
  await page.screenshot({path:output+'/'+device.name+'.png',fullPage:true,animations:'disabled'});
  // Cloudflare's injected web analytics beacon is intentionally denied by the payment CSP.
  // Preserve the evidence; do not loosen CSP or ignore unrelated browser errors.
  const blockedAnalytics=errors.filter(e=>e.startsWith('Refused to load the script')&&e.includes('static.cloudflareinsights.com/beacon.min.js'));
  const unexpectedErrors=errors.filter(e=>!blockedAnalytics.includes(e));
  const item={device:device.name,status,title,heading,overflow,links,errors,blockedAnalytics,unexpectedErrors,
    ok:status===200&&title.includes('EKODI Pay')&&heading.includes('결제')&&overflow<=2&&links>=3&&unexpectedErrors.length===0};
  if(!item.ok)failed=true;
  results.push(item);
  await context.close();
 }
 const request=await browser.newContext();
 const api=await request.request.get(base+'/api/health',{timeout:20000});
 const json=api.ok()?await api.json():null;
 const denied=await request.request.get(base+'/checkout?service=ekodibiz&orderId=EB-ABCDEF&amount=1',{timeout:20000});
 const nominal=await request.request.get(base+'/checkout?service=ekodibiz&orderId=EB-ABCDEF',{timeout:20000});
 const nominalBody=await nominal.text();
 const mutation=await request.request.post(base+'/checkout',{data:'no-charge',timeout:20000});
 const apiSafe=api.status()===200&&json?.service==='ekodipay'&&
   json?.realMoneyProcessing==='disabled-until-human-approved-pg-activation';
 const paymentsSafe=denied.status()===400&&mutation.status()===405&&
   nominal.status()===200&&nominalBody.includes('결제 완료 증명이 아닙니다');
 results.push({device:'checkout-and-health',health:api.status(),apiSafe,
   amountRejected:denied.status(),postRejected:mutation.status(),nominal:nominal.status(),paymentsSafe});
 if(!apiSafe||!paymentsSafe)failed=true;
 await request.close();
}finally{await browser.close();}
const report={policy:'EKODIPAY-NATIVE-001',origin:base,readOnly:true,realMoneyProcessing:'not-invoked',
  screenshots:['desktop.png','mobile.png'],passed:!failed,results};
await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({policy:report.policy,passed:report.passed,results:report.results}));
if(failed)process.exitCode=1;
