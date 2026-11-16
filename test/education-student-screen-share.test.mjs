import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EducationScreenRoom,ROOM_TTL_MS,MAX_LEARNERS} from '../education-screen-room.js';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const key=x=>x.repeat(64);
function createContext(){
 const map=new Map(),sockets=[];
 return {
  map,sockets,
  storage:{
   get:async k=>map.get(k),
   put:async(k,v)=>{map.set(k,v)},
   delete:async k=>{map.delete(k)},
   list:async({prefix})=>new Map([...map].filter(([k])=>k.startsWith(prefix))),
   setAlarm:async at=>{map.set('__alarm__',at)},
   deleteAll:async()=>{map.clear()}
  },
  getWebSockets:()=>sockets
 };
}
const post=(path,data)=>new Request('https://room'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
function fake(role,id,name=''){
 const messages=[];return {messages,deserializeAttachment:()=>({role,id,name}),send:x=>messages.push(JSON.parse(x)),close:()=>{}};
}
test('QR room creates expiring, capability-scoped learner slots and never returns host secret to learners',async()=>{
 const ctx=createContext(),room=new EducationScreenRoom(ctx,{});
 const initialized=await room.fetch(post('/init',{id:'a'.repeat(32),hostKey:key('a'),joinKey:key('b'),createdAt:Date.now()}));
 assert.equal(initialized.status,200);
 const conf=ctx.map.get('config');
 assert.equal(conf.hostHash.length,64);
 assert.equal(conf.joinHash.length,64);
 assert.equal('hostKey' in conf,false);
 assert.equal('joinKey' in conf,false);
 assert.ok(conf.expiresAt-conf.createdAt===ROOM_TTL_MS);
 assert.equal(ctx.map.get('__alarm__'),conf.expiresAt,'room data must be erased automatically after expiration');
 assert.equal((await room.fetch(post('/init',{id:'a'.repeat(32),hostKey:key('a'),joinKey:key('b'),createdAt:Date.now()}))).status,409);
 assert.equal((await room.fetch(post('/join',{joinKey:key('c'),name:'수강생'}))).status,403);
 assert.equal((await room.fetch(post('/join',{joinKey:key('b'),name:'X'}))).status,400);
 const joined=await room.fetch(post('/join',{joinKey:key('b'),name:'김농부'}));
 assert.equal(joined.status,200);
 const data=await joined.json();
 assert.equal(data.ok,true);assert.equal(data.name,'김농부');
 assert.match(data.id,/^[a-f0-9]{32}$/);assert.match(data.token,/^[a-f0-9]{64}$/);
 assert.equal('hostKey' in data,false);
 for(let i=1;i<MAX_LEARNERS;i++)assert.equal((await room.fetch(post('/join',{joinKey:key('b'),name:'수강생'+i}))).status,200);
 assert.equal((await room.fetch(post('/join',{joinKey:key('b'),name:'초과'}))).status,429);
 conf.expiresAt=Date.now()-1;ctx.map.set('config',conf);
 assert.equal((await room.fetch(post('/join',{joinKey:key('b'),name:'지각생'}))).status,410);
});
test('participants share only by their own action; frames go to the instructor only, rate-limited, never between participants',async()=>{
 const ctx=createContext(),room=new EducationScreenRoom(ctx,{});
 await room.fetch(post('/init',{id:'b'.repeat(32),hostKey:key('a'),joinKey:key('b'),createdAt:Date.now()}));
 const a=await (await room.fetch(post('/join',{joinKey:key('b'),name:'참여자A'}))).json();
 const b=await (await room.fetch(post('/join',{joinKey:key('b'),name:'참여자B'}))).json();
 const host=fake('host','host'),personA=fake('student',a.id,'참여자A'),personB=fake('student',b.id,'참여자B');
 ctx.sockets.push(host,personA,personB);
 await room.webSocketMessage(personB,JSON.stringify({type:'focus',id:b.id}));
 assert.equal(ctx.map.get('selected'),undefined,'participant cannot promote themselves');
 const frame='data:image/jpeg;base64,AA==';
 await room.webSocketMessage(personA,JSON.stringify({type:'frame',data:frame}));
 assert.equal(host.messages.at(-1).type,'frame');assert.equal(host.messages.at(-1).id,a.id);assert.equal(host.messages.at(-1).name,'참여자A');
 assert.ok(!personB.messages.some(m=>m.type==='frame'),'frames never reach other participants');
 const count=host.messages.filter(m=>m.type==='frame').length;
 await room.webSocketMessage(personA,JSON.stringify({type:'frame',data:frame}));
 assert.equal(host.messages.filter(m=>m.type==='frame').length,count,'per-participant rate limit');
 await room.webSocketMessage(personB,JSON.stringify({type:'frame',data:'javascript:alert(1)'}));
 assert.ok(!host.messages.some(m=>m.type==='frame'&&m.id===b.id),'only image data URLs are relayed');
 const roster=host.messages.filter(m=>m.type==='roster').at(-1);
 assert.equal(roster.participants.find(p=>p.id===a.id).sharing,true);
 await room.webSocketMessage(host,JSON.stringify({type:'focus',id:a.id}));
 assert.equal(ctx.map.get('selected'),a.id);assert.equal(personA.messages.at(-1).type,'focus');
 await room.webSocketMessage(host,JSON.stringify({type:'focus',id:b.id}));
 assert.equal(personA.messages.at(-1).type,'unfocus','switching focus tells the previous participant');
 await room.webSocketMessage(host,JSON.stringify({type:'stop',id:b.id}));
 assert.equal(personB.messages.at(-1).type,'stop','instructor can stop a participant share');
 await room.webSocketMessage(host,JSON.stringify({type:'end'}));
 assert.equal(ctx.map.get('config').ended,true);
 assert.equal(host.messages.at(-1).type,'room_closed');
 assert.equal(personA.messages.at(-1).type,'room_closed');
 // A disconnected instructor stops every participant capture.
 const ctx2=createContext(),room2=new EducationScreenRoom(ctx2,{});
 await room2.fetch(post('/init',{id:'d'.repeat(32),hostKey:key('a'),joinKey:key('b'),createdAt:Date.now()}));
 const joined=await (await room2.fetch(post('/join',{joinKey:key('b'),name:'참여자C'}))).json();
 const h2=fake('host','host'),c2=fake('student',joined.id,'참여자C');
 ctx2.sockets.push(h2,c2);
 await room2.webSocketMessage(h2,JSON.stringify({type:'focus',id:joined.id}));
 await room2.webSocketClose(h2);
 assert.equal(ctx2.map.get('selected'),undefined);
 assert.equal(c2.messages.at(-1).type,'stop','host disappearance must stop participant capture');
});
test('Education QR sharing pages and gateway respect consent and no-unapproved-host authority',async()=>{
 const [worker,api,html,client,css,prod,stage,studio]=await Promise.all([
  read('education-worker.js'),read('education-screen-share-api.js'),
  read('education/study/live/screen-share/index.html'),
  read('education/study/live/screen-share/screen-share.js'),
  read('education/study/live/screen-share/screen-share.css'),
  read('wrangler.education.toml'),read('wrangler.education.staging.toml'),
  read('education/study/live/index.html')
 ]);
 assert.match(worker,/educationScreenApi\(request,env/);
 assert.match(worker,/EducationScreenRoom/);
 assert.match(api,/ekodiInstructor\(token,env\)/);
 assert.match(api,/origin_forbidden/);
 assert.match(api,/#k='/,'QR join secret must remain in a URL fragment, not the network-visible query');
 assert.ok(!api.includes("'&k='"),'do not leak join invitation into HTTP request URL');
 assert.match(client,/location\.hash\.slice\(1\)/,'browser consumes private QR fragment');
 assert.match(client,/history\.replaceState/,'private QR fragment removed after reading');
 assert.match(api,/instructor_login_required/);
 assert.match(api,/EDU_SCREEN_SHARE_ENABLED!=='true'/);
 assert.match(api,/new Request\('https:\/\/room\/init'/);
 assert.match(html,/강사가 참여자를 선택해도 화면은 자동 전송되지 않습니다/);assert.match(html,/id="grid"/);
 assert.match(html,/id="roster"/);assert.match(html,/id="qr"/);
 assert.match(client,/getDisplayMedia/);
 assert.match(client,/navigator\.mediaDevices\?\.getDisplayMedia/);
 assert.match(client,/toDataURL\('image\/jpeg'/);
 assert.match(client,/type:'frame'/);assert.match(client,/bufferedAmount<600000/,'backpressure on slow networks');
 assert.match(client,/send\(\{type:'focus'/);
 assert.match(client,/stream\.getTracks\(\)\.forEach\(t=>t\.stop\(\)\)/);
 assert.match(css,/@media\(max-width:390px\)/);
 for(const manifest of [prod,stage]){
  assert.match(manifest,/EDU_SCREEN_ROOMS/);
  assert.match(manifest,/new_sqlite_classes = \["EducationScreenRoom"\]/);
 }
 assert.match(prod,/EDU_SCREEN_SHARE_ENABLED = "true"/);
 assert.match(stage,/EDU_SCREEN_SHARE_ENABLED = "false"/);
 assert.match(studio,/screen-share\/">참여자 QR 화면 공유/);
 assert.doesNotMatch(client,/MediaRecorder|startRecording|captureStream|autoStartScreenShare|eval\(/);
});


test('canonical /edu service binding preserves native websocket handshake without reconstructing 101',async()=>{
 const {routeCanonicalSurface}=await import('../canonical-surface-router.js');
 const nativeUpgrade={status:101,webSocket:{id:'accepted'},headers:new Headers()};
 const id='a'.repeat(32);let upstream=null;
 const req=new Request('https://ekodi.kr/edu/study/live/screen-share/api/rooms/'+id+'/ws',{
  headers:{upgrade:'websocket','sec-websocket-protocol':'ekodi-screen-v1, host.'+'a'.repeat(64)}
 });
 const actual=await routeCanonicalSurface(req,{
  EDUCATION:{fetch:async request=>{upstream=request;return nativeUpgrade;}}
 });
 assert.equal(actual,nativeUpgrade,'websocket 101 must preserve attached Cloudflare native socket');
 assert.equal(new URL(upstream.url).pathname,'/study/live/screen-share/api/rooms/'+id+'/ws');
 assert.equal(upstream.headers.get('upgrade'),'websocket');
 const canonical=await read('canonical-surface-router.js');
 assert.match(canonical,/if\(response\.status===101&&response\.webSocket\)return response/);
});

// 2026-10-31: `wrangler versions upload` cannot apply Durable Object migrations, so every guarded
// production release failed after EducationScreenRoom was added. A pending additive migration is
// applied once with deploy; non-additive migrations are refused for an explicit operator release.
test('production release applies a pending additive DO migration once, then stays guarded',async()=>{
  const {readFile}=await import('node:fs/promises');
  const wf=await readFile(new URL('../.github/workflows/deploy-education.yml',import.meta.url),'utf8');
  const step=wf.slice(wf.indexOf('- name: Bootstrap or guarded release'));
  assert.match(step,/migration_tag/);
  assert.match(step,/if \[ -n "\$wanted_tag" \] && \[ "\$live_tag" != "\$wanted_tag" \]/);
  assert.match(step,/renamed_classes\|deleted_classes\|transferred_classes/);
  assert.match(step,/node scripts\/guarded-worker-release\.mjs --manifest deploy\/manifests\/education\.worker\.json/);
});

// 2026-10-31: the shared EKODI sign-in chip joins the studio app bar through its collapsible menu, so the
// phone-width studio bar stays one row (production native check: ≤72px; it measured 92px with the chip inline).
test('studio app bar offers the sign-in chip a place inside the collapsible controls',async()=>{
  const {readFile}=await import('node:fs/promises');
  const html=await readFile(new URL('../education/study/live/index.html',import.meta.url),'utf8');
  assert.match(html,/<div class="top-controls" id="topControls" data-ekodi-header-actions>/);
  const auth=await readFile(new URL('../shell/unified-user-auth.js',import.meta.url),'utf8');
  assert.match(auth,/header\.querySelector\('\[data-ekodi-header-actions\]/);
});
