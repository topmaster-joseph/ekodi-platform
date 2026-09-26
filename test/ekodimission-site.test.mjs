import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import spaceWorker from '../space-worker.js';
import platformEntry from '../platform-router-entry-worker.js';

const spaceRoot=new URL('../space/',import.meta.url);
const contentType=path=>path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'application/javascript; charset=utf-8':path.endsWith('.jpg')?'image/jpeg':path.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8';
const env={ASSETS:{fetch:async request=>{
  const pathname=new URL(request.url).pathname;
  try{const body=await readFile(new URL(`.${pathname}`,spaceRoot));return new Response(request.method==='HEAD'?null:body,{status:200,headers:{'content-type':contentType(pathname)}})}catch{return new Response('Not Found',{status:404})}
}}};
const eventPath='/ekodimission/apply/260926-open-table';
const legacyCurrentEventPath='/ekodimission/activities/260926-chuseok-open-table';
const applicationApi='/ekodimission/api/activities/260926-chuseok-open-table/applications';
const standaloneApplyPath=eventPath;
const pageCases=[
  ['/ekodimission','에코디선교회'],['/ekodimission/activities','MISSION ACTIVITIES'],
  [eventPath,'한가위 열린식탁 & 나눔마켓'],['/ekodimission/participate','PARTICIPATE'],
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

test('legacy Open Table URLs permanently redirect to the corrected dated activity URL',async()=>{
  for(const legacy of [legacyCurrentEventPath,'/ekodimission/activities/260925-chuseok-open-table','/ekodimission/activities/2026-chuseok-open-table']){
    const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${legacy}?from=old`),env);
    assert.equal(response.status,308,legacy);assert.equal(response.headers.get('location'),'https://ekodi.kr/ekodimission/apply/260926-open-table?from=old',legacy);assert.equal(response.headers.get('x-ekodi-publication-status'),'published',legacy);
  }
});

test('standalone Open Table application link is action-first, compact, and writes to the existing event application API',async()=>{
  const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${standaloneApplyPath}`),env);
  assert.equal(response.status,200);assert.equal(response.headers.get('x-ekodi-route'),'ekodimission-public');
  const body=await response.text();
  assert.match(body,/class="open-table-hero"/);assert.match(body,/한가위 열린식탁 & 나눔마켓/);assert.match(body,/먹고, 나누고, 빈자리를 채웁니다/);assert.match(body,/9월 26일 토요일/);assert.match(body,/16:00–18:00/);assert.match(body,/자담치킨 목포대점/);assert.match(body,/참가비<\/dt><dd>무료/);assert.match(body,/href="#apply"/);assert.match(body,/오시는 길/);assert.match(body,/열린식탁/);assert.match(body,/나눔마켓/);assert.match(body,/기타 하고 싶은 말/);assert.match(body,/name="name"/);assert.match(body,/name="phone"/);assert.match(body,/name="note"/);assert.match(body,/name="partySize" value="1"/);assert.doesNotMatch(body,/참여 인원 \| Party size/);assert.doesNotMatch(body,/이메일 \| Email/);assert.match(body,/>신청하기<\/button>/);assert.match(body,/data-event-application/);assert.match(body,/260926-chuseok-open-table/);assert.match(body,/class="mobile-apply-cta"/);assert.doesNotMatch(body,/자담치킨 \| Jadam Chicken|무료 \| Free|팟럭 \| Potluck|나눔마켓 \| Sharing Market|신청하기 \| Register/);assert.doesNotMatch(body,/activities\/2026-chuseok-open-table#apply/);
});

test('EKODI Mission shared assets and unknown child routes are guarded',async()=>{
  for(const path of ['/ekodimission/assets/site.css','/ekodimission/assets/site.js','/ekodimission/assets/shell.css','/ekodimission/assets/shell.js','/ekodimission/assets/share.css','/ekodimission/assets/mission-table-hero.svg','/ekodimission/assets/open-table-hero-260926.svg','/ekodimission/assets/open-table-meal-260925.jpg']){const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${path}`),env);assert.equal(response.status,200,path);assert.equal(response.headers.get('x-ekodi-route'),'ekodimission-asset',path);assert.equal(response.headers.get('x-ekodi-publication-status'),'published',path)}
  const missing=await spaceWorker.fetch(new Request('https://ekodi.kr/ekodimission/not-published'),env);assert.equal(missing.status,404);assert.equal(missing.headers.get('x-ekodi-route'),'ekodimission-not-found');
});

test('Open Table is first-party EKODI application UI with corrected Sep 26 schedule',async()=>{
  const [event,activities,script,css,admin]=await Promise.all([readFile(new URL('../space/ekodimission-open-table-apply.page',import.meta.url),'utf8'),readFile(new URL('../space/ekodimission-activities.page',import.meta.url),'utf8'),readFile(new URL('../space/ekodimission.js',import.meta.url),'utf8'),readFile(new URL('../space/ekodimission.css',import.meta.url),'utf8'),readFile(new URL('../workspace-admin-page.js',import.meta.url),'utf8')]);
  assert.match(event,/260926-chuseok-open-table/);assert.match(event,/9월 26일 토요일/);assert.match(event,/16:00–18:00/);assert.match(event,/자담치킨 목포대점/);assert.match(event,/id="apply"/);assert.match(event,/data-event-application/);assert.doesNotMatch(event,/docs\.google\.com|forms\/d\//i);
  assert.match(activities,/\/ekodimission\/apply\/260926-open-table/);assert.match(activities,/9월 26일 토요일 16:00–18:00/);const home=await readFile(new URL('../space/ekodimission.page',import.meta.url),'utf8');assert.match(home,/09\.26/);assert.match(home,/SAT · 2026/);assert.match(home,/2026년 9월 26일\(토\) 16:00–18:00/);assert.doesNotMatch(home,/09\.25|15:00–17:00/);assert.match(home,/\/ekodimission\/apply\/260926-open-table/);assert.doesNotMatch(script,/docs\.google\.com|forms\/d\//i);assert.match(script,/ekodimission\/apply\/260926-open-table/);assert.match(script,/2026년 9월 26일 토요일 오후 4시/);
  assert.match(script,/applications/);assert.match(css,/word-break:keep-all/);assert.match(css,/overflow-wrap:break-word/);assert.match(css,/hyphens:none/);assert.match(css,/\.open-table-hero\{/);assert.match(css,/\.mobile-apply-cta\{/);
  assert.match(admin,/'ekodimission':'에코디선교회'/);assert.match(admin,/'ekodimission':'mission'/);
});

test('first-party application API uses the canonical Sep 26 event key end-to-end',async()=>{
  const dataEnv={...env,DATA_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable-test'};
  const originalFetch=globalThis.fetch;let called=false;
  globalThis.fetch=async(input,init)=>{called=true;assert.equal(String(input),'https://example.supabase.co/rest/v1/rpc/mission_submit_event_application');const payload=JSON.parse(init.body);assert.equal(payload.p_event_key,'260926-chuseok-open-table');assert.equal(payload.p_name,'홍길동');return new Response(JSON.stringify({ok:true,application_id:'00000000-0000-0000-0000-000000000001'}),{status:200,headers:{'content-type':'application/json'}})};
  try{
    const response=await spaceWorker.fetch(new Request(`https://ekodi.kr${applicationApi}`,{method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify({name:'홍길동',phone:'010-1234-5678',partySize:2,language:'ko',privacyConsent:true,photoConsent:false})}),dataEnv);
    assert.equal(response.status,200);const body=await response.json();assert.equal(body.ok,true);assert.equal(body.eventKey,'260926-chuseok-open-table');assert.equal(called,true);
  }finally{globalThis.fetch=originalFetch}
  const denied=await spaceWorker.fetch(new Request(`https://ekodi.kr${applicationApi}`,{method:'POST',headers:{origin:'https://ekodi.kr','content-type':'application/json'},body:JSON.stringify({name:'홍길동',phone:'010-1234-5678',partySize:1,privacyConsent:false})}),dataEnv);
  assert.equal(denied.status,400);
});


test('Mission applicant share route is token-gated, read-only, noindex, and never projects private contact data',async()=>{
  const dataEnv={...env,DATA_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'publishable-test'};
  const token='AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_ABCD';
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    assert.equal(String(input),'https://example.supabase.co/rest/v1/rpc/activity_public_share_snapshot');
    const payload=JSON.parse(init.body);assert.equal(payload.p_token,token);
    return new Response(JSON.stringify({
      ok:true,
      activity:{activity_key:'260926-chuseok-open-table',title:'2026 추석 열린식탁',starts_at:'2026-09-26T16:00:00+09:00',ends_at:'2026-09-26T18:00:00+09:00',venue:'자담치킨 목포대점'},
      share:{expires_at:'2026-10-03T16:00:00+09:00',field_policy:{seq:true,name:true,submitted_at:true,status:true,party_size:true,phone:true,email:true}},
      participants:[{seq:1,name:'공유검증 참가자',submitted_at:'2026-09-19T14:00:00Z',phone:'010-0000-0099',email:'share-test@invalid.ekodi',status:'confirmed',party_size:2}]
    }),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const response=await spaceWorker.fetch(new Request(`https://ekodi.kr/ekodimission/share/${token}`),dataEnv);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-ekodi-route'),'ekodimission-share');
    assert.equal(response.headers.get('x-ekodi-publication-status'),'private-share');
    assert.match(response.headers.get('x-robots-tag')||'',/noindex/i);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.text();
    assert.match(body,/읽기전용 공유본/);
    assert.match(body,/공유검증 참가자/);
    assert.match(body,/신청일시/);
    assert.match(body,/2026년 9월 19일/);
    assert.match(body,/010-0000-0099/);
    assert.match(body,/share-test@invalid\.ekodi/);
    assert.match(body,/확정/);
    assert.match(body,/>2<\/td>/);
    assert.doesNotMatch(body,/후속 메모|EKODI ID/);
  }finally{globalThis.fetch=originalFetch}

  const originalFetchPrivate=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    ok:true,
    activity:{activity_key:'260926-chuseok-open-table',title:'2026 추석 열린식탁'},
    share:{expires_at:'2026-10-03T16:00:00+09:00',field_policy:{seq:true,name:true,submitted_at:true,status:true,party_size:true,phone:false,email:false}},
    participants:[{seq:1,name:'비공개 연락처 검증',submitted_at:'2026-09-19T14:00:00Z',status:'applied',party_size:1}]
  }),{status:200,headers:{'content-type':'application/json'}});
  try{
    const privateContacts=await spaceWorker.fetch(new Request(`https://ekodi.kr/ekodimission/share/${token}`),dataEnv);
    assert.equal(privateContacts.status,200);
    const privateBody=await privateContacts.text();
    assert.match(privateBody,/비공개 연락처 검증/);
    assert.doesNotMatch(privateBody,/<th scope="col">전화번호<\/th>|<th scope="col">이메일<\/th>/);
  }finally{globalThis.fetch=originalFetchPrivate}

  const originalFetch2=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:false}),{status:200,headers:{'content-type':'application/json'}});
  try{
    const missing=await spaceWorker.fetch(new Request(`https://ekodi.kr/ekodimission/share/${token}`),dataEnv);
    assert.equal(missing.status,404);
    assert.equal(missing.headers.get('x-ekodi-publication-status'),'private-share');
    assert.match(missing.headers.get('x-robots-tag')||'',/noindex/i);
  }finally{globalThis.fetch=originalFetch2}
});


// Regression guard: all public Mission surfaces, including Live, consume one shell contract.
test('every EKODI Mission page consumes one shared shell with published-only languages',async()=>{
  const pageFiles=[
    'ekodimission.page','ekodimission-activities.page','ekodimission-activity.page','ekodimission-open-table-apply.page','ekodimission-contact.page',
    'ekodimission-give.page','ekodimission-participate.page','ekodimission-partners.page','ekodimission-prayer.page',
    'ekodimission-stories.page','ekodimission-transparency.page','ekodimission-vision.page'
  ];
  for(const file of pageFiles){
    const source=await readFile(new URL('../space/'+file,import.meta.url),'utf8');
    assert.match(source,/<header class="mission-site-header">/,file);
    assert.match(source,/<nav aria-label="주요 메뉴" data-mission-nav><\/nav>/,file);
    assert.match(source,/\/ekodimission\/assets\/shell\.css/,file);
    assert.match(source,/\/ekodimission\/assets\/shell\.js/,file);
    assert.doesNotMatch(source,/<span>언어<\/span>/,file);
  }
  const [shell,featureScript]=await Promise.all([
    readFile(new URL('../space/ekodimission-shell.js',import.meta.url),'utf8'),
    readFile(new URL('../space/ekodimission.js',import.meta.url),'utf8')
  ]);
  assert.match(shell,/EKODI_MISSION_NAVIGATION_CONTRACT/);
  assert.match(shell,/version:3/);
  for(const href of ['/ekodimission/activities','/ekodimission/live','/ekodimission/participate','/ekodimission/partners','/ekodimission/stories'])assert.match(shell,new RegExp(href.replace(/\//g,'\\/')));
  assert.match(shell,/language-registry\.json/);
  assert.match(shell,/api\/i18n\/v1\/status\?service=mission/);
  assert.match(shell,/api\/i18n\/v1\/catalog\?service=mission/);
  assert.match(shell,/visibility:'published-only'/);
  assert.match(shell,/languages\.filter\(item=>published\.has\(item\.locale\)\)/);
  assert.doesNotMatch(shell,/option\.disabled=!published\.has/);
  assert.doesNotMatch(shell,/준비 중/);
  assert.match(shell,/select\.setAttribute\('aria-label','언어 선택'\)/);
  assert.match(shell,/nav\.replaceChildren/);
  assert.doesNotMatch(featureScript,/missionNavigationContract|language-registry\.json|data-mission-language-control/);
  const live=await spaceWorker.fetch(new Request('https://ekodi.kr/ekodimission/live'),env);
  assert.equal(live.status,200);
  const liveHtml=await live.text();
  assert.match(liveHtml,/<header class="mission-site-header">/);
  assert.match(liveHtml,/<nav aria-label="주요 메뉴" data-mission-nav><\/nav>/);
  assert.match(liveHtml,/\/ekodimission\/assets\/shell\.css/);
  assert.match(liveHtml,/\/ekodimission\/assets\/shell\.js/);
  assert.doesNotMatch(liveHtml,/class="live-header"/);
});

test('mission hero visuals are first-party SVG assets and pages render the complete artwork',async()=>{
  const [home,event,worker,homeSvg,eventSvg,css]=await Promise.all([
    readFile(new URL('../space/ekodimission.page',import.meta.url),'utf8'),
    readFile(new URL('../space/ekodimission-activity.page',import.meta.url),'utf8'),
    readFile(new URL('../space-worker.js',import.meta.url),'utf8'),
    readFile(new URL('../space/mission-table-hero.svg',import.meta.url),'utf8'),
    readFile(new URL('../space/open-table-hero-260926.svg',import.meta.url),'utf8'),
    readFile(new URL('../space/ekodimission.css',import.meta.url),'utf8')
  ]);
  assert.match(home,/mission-table-hero\.svg/);assert.match(event,/Chuseok Open Table & Sharing Market/);assert.doesNotMatch(event,/open-table-hero-260926\.svg/);
  assert.match(worker,/mission-table-hero\.svg/);assert.match(worker,/open-table-hero-260926\.svg/);
  assert.match(homeSvg,/<svg[\s\S]*한 식탁이/);assert.match(eventSvg,/<svg[\s\S]*2026 에코디 추석 열린식탁/);
  assert.match(css,/\.event-visual img\{[^}]*object-fit:contain/);assert.match(css,/\.hero-visual img\{[^}]*object-fit:cover/);
  for(const asset of ['/ekodimission/assets/mission-table-hero.svg','/ekodimission/assets/open-table-hero-260926.svg']){
    const response=await spaceWorker.fetch(new Request('https://ekodi.kr'+asset),env);assert.equal(response.status,200,asset);assert.match(response.headers.get('content-type')||'',/image\/svg\+xml/);
  }
});

test('canonical apex Mission pages and assets delegate to the Space service binding without internal operating-space chrome',async()=>{
  const calls=[];
  const platformEnv={SPACE:{fetch:async request=>{calls.push(new URL(request.url).pathname);return spaceWorker.fetch(request,env,{})}}};
  const root=await platformEntry.fetch(new Request('https://ekodi.kr/ekodimission'),platformEnv,{});
  assert.equal(root.status,200);
  assert.equal(root.headers.get('x-ekodi-workspace-gateway'),'space-service-binding');
  assert.equal(root.headers.get('x-ekodi-route'),'ekodimission-public');
  assert.equal(root.headers.get('x-ekodi-independent-site'),'true');
  assert.equal(root.headers.get('x-ekodi-operating-space-label'),null);
  const rootHtml=await root.text();
  assert.match(rootHtml,/EKODI MISSION/);
  assert.doesNotMatch(rootHtml,/data-ekodi-operating-space-label|>운영공간</);

  for(const path of ['/ekodimission/assets/shell.js','/ekodimission/assets/shell.css']){
    const response=await platformEntry.fetch(new Request('https://ekodi.kr'+path),platformEnv,{});
    assert.equal(response.status,200,path);
    assert.equal(response.headers.get('x-ekodi-workspace-gateway'),'space-service-binding',path);
    assert.equal(response.headers.get('x-ekodi-route'),'ekodimission-asset',path);
  }

  const beforeLive=calls.length;
  const live=await platformEntry.fetch(new Request('https://ekodi.kr/ekodimission/live'),platformEnv,{});
  assert.equal(live.status,200);
  assert.equal(calls.length,beforeLive,'Mission Live must remain owned by the shared realtime route');
  assert.ok(calls.includes('/ekodimission'));
  assert.ok(calls.includes('/ekodimission/assets/shell.js'));
  assert.ok(calls.includes('/ekodimission/assets/shell.css'));
});

test('platform router preserves tenant-branded independent sites without EKODI shell injection',async()=>{
  const source=await readFile(new URL('../platform-router-entry-worker.js',import.meta.url),'utf8');assert.match(source,/x-ekodi-independent-site/);assert.match(source,/independent-workspace-site/);
});

test('mission stays off the EKODI root catalog until homepage exposure is separately enabled',async()=>{
  const registry=JSON.parse(await readFile(new URL('../config/ecosystem-services.json',import.meta.url),'utf8'));const mission=registry.services.find(service=>service.id==='mission');assert.ok(mission);assert.equal(mission.url,'https://ekodi.kr/ekodimission');assert.equal(mission.homepage,false);assert.equal(mission.productionVerified,true);assert.equal(mission.status,'preparing');
});

test('mission production smoke covers every published subservice route',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../deploy/manifests/space.worker.json',import.meta.url),'utf8'));const urls=new Set(manifest.worker.requests.map(item=>item.url));for(const [path] of pageCases)assert.ok(urls.has(`https://ekodi.kr${path}`),path);const missionRequests=manifest.worker.requests.filter(item=>item.url.startsWith('https://ekodi.kr/ekodimission'));assert.ok(missionRequests.length>=pageCases.length);for(const item of missionRequests)assert.equal(item.rollbackVerify,false,item.url);
  const eventPage=await readFile(new URL('../space/ekodimission-open-table-apply.page',import.meta.url),'utf8');
  const eventProbe=manifest.worker.requests.find(item=>item.url==='https://ekodi.kr/ekodimission/apply/260926-open-table');
  assert.ok(eventProbe,'missing Open Table production probe');
  for(const marker of eventProbe.expect||[])assert.ok(eventPage.includes(marker),`Open Table probe marker drifted from page source: ${marker}`);
});

test('mission authentication and service registry use only the canonical ekodi.kr path',async()=>{
  const files=await Promise.all(['../auth-site/auth.js','../auth-site/client-auth.js','../auth-site/auth-workspace-target.js','../service-registry.json','../supabase/functions/access-api/index.ts'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));for(const source of files)assert.doesNotMatch(source,/mission\.ekodi\.kr/);for(const source of files.slice(0,4))assert.match(source,/ekodi\.kr\/ekodimission/);const access=files[4];assert.match(access,/mission:\["https:\/\/ekodi\.kr"\]/);assert.match(access,/site==="mission"[\s\S]*?\/ekodimission/);
});
