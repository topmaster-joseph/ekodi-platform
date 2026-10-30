#!/usr/bin/env node
// First-party synthetic-only browser acceptance. Runs in protected Education release lanes.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const preview=process.env.EKODI_EDUCATION_PREVIEW_MODE==='true';
const base=process.env.EKODI_EDUCATION_FARM_URL||(preview
 ? 'http://127.0.0.1:8765/study/farm-marketing/'
 : 'https://ekodi.kr/edu/study/farm-marketing/');
if(!base.startsWith('https://')&&!(preview&&base.startsWith('http://127.0.0.1:8765/')))throw Error('Unsafe acceptance target');
const folder=resolve('artifacts/education-farm-marketing-native');
const report={ok:false,base,preview,checks:[]};
let browser;
try{
 await mkdir(folder,{recursive:true});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,768,1366,1440]){
  const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  const target=new URL(base);target.searchParams.set('step','3');
  const response=await page.goto(target.href,{waitUntil:'domcontentloaded',timeout:30000});
  if(response?.status()!==200)throw Error('Workshop HTTP '+response?.status()+' at '+target);
  await page.locator('#lesson h3').waitFor({timeout:12000});
  if(!(await page.title()).includes('농산물'))throw Error('Wrong live workshop page');
  if(!(await page.locator('#stepCount').innerText()).includes('3 / 7'))throw Error('Deep link not honored');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  if(overflow>4)throw Error('Horizontal overflow at '+width+'px: '+overflow);
  if(errors.length)throw Error('Client errors: '+errors.join('; '));
  if(width===390){
   await page.locator('#kind').selectOption('버섯');
   for(const [id,value] of [['product','표고버섯'],['farm','실습농장'],['region','전남 무안'],['feature','직접 수확한 식용 버섯'],['contact','농장으로 문의']])await page.locator('#'+id).fill(value);
   await page.locator('#productForm button[type=submit]').click();
   if(!(await page.locator('#resultText').innerText()).includes('실습농장'))throw Error('Marketing copy missing');
   if(!(await page.locator('#resultPrompt').innerText()).includes('원산지'))throw Error('Safe prompt missing');
   await page.locator('#posterTitle').fill('우리 실습농장 표고버섯');
   await page.locator('#drawPoster').click();
   const poster=await page.locator('#posterCanvas').evaluate(canvas=>({w:canvas.width,h:canvas.height,n:canvas.toDataURL('image/png').length}));
   if(poster.w!==1080||poster.h!==1080||poster.n<1000)throw Error('PNG canvas failed');
   const [download]=await Promise.all([page.waitForEvent('download',{timeout:15000}),page.locator('#savePoster').click()]);
   if(!download.suggestedFilename().endsWith('.png'))throw Error('PNG download missing');
   await page.locator('[data-check="photo"]').check();
   await page.reload({waitUntil:'domcontentloaded'});
   if(!await page.locator('[data-check="photo"]').isChecked())throw Error('Local checklist not persisted');
   if((await page.locator('#farm').inputValue())!=='실습농장')throw Error('Local form not persisted');
   await page.locator('[data-step="7"]').click();
   await page.locator('[data-answer="O"]').click();
   if(!(await page.locator('#quizFeedback').innerText()).trim())throw Error('OX quiz failed');
  }
  await page.screenshot({path:resolve(folder,'viewport-'+width+'.png'),fullPage:true});
  report.checks.push({width,status:response.status(),overflow});
  await context.close();
 }
 report.ok=true;console.log(JSON.stringify(report));
}catch(error){report.error=String(error.stack||error).slice(0,1500);console.error(JSON.stringify(report));process.exitCode=1}
finally{await writeFile(resolve(folder,'result.json'),JSON.stringify(report,null,2));await browser?.close()}
