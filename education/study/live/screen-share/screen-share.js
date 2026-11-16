import {qrSvg} from '../engine/qr.js';
import {readToken,acceptAdminHandoff} from '../engine/admin-instructor.js';
const $=id=>document.getElementById(id);
const BASE='/edu/study/live/screen-share/api/rooms';
const params=new URLSearchParams(location.search);
const roomId=params.get('r')||'';
const invite=new URLSearchParams(location.hash.slice(1)).get('k')||params.get('k')||sessionStorage.getItem('screen-invite-'+roomId)||'';
const guest=/^[a-f0-9]{32}$/.test(roomId)&&/^[a-f0-9]{64}$/.test(invite);
let room=null,ws=null,pc=null,stream=null,selected='',side=guest?'student':'host';
const peers=new Map(),cards=new Map(),pendingIce=new Map();
let activeIds=[];
const ice=[{urls:'stun:stun.cloudflare.com:3478'}];
function say(message){const target=side==='host'?$('teacherStatus'):$('learnerStatus');target.textContent=message;}
function send(value){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value));}
function removeCard(id){
 const peer=peers.get(id);if(peer){peer.close();peers.delete(id);}
 pendingIce.delete(id);
 const card=cards.get(id);if(card){card.remove();cards.delete(id);}
 if(side==='host')$('stageEmpty').hidden=cards.size>0;
}
function resetMedia(){
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
 if(pc){pc.close();pc=null;}
 pendingIce.delete('student');
 for(const id of [...cards.keys()])removeCard(id);
}
function cardFor(id,name){
 let entry=cards.get(id);if(entry)return entry;
 const card=document.createElement('article');card.className='screen-card';card.dataset.participantId=id;
 const header=document.createElement('div');header.className='screen-card-header';
 const label=document.createElement('strong');label.textContent=name||'수강생';
 const zoom=document.createElement('button');zoom.type='button';zoom.className='btn secondary';zoom.textContent='확대';
 zoom.addEventListener('click',()=>card.classList.toggle('spotlight'));
 const stopButton=document.createElement('button');stopButton.type='button';stopButton.className='btn secondary';stopButton.textContent='중지';
 stopButton.addEventListener('click',()=>send({type:'stop_student',id}));
 header.append(label,zoom,stopButton);
 const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;
 const image=document.createElement('img');image.alt=label.textContent+' 화면 캡처';image.hidden=true;
 const empty=document.createElement('p');empty.className='screen-placeholder';empty.textContent='수강생 동의를 기다립니다.';
 card.append(header,video,image,empty);$('screenGrid').append(card);
 entry={root:card,label,video,image,empty};cards.set(id,entry);$('stageEmpty').hidden=true;return entry;
}
function makePeer(id){
 if(side==='student'){if(pc)pc.close();pc=new RTCPeerConnection({iceServers:ice});
  pc.onicecandidate=e=>{if(e.candidate)send({type:'rtc',kind:'ice',payload:e.candidate.toJSON()});};
  pc.onconnectionstatechange=()=>{if(pc?.connectionState==='failed')say('연결에 실패했습니다. 다른 Wi-Fi나 이미지 제출을 이용해 주세요.');};
  return pc;
 }
 const old=peers.get(id);if(old)old.close();
 const peer=new RTCPeerConnection({iceServers:ice});peers.set(id,peer);
 peer.onicecandidate=e=>{if(e.candidate)send({type:'rtc',kind:'ice',to:id,payload:e.candidate.toJSON()});};
 peer.ontrack=e=>{const card=cardFor(id);card.image.hidden=true;card.video.hidden=false;card.empty.hidden=true;
  card.video.srcObject=e.streams[0]||new MediaStream([e.track]);card.video.play().catch(()=>{card.empty.textContent='재생하려면 클릭하세요.';});};
 peer.onconnectionstatechange=()=>{if(peer.connectionState==='failed'){const card=cardFor(id);card.empty.hidden=false;card.empty.textContent='연결이 원활하지 않습니다. 이미지 제출을 이용하세요.';}};
 return peer;
}
async function flushIce(id,peer){
 const queue=pendingIce.get(id)||[];pendingIce.delete(id);
 for(const candidate of queue)await peer.addIceCandidate(candidate).catch(()=>{});
}
async function receiveRtc(m){
 try{
  const id=side==='host'?m.to:'student';
  let peer=side==='host'?peers.get(id):pc;
  if(m.kind==='offer'&&side==='host'){
   if(!activeIds.includes(id))return;
   peer=makePeer(id);await peer.setRemoteDescription(m.payload);
   await flushIce(id,peer);
   const answer=await peer.createAnswer();await peer.setLocalDescription(answer);
   send({type:'rtc',kind:'answer',to:id,payload:peer.localDescription.toJSON()});
  }else if(m.kind==='answer'&&side==='student'){
   if(peer){await peer.setRemoteDescription(m.payload);await flushIce(id,peer);}
  }else if(m.kind==='ice'&&m.payload){
   if(peer?.remoteDescription)await peer.addIceCandidate(m.payload).catch(()=>{});
   else{const candidates=pendingIce.get(id)||[];if(candidates.length<100)candidates.push(m.payload);pendingIce.set(id,candidates);}
  }
 }catch{say('실시간 화면 연결 협상에 실패했습니다. 이미지 제출 기능을 이용하세요.');}
}
function roster(list,active){
 activeIds=Array.isArray(active)?active:[];
 $('rosterCount').textContent=String(list.length);
 const entries=new Map(list.map(p=>[p.id,p]));
 for(const id of [...cards.keys()])if(!activeIds.includes(id)||!entries.has(id))removeCard(id);
 const el=$('roster');el.replaceChildren();
 if(!list.length){const li=document.createElement('li');li.textContent='아직 접속한 수강생이 없습니다.';el.append(li);}
 for(const person of list){
  const li=document.createElement('li'),name=document.createElement('strong'),btn=document.createElement('button');
  const chosen=activeIds.includes(person.id);
  name.textContent=person.name+(chosen?' · 공유 요청됨':'');
  if(chosen)cardFor(person.id,person.name);
  btn.type='button';btn.className='btn secondary';btn.textContent=chosen?'요청 취소':'화면 요청';
  btn.addEventListener('click',()=>{if(chosen)send({type:'stop_student',id:person.id});else send({type:'select',id:person.id});});
  li.append(name,btn);el.append(li);
 }
 $('stopSelection').disabled=!activeIds.length;
 $('stageLabel').textContent=activeIds.length+'명 화면 요청 중 · 최대 9명 동시 공유';
}
function connect(id,role,credential){
 const proto=role==='host'?'host.'+credential:'student.'+credential.id+'.'+credential.token;
 const url=new URL(`${BASE}/${id}/ws`,location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(url.toString(),['ekodi-screen-v1',proto]);
 ws.addEventListener('open',()=>say(role==='host'?'수업방 연결됨 · PC 입장 링크를 수강생에게 전달하세요.':'수업에 연결됐습니다. 강사의 요청을 기다립니다.'));
 ws.addEventListener('close',()=>{if(role==='student')$('shareControls').hidden=true;resetMedia();say('연결이 끊어졌습니다. 페이지를 새로 열어주세요.');});
 ws.addEventListener('message',async event=>{
  let m;try{m=JSON.parse(event.data);}catch{return;}
  if(m.type==='roster'&&role==='host'){roster(m.participants||[],m.active||[]);return;}
  if(m.type==='selected'){
   if(role==='student'){$('shareControls').hidden=false;say('강사가 공유를 요청했습니다. 동의할 경우 아래 버튼을 눌러주세요.');}
   else say('화면 공유 요청을 전송했습니다. 수강생 동의를 기다립니다.');
   return;
  }
  if(m.type==='rtc'){await receiveRtc(m);return;}
  if(m.type==='snapshot'&&role==='host'&&activeIds.includes(m.id)&&/^data:image\/(?:jpeg|png);base64,/.test(m.data||'')){
   const card=cardFor(m.id,m.name);card.video.hidden=true;card.image.src=m.data;card.image.hidden=false;card.empty.hidden=true;
   say((m.name||'수강생')+'의 이미지가 표시됐습니다.');return;
  }
  if(m.type==='status'&&role==='host'){
   const card=cards.get(m.id);if(card){card.root.dataset.status=m.status;
    if(m.status==='stopped') {card.empty.hidden=false;card.empty.textContent='화면 공유 중지됨';card.video.hidden=true;}
   }
   say(m.status==='sharing'?'수강생이 화면 공유를 시작했습니다.':m.status==='denied'?'수강생이 공유를 허용하지 않았습니다.':'수강생 상태: '+m.status);return;
  }
  if(m.type==='stopped'){if(role==='host'){if(m.id)removeCard(m.id);else resetMedia();}else{$('shareControls').hidden=true;stop(false);}say('공유가 중지됐습니다.');return;}
  if(m.type==='stop'&&role==='student'){stop(false);$('shareControls').hidden=true;say('강사가 공유를 종료했습니다.');return;}
  if(m.type==='room_closed'){resetMedia();if(role==='student')$('shareControls').hidden=true;say('수업방이 종료됐습니다.');return;}
  if(m.type==='error')say(m.code==='screen_limit'?'동시 화면은 최대 9개입니다. 기존 화면을 중지하고 다시 요청하세요.':'요청 실패: '+m.code);
 });
}
async function create(){
 $('createRoom').disabled=true;
 try{
  const r=await fetch(BASE,{method:'POST',headers:{},credentials:'same-origin'});
  const data=await r.json();
  if(!r.ok)throw Error(data.code==='room_rate_limited'?'수업방 생성 횟수를 초과했습니다. 잠시 후 다시 시도하세요.':data.code||'create_failed');
  room=data;
  $('invitePanel').hidden=false;$('inviteLink').value=data.joinUrl;
  $('qr').innerHTML=qrSvg(data.joinUrl,{label:'수강생 QR 접속'});
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
  say('참여가 승인됐습니다. 강사의 선택을 기다립니다.');
 }catch(e){say('수업 참가 실패: '+e.message);$('joinRoom').disabled=false;}
}
async function share(){
 if(!guest||$('shareControls').hidden)return;
 if(typeof navigator.mediaDevices?.getDisplayMedia!=='function'){
  say('이 기기의 브라우저는 전체 화면 공유를 지원하지 않습니다. 아래 캡처 이미지를 제출해 주세요.');
  send({type:'status',status:'unsupported'});return;
 }
 try{
  stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:10},audio:false});
  const track=stream.getVideoTracks()[0];
  if(!track)throw Error('video_track_missing');
  track.addEventListener('ended',()=>stop(true),{once:true});
  const peer=makePeer();peer.addTrack(track,stream);
  const offer=await peer.createOffer();await peer.setLocalDescription(offer);
  send({type:'rtc',kind:'offer',payload:peer.localDescription.toJSON()});
  send({type:'status',status:'sharing'});say('실시간 화면 공유 중 · 중지 버튼으로 종료할 수 있습니다.');
 }catch(e){
  if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
  send({type:'status',status:'denied'});
  const reason=e?.name==='NotAllowedError'?'공유 권한이 거부되거나 선택이 취소됐습니다.':
    e?.name==='NotFoundError'?'공유할 화면을 찾지 못했습니다.':
    e?.name==='NotReadableError'?'선택한 화면을 캡처할 수 없습니다. 다른 창을 골라주세요.':
    '화면 공유를 시작하지 못했습니다. 브라우저 허용 상태와 네트워크 연결을 확인해 주세요.';
  say(reason+' 이미지 제출도 가능합니다.');
 }
}
function stop(notify=true){resetMedia();if(notify)send({type:'status',status:'stopped'});if(guest)say('화면 공유가 중지됐습니다.');}
async function snapshot(){
 if($('shareControls').hidden)return;
 const file=$('snapshotFile').files?.[0];if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)){say('PNG, JPG 또는 WEBP 이미지 파일을 선택하세요.');return;}
 if(file.size>8_000_000){say('8MB 이하 이미지를 선택하세요.');return;}
 try{
  let bmp;
  if(typeof createImageBitmap==='function')bmp=await createImageBitmap(file);
  else{
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('read_failed'));reader.readAsDataURL(file);});
   bmp=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('image_decode_failed'));img.src=data;});
  }
  const scale=Math.min(1,1000/Math.max(bmp.width,bmp.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bmp.width*scale);canvas.height=Math.round(bmp.height*scale);
  const context=canvas.getContext('2d');if(!context)throw Error('canvas_unavailable');
  context.drawImage(bmp,0,0,canvas.width,canvas.height);
  if(typeof bmp.close==='function')bmp.close();
  let quality=.75,src=canvas.toDataURL('image/jpeg',quality);
  while(src.length>300000&&quality>.3){quality-=.15;src=canvas.toDataURL('image/jpeg',quality);}
  if(src.length>300000){say('이미지가 너무 큽니다. 크기를 줄인 후 다시 선택하세요.');return;}
  send({type:'snapshot',data:src});say('선택한 이미지가 강사 화면으로 전송됐습니다.');
 }catch{say('이미지를 처리하지 못했습니다. 다른 파일을 선택하세요.');}
}
function init(){
 acceptAdminHandoff(window);
 if(guest){
  side='student';$('teacher').hidden=true;$('learner').hidden=false;
  sessionStorage.setItem('screen-invite-'+roomId,invite);
  history.replaceState(null,'',location.pathname+'?r='+roomId);
  $('joinRoom').addEventListener('click',join);
  $('startShare').addEventListener('click',share);
  $('stopShare').addEventListener('click',()=>stop(true));
  $('sendSnapshot').addEventListener('click',snapshot);
 }else{
  $('learner').hidden=true;$('login').href=adminLoginUrl(window)||'../unlock/';
  $('createRoom').addEventListener('click',create);
  $('copyInvite').addEventListener('click',()=>navigator.clipboard?.writeText($('inviteLink').value).then(()=>say('QR 주소를 복사했습니다.')).catch(()=>say('주소를 직접 복사해 주세요.')));
  $('stopSelection').addEventListener('click',()=>{send({type:'stop'});resetMedia();selected='';$('stageLabel').textContent='수강생 화면을 기다립니다';$('stopSelection').disabled=true;});
  $('endRoom').addEventListener('click',()=>{send({type:'end'});resetMedia();$('invitePanel').hidden=true;$('endRoom').disabled=true;say('수업방을 종료했습니다.');});
  $('fullScreen').addEventListener('click',()=>$('stage').requestFullscreen?.().catch(()=>{}));
 }
 window.addEventListener('pagehide',()=>{resetMedia();ws?.close();});
}
init();
