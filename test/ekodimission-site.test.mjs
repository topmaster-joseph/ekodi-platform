import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import spaceWorker from '../space-worker.js';

const spaceRoot=new URL('../space/',import.meta.url);
const contentType=path=>path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8';
const env={ASSETS:{fetch:async request=>{
  const pathname=new URL(request.url).pathname;
  try{const body=await readFile(new URL(`.${pathname}`,spaceRoot));return new Response(request.method==='HEAD'?null:body,{status:200,headers:{'content-type':contentType(pathname)}})}catch{return new Response('Not Found',{status:404})}
}}};
const pageCases=[
  ['/ekodimission','에코디선교회'],['/ekodimission/activities','MISSION ACTIVITIES'],
  ['/ekodimission/activities/2026-chuseok-open-table','2026 에코디'],['/ekodimission/participate','PARTICIPATE'],
  ['/ekodimission/partners','PARTNERSHIP'],['/ekodimission/stories','STORIES & NEWS'],['/ekodimission/give','GIVE & SHARE'],
];
test('EKODI Mission pages are routed as independent private-review workspace surfaces',async()=>{
  for(const [path,marker] of pageCases){const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${path}`),env);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-ekodi-route'),'ekodimission-preview',path);assert.equal(response.headers.get('x-ekodi-independent-site'),'true',path);assert.match(response.headers.get('x-robots-tag')||'',/noindex/i,path);assert.match(await response.text(),new RegExp(marker),path)}
});

test('EKODI Mission shared assets and unknown child routes are guarded',async()=>{
  for(const path of ['/ekodimission/assets/site.css','/ekodimission/assets/site.js']){const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${path}`),env);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-ekodi-route'),'ekodimission-asset',path)}
  const missing=await spaceWorker.fetch(new Request('https://ekodi.kr/ekodimission/not-published'),env);assert.equal(missing.status,404);assert.equal(missing.headers.get('x-ekodi-route'),'ekodimission-not-found');
});

test('platform router preserves tenant-branded independent sites without EKODI shell injection',async()=>{
  const source=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');
  assert.match(source,/x-ekodi-independent-site/);assert.match(source,/independent-workspace-site/);
});

test('mission is registered but excluded from public root until approval',async()=>{
  const registry=JSON.parse(await readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));const mission=registry.services.find(service=>service.id==='mission');assert.ok(mission);assert.equal(mission.url,'https://ekodi.kr/ekodimission');assert.equal(mission.homepage,false);assert.equal(mission.productionVerified,false);assert.equal(mission.status,'preparing');
});


test('Open Table uses the approved 16:00-18:00 schedule and mission admin identity',async()=>{
  const [event,admin]=await Promise.all([readFile(new URL('../space/ekodimission-activity.page',import.meta.url),'utf8'),readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8')]);
  assert.match(event,/16:00–18:00/);assert.doesNotMatch(event,/12:00–15:00|낮 12시/);
  assert.match(admin,/'ekodimission':'에코디선교회'/);assert.match(admin,/'ekodimission':'mission'/);
});
