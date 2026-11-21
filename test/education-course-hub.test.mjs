import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {courseHubRouter,isEducationHubPath,EDUCATION_HUB_ACCESS} from '../education/course-hub/router.js';
globalThis.crypto??=webcrypto;
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const key='h'.repeat(64);
const root='https://ekodi.kr';
const origin={origin:root};
const registry=new Map();
function fakeR2(){
 return {
  async get(k){return registry.has(k)?{text:async()=>registry.get(k)}:null;},
  async put(k,v){registry.set(k,String(v));}
 };
}
async function environment(){
 const raw=await read('education/courses/catalog.json');
 return {
  EDU_GATE_SIGNING_KEY:key,
  EDU_DOCS:fakeR2(),
  CONTROL_API:{fetch:async req=>{
   const token=String(req.headers.get('authorization')||'');
   return token==='Bearer admin-test-token-very-long'?Response.json({authenticated:true,role:'super_admin',email:'admin@example.org'}):new Response('',{status:401});
  }},
  ASSETS:{fetch:async req=>{
   const path=new URL(req.url).pathname;
   if(path==='/courses/catalog.json')return new Response(raw,{headers:{'content-type':'application/json'}});
   if(path==='/course-hub/index.html')return new Response('<html><body>Hub UI</body></html>',{headers:{'content-type':'text/html'}});
   if(path==='/course-hub/signin.html')return new Response('<html><body>Verified instructor sign-in</body></html>',{headers:{'content-type':'text/html'}});
   return new Response('not found',{status:404});
  }}
 };
}
const req=(path,options={})=>new Request(root+path,options);
const call=(path,env,options={})=>courseHubRouter(req(path,options),env);
async function admin(env){
 const r=await call('/teach/access',env,{method:'POST',headers:{...origin,authorization:'Bearer admin-test-token-very-long','content-type':'application/json'},body:'{}'});
 assert.equal(r.status,200);return r.headers.get('set-cookie')?.split(';')[0];
}
test('single source registry provides unique canonical course IDs and no copied content',async()=>{
 const cat=JSON.parse(await read('education/courses/catalog.json'));
 assert.equal(cat.schemaVersion,2);
 assert.ok(cat.courses.length>=6,'preserve the baseline catalog while allowing new courses');
 assert.equal(new Set(cat.courses.map(x=>x.id)).size,cat.courses.length);
 for(const c of cat.courses){
  assert.ok(c.title&&c.summary&&c.syllabus?.length>0&&c.studyUrl);
  assert.ok(c.fields.every(id=>cat.fields.some(f=>f.id===id)));
  assert.ok(c.audiences.every(id=>cat.audiences.some(a=>a.id===id)));
  assert.ok(!('slidesHtml' in c),'source material stays in the owning course');
 }
 assert.equal(cat.courses.filter(c=>c.id==='foreign-worker-cold-safety-2026').length,1);
 const [home,study,worker,ui,learner]=await Promise.all([read('education/index.html'),read('education/study/index.html'),read('education-worker.js'),read('education/course-hub/index.html'),read('education/course-hub/hub.js')]);
 assert.match(home,/href="\/edu\/courses\/"/);
 assert.match(study,/href="\/edu\/teach\/"/);
 assert.match(study,/href="\/edu\/learn\/"/);
 assert.match(worker,/courseHubRouter/);
 assert.match(ui,/hubMain/);
 assert.match(learner,/teacherPublish/);
 assert.match(learner,/12,?000|12000/);
 assert.doesNotMatch(ui,/<script(?![^>]*src=)|\sonclick=/);
});
test('field/audience and role-specific subroutes share the same hub safely',async()=>{
 for(const route of ['/courses/','/courses/mnu-factchat-2026/','/fields/ai-digital/','/audiences/foreign-workers/','/learn/','/learn/foreign-worker-cold-safety-2026/','/teach/','/teach/farm-marketing-2026/'])
  assert.equal(isEducationHubPath(route),true,route);
 for(const route of ['/teach/access','/teach/live-state','/courses/catalog.json','/study/live/','/course-hub/auth.js','/fields/../../../admin'])
  assert.equal(isEducationHubPath(route),false,route);
 const env=await environment();
 assert.equal((await call('/courses/',env)).status,200);
 assert.equal((await call('/fields/safety/',env)).status,200);
 assert.equal((await call('/learn/foreign-worker-cold-safety-2026/',env)).status,200);
 assert.equal((await call('/teach/',env)).status,401,'unauthorized teacher page stays closed');
 assert.equal(EDUCATION_HUB_ACCESS.cookie,'ekodi_edu_teacher_v1');
});
test('only a server-verified super admin can issue instructor session, never a shared password',async()=>{
 const env=await environment();
 assert.equal((await call('/teach/access',env,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403,'missing Origin');
 assert.equal((await call('/teach/access',env,{method:'POST',headers:{...origin,'content-type':'application/json'},body:JSON.stringify({password:'correct'})})).status,403,'shared password cannot enter');
 const cookie=await admin(env);
 assert.match(cookie,/ekodi_edu_teacher_v1=v1\./);
 assert.equal((await call('/teach/',env,{headers:{cookie}})).status,200);
 const status=await call('/teach/status',env,{headers:{cookie}});
 assert.equal((await status.json()).role,'super_admin');
 assert.match((await call('/teach/',env,{headers:{cookie}})).headers.get('cache-control'),/no-store/);
 const out=await call('/teach/logout',env,{method:'POST',headers:{...origin,cookie}});
 assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
 const parts=cookie.split('.');
 const signature=parts.pop();
 assert.match(signature,/^[A-Za-z0-9_-]+$/);
 parts.push((signature[0]==='A'?'B':'A')+signature.slice(1));
 const tamper=parts.join('.');
 assert.notEqual(tamper,cookie,'tampering must change actual HMAC signature bytes');
 assert.equal((await call('/teach/',env,{headers:{cookie:tamper}})).status,401,'modified cookie');
});
test('only fresh central super-admin bearer can register or revoke verified instructor emails',async()=>{
 registry.clear();const env=await environment(),cookie=await admin(env);
 assert.equal((await call('/teach/instructors',env)).status,403);
 assert.equal((await call('/teach/instructors',env,{method:'POST',headers:{...origin,cookie,'content-type':'application/json'},body:JSON.stringify({email:'allowed@example.org',action:'add'})})).status,403,'teacher cookie alone not administrative authority');
 assert.equal((await call('/teach/instructors',env,{method:'POST',headers:{authorization:'Bearer admin-test-token-very-long','content-type':'application/json'},body:JSON.stringify({email:'allowed@example.org',action:'add'})})).status,403,'missing Origin');
 const options={method:'POST',headers:{...origin,authorization:'Bearer admin-test-token-very-long','content-type':'application/json'}};
 let r=await call('/teach/instructors',env,{...options,body:JSON.stringify({email:'Allowed@Example.org',action:'add'})});
 assert.equal(r.status,200);
 let result=await r.json();assert.deepEqual(result.emails,['allowed@example.org']);
 const get=await call('/teach/instructors',env,{headers:{authorization:'Bearer admin-test-token-very-long'}});
 assert.deepEqual((await get.json()).emails,['allowed@example.org']);
 // Identity API is authoritative; a forged browser email is never a role.
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).includes('identity-api/identities'))return Response.json({person:{verifiedEmails:['allowed@example.org']}});
  throw Error('unexpected external fetch');
 };
 try{
  r=await call('/teach/access',env,{method:'POST',headers:{...origin,'content-type':'application/json'},body:JSON.stringify({accessToken:'valid-identity-access-token'})});
  assert.equal(r.status,200);
  const assignedCookie=r.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/teach/',env,{headers:{cookie:assignedCookie}})).status,200);
  await call('/teach/instructors',env,{...options,body:JSON.stringify({email:'allowed@example.org',action:'remove'})});
  assert.equal((await call('/teach/',env,{headers:{cookie:assignedCookie}})).status,401,'email revocation takes effect immediately');
 }finally{globalThis.fetch=original;}
});
test('instructor controls shared public presentation steps; student requests never write',async()=>{
 registry.clear();const env=await environment();
 const id='foreign-worker-cold-safety-2026',course='/learn/'+id+'/';
 const cookie=await admin(env);
 let r=await call('/courses/live-state?id='+id,env);
 assert.equal((await r.json()).state.live,false);
 const payload={courseId:id,step:2,live:true,notice:'현장 안전을 먼저 확인하세요.'};
 const opts={method:'PUT',headers:{...origin,'content-type':'application/json'},body:JSON.stringify(payload)};
 assert.equal((await call('/teach/live-state',env,opts)).status,403);
 r=await call('/teach/live-state',env,{...opts,headers:{...opts.headers,cookie}});
 assert.equal(r.status,200);
 r=await call('/courses/live-state?id='+id,env);
 const state=(await r.json()).state;
 assert.equal(state.step,2);assert.equal(state.live,true);assert.match(state.notice,/현장 안전/);
 assert.equal((await call(course,env)).status,200);
 const unknown=await call('/courses/live-state?id=not-registered',env);
 assert.equal(unknown.status,404);
 const invalid=await call('/teach/live-state',env,{...opts,headers:{...opts.headers,cookie},body:JSON.stringify({courseId:id,step:-1,live:true,notice:'x'})});
 assert.equal(invalid.status,400);
 const outOfScope=await call('/teach/live-state',env,{...opts,headers:{...opts.headers,cookie},body:JSON.stringify({courseId:'../../../admin',step:1})});
 assert.equal(outOfScope.status,404);
});
test('no user data, credentials or administrative authority is exposed by student script',async()=>{
 const [page,script,style,login]=await Promise.all([
  read('education/course-hub/index.html'),read('education/course-hub/hub.js'),
  read('education/course-hub/hub.css'),read('education/course-hub/signin.html')
 ]);
 assert.match(page,/hub\.js/);assert.match(page,/hub\.css/);
 assert.match(script,/localStorage\.setItem\(key/);
 assert.match(script,/localStorage\.removeItem\(key/);
 assert.match(script,/navigator\.clipboard/);
 assert.match(script,/status==='|section==='learn'/);
 assert.doesNotMatch(script,/service_role|SUPABASE_SERVICE_ROLE_KEY|API_SECRET/i);
 assert.match(login,/최고관리자/);assert.doesNotMatch(login,/name="password"/);
 for(const width of ['760px','460px'])assert.ok(style.includes(width));
});

test('anonymous course catalog exposes learning content but not instructor or owner document metadata',async()=>{
 const env=await environment();
 const response=await call('/courses/catalog.json',env);
 assert.equal(response.status,200);
 assert.match(response.headers.get('cache-control'),/no-store/);
 const text=await response.text();
 const data=JSON.parse(text);
 assert.ok(data.courses.length>=6,'allow new approved courses');
 assert.equal(new Set(data.courses.map(c=>c.id)).size,6);
 for(const key of ['googleSlidesId','presentationUrl','editUrl','sourceUrl','ownerFolderUrl',
   'sourceFilename','sourceAccess','teacherTool','reviewFlags','registeredAt','taskId']){
  assert.ok(!text.includes('"'+key+'"'),'owner-only field '+key+' must not be public');
 }
 assert.ok(!text.includes('18sPXSmL_V7E5NPpcjMhurR_tg6zAnep6ds-F5RgDie4'));
 assert.ok(!text.includes('1J2eNNFjKu-C50WN_Ta950jxtzTswVyCo'));
 const safety=data.courses.find(c=>c.id==='foreign-worker-cold-safety-2026');
 assert.equal(safety.title,'외국인 근로자 한랭질환 예방 안전보건교육');
 assert.equal(safety.studyUrl,'/edu/study/cold-safety-2026/');
 assert.ok(safety.syllabus.length>0);
 const fact=data.courses.find(c=>c.id==='mnu-factchat-2026');
 assert.ok(fact.resources.some(r=>r.url.startsWith('/edu/study/live/')));
 assert.ok(!fact.resources.some(r=>r.url.startsWith('https://')));
 const head=await call('/courses/catalog.json',env,{method:'HEAD'});
 assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('full source/teacher materials require verified signed instructor or super-admin session',async()=>{
 registry.clear();
 const env=await environment();
 for(const path of ['/teach/catalog.json']){
  for(const opts of [{},{headers:{authorization:'Bearer admin-test-token-very-long'}},{method:'HEAD'}]){
   const res=await call(path,env,opts);assert.equal(res.status,403,'no privileged cookie');
   const data=await res.json();assert.equal(data.code,'teacher_access_denied');
   assert.equal(JSON.stringify(data).includes('googleSlidesId'),false);
  }
 }
 const cookie=await admin(env);
 const r=await call('/teach/catalog.json',env,{headers:{cookie}});
 assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
 const data=await r.json();
 const safety=data.courses.find(c=>c.id==='foreign-worker-cold-safety-2026');
 assert.ok(safety.editUrl.startsWith('https://docs.google.com/presentation/d/'));
 assert.ok(safety.sourceUrl.startsWith('https://drive.google.com/file/d/'));
 assert.ok(safety.ownerFolderUrl.startsWith('https://drive.google.com/drive/folders/'));
 assert.equal(safety.reviewFlags.length,4);
 const fact=data.courses.find(c=>c.id==='mnu-factchat-2026');
 assert.ok(fact.teacherTool.includes('/study/live/'));
 const head=await call('/teach/catalog.json',env,{method:'HEAD',headers:{cookie}});
 assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('new private metadata and nonlocal resource URLs are excluded by an allowlisted public serializer',async()=>{
 const env=await environment(), original=env.ASSETS.fetch;
 env.ASSETS.fetch=async request=>{
  const r=await original(request);
  if(new URL(request.url).pathname!=='/courses/catalog.json')return r;
  const obj=await r.json();
  obj.courses[0].credential='forbidden-canary';
  obj.courses[0].adminNote='not-public';
  obj.courses[0].resources=[
   {label:'Private Slides',url:'https://drive.google.com/file/d/owner-only/view'},
   {label:'External Link',url:'//other.example/bad'},
   {label:'Safe Learner',url:'/edu/study/cold-safety-2026/'}
  ];
  return Response.json(obj);
 };
 const publicResponse=await call('/courses/catalog.json',env);
 const data=await publicResponse.json(),course=data.courses[0];
 assert.equal('credential' in course,false);
 assert.equal('adminNote' in course,false);
 assert.deepEqual(course.resources,[{label:'Safe Learner',url:'/edu/study/cold-safety-2026/'}]);
});
