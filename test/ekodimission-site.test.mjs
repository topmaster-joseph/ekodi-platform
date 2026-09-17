import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import spaceWorker from '../space-worker.js';

const spaceRoot=new URL('../space/',import.meta.url);
const contentType=path=>path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'application/javascript; charset=utf-8':path.endsWith('.jpg')?'image/jpeg':'text/html; charset=utf-8';
const env={ASSETS:{fetch:async request=>{
  const pathname=new URL(request.url).pathname;
  try{const body=await readFile(new URL(`.${pathname}`,spaceRoot));return new Response(request.method==='HEAD'?null:body,{status:200,headers:{'content-type':contentType(pathname)}})}catch{return new Response('Not Found',{status:404})}
}}};
const eventPath='/ekodimission/activities/260925-chuseok-open-table';
const applicationApi=`/ekodimission/api/activities/260925-chuseok-open-table/applications`;
const pageCases=[
  ['/ekodimission','에코디선교회'],['/ekodimission/activities','MISSION ACTIVITIES'],
  [eventPath,'JOIN THE TABLE'],['/ekodimission/participate','PARTICIPATE'],
  ['/ekodimission/partners','PARTNERSHIP'],['/ekodimission/stories','STORIES & NEWS'],['/ekodimission/give','GIVE & SHARE'],
];
test('EKODI Mission pages are routed as branded published public surfaces',async()=>{
  for(const [path,marker] of pageCases){
    const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${path}`),env);
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('x-ekodi-route'),'ekodimission-public',path);
    assert.equal(response.headers.get('x-ekodi-independent-site'),'true',path);
    assert.equal(response.headers.get('x-ekodi-site-class'),'brand-site',path);
    assert.equal(response.headers.get('x-ekodi-publication-status'),'published',path);
    assert.match(response.headers.get('x-robots-tag')||'',/^index, follow$/i,path);
    const body=await response.text();
    assert.match(body,new RegExp(marker),path);
    assert.match(body,/meta name="robots" content="index,follow"/i,path);
    assert.doesNotMatch(body,/review-banner|관리자 검수 중|검색엔진과 공개 내비게이션에는 노출하지 않습니다/i,path);
  }
});

test('published EKODI Mission live route is indexable and independently branded',async()=>{
  const response=await spaceWorker.fetch(new Request('https://ekodi.kr/ekodimission/live'),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-ekodi-route'),'ekodimission-public');
  assert.equal(response.headers.get('x-ekodi-independent-site'),'true');
  assert.equal(response.headers.get('x-ekodi-publication-status'),'published');
  assert.equal(response.headers.get('x-robots-tag'),'index, follow');
  const body=await response.text();assert.match(body,/EKODI REALTIME/);assert.match(body,/meta name="robots" content="index, follow"/i);
});

test('legacy Open Table URL permanently redirects to the dated activity URL',async()=>{
  const response=await spaceWorker.fetch(new Request('https://ekodi.kr/ekodimission/activities/2026-chuseok-open-table?from=old'),env);
  assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://ekodi.kr/ekodimission/activities/260925-chuseok-open-table?from=old');assert.equal(response.headers.get('x-ekodi-publication-status'),'published');
});

test('EKODI Mission shared assets and unknown child routes are guarded',async()=>{
  for(const path of ['/ekodimission/assets/site.css','/ekodimission/assets/site.js','/ekodimission/assets/open-table-meal-260925.jpg']){const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${path}`),env);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-ekodi-route'),'ekodimission-asset',path);assert.equal(response.headers.get('x-ekodi-publication-status'),'published',path)}
  const missing=await spaceWorker.fetch(new Request('https://ekodi.kr/ekodimission/not-published'),env);assert.equal(missing.status,404);assert.equal(missing.headers.get('x-ekodi-route'),'ekodimission-not-found');
});

test('Open Table is first-party EKODI application UI with approved schedule',async()=>{
  const [event,script,css,admin]=await Promise.all([readFile(new URL('../space/ekodimission-activity.page',import.meta.url),'utf8'),readFile(new URL('../space/ekodimission.js',import.meta.url),'utf8'),readFile(new URL('../space/ekodimission.css',import.meta.url),'utf8'),readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8')]);
  assert.match(event,/16:00–18:00/);assert.match(event,/id="apply"/);assert.match(event,/data-event-application/);assert.match(event,/260925-chuseok-open-table/);assert.doesNotMatch(event,/docs\.google\.com|forms\/d\//i);assert.doesNotMatch(script,/docs\.google\.com|forms\/d\//i);
  assert.match(script,/mission-event-apply|applications/);assert.match(css,/word-break:keep-all/);assert.match(css,/overflow-wrap:break-word/);assert.match(css,/hyphens:none/);
  assert.match(admin,/'ekodimission':'에코디선교회'/);assert.match(admin,/'ekodimission':'mission'/);
});

test('first-party application API validates consent and calls the mission Supabase RPC',async()=>{
  const dataEnv={...env,DATA_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable-test'};
  const originalFetch=globalThis.fetch;let called=false;
  globalThis.fetch=async(input,init)=>{called=true;assert.equal(String(input),'https://example.supabase.co/rest/v1/rpc/mission_submit_event_application');const payload=JSON.parse(init.body);assert.equal(payload.p_event_key,'260925-chuseok-open-table');assert.equal(payload.p_name,'홍길동');return new Response(JSON.stringify({ok:true,application_id:'00000000-0000-0000-0000-000000000001'}),{status:200,headers:{'content-type':'application/json'}})};
  try{
    const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${applicationApi}`,{method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify({name:'홍길동',phone:'010-1234-5678',partySize:2,language:'ko',privacyConsent:true,photoConsent:false})}),dataEnv);
    assert.equal(response.status,200);const body=await response.json();assert.equal(body.ok,true);assert.equal(body.eventKey,'260925-chuseok-open-table');assert.equal(called,true);
  }finally{globalThis.fetch=originalFetch}
  const denied=await spaceWorker.fetch(new Request(`https://ekodi.kr${applicationApi}`,{method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify({name:'홍길동',phone:'010-1234-5678',partySize:1,privacyConsent:false})}),dataEnv);
  assert.equal(denied.status,400);
});

test('platform router preserves tenant-branded independent sites without EKODI shell injection',async()=>{
  const source=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');assert.match(source,/x-ekodi-independent-site/);assert.match(source,/independent-workspace-site/);
});

test('mission stays off the EKODI root catalog until homepage exposure is separately enabled',async()=>{
  const registry=JSON.parse(await readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));const mission=registry.services.find(service=>service.id==='mission');assert.ok(mission);assert.equal(mission.url,'https://ekodi.kr/ekodimission');assert.equal(mission.homepage,false);assert.equal(mission.productionVerified,true);assert.equal(mission.status,'preparing');
});

test('mission production smoke covers every published subservice route',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/space.worker.json',import.meta.url),'utf8'));const urls=new Set(manifest.worker.requests.map(item=>item.url));for(const [path] of pageCases)assert.ok(urls.has(`https://ekodi.kr${path}`),path);const missionRequests=manifest.worker.requests.filter(item=>item.url.startsWith('https://ekodi.kr/ekodimission'));assert.ok(missionRequests.length>=pageCases.length);for(const item of missionRequests)assert.equal(item.rollbackVerify,false,item.url);
});

test('mission authentication and service registry use only the canonical ekodi.kr path',async()=>{
  const files=await Promise.all(['../auth-site/auth.js','../auth-site/client-auth.js','../auth-site/auth-workspace-target.js','../service-registry.json','../supabase/functions/access-api/index.ts'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));for(const source of files)assert.doesNotMatch(source,/mission\.ekodi\.kr/);for(const source of files.slice(0,4))assert.match(source,/ekodi\.kr\/ekodimission/);const access=files[4];assert.match(access,/mission:\["https:\/\/ekodi\.kr"\]/);assert.match(access,/site==="mission"[\s\S]*?\/ekodimission/);
});
