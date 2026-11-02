import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const base='https://worship.ekodi.test/ekodichurch/worship/2026-10-11/';
const root=new URL('../worship/2026-10-11/',import.meta.url);

test('presenter and stage stay synchronized, print is separate from broadcasting',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('https://worship.ekodi.test/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const filename=path.endsWith('/worship.js')?'worship.js':path.endsWith('/worship.css')?'worship.css':'index.html';
    const body=await readFile(new URL(filename,root),'utf8');
    const contentType=filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html';
    await route.fulfill({status:200,contentType,body});
  });
  const operator=await context.newPage();
  await operator.goto(base+'?view=operator');
  await expect(operator.locator('body')).toHaveAttribute('data-view','operator');
  await expect(operator.locator('#slide-title')).toContainText('모두가 듣도록');
  const popupPromise=operator.waitForEvent('popup');
  await operator.locator('#open-stage').click();
  const stage=await popupPromise;
  await stage.waitForLoadState();
  await expect(stage.locator('body')).toHaveAttribute('data-view','stage');
  await operator.locator('#operator-next').click();
  await expect(stage.locator('#slide-title')).toHaveText('Community Sunday Worship');
  await expect(stage.locator('#slide-number')).toHaveText('2 / 16');
  await operator.locator('#operator-blackout').click();
  await expect(stage.locator('#slide')).toHaveAttribute('data-blackout','true');
  await stage.keyboard.press('b');
  await expect(operator.locator('#slide')).toHaveAttribute('data-blackout','false');
  await stage.keyboard.press('End');
  await expect(operator.locator('#slide-number')).toHaveText('16 / 16');
  await context.close();
});

test('portrait view preserves 9:16 source layout for Instagram composition',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('https://worship.ekodi.test/**',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop()||'index.html';
    const filename=['worship.js','worship.css'].includes(name)?name:'index.html';
    const body=await readFile(new URL(filename,root),'utf8');
    await route.fulfill({status:200,contentType:filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html',body});
  });
  const page=await context.newPage();
  await page.goto(base+'?view=vertical');
  await expect(page.locator('body')).toHaveAttribute('data-view','vertical');
  const box=await page.locator('#slide').boundingBox();
  expect(box).toBeTruthy();
  expect(Math.abs(box.width/box.height-9/16)).toBeLessThan(0.02);
  await expect(page.locator('#slide-number')).toHaveText('1 / 16');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#slide-number')).toHaveText('2 / 16');
  await context.close();
});