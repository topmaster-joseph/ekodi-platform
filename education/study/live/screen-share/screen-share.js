import {qrSvg} from '../engine/qr.js';
import {readToken,acceptAdminHandoff,adminLoginUrl} from '../engine/admin-instructor.js';
const $=id=>document.getElementById(id);
const BASE='/edu/study/live/screen-share/api/rooms';
const params=new URLSearchParams(location.search);
const roomId=params.get('r')||'';
const invite=new URLSearchParams(location.hash.slice(1)).get('k')||params.get('k')||sessionStorage.getItem('screen-invite-'+roomId)||'';
const guest=/^[a-f0-9]{32}$/.test(roomId)&&/^[a-f0-9]{64}$/.test(invite);
let room=null,ws=null,pc=null,stream=null,selected='',side=guest?'student':'host';
const ice=[{urls:'stun:stun.cloudflare.com:3478'}];
function say(message){const target=side==='host'?$('teacherStatus'):$('learnerStatus');target.textContent=message;}
function send(value){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value));}
function resetMedia(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}if(pc){pc.close();pc=null;}const v=$('remoteVideo');v.srcObject=null;v.hidden=true;$('remoteImage').hidden=true;$('stageEmpty').hidden=false;}
function makePeer(){
 if(pc)pc.close();
 pc=new RTCPeerConnection({iceServers:ice});
 pc.onicecandidate=event=>{if(event.candidate)send({type:'rtc',kind:'ice',payload:event.candidate.toJSON()});};
 pc.onconnectionstatechange=()=>{
  if(pc?.connectionState==='failed'){say('기기 간 연결이 실패했습니다. 동일한 Wi-Fi 또는 이미지 제출을 이용해 주세요.');}
 };
 if(side==='host')pc.ontrack=event=>{
  $('remoteImage').hidden=true;$('stageEmpty').hidden=true;
  $('remoteVideo').srcObject=event.streams[0]||new MediaStream([event.track]);$('remoteVideo').hidden=false;
  $('remoteVideo').play().catch(()=>say('영상을 재생하려면 화면을 클릭해 주세요.'));
 };
 return pc;
}
async function receiveRtc(m){
 try{
  if(!pc&&(side==='host'||stream))makePeer();
  if(!pc)return;
  if(m.kind==='offer'&&side==='host'){
   await pc.setRemoteDescription(m.payload);
   const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
   send({type:'rtc',kind:'answer',payload:pc.localDescription.toJSON()});
  }else if(m.kind==='answer'&&side==='student'){
   await pc.setRemoteDescription(m.payload);
  }else if(m.kind==='ice'&&m.payload){
   await pc.addIceCandidate(m.payload).catch(()=>{});
  }
 }catch{say('실시간 연결 협상에 실패했습니다. 이미지 제출 기능을 사용할 수 있습니다.');}
}
function roster(list,active){
 $('rosterCount').textContent=String(list.length);
 const el=$('roster');el.replaceChildren();
 if(!list.length){const li=document.createElement('li');li.textContent='아직 접속한 수강생이 없습니다.';el.append(li);}
 for(const person of list){
  const li=document.createElement('li'),name=document.createElement('strong'),btn=document.createElement('button');
  name.textContent=person.name+(person.id===active?' · 선택됨':'');
  btn.type='button';btn.className='btn secondary';btn.textContent=person.id===active?'선택됨':'스크린에 표시';
  btn.disabled=person.id===active;
  btn.addEventListener('click',()=>{resetMedia();selected=person.id;send({type:'select',id:person.id});say(person.name+' 수강생에게 공유 요청을 보냈습니다. 동의를 기다립니다.');$('stageLabel').textContent=person.name+' 수강생';$('stopSelection').disabled=false;});
  li.append(name,btn);el.append(li);
 }
}
function connect(id,role,credential){
 const proto=role==='host'?'host.'+credential:'student.'+credential.id+'.'+credential.token;
 const url=new URL(`${BASE}/${id}/ws`,location.origin);
 url.protocol=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(url.toString(),['ekodi-screen-v1',proto]);
 ws.addEventListener('open',()=>say(role==='host'?'수업방 연결됨 · 수강생 QR을 보여주세요.':'수업에 연결됐습니다. 강사의 선택을 기다립니다.'));
 ws.addEventListener('close',()=>{if($('learnerStatus')&&role==='student')$('shareControls').hidden=true;resetMedia();say('연결이 끊어졌습니다. 다시 접속하거나 수업방을 새로 만드세요.');});
 ws.addEventListener('message',async event=>{
  let m;try{m=JSON.parse(event.data);}catch{return;}
  if(m.type==='roster'&&role==='host'){roster(m.participants||[],m.selected);return;}
  if(m.type==='selected'){
   if(role==='student'){$('shareControls').hidden=false;say('강사가 화면 공유를 요청했습니다. 공유를 원하시면 아래 버튼을 누르세요.');}
   else{$('stopSelection').disabled=false;say('수강생이 선택됐습니다. 본인 동의가 필요한 상태입니다.');}
   return;
  }
  if(m.type==='rtc'){await receiveRtc(m);return;}
  if(m.type==='snapshot'&&role==='host'&&/^data:image\/(?:jpeg|png);base64,/.test(m.data||'')){
   resetMedia();$('remoteImage').src=m.data;$('remoteImage').hidden=false;$('stageEmpty').hidden=true;
   say((m.name||'수강생')+'의 화면 캡처 이미지가 표시됐습니다.');return;
  }
  if(m.type==='status'&&role==='host'){say(m.status==='sharing'?'수강생이 실시간 공유를 시작했습니다.':m.status==='denied'?'수강생이 공유를 허용하지 않았습니다.':m.status==='unsupported'?'수강생 기기에서 전체 화면 공유를 지원하지 않습니다.':'수강생 상태: '+m.status);return;}
  if(m.type==='stopped'||m.type==='stop'){resetMedia();if(role==='student')$('shareControls').hidden=true;else{$('stageLabel').textContent='화면을 선택해 주세요';$('stopSelection').disabled=true;}say('공유가 종료됐습니다.');return;}
  if(m.type==='room_closed'){resetMedia();say('강사가 수업방을 종료했습니다.');$('shareControls').hidden=true;return;}
  if(m.type==='error')say('요청 처리 실패: '+m.code);
 });
}
async function create(){
 const access=readToken(window);
 $('createRoom').disabled=true;
 try{
  const r=await fetch(BASE,{method:'POST',headers:access?{authorization:'Bearer '+access}:{},credentials:'same-origin'});
  const data=await r.json();
  if(!r.ok)throw Error(r.status===401?'강사 인증이 필요합니다. 강사 로그인 후 다시 시도해 주세요.':data.code||'create_failed');
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
 }catch{send({type:'status',status:'denied'});say('화면 공유가 허용되지 않았거나 기기가 지원하지 않습니다. 이미지를 제출할 수 있습니다.');}
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
  $('stopSelection').addEventListener('click',()=>{send({type:'stop'});resetMedia();selected='';$('stageLabel').textContent='화면을 선택해 주세요';$('stopSelection').disabled=true;});
  $('endRoom').addEventListener('click',()=>{send({type:'end'});resetMedia();$('invitePanel').hidden=true;$('endRoom').disabled=true;say('수업방을 종료했습니다.');});
  $('fullScreen').addEventListener('click',()=>$('stage').requestFullscreen?.().catch(()=>{}));
 }
 window.addEventListener('pagehide',()=>{resetMedia();ws?.close();});
}
init();
