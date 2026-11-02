import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const url='https://worship-live.ekodi.test/ekodichurch/live/';
const files=new Map([
  ['/ekodichurch/live/','live/index.html'],
  ['/ekodichurch/live/live.css','live/live.css'],
  ['/ekodichurch/live/worship-materials.css','live/worship-materials.css'],
  ['/ekodichurch/live/worship-materials.js','live/worship-materials.js'],
  ['/ekodichurch/worship/2026-10-11/materials.json','worship/2026-10-11/materials.json'],
  ['/ekodichurch/live/host-intent.js',null],['/ekodichurch/live/live.js',null]
]);
test('authorized source slide controls reach remote viewer and manual override is retained',async({browser})=>{
 const ctx=await browser.newContext({viewport:{width:1200,height:960}});
 let index=0,revision=0;
 await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='worship-live.ekodi.test')return route.abort();
  if(u.pathname==='/api/realtime/rooms/room_testchurch/presentation'){
    if(route.request().method()==='PUT'){
      const bearer=route.request().headers().authorization;
      if(bearer!=='Bearer browser-test-token')return route.fulfill({status:403,contentType:'application/json',body:'{"error":"forbidden"}'});
      const data=route.request().postDataJSON();
      if(data.deckId!=='worship-2026-10-11'||!Number.isInteger(data.index))return route.fulfill({status:400,body:'invalid'});
      index=data.index;revision++;
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,presentation:revision?{deckId:'worship-2026-10-11',index,revision}:null})});
  }
  const file=files.get(u.pathname);
  if(file===undefined)return route.fulfill({status:404,body:'not found'});
  const contentType=u.pathname.endsWith('.json')?'application/json':u.pathname.endsWith('.js')?'application/javascript':u.pathname.endsWith('.css')?'text/css':'text/html';
  return route.fulfill({status:200,contentType,body:file?await readFile(new URL(file,root),'utf8'):''});
 });
 const host=await ctx.newPage();
 await host.goto(url+'?date=2026-10-11');
 await host.evaluate(()=>{sessionStorage.setItem('ekodi-auth-token','browser-test-token');document.getElementById('studioView').classList.remove('hidden');window.dispatchEvent(new CustomEvent('ekodi:live:room',{detail:{roomId:'room_testchurch',tenant:'ekodichurch',role:'host'}}));});
 await expect(host.locator('#worshipHostSyncStatus')).toContainText('전송 완료');
 expect(index).toBe(0);
 await host.locator('#worshipHostNext').click();
 await expect(host.locator('#worshipHostSyncStatus')).toContainText('전송 완료');
 expect(index).toBe(1);
 const viewer=await ctx.newPage();
 await viewer.goto(url+'?date=2026-10-11');
 await viewer.evaluate(()=>{document.getElementById('viewerView').classList.remove('hidden');window.dispatchEvent(new CustomEvent('ekodi:live:room',{detail:{roomId:'room_testchurch',tenant:'ekodichurch',role:'viewer'}}));});
 await viewer.locator('[data-viewer-material-mode="ppt"]').click();
 await viewer.locator('#viewerFollowPresenter').click();
 await expect(viewer.locator('#viewerSlideCount')).toHaveText('2 / 16');
 await expect(viewer.locator('#viewerFollowPresenter')).toHaveAttribute('aria-pressed','true');
 await viewer.locator('#viewerSlideNext').click();
 await expect(viewer.locator('#viewerFollowPresenter')).toHaveAttribute('aria-pressed','false');
 await expect(viewer.locator('#viewerSlideCount')).toHaveText('3 / 16');
 await host.locator('#worshipHostNext').click();
 await expect(host.locator('#worshipHostSyncStatus')).toContainText('전송 완료');
 await viewer.locator('#viewerFollowPresenter').click();
 await expect(viewer.locator('#viewerSlideCount')).toHaveText('3 / 16');
 await ctx.close();
});
