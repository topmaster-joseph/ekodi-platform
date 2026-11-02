import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seoulTodayDate,devotionalUrl,normalize,loadTodayCards} from '../bible/devotion-today-card.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fixture={found:true,date:'2026-11-03',passage:'고린도전서 3:10-23',activities:{keyLine:'예수 그리스도 위에 우리의 삶을 세웁니다.'}};
test('today date is Seoul-based, including the UTC rollover boundary',()=>{
 assert.equal(seoulTodayDate(new Date('2026-11-02T15:05:00Z')),'2026-11-03');
 assert.equal(seoulTodayDate(new Date('2026-11-02T14:59:00Z')),'2026-11-02');
});
test('one public Scripture message is strictly the same on every homepage',()=>{
 assert.deepEqual(normalize(fixture,'2026-11-03'),{
   date:'2026-11-03',passage:fixture.passage,keyLine:fixture.activities.keyLine,title:'오늘의 매일묵상'
 });
 assert.equal(normalize({...fixture,date:'2026-11-04'},'2026-11-03'),null);
 assert.equal(normalize({...fixture,found:false},'2026-11-03'),null);
 assert.equal(normalize({...fixture,activities:{}},'2026-11-03'),null);
 assert.deepEqual(['church','mission','bible'].map(site=>devotionalUrl(site,'2026-11-03')),[
   '/ekodichurch/devotion/?date=2026-11-03',
   '/ekodimission/devotion?date=2026-11-03',
   '/bible/devotion/2026-11-03'
 ]);
});
test('all three public homepages mount same shared daily card, not separate copy',()=>{
 const pages=[['space/ekodimission.page','mission'],['sites/ekodi-church/index.html','church'],['bible/index.html','bible']];
 for(const [path,site] of pages){
  const html=read(path);
  assert.ok(html.includes('data-ekodi-today-devotion="'+site+'"'),path);
  assert.match(html,/data-devotion-passage/);
  assert.match(html,/data-devotion-keyline/);
  assert.match(html,/data-devotion-date/);
  assert.match(html,/\/bible\/devotion-today-card\.js/);
 }
 const controller=read('sites/ekodi-church/church-header-controls.js');
 assert.match(controller,/!devotion\.hasAttribute\('data-ekodi-today-devotion'\)/);
});
test('mission replaces overcrowded nav with one accessible disclosure preserving all canonical destinations',()=>{
 const js=read('space/ekodimission-shell.js');
 assert.match(js,/const primaryIndices=new Set\(\[0,1,2,5\]\)/);
 assert.match(js,/more\.append\(summary,popup\)/);
 assert.match(js,/nav\.replaceChildren\(\.\.\.primary,more,language\)/);
 assert.match(js,/if\(secondary\.some/);
 for(const route of ['/ekodimission/devotion','/ekodimission/activities','/ekodimission/history','/ekodimission/live','/ekodimission/participate','/ekodimission/partners','/ekodimission/stories','/qtin/mission'])
   assert.ok(js.includes(route),route);
 const css=read('space/ekodimission.css');
 assert.match(css,/\.mission-home>\.hero\.hero-split\{min-height:0!important;height:auto!important/);
 const shell=read('space/ekodimission-shell.css');
 assert.match(shell,/\.mission-nav-more-links/);
});
test('data fetch is one public request and never displays stale or unpublished content',async()=>{
 const attrs={};
 class FakeNode {
  constructor(site){this.dataset={ekodiTodayDevotion:site};this.attrs={};this.children={};}
  querySelector(s){
   if(!this.children[s])this.children[s]={textContent:'',attrs:{},setAttribute(name,value){this.attrs[name]=value}};
   return this.children[s];
  }
  matches(){return false}
 }
 const cards=['church','mission','bible'].map(s=>new FakeNode(s));
 const calls=[];
 const ok=await loadTodayCards({
  doc:{querySelectorAll:()=>cards},
  fetchImpl:async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>fixture}},
  now:new Date('2026-11-02T15:01:00Z')
 });
 assert.equal(ok,true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/bible/api/bible/devotion?date=2026-11-03');
 assert.equal(calls[0].options.credentials,'omit');
 for(const card of cards){
  assert.equal(card.children['[data-devotion-passage]'].textContent,fixture.passage);
  assert.equal(card.children['[data-devotion-keyline]'].textContent,fixture.activities.keyLine);
  assert.equal(card.dataset.devotionReady,'true');
 }
 const badCards=['church','mission','bible'].map(s=>new FakeNode(s));
 assert.equal(await loadTodayCards({doc:{querySelectorAll:()=>badCards},fetchImpl:async()=>({ok:true,json:async()=>({...fixture,date:'2026-11-04'})}),now:new Date('2026-11-02T15:01:00Z')}),false);
 assert.ok(badCards.every(x=>!x.dataset.devotionReady));
});
