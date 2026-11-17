// EKODI Education · 참여자 화면 공유 (2026-11-16 redesign).
// Participants press "share" themselves; the browser captures the tab/window they pick and sends a still
// JPEG every 1–2 s over the room WebSocket. The instructor sees every sharing participant in a grid and can
// enlarge one. No WebRTC (STUN-only peer links failed across school Wi-Fi/LTE), no recording, no storage.
import {qrSvg} from '../engine/qr.js';
import {readToken,acceptAdminHandoff,adminLoginUrl,adminInstructorSession} from '../engine/admin-instructor.js';
const $=id=>document.getElementById(id);
const BASE='/edu/study/live/screen-share/api/rooms';
const params=new URLSearchParams(location.search);
const roomId=params.get('r')||'';
const invite=new URLSearchParams(location.hash.slice(1)).get('k')||params.get('k')||sessionStorage.getItem('screen-invite-'+roomId)||'';
const viewKey=new URLSearchParams(location.hash.slice(1)).get('v')||'';
const projector=/^[a-f0-9]{32}$/.test(roomId)&&/^[a-f0-9]{64}$/.test(viewKey);
const guest=!projector&&/^[a-f0-9]{32}$/.test(roomId)&&/^[a-f0-9]{64}$/.test(invite);
let closedByHost=false,room=null,ws=null,stream=null,timer=0,focused=false,side=guest?'student':'host',big='';
const tiles=new Map(); // host: id -> {name,sharing,src}
function say(message){const target=side==='host'?$('teacherStatus'):side==='projector'?$('pMeta'):$('learnerStatus');target.textContent=message;}
function send(value){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value));}

// ---------- host ----------
function renderGrid(){
 const grid=$('grid');grid.replaceChildren();
 const sharing=[...tiles.entries()].filter(([,t])=>t.sharing||t.src);
 $('sharingCount').textContent=String(sharing.length);
 if(!sharing.length){const e=document.createElement('div');e.className='empty';e.id='stageEmpty';e.textContent='참여자가 「내 실습 화면 공유 시작」을 누르면 이곳에 화면이 나타납니다.';grid.append(e);return;}
 for(const [id,t] of sharing){
  const b=document.createElement('button');b.type='button';b.className='tile';b.dataset.id=id;b.setAttribute('aria-label',t.name+' 화면 크게 보기');
  if(t.src){const img=document.createElement('img');img.alt=t.name+' 참여자 화면';img.src=t.src;b.append(img);}
  else{const w=document.createElement('div');w.className='wait';w.textContent='화면 받는 중…';b.append(w);}
  const n=document.createElement('span');n.textContent=t.name;b.append(n);
  b.addEventListener('click',()=>openBig(id));grid.append(b);
 }
}
function updateTileImage(id){
 const t=tiles.get(id);const tile=$('grid').querySelector('.tile[data-id="'+id+'"]');
 if(!tile){renderGrid();return;}
 let img=tile.querySelector('img');
 if(!img){tile.replaceChildren();img=document.createElement('img');img.alt=t.name+' 참여자 화면';const n=document.createElement('span');n.textContent=t.name;tile.append(img,n);}
 img.src=t.src;
}
function openBig(id){
 const t=tiles.get(id);if(!t)return;
 big=id;send({type:'focus',id});
 $('stage').hidden=false;$('grid').hidden=true;$('stageLabel').textContent=t.name+' 참여자 화면';
 if(t.src){$('remoteImage').src=t.src;$('remoteImage').hidden=false;}
 $('stopSelection').disabled=false;
}
function closeBig(){
 if(big)send({type:'unfocus'});
 big='';$('stage').hidden=true;$('grid').hidden=false;$('remoteImage').hidden=true;$('remoteImage').removeAttribute('src');
 $('stageLabel').textContent='공유 중인 참여자 화면';$('stopSelection').disabled=true;
}
function roster(list){
 $('rosterCount').textContent=String(list.length);
 const ids=new Set(list.map(p=>p.id));
 for(const id of [...tiles.keys()])if(!ids.has(id))tiles.delete(id);
 for(const p of list){const t=tiles.get(p.id)||{src:''};t.name=p.name;t.sharing=!!p.sharing||!!t.src;tiles.set(p.id,t);}
 const el=$('roster');el.replaceChildren();
 if(!list.length){const li=document.createElement('li');li.textContent='아직 접속한 참여자가 없습니다.';el.append(li);}
 for(const p of list){
  const t=tiles.get(p.id),li=document.createElement('li'),name=document.createElement('strong'),btn=document.createElement('button');
  name.textContent=p.name;
  if(t.sharing){const live=document.createElement('span');live.className='live';live.textContent='● 공유 중';name.append(live);}
  btn.type='button';btn.className='btn secondary';btn.textContent=t.sharing?'크게 보기':'공유 대기';btn.disabled=!t.sharing;
  btn.addEventListener('click',()=>openBig(p.id));
  li.append(name,btn);el.append(li);
 }
 if(big&&!ids.has(big))closeBig();
 renderGrid();
}
function hostMessage(m){
 if(m.type==='roster'){roster(m.participants||[]);return;}
 if(m.type==='frame'&&/^data:image\/(?:jpeg|png);base64,/.test(m.data||'')){
  const t=tiles.get(m.id)||{name:m.name||'참여자'};const fresh=!t.src;t.src=m.data;t.sharing=true;tiles.set(m.id,t);
  if(fresh)renderGrid();else updateTileImage(m.id);
  if(big===m.id){$('remoteImage').src=m.data;$('remoteImage').hidden=false;}
  return;
 }
 if(m.type==='status'){
  const t=tiles.get(m.id);
  if(m.status==='stopped'&&t){t.sharing=false;t.src='';if(big===m.id)closeBig();renderGrid();}
  say((m.name||'참여자')+': '+(m.status==='sharing'?'화면 공유를 시작했습니다.':m.status==='stopped'?'공유를 멈췄습니다.':m.status==='denied'?'공유를 허용하지 않았습니다.':'이 기기는 화면 공유를 지원하지 않아 캡처 이미지를 보낼 수 있습니다.'));
  return;
 }
 if(m.type==='left'){tiles.delete(m.id);if(big===m.id)closeBig();renderGrid();return;}
 if(m.type==='room_closed'){closeBig();tiles.clear();renderGrid();say('수업방이 종료됐습니다.');return;}
 if(m.type==='error')say('요청 처리 실패: '+m.code);
}

// ---------- projector (스크린 투사용, display only) ----------
const pFrames=new Map();let pShow='',pRetry=0;
function pRender(){
 const n=[...pFrames.values()].filter(t=>t.src).length;
 $('pMeta').textContent=pShow?'강사가 고른 화면':('공유 중 '+n+'명');
 if(pShow&&pFrames.get(pShow)?.src){
  const t=pFrames.get(pShow);$('pStage').hidden=false;$('pGrid').hidden=true;$('pImage').src=t.src;$('pName').textContent=t.name;$('pTitle').textContent=t.name+' 실습 화면';return;
 }
 $('pStage').hidden=true;$('pGrid').hidden=false;$('pTitle').textContent='참여자 실습 화면';
 const grid=$('pGrid');grid.replaceChildren();
 const list=[...pFrames.entries()].filter(([,t])=>t.src);
 if(!list.length){const e=document.createElement('div');e.className='proj-empty';e.textContent='참여자가 「내 실습 화면 공유 시작」을 누르면 이곳에 나타납니다.';grid.append(e);return;}
 for(const [id,t] of list){const f=document.createElement('figure');f.dataset.id=id;const img=document.createElement('img');img.alt=t.name+' 실습 화면';img.src=t.src;const c=document.createElement('figcaption');c.textContent=t.name;f.append(img,c);grid.append(f);}
}
function projectorMessage(m){
 if(m.type==='frame'&&/^data:image\/(?:jpeg|png);base64,/.test(m.data||'')){
  const t=pFrames.get(m.id)||{name:m.name||'참여자'};const fresh=!t.src;t.src=m.data;t.name=m.name||t.name;pFrames.set(m.id,t);
  if(pShow===m.id){$('pImage').src=m.data;if($('pStage').hidden)pRender();return;}
  if(!pShow){const img=$('pGrid').querySelector('figure[data-id="'+m.id+'"] img');if(img&&!fresh)img.src=m.data;else pRender();}
  return;
 }
 if(m.type==='show'){pShow=m.id;const t=pFrames.get(m.id)||{name:m.name||'참여자',src:''};t.name=m.name||t.name;pFrames.set(m.id,t);pRender();return;}
 if(m.type==='grid'){pShow='';pRender();return;}
 if(m.type==='status'&&m.status==='stopped'){pFrames.delete(m.id);if(pShow===m.id)pShow='';pRender();return;}
 if(m.type==='left'){pFrames.delete(m.id);if(pShow===m.id)pShow='';pRender();return;}
 if(m.type==='roster'){const ids=new Set((m.participants||[]).map(p=>p.id));for(const id of [...pFrames.keys()])if(!ids.has(id))pFrames.delete(id);pRender();return;}
 if(m.type==='room_closed'){pFrames.clear();pShow='';pRender();$('pMeta').textContent='수업방이 종료됐습니다.';return;}
 if(m.type==='replaced'){$('pMeta').textContent='다른 프로젝터 화면이 열려 이 화면은 닫혔습니다.';}
}
function connectProjector(){
 const url=new URL(`${BASE}/${roomId}/ws`,location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(url.toString(),['ekodi-screen-v1','view.'+viewKey]);
 ws.addEventListener('open',()=>{pRetry=0;$('pMeta').textContent='연결됨 · 공유 대기';});
 ws.addEventListener('message',e=>{let m;try{m=JSON.parse(e.data);}catch{return;}projectorMessage(m);});
 ws.addEventListener('close',ev=>{if(ev.code===4001||ev.code===4000)return;$('pMeta').textContent='연결이 끊겨 다시 연결 중…';setTimeout(connectProjector,Math.min(15000,1000*2**(pRetry++)));});
}
function projectorUrl(){return room?.id&&room?.hostKey?location.origin+location.pathname+'?r='+room.id+'#v='+room.hostKey:'';}

// ---------- participant ----------
function stopCapture(){clearTimeout(timer);timer=0;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}const v=$('captureVideo');v.srcObject=null;}
function encode(canvas){
 let quality=focused?.7:.6,src=canvas.toDataURL('image/jpeg',quality);
 while(src.length>300000&&quality>.3){quality-=.1;src=canvas.toDataURL('image/jpeg',quality);}
 return src.length>300000?'':src;
}
function captureLoop(){
 if(!stream)return;
 const v=$('captureVideo');
 if(v.videoWidth&&ws?.bufferedAmount<600000){
  const max=focused?1280:800,scale=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
  const c=document.createElement('canvas');c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);
  const ctx=c.getContext('2d');if(ctx){ctx.drawImage(v,0,0,c.width,c.height);const src=encode(c);if(src)send({type:'frame',data:src});}
 }
 timer=setTimeout(captureLoop,focused?700:1500);
}
async function share(){
 if(!guest||$('shareControls').hidden)return;
 if(typeof navigator.mediaDevices?.getDisplayMedia!=='function'){
  say('이 기기의 브라우저는 화면 공유를 지원하지 않습니다. 화면을 캡처해 아래에서 이미지를 보내 주세요.');
  send({type:'status',status:'unsupported'});return;
 }
 try{
  stopCapture();
  stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:5},audio:false});
  const track=stream.getVideoTracks()[0];if(!track)throw Error('video_track_missing');
  track.addEventListener('ended',()=>stop(true),{once:true});
  const v=$('captureVideo');v.srcObject=stream;await v.play().catch(()=>{});
  send({type:'status',status:'sharing'});say('내 화면을 강사에게 보여주는 중입니다 · 「공유 중지」로 언제든 끌 수 있습니다.');
  captureLoop();
 }catch{stopCapture();send({type:'status',status:'denied'});say('화면 공유가 허용되지 않았습니다. 다시 누르거나 캡처 이미지를 보낼 수 있습니다.');}
}
function stop(notify=true){stopCapture();if(notify)send({type:'status',status:'stopped'});if(guest)say('화면 공유를 멈췄습니다.');}
// Any phone/PC image is shrunk automatically (size and quality) until it fits the room message limit.
const SNAP_LIMIT=280000,SNAP_SIDES=[1600,1280,1024,800,640,480],SNAP_QUALITY=[.8,.65,.5,.4];
async function decodeImage(file){
 if(typeof createImageBitmap==='function'){try{return await createImageBitmap(file,{imageOrientation:'from-image'});}catch{}}
 const url=URL.createObjectURL(file);
 try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('image_decode_failed'));img.src=url;});}
 finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export function shrinkToDataUrl(bmp,canvasFactory=()=>document.createElement('canvas')){
 const w=bmp.width,h=bmp.height;
 for(const side of SNAP_SIDES){
  const scale=Math.min(1,side/Math.max(w,h)),c=canvasFactory();
  c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  const ctx=c.getContext('2d');if(!ctx)throw Error('canvas_unavailable');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bmp,0,0,c.width,c.height);
  for(const q of SNAP_QUALITY){const src=c.toDataURL('image/jpeg',q);if(src.length<=SNAP_LIMIT)return src;}
 }
 return '';
}
async function snapshot(){
 if($('shareControls').hidden)return;
 const file=$('snapshotFile').files?.[0];
 if(!file){say('보낼 이미지를 먼저 선택하세요.');return;}
 if(file.type&&!/^image\//.test(file.type)){say('이미지 파일(사진·캡처)을 선택하세요.');return;}
 if(file.size>40_000_000){say('40MB 이하 이미지를 선택하세요.');return;}
 say('이미지 크기를 자동으로 줄이는 중…');
 try{
  const bmp=await decodeImage(file);
  const src=shrinkToDataUrl(bmp);
  if(typeof bmp.close==='function')bmp.close();
  if(!src){say('이미지를 줄이지 못했습니다. 다른 캡처로 다시 시도하세요.');return;}
  send({type:'frame',data:src});
  say('강사 화면으로 보냈습니다 (원본 '+(file.size/1048576).toFixed(1)+'MB → '+Math.round(src.length*0.75/1024)+'KB로 자동 축소).');
 }catch{say('이 이미지 형식은 열 수 없습니다. 화면 캡처(PNG·JPG)로 다시 선택하세요.');}
}
function studentMessage(m){
 if(m.type==='focus'){focused=true;say('강사가 내 화면을 크게 보고 있습니다.');return;}
 if(m.type==='unfocus'){focused=false;return;}
 if(m.type==='stop'){stop(false);say(m.reason==='instructor'?'강사가 내 화면 공유를 멈췄습니다. 필요하면 다시 시작할 수 있습니다.':'강사 연결이 끊겨 공유를 멈췄습니다.');return;}
 if(m.type==='room_closed'){closedByHost=true;stop(false);$('shareControls').hidden=true;say('강사가 수업방을 종료했습니다.');return;}
}

// ---------- connection ----------
function connect(id,role,credential){
 const proto=role==='host'?'host.'+credential:'student.'+credential.id+'.'+credential.token;
 const url=new URL(`${BASE}/${id}/ws`,location.origin);
 url.protocol=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(url.toString(),['ekodi-screen-v1',proto]);
 ws.addEventListener('open',()=>{
  if(role==='host')say('수업방 연결됨 · 참여자 QR을 보여주세요.');
  else{$('shareControls').hidden=false;say('수업에 연결됐습니다. 「내 실습 화면 공유 시작」을 누르면 강사에게 보입니다.');}
 });
 ws.addEventListener('close',()=>{if(role==='student'){stopCapture();$('shareControls').hidden=true;}if(!closedByHost)say('연결이 끊어졌습니다. 다시 접속하거나 수업방을 새로 만드세요.');});
 ws.addEventListener('message',event=>{let m;try{m=JSON.parse(event.data);}catch{return;}(role==='host'?hostMessage:studentMessage)(m);});
}
// Instructor status: the HttpOnly instructor cookie (12h) is what the room API accepts. A central admin login
// token in this tab is exchanged for it; an expired token is dropped so the button says to log in again.
async function instructorReady(){
 try{const r=await fetch('../unlock/session',{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(d.instructor)return true;}catch{}
 if(readToken(window)){const r=await adminInstructorSession(window);if(r.ok)return true;}
 return false;
}
async function refreshLogin(){
 const ok=await instructorReady();
 $('login').textContent=ok?'강사 로그인됨':'강사 로그인';
 $('login').classList.toggle('primary',!ok);
 if(!ok)say('먼저 「강사 로그인」을 눌러 로그인하세요. 로그인하면 이 화면으로 돌아옵니다.');
 return ok;
}
async function create(){
 if(!await instructorReady()){say('강사 로그인이 만료됐습니다. 로그인 화면으로 이동합니다…');const u=adminLoginUrl(window);if(u)setTimeout(()=>{location.href=u;},900);return;}
 const access=readToken(window);
 $('createRoom').disabled=true;
 try{
  const r=await fetch(BASE,{method:'POST',headers:access?{authorization:'Bearer '+access}:{},credentials:'same-origin'});
  const data=await r.json();
  if(r.status===401){say('강사 로그인이 만료됐습니다. 로그인 화면으로 이동합니다…');const u=adminLoginUrl(window);if(u)setTimeout(()=>{location.href=u;},900);return;}
  if(!r.ok)throw Error(data.code||'create_failed');
  room=data;
  $('invitePanel').hidden=false;$('inviteLink').value=data.joinUrl;
  $('qr').innerHTML=qrSvg(data.joinUrl,{label:'참여자 QR 접속'});
  $('endRoom').disabled=false;
  connect(data.id,'host',data.hostKey);
 }catch(e){say('수업방을 만들지 못했습니다: '+e.message);}finally{$('createRoom').disabled=false;}
}
async function join(){
 if(!guest)return;
 const name=$('displayName').value.trim();
 if(name.length<2){say('이름을 두 글자 이상 입력하세요.');return;}
 $('joinRoom').disabled=true;
 try{
  const r=await fetch(`${BASE}/${roomId}/join`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({joinKey:invite,name}),credentials:'same-origin'});
  const data=await r.json();
  if(!r.ok)throw Error(data.code||'join_failed');
  room=data;
  connect(roomId,'student',{id:data.id,token:data.token});
  say('참여가 승인됐습니다. 연결 중…');
 }catch(e){say('수업 참가 실패: '+e.message);$('joinRoom').disabled=false;}
}
function init(){
 acceptAdminHandoff(window);
 if(projector){
  side='projector';document.body.classList.add('is-projector');$('teacher').hidden=true;$('learner').hidden=true;$('projector').hidden=false;
  history.replaceState(null,'',location.pathname+'?r='+roomId+'#v='+viewKey);
  $('pFull').addEventListener('click',()=>$('projector').requestFullscreen?.().catch(()=>{}));
  pRender();connectProjector();return;
 }
 if(guest){
  side='student';$('teacher').hidden=true;$('learner').hidden=false;
  sessionStorage.setItem('screen-invite-'+roomId,invite);
  history.replaceState(null,'',location.pathname+'?r='+roomId);
  $('joinRoom').addEventListener('click',join);
  $('startShare').addEventListener('click',share);
  $('stopShare').addEventListener('click',()=>stop(true));
  $('sendSnapshot').addEventListener('click',snapshot);
  $('snapshotFile').addEventListener('change',()=>{if($('snapshotFile').files?.[0])snapshot();});
 }else{
  $('learner').hidden=true;
  const login=adminLoginUrl(window);$('login').href=login||'../unlock/';
  refreshLogin();
  $('createRoom').addEventListener('click',create);
  $('createRoom').textContent='새 수업방 만들기 (4시간) · QR 표시';
  $('copyInvite').addEventListener('click',()=>navigator.clipboard?.writeText($('inviteLink').value).then(()=>say('QR 주소를 복사했습니다.')).catch(()=>say('주소를 직접 복사해 주세요.')));
  $('stopSelection').addEventListener('click',closeBig);
  $('openProjector').addEventListener('click',()=>{const u=projectorUrl();if(u)window.open(u,'ekodi-projector','noopener');});
  $('copyProjector').addEventListener('click',()=>{const u=projectorUrl();if(u)navigator.clipboard?.writeText(u).then(()=>say('프로젝터 주소를 복사했습니다. 스크린에 연결된 컴퓨터에서 여세요.')).catch(()=>say('주소 복사가 막혔습니다. 「이 컴퓨터에서 프로젝터 화면 열기」를 쓰세요.'));});
  $('closeStage').addEventListener('click',closeBig);
  $('endRoom').addEventListener('click',()=>{send({type:'end'});closeBig();tiles.clear();renderGrid();$('invitePanel').hidden=true;$('endRoom').disabled=true;say('수업방을 종료했습니다.');});
  $('fullScreen').addEventListener('click',()=>{const el=big?$('stage'):$('grid');el.requestFullscreen?.().catch(()=>{});});
 }
 window.addEventListener('pagehide',()=>{stopCapture();ws?.close();});
}
init();
