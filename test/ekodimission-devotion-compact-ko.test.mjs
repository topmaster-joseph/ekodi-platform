import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import spaceWorker from '../space-worker.js';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Mission Korean devotion subtitle is visually absent without changing other locales',async()=>{
 const [html,css,shell]=await Promise.all([
  read('space/ekodimission-devotion.page'),
  read('space/ekodimission-shell.css'),
  read('space/ekodimission-shell.js')
 ]);
 assert.match(html,/<html lang="ko"/);
 assert.match(html,/<main class="subpage" data-mission-devotion>/);
 assert.doesNotMatch(html,/EKODI MISSION · DAILY DEVOTION/);
 assert.match(css,/html:lang\(ko\) main\[data-mission-devotion\] \[data-mission-devotion-eyebrow\]\{display:none!important\}/);
 assert.doesNotMatch(css,/html\s*\[lang\]\s+\[data-mission-devotion-eyebrow\]/);
 assert.match(shell,/document\.documentElement\.lang=active/);
 assert.match(shell,/syncDevotionEyebrow\(active\)/);
 assert.match(shell,/syncDevotionEyebrow\(sourceLocale\)/);
 assert.match(shell,/heading\.insertBefore\(eyebrow/);
 assert.match(shell,/eyebrow\.textContent='EKODI MISSION · DAILY DEVOTION'/);
 assert.match(html,/<h1>오늘의 매일묵상<\/h1>/);
});

test('Mission-only compact rhythm preserves readable verse spacing and focus behavior',async()=>{
 const [css,shared,html]=await Promise.all([
  read('space/ekodimission-shell.css'),
  read('bible/devotion.css'),
  read('space/ekodimission-devotion.page')
 ]);
 for(const selector of ['.dv-page-title','.ekodi-devotion','.dv-summary','.dv-datebar','.dv-verses p','.dv-poem p','.dv-questions li','.dv-tabs','.dv-panel','.dv-record p']){
  assert.ok(css.includes('main[data-mission-devotion] '+selector),'missing mission-specific compact selector: '+selector);
 }
 assert.match(css,/\.dv-verses p\{margin:2px 0\}/);
 assert.match(css,/\.dv-date-link\{\s*padding:5px 10px;min-height:36px/);
 assert.match(css,/\.dv-btn\{\s*padding:6px 11px;min-height:38px/);
 assert.match(css,/@media\(max-width:520px\)/);
 assert.match(css,/body:has\(main\[data-mission-devotion\]\) \.site-footer/);
 assert.match(css,/main\[data-mission-devotion\] \.ekodi-devotion\{padding-left:0;padding-right:0\}/);
 assert.match(html,/<link rel="stylesheet" href="\/ekodimission\/assets\/shell.css">/);
 assert.match(html,/<link rel="stylesheet" href="\/bible\/devotion.css">/);
 assert.match(shared,/\.ekodi-devotion \.dv-poem p/);
 assert.doesNotMatch(shared,/html:lang\(ko\) main\[data-mission-devotion\]/);
});

test('Mission devotion route keeps independent header/footer, stylesheet and renderer',async()=>{
 const env={ASSETS:{fetch:async request=>{
   const path=new URL(request.url).pathname;
   try{
     const file=path.startsWith('/ekodimission/')?path.replace('/ekodimission/',''):path.slice(1);
     const data=await read('space/'+file);
     return new Response(data,{headers:{'content-type':'text/html; charset=utf-8'}});
   }catch{return new Response('missing',{status:404});}
 }}};
 const response=await spaceWorker.fetch(new Request('https://ekodi.kr/ekodimission/devotion'),env);
 assert.equal(response.status,200);
 const page=await response.text();
 assert.match(page,/data-mission-devotion/);
 assert.match(page,/data-ekodi-devotion/);
 assert.match(page,/class="mission-site-header"/);
 assert.match(page,/class="site-footer"/);
 assert.match(page,/href="\/ekodimission\/assets\/shell.css"/);
 assert.match(page,/src="\/bible\/devotion.js"/);
});

test('Mission devotional login controls sit in the lower admin row without changing shared devotion renderer',async()=>{
 const [shell,css,renderer,missionPage]=await Promise.all([
  read('space/ekodimission-shell.js'),
  read('space/ekodimission-shell.css'),
  read('bible/devotion.js'),
  read('space/ekodimission-devotion.page')
 ]);
 assert.match(missionPage,/main class="subpage" data-mission-devotion/);
 assert.match(shell,/const devotion=document\.querySelector\('main\[data-mission-devotion\]'\)/);
 assert.match(shell,/const target=devotion\|\|document\.querySelector\('\.mission-site-header'\)/);
 assert.match(shell,/if\(devotion\)mountDevotionAuthNextToAdmin\(row,devotion\)/);
 assert.doesNotMatch(shell,/header\.append\(row\)/);
 assert.match(shell,/renderer\.querySelector\('\.dv-adminbar'\)/);
 assert.match(shell,/adminBar\.before\(tools\)/);
 assert.match(shell,/tools\.append\(adminBar,authRow\)/);
 assert.match(shell,/adminBar\.before\(tools\)/);
 assert.match(shell,/const renderer=devotion\.querySelector\('\[data-ekodi-devotion\]'\)/);
 assert.match(shell,/observer\.observe\(renderer,\{childList:true\}\)/);
 assert.match(renderer,/root\.append\(datebar, status, scriptureBlock, tabbar, panelWrap, notice, shareRow, adminBar, adminPanel, adminView, toastEl\)/);
 assert.match(css,/main\[data-mission-devotion\] \.mission-devotion-tools .mission-auth-button\{\s*min-height:36px/);

 assert.match(shell,/new MutationObserver/);
 assert.match(shell,/if\(mount\(\)\)observer\.disconnect\(\)/);
 assert.match(css,/main\[data-mission-devotion\] \.mission-devotion-tools/);
 assert.match(css,/mission-devotion-tools > \.dv-adminbar\[hidden\]\{display:none!important\}/);
 assert.match(css,/mission-devotion-tools > \.mission-auth-actions/);
 assert.match(renderer,/root\.append\(datebar, status, scriptureBlock, tabbar, panelWrap, notice, shareRow, adminBar, adminPanel, adminView, toastEl\)/);
 assert.match(shell,/missionAuthUi\?\.logout\.addEventListener\('click'/);
 assert.match(shell,/window\.EKODIMissionAuth=Object\.freeze/);
});

test('Mission login is only a guest button or verified account with logout',async()=>{
 const [shell,board,css]=await Promise.all([
  read('space/ekodimission-shell.js'),
  read('site-board-control.js'),
  read('bible/devotion.css')
 ]);
 assert.doesNotMatch(shell,/로그인됨|비로그인|로그인 확인 중|로그인 확인 불가/);
 assert.match(shell,/state\.textContent='';\s*state\.hidden=true;/);
 assert.match(shell,/missionAuthUi\.state\.textContent=authenticated\?missionAccountLabel\(account\):''/);
 assert.match(shell,/missionAuthUi\.state\.hidden=!authenticated/);
 assert.match(shell,/verifiedToken=token;paintMissionAuth\('in',data\.account\)/);
 assert.match(shell,/missionAuthUi\.login\.hidden=authenticated/);
 assert.match(shell,/missionAuthUi\.logout\.hidden=!authenticated/);
 assert.match(board,/account:who\.authenticated\?who\.email:''/);
 assert.match(board,/response\.headers\.set\('cache-control','private, no-store'\)/);
 assert.match(css,/\.mission-auth-state\[hidden\]\{display:none!important\}/);
});
