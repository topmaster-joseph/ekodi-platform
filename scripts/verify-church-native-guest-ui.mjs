import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const ORIGIN='https://ekodi.kr';
const HOME=ORIGIN+'/ekodichurch/';
const artifactDir='artifacts/church-native-browser';
const report={runner:'EKODI-owned isolated Chromium',mode:'unauthenticated read-only',
  startedAt:new Date().toISOString(),checks:[],pageErrors:[],status:'pending'};
const browser=await chromium.launch({headless:true});
try {
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]) {
    const context=await browser.newContext({viewport,serviceWorkers:'block',acceptDownloads:false});
    const page=await context.newPage();
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(String(error?.message||error).slice(0,200)));
    await page.route('**/*',async route=>{
      if(!['GET','HEAD','OPTIONS'].includes(route.request().method()))return route.abort('blockedbyclient');
      return route.continue();
    });
    try {
      const res=await page.goto(HOME,{waitUntil:'domcontentloaded',timeout:30000});
      if(res?.status()!==200)throw new Error('Church public home status '+res?.status());
      const link=page.locator('[data-church-worship-admin]');
      await link.waitFor({state:'attached',timeout:12000});
      if(!(await link.isHidden()))throw new Error('Privileged worship control exposed to guest');
      const dest=await link.getAttribute('href');
      if(dest!=='/ekodichurch/admin/worship')throw new Error('Unexpected admin destination');
      if(pageErrors.length)throw new Error('Public page JavaScript error '+pageErrors[0]);
      report.checks.push({viewport,homeStatus:res.status(),guestManagerHidden:true,managementDestinationValid:true,pageErrors:0});
      console.log('EKODI_CHURCH_PUBLIC_GUEST_UI '+JSON.stringify(report.checks.at(-1)));
    } finally {
      report.pageErrors.push(...pageErrors);
      await context.close();
    }
  }
  report.status='success';
} finally {
  await browser.close();
  await fs.mkdir(artifactDir,{recursive:true});
  await fs.writeFile(artifactDir+'/guest-ui-proof.json',JSON.stringify(report,null,2)+'\n');
}
if(report.status!=='success')throw new Error('EKODI Church native browser acceptance did not complete');
