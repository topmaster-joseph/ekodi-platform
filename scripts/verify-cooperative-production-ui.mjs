// EKODI first-party Chromium verification. Read-only against the real hostname;
// this does not authenticate people, create access grants, or submit any forms.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { normalizeTask } from './ekodi-background-browser-worker.mjs';
import { COOPERATIVES } from '../cooperative-registry.js';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const artifacts=path.resolve('artifacts/cooperative-production-ui');
await fs.mkdir(artifacts,{recursive:true});
const checks=[],pageErrors=[],consoleErrors=[],resourceFailures=[];
let activePage=null,activeUrl='';
const browser=await chromium.launch({headless:true});
try{
  for(const width of [1440,390]){
    const task=normalizeTask({path:'/',deviceProfile:width<500?'mobile-portrait':'desktop',allowMutation:false});
    assert.equal(task.allowMutation,false);
    const context=await browser.newContext({viewport:{width,height:950},isMobile:width<500,hasTouch:width<500});
    const page=await context.newPage();
    activePage=page;
    page.on('pageerror',error=>pageErrors.push(error.message));
    page.on('console',message=>{if(message.type()==='error'&&consoleErrors.length<30)consoleErrors.push(message.text().slice(0,600));});
    page.on('response',response=>{if(response.status()>=400&&resourceFailures.length<30){const url=new URL(response.url());resourceFailures.push({url:url.origin+url.pathname,status:response.status()});}});
    for(const coop of COOPERATIVES){
      const root='https://ekodi.kr/'+coop.slug;
      const canonical=await context.request.get(root,{maxRedirects:0});
      assert.equal(canonical.status(),308);assert.equal(canonical.headers().location,root+'/');
      const data=await context.request.get(root+'/api/public');
      assert.equal(data.status(),200);const body=await data.json();
      assert.equal(body.source,'server');assert.equal(body.workspaceId,coop.workspaceId);assert.equal(body.name,coop.name);
      for(const surface of ['public','members','admin']){
        const url=root+(surface==='public'?'/':'/'+surface);
        activeUrl=url;
        const response=await page.goto(url,{waitUntil:'networkidle',timeout:45000});
        assert.equal(response.status(),200);assert.equal(new URL(page.url()).hostname,'ekodi.kr');
        if(surface==='public'){
          await page.waitForFunction(name=>document.querySelector('#publicName')?.textContent===name,coop.name);
        }else{
          await page.waitForSelector('#gate:not([hidden])');assert.equal(await page.locator('#workspace').isVisible(),false);
          const login=new URL(await page.locator('#loginLink').getAttribute('href'));
          assert.equal(login.origin,'https://ekodi.kr');assert.equal(login.pathname,'/auth/');assert.equal(login.searchParams.get('return_to'),url);
        }
        assert.ok((await page.locator('.brand').innerText()).includes(coop.name));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
        await page.screenshot({path:path.join(artifacts,coop.slug+'-'+surface+'-'+width+'.png'),fullPage:true});
        checks.push({url,surface,width,passed:true});
      }
    }
    for(const suffix of ['','admin/']){
      const url='https://ekodi.kr/business-coop/'+suffix;
      activeUrl=url;
      const response=await page.goto(url,{waitUntil:'networkidle',timeout:45000});assert.equal(response.status(),200);
      await page.waitForSelector('#gate:not([hidden])');assert.equal(await page.locator('#workspace').isVisible(),false);
      assert.ok((await page.locator('h1').innerText()).includes('협동조합 운영관리자 공간'));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
      checks.push({url,surface:'operations-guest',width,passed:true});
    }
    await context.close();
  }
  assert.deepEqual(pageErrors,[]);
  const result={ok:true,hostname:'ekodi.kr',engine:'EKODI Chromium browser task policy',evidenceScope:'production-public-and-guest',publicAndGuestVerified:true,authenticatedWritesVerified:false,mutationsPerformed:0,checkedAt:new Date().toISOString(),checks,pageErrors};
  await fs.writeFile(path.join(artifacts,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({ok:true,evidenceScope:result.evidenceScope,checks:checks.length,authenticatedWritesVerified:false}));
}catch(error){
  const failure={ok:false,evidenceScope:'production-public-and-guest',activeUrl,mutationsPerformed:0,error:String(error.message||error),pageErrors,consoleErrors,resourceFailures,completedChecks:checks};
  await fs.writeFile(path.join(artifacts,'failure.json'),JSON.stringify(failure,null,2));
  if(activePage&&!activePage.isClosed())await activePage.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true}).catch(()=>{});
  console.error(JSON.stringify(failure));throw error;
}finally{await browser.close();}
