import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const fixture=new URL('../',import.meta.url);
const fake='https://live.ekodi.test/ekodichurch/live/';
const files=new Map([
 ['/ekodichurch/live/','live/index.html'],
 ['/ekodichurch/live/live.css','live/live.css'],
 ['/ekodichurch/live/worship-materials.css','live/worship-materials.css'],
 ['/ekodichurch/live/worship-materials.js','live/worship-materials.js'],
 ['/ekodichurch/worship/2026-10-11/materials.json','worship/2026-10-11/materials.json'],
 ['/ekodichurch/worship/2026-10-18/materials.json','worship/2026-10-18/materials.json'],
 ['/ekodichurch/worship/weekly.json','worship/weekly.json'],
 ['/ekodichurch/live/live.js',null],
 ['/ekodichurch/live/host-intent.js',null],
]);
test('viewer chooses synchronized-area layouts without changing broadcaster track composition',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1366,height:900}});
 await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='live.ekodi.test')return route.abort();
   const file=files.get(url.pathname);
   if(file===undefined)return route.fulfill({status:404,body:'not found'});
   const contentType=url.pathname.endsWith('.json')?'application/json':url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':'text/html';
   await route.fulfill({status:200,contentType,body:file?await readFile(new URL(file,fixture),'utf8'):''});
 });
 const page=await context.newPage();
 await page.goto(fake+'?date=2026-10-11');
 await expect(page.locator('#viewerMaterialStatus')).toContainText('PPT 16장');
 await page.locator('#viewerView').evaluate(el=>el.classList.remove('hidden'));
 await expect(page.locator('#viewerWorshipSlides')).toHaveClass(/hidden/);
 await page.locator('[data-viewer-material-mode=all]').click();
 await expect(page.locator('#viewerContentLayout')).toHaveAttribute('data-material-layout','all');
 await expect(page.locator('#viewerVideoStage')).not.toHaveClass(/hidden/);
 await expect(page.locator('#viewerWorshipSlides')).not.toHaveClass(/hidden/);
 await expect(page.locator('#viewerWorshipBulletin')).not.toHaveClass(/hidden/);
 await expect(page.locator('#viewerSlideTitle')).toContainText('모두가 듣도록');
 await page.locator('#viewerSlideNext').click();
 await expect(page.locator('#viewerSlideCount')).toHaveText('2 / 16');
 await page.locator('[data-viewer-material-mode=ppt-bulletin]').click();
 await expect(page.locator('#viewerVideoStage')).toHaveClass(/hidden/);
 await expect(page.locator('#viewerWorshipSlides')).not.toHaveClass(/hidden/);
 await expect(page.locator('#viewerWorshipBulletin')).not.toHaveClass(/hidden/);
 await page.locator('[data-viewer-material-mode=video]').click();
 await expect(page.locator('#viewerVideoStage')).not.toHaveClass(/hidden/);
 await expect(page.locator('#viewerWorshipSlides')).toHaveClass(/hidden/);
 await expect(page.locator('#viewerWorshipBulletin')).toHaveClass(/hidden/);
 await context.close();
});

test('viewer mobile mode supports independent bulletin without requiring a login',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='live.ekodi.test')return route.abort();
  const file=files.get(url.pathname);
  if(file===undefined)return route.fulfill({status:404,body:'not found'});
  await route.fulfill({status:200,contentType:url.pathname.endsWith('.json')?'application/json':url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':'text/html',body:file?await readFile(new URL(file,fixture),'utf8'):''});
 });
 const page=await context.newPage();
 await page.goto(fake+'?date=2026-10-11');
 await page.locator('#viewerView').evaluate(el=>el.classList.remove('hidden'));
 await expect(page.locator('#viewerMaterialStatus')).toContainText('PPT 16장');
 await page.locator('[data-viewer-material-mode=bulletin]').click();
 await expect(page.locator('#viewerWorshipBulletin')).toBeVisible();
 await expect(page.locator('#viewerWorshipSlides')).toHaveClass(/hidden/);
 await expect(page.locator('#viewerBulletinBody')).toContainText('대표기도');
 await expect(page.locator('#viewerBulletinBody')).toContainText('박은희');
 await context.close();
});

test('default live worship selects October 18 on Saturday in KST on PC and mobile',async({browser})=>{
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='live.ekodi.test')return route.abort();
   const file=files.get(url.pathname);
   if(file===undefined)return route.fulfill({status:404,body:'not found'});
   await route.fulfill({status:200,contentType:url.pathname.endsWith('.json')?'application/json':url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':'text/html',body:file?await readFile(new URL(file,fixture),'utf8'):''});
  });
  const page=await context.newPage();
  await page.clock.setFixedTime(new Date('2026-10-17T06:30:00Z'));
  await page.goto(fake);
  await expect(page.locator('#viewerMaterialStatus')).toContainText('2026-10-18 주일예배');
  await expect(page.locator('#viewerBulletinLink')).toHaveAttribute('href','/ekodichurch/worship/2026-10-18/');
  await page.locator('#viewerView').evaluate(el=>el.classList.remove('hidden'));
  await page.locator('[data-viewer-material-mode=ppt-bulletin]').click();
  await expect(page.locator('#viewerSlideTitle')).toContainText('품 안에서');
  await expect(page.locator('#viewerBulletinBody')).toContainText('신명기 33:12–19');
  await context.close();
 }
});
