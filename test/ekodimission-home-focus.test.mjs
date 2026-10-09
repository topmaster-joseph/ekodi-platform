import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import spaceWorker from '../space-worker.js';

const space=new URL('../space/',import.meta.url);
const source=name=>readFile(new URL(name,space),'utf8');
const env={ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  try{return new Response(await readFile(new URL('.'+path,space)),{status:200,headers:{'content-type':'text/html; charset=utf-8'}})}
  catch{return new Response('Not Found',{status:404})}
}}};

test('Mission landing page has only an introduction and active/upcoming events',async()=>{
  const html=await source('ekodimission.page');
  const sections=[...html.matchAll(/<section\b[^>]*>/g)].map(item=>item[0]);
  assert.equal(sections.length,2,'no archived events or services duplicated on home');
  assert.match(sections[0],/hero-split/);
  assert.match(sections[1],/mission-home-current/);
  assert.match(html,/곁을 내어주는 선교/);
  assert.match(html,/진행·예정 행사/);
  assert.match(html,/data-mission-home-event data-event-last-day="2026-10-10"/);
  assert.match(html,/\/ekodimission\/activities\/261010-naju-yeongsan/);
  assert.match(html,/data-mission-home-empty hidden/);
  assert.match(html,/지난 활동·연혁 보기/);
  for(const excluded of ['2026 가을 공동체 여행','2026 에코디 추석 열린식탁','MISSION SERVICES','OUR JOURNEY','에클레시아','한 사람의 자리를 하나 더'])assert.ok(!html.includes(excluded),excluded);
  const archive=await source('ekodimission-activities.page');
  assert.match(archive,/2026 가을 공동체 여행/);
  assert.match(archive,/2026 에코디 추석 열린식탁/);
  for(const path of ['/ekodimission','/ekodimission/']){
    const response=await spaceWorker.fetch(new Request('https://ekodi.kr'+path),env);
    assert.equal(response.status,200,path);
    const body=await response.text();
    assert.match(body,/data-mission-home-event/,path);
    assert.doesNotMatch(body,/2026 가을 공동체 여행/,path);
  }
});

test('Mission home event automatically disappears after 10 October in Asia/Seoul',async()=>{
  const js=await source('ekodimission.js');
  const run=(iso)=>{
    const card={dataset:{eventLastDay:'2026-10-10'},hidden:false};
    const empty={hidden:true};
    const doc={
      querySelector:sel=>sel==='.hero-split'?{}:sel==='[data-mission-home-empty]'?empty:null,
      querySelectorAll:sel=>sel==='[data-mission-home-event]'?[card]:[],
      addEventListener:()=>{}
    };
    class Clock extends Date{
      constructor(...args){super(...(args.length?args:[iso]))}
    }
    const runBrowser=new Function('document','window','navigator','sessionStorage','Date','Intl',js);
    runBrowser(doc,{}, {},{getItem:()=>''},Clock,Intl);
    return {card,empty};
  };
  const before=run('2026-10-09T12:00:00Z');
  assert.equal(before.card.hidden,false);
  assert.equal(before.empty.hidden,true);
  const onDay=run('2026-10-10T14:59:59Z');
  assert.equal(onDay.card.hidden,false);
  const after=run('2026-10-10T15:00:00Z');
  assert.equal(after.card.hidden,true);
  assert.equal(after.empty.hidden,false);
});

test('Mission event date remains legible on small screens',async()=>{
  const css=await source('ekodimission.css');
  assert.match(css,/mission-home-current \.activity-date strong/);
  assert.match(css,/white-space:nowrap/);
});