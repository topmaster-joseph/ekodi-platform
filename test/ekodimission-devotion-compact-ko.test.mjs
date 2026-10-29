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
