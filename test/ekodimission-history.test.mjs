import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import spaceWorker from '../space-worker.js';
const root=new URL('../space/',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
const env={ASSETS:{fetch:async request=>{try{return new Response(await readFile(new URL('.'+new URL(request.url).pathname,root)),{status:200,headers:{'content-type':'text/html; charset=utf-8'}})}catch{return new Response('Not Found',{status:404})}}}};

test('mission history is a first-class public route and slash variants agree',async()=>{
 const path='/ekodimission/history';
 const a=await spaceWorker.fetch(new Request('https://ekodi.kr'+path),env);
 const b=await spaceWorker.fetch(new Request('https://ekodi.kr'+path+'/'),env);
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal(a.headers.get('x-ekodi-independent-site'),'true');
 assert.equal(a.headers.get('x-ekodi-publication-status'),'published');
 assert.equal(a.headers.get('x-robots-tag'),'index, follow');
 const html=await a.text();
 assert.equal(html,await b.text());
 assert.match(html,/href="https:\/\/ekodi.kr\/ekodimission\/history"/);
 assert.match(html,/data-mission-nav/);
 assert.match(html,/id="history-2018"/);
 assert.match(html,/id="history-2026"/);
 assert.match(html,/설립 월·일이 달라/);
 assert.doesNotMatch(html,/student\.phone|account_password|생년월일|주민등록번호/);
});

test('history timeline is ordered most recent to oldest with unique anchors and no fabricated foundation date',async()=>{
 const page=await read('ekodimission-history.page');
 const years=[...page.matchAll(/<li class="mission-history-entry" id="history-(\d{4})">/g)].map(m=>Number(m[1]));
 assert.deepEqual(years,[2026,2025,2024,2023,2022,2021,2018]);
 assert.equal(new Set(years).size,years.length);
 assert.match(page,/<time datetime="2018">2018<\/time>/);
 assert.doesNotMatch(page,/datetime="2018-(?:03|08)-13"/);
 assert.ok(page.includes('제주 여름캠프'));
 assert.ok(page.includes('서울 공동체 여행'));
});

test('shared header and homepage now present history as distinct from activities and news',async()=>{
 const [shell,home,activities,stories,worker]=await Promise.all([
   read('ekodimission-shell.js'),read('ekodimission.page'),
   read('ekodimission-activities.page'),read('ekodimission-stories.page'),
   readFile(new URL('../space-worker.js',import.meta.url),'utf8')
 ]);
 assert.match(shell,/href:'\/ekodimission\/activities',label:'활동'[\s\S]*href:'\/ekodimission\/history',label:'연혁'[\s\S]*href:'\/ekodimission\/live',label:'라이브'/);
 assert.match(shell,/location.replace\('\/ekodimission\/history'\+location.hash\)/);
 assert.ok(home.includes('href="/ekodimission/history"'),'Landing directs to the independent history page');
 assert.ok(home.includes('진행·예정 행사'));
 assert.ok(!home.includes('href="/ekodimission/history#history-2018"'),'No history timeline on home');
 assert.ok(activities.includes('href="/ekodimission/history#history-2025"'));
 assert.ok(activities.includes('href="/ekodimission/history"'));
 assert.ok(stories.includes('href="/ekodimission/history"'));
 assert.doesNotMatch(stories,/id="history-2018"|id="history-2025"|MISSION HISTORY · 2018–2026/);
 assert.ok(worker.includes("['/ekodimission/history','/ekodimission-history.page']"));
});
