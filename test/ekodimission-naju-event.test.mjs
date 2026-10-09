import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import spaceWorker from '../space-worker.js';

const base=new URL('../space/',import.meta.url);
const env={ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  try{return new Response(await readFile(new URL('.'+path,base)),{status:200,headers:{'content-type':'text/html; charset=utf-8'}})}
  catch{return new Response('Not Found',{status:404})}
}}};

test('10 October Naju festival page and homepage links',async()=>{
  const route='/ekodimission/activities/261010-naju-yeongsan';
  const a=await spaceWorker.fetch(new Request('https://ekodi.kr'+route),env);
  const b=await spaceWorker.fetch(new Request('https://ekodi.kr'+route+'/'),env);
  assert.equal(a.status,200);
  assert.equal(b.status,200);
  assert.equal(a.headers.get('x-ekodi-route'),'ekodimission-public');
  const html=await a.text();
  assert.equal(html,await b.text());
  assert.match(html,/10월 10일 토요일/);
  assert.match(html,/11:00/);
  assert.match(html,/나주 영산강정원/);
  assert.match(html,/운영진 안내/);
  assert.match(html,/data-share-event/);
  assert.match(html,/name="viewport"/);
  assert.doesNotMatch(html,/data-event-application/);
  const [home,list]=await Promise.all([
    readFile(new URL('ekodimission.page',base),'utf8'),
    readFile(new URL('ekodimission-activities.page',base),'utf8')
  ]);
  assert.ok(home.includes('href="'+route+'"'));
  assert.ok(list.includes('href="'+route+'"'));
  assert.ok(list.indexOf('2026-10-10')<list.indexOf('2026-10-03'));
});
