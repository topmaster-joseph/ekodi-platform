(()=>{'use strict';
const API='/api/realtime',SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co',PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_',cfg=document.body.dataset,$=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const state={room:null,pc:null,session:null,local:null,screen:null,remote:new MediaStream(),hosting:false,recording:null,studioPrepared:false,destinationCatalogLoaded:false};
function token(){try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return''}}
async function bootstrapAuthHandoff(){const hash=new URLSearchParams(location.hash.replace(/^#/,''));const tokenHash=hash.get('ekodi_token');if(!tokenHash)return false;history.replaceState(null,'',location.pathname+location.search);const response=await fetch(`${SUPABASE_URL}/auth/v1/verify`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({token_hash:tokenHash,type:hash.get('ekodi_type')||'email'})});const data=await response.json().catch(()=>({}));const access=data?.access_token||data?.session?.access_token||'';if(!response.ok||!access)throw new Error(data?.msg||data?.error_description||'login_handoff_failed');sessionStorage.setItem('ekodi-auth-token',access);return true}
function headers(json=false,session=false){const h=new Headers();if(token())h.set('authorization',`Bearer ${token()}`);if(json)h.set('content-type','application/json');if(session&&state.session?.accessKey)h.set('x-ekodi-session-key',state.session.accessKey);return h}
async function api(path,options={}){const response=await fetch(`${API}${path}`,{...options,headers:headers(Boolean(options.body),Boolean(options.session)),cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok){const e=new Error(data.error||`HTTP ${response.status}`);e.status=response.status;e.data=data;throw e}return data}
function show(id){for(const key of ['entryView','studioView','viewerView'])$(key)?.classList.add('hidden');$(id)?.classList.remove('hidden')}
function note(message,target='statusLog'){if($(target))$(target).textContent=message}
function login(){const returnTo=location.href;location.href=`/auth/?site=${encodeURIComponent(cfg.authSite||cfg.tenant)}&return_to=${encodeURIComponent(returnTo)}`}
async function waitIce(pc){if(pc.iceGatheringState==='complete')return;await new Promise(resolve=>{const timer=setTimeout(resolve,2500);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);resolve()}},{once:false})})}
function providerDescription(data){return data?.provider?.sessionDescription||data?.provider?.data?.sessionDescription||data?.sessionDescription||null}
function broadcastSelection(){const destinationIds=[...document.querySelectorAll('#externalDestinations input[data-destination]:checked')].map(input=>input.value).filter(Boolean);return {broadcastMode:destinationIds.length?'ekodi+external':'ekodi',destinationIds,multistream:destinationIds.length>0}}
function destinationReason(value){return ({channel_connection_required:'채널 연결 필요',live_provider_not_supported:'실시간 송출 미지원',live_permission_required:'실시간 권한 준비 필요',distribution_engine_pending:'외부 송출 엔진 준비 중'})[value]||'사용 준비 필요'}
function renderExternalDestinations(channels=[]){
  const root=$('externalDestinations');if(!root)return;
  root.replaceChildren();
  if(!channels.length){const empty=document.createElement('small');empty.textContent='연결된 외부 방송 채널이 없습니다. 사이트 관리자에서 채널을 연결한 뒤 다시 확인하세요.';root.append(empty);return}
  for(const channel of channels){
    const label=document.createElement('label');label.className='destination-row';
    const input=document.createElement('input');input.type='checkbox';input.value=channel.id;input.dataset.destination='true';input.disabled=!channel.selectable;
    const copy=document.createElement('span');const strong=document.createElement('strong');strong.textContent=channel.label||channel.provider;const small=document.createElement('small');small.textContent=channel.selectable?'동시방송 선택 가능':destinationReason(channel.reason);copy.append(strong,small);label.append(input,copy);root.append(label);
  }
}
async function loadExternalDestinations(){
  if(!token()){renderExternalDestinations([]);const root=$('externalDestinations');if(root)root.querySelector('small').textContent='외부 방송 채널은 로그인 후 선택할 수 있습니다.';return false}
  try{const data=await api(`/destinations/catalog?tenant=${encodeURIComponent(cfg.tenant)}`);state.destinationCatalogLoaded=true;renderExternalDestinations(data.channels||[]);return true}
  catch(error){state.destinationCatalogLoaded=false;const root=$('externalDestinations');if(root)root.innerHTML='<small>외부 채널을 불러오지 못했습니다. 내부 방송과 자동 저장은 정상적으로 사용할 수 있습니다.</small>';note(`외부 채널 확인 실패: ${error.message}`);return false}
}
async function createRoom(){const body={tenant:cfg.tenant,mode:cfg.roomMode,title:params.get('title')||cfg.defaultTitle,interactiveParticipants:6,languages:0,durationMinutes:180,recording:true,publicViewers:true,ai:true,...broadcastSelection()};try{return await api('/rooms',{method:'POST',body:JSON.stringify(body)})}catch(error){if(error.status===401){login();return null}if(error.status===402&&error.data?.subscriptionUrl){location.href=error.data.subscriptionUrl;return null}throw error}}
async function createSession(roomId,role){const data=await api(`/rooms/${encodeURIComponent(roomId)}/sessions`,{method:'POST',body:JSON.stringify({role})});state.session=data.session;state.pc=new RTCPeerConnection({iceServers:data.iceServers||[]});state.pc.onconnectionstatechange=()=>{$('connectionState')&&($('connectionState').textContent=state.pc.connectionState)};return data}
async function acquireCamera(){if(state.local)return state.local;const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:{echoCancellation:true,noiseSuppression:true}});state.local=stream;$('mainVideo').srcObject=stream;$('programPlaceholder')?.classList.add('hidden');return stream}
function trackPayload(pc,stream,source='camera'){return pc.getTransceivers().filter(t=>t.sender?.track&&stream.getTracks().includes(t.sender.track)).map((t,index)=>({mid:t.mid,trackName:`${source}-${t.sender.track.kind}-${Date.now()}-${index}`,kind:t.sender.track.kind,sourceType:t.sender.track.kind==='audio'?'microphone':source}))}
async function publishStream(stream,source='camera'){for(const track of stream.getTracks())state.pc.addTrack(track,stream);const offer=await state.pc.createOffer();await state.pc.setLocalDescription(offer);await waitIce(state.pc);const tracks=trackPayload(state.pc,stream,source);if(tracks.some(t=>!t.mid))throw new Error('media_negotiation_not_ready');const data=await api(`/rooms/${state.room.id}/sessions/${state.session.id}/publish`,{method:'POST',session:true,body:JSON.stringify({sessionDescription:state.pc.localDescription,tracks})});const answer=providerDescription(data);if(!answer?.sdp)throw new Error('media_server_answer_missing');await state.pc.setRemoteDescription(answer)}

const RECORD_PART_TARGET=6*1024*1024;
function recordingMime(){for(const type of ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'])if(globalThis.MediaRecorder?.isTypeSupported?.(type))return type;return 'video/webm'}
async function uploadRecordingBlob(rec,blob){
  const part=rec.part++;
  const response=await fetch(`${API}/rooms/${encodeURIComponent(state.room.id)}/recordings/${encodeURIComponent(rec.id)}/parts/${part}`,{method:'PUT',headers:{authorization:`Bearer ${token()}`,'content-type':rec.mime},body:blob});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`recording_part_${response.status}`);return data;
}
function flushRecordingPart(rec,force=false){
  if(!rec||!rec.pending.length||(!force&&rec.pendingBytes<RECORD_PART_TARGET))return;
  const blob=new Blob(rec.pending,{type:rec.mime});rec.pending=[];rec.pendingBytes=0;
  rec.queue=rec.queue.then(()=>uploadRecordingBlob(rec,blob)).catch(error=>{rec.failed=true;note(`녹화 저장 지연: ${error.message}. 방송은 계속됩니다.`)});
}
async function startRecording(){
  if(!state.room||!state.local||!globalThis.MediaRecorder)return false;
  try{
    const mime=recordingMime(),created=await api(`/rooms/${state.room.id}/recordings`,{method:'POST',body:JSON.stringify({mimeType:mime,title:state.room.title,retentionDays:180})});
    const rec={id:created.recording.id,mime,part:1,pending:[],pendingBytes:0,queue:Promise.resolve(),failed:false,media:null};
    const media=new MediaRecorder(state.local,{mimeType:mime});rec.media=media;state.recording=rec;
    media.ondataavailable=event=>{if(!event.data?.size)return;rec.pending.push(event.data);rec.pendingBytes+=event.data.size;flushRecordingPart(rec,false)};
    media.onerror=event=>{rec.failed=true;note(`녹화 오류: ${event.error?.message||'recording_error'}. 방송은 계속됩니다.`)};
    media.start(5000);note('방송 중입니다. 녹화본은 R2에 안전하게 기록한 뒤 공유드라이브로 보관합니다.');return true;
  }catch(error){note(`방송은 시작됐지만 녹화 준비에 실패했습니다: ${error.message}`);return false}
}
async function stopRecording(){
  const rec=state.recording;if(!rec)return null;
  if(rec.media?.state!=='inactive')await new Promise(resolve=>{rec.media.addEventListener('stop',resolve,{once:true});rec.media.stop()});
  flushRecordingPart(rec,true);await rec.queue;
  try{
    if(rec.failed){await api(`/rooms/${state.room.id}/recordings/${rec.id}/abort`,{method:'POST',body:'{}'}).catch(()=>{});return null}
    const done=await api(`/rooms/${state.room.id}/recordings/${rec.id}/finalize`,{method:'POST',body:'{}'});
    note(done.archive?.ok?'방송 종료 · 녹화본 공유드라이브 보관 완료':'방송 종료 · 녹화본 저장 완료, 공유드라이브 보관 대기');return done;
  }catch(error){note(`방송은 종료됐지만 녹화 확정에 실패했습니다: ${error.message}`);return null}
  finally{state.recording=null}
}
async function prepareStudio(){show('studioView');note('카메라·마이크와 송출 채널을 준비하고 있습니다.');try{await acquireCamera();state.studioPrepared=true;$('goLiveButton').disabled=false;await loadExternalDestinations();note(token()?'준비 완료. 내부 방송·자동 저장은 기본이며, 필요하면 외부 채널을 선택한 뒤 방송을 시작하세요.':'준비 완료. 내부 방송·자동 저장은 기본입니다. 외부 채널 선택은 로그인 후 사용할 수 있습니다.');return true}catch(error){state.studioPrepared=false;$('goLiveButton').disabled=true;note(`방송 준비 실패: ${error.message}`);return false}}
async function startHost(){if(state.room&&state.session&&state.pc)return true;if(state.hosting)return false;state.hosting=true;show('studioView');note('방송 서버에 연결하고 있습니다.');try{const created=await createRoom();if(!created){state.hosting=false;return false}state.room=created.room;$('roomTitle').textContent=state.room.title;$('shareLink').value=`${location.origin}${cfg.livePath}?room=${encodeURIComponent(state.room.id)}`;$('roomLinks').classList.remove('hidden');const stream=state.local||await acquireCamera();await api(`/rooms/${state.room.id}/status`,{method:'POST',body:JSON.stringify({status:'starting'})});await createSession(state.room.id,'owner');await publishStream(stream,'camera');note('미디어 연결 완료. 내부 녹화는 방송 시작과 함께 자동 실행됩니다.');return true}catch(error){state.hosting=false;$('goLiveButton').disabled=false;note(`방송 준비 실패: ${error.message}`);return false}}
async function goLive(){if(!state.room)return;try{await api(`/rooms/${state.room.id}/status`,{method:'POST',body:JSON.stringify({status:'live'})});$('programBadge').textContent='LIVE';$('liveState').textContent='방송 중';$('goLiveButton').disabled=true;$('endLiveButton').disabled=false;note('방송 중입니다. 내부 녹화를 자동 시작합니다.');await startRecording()}catch(error){$('goLiveButton').disabled=false;note(`방송 시작 실패: ${error.message}`)}}
async function startBroadcast(){if(!state.studioPrepared){const prepared=await prepareStudio();if(!prepared)return}if(!token())return login();$('goLiveButton').disabled=true;const ready=await startHost();if(!ready){$('goLiveButton').disabled=false;return}await goLive()}
async function endLive(){if(!state.room)return;try{await api(`/rooms/${state.room.id}/status`,{method:'POST',body:JSON.stringify({status:'ending'})});await stopRecording();if(state.session)await api(`/rooms/${state.room.id}/sessions/${state.session.id}/leave`,{method:'POST',session:true,body:'{}'}).catch(()=>{});state.pc?.close();state.local?.getTracks().forEach(t=>t.stop());state.screen?.getTracks().forEach(t=>t.stop());await api(`/rooms/${state.room.id}/status`,{method:'POST',body:JSON.stringify({status:'ended'})});$('programBadge').textContent='종료';$('endLiveButton').disabled=true;if(!state.recording)note('방송이 종료되었습니다.')}catch(error){note(`방송 종료 처리 실패: ${error.message}`)}}
async function shareScreen(){if(!state.room||!state.pc)return note('먼저 방송을 준비해 주세요.');try{const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});state.screen=stream;await publishStream(stream,'screen');$('mainVideo').srcObject=stream;stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(state.local)$('mainVideo').srcObject=state.local});note('화면공유를 방송에 추가했습니다.')}catch(error){if(error.name!=='NotAllowedError')note(`화면공유 실패: ${error.message}`)}}
async function joinViewer(roomId=''){show('viewerView');note('현재 방송을 찾고 있습니다.','viewerStatus');try{let id=roomId;if(!id){const live=await api(`/live?tenant=${encodeURIComponent(cfg.tenant)}`);if(!live.live||!live.room){$('viewerEmpty').textContent='현재 진행 중인 공개 방송이 없습니다.';note('현재 생방송이 없습니다.','viewerStatus');return}id=live.room.id}const detail=await api(`/rooms/${encodeURIComponent(id)}`);state.room=detail.room;$('viewerTitle').textContent=state.room.title||cfg.defaultTitle;await createSession(id,'viewer');state.pc.ontrack=event=>{for(const track of event.streams?.[0]?.getTracks?.()||[event.track])if(!state.remote.getTracks().some(x=>x.id===track.id))state.remote.addTrack(track);$('viewerVideo').srcObject=state.remote;$('viewerEmpty').classList.add('hidden')};const pulled=await api(`/rooms/${id}/sessions/${state.session.id}/pull`,{method:'POST',session:true,body:JSON.stringify({tracks:(detail.tracks||[]).map(track=>({trackName:track.track_name||track.trackName}))})});if(pulled.empty){note('방송방은 열려 있지만 아직 영상 트랙이 없습니다.','viewerStatus');return}const offer=providerDescription(pulled);if(!offer?.sdp)throw new Error('media_server_offer_missing');await state.pc.setRemoteDescription(offer);const answer=await state.pc.createAnswer();await state.pc.setLocalDescription(answer);await waitIce(state.pc);await api(`/rooms/${id}/sessions/${state.session.id}/renegotiate`,{method:'PUT',session:true,body:JSON.stringify({sessionDescription:state.pc.localDescription})});note('실시간 방송에 연결되었습니다.','viewerStatus')}catch(error){note(`참여 연결 실패: ${error.message}`,'viewerStatus')}}
async function refreshLive(){try{const live=await api(`/live?tenant=${encodeURIComponent(cfg.tenant)}`);$('liveState').textContent=live.live?'현재 LIVE':'현재 대기';if(live.live)$('joinButton').textContent='현재 방송 참여하기'}catch{$('liveState').textContent='상태 확인 필요'}}
$('refreshDestinationsButton')?.addEventListener('click',()=>{if(!token())return login();loadExternalDestinations()});
$('hostButton')?.addEventListener('click',prepareStudio);$('joinButton')?.addEventListener('click',()=>joinViewer());$('goLiveButton')?.addEventListener('click',startBroadcast);$('endLiveButton')?.addEventListener('click',endLive);$('screenButton')?.addEventListener('click',shareScreen);$('cameraButton')?.addEventListener('click',async()=>{try{await acquireCamera();note('카메라가 준비되었습니다.')}catch(error){note(`카메라 사용 불가: ${error.message}`)}});$('micButton')?.addEventListener('click',()=>{const track=state.local?.getAudioTracks?.()[0];if(!track)return note('먼저 카메라·마이크를 준비해 주세요.');track.enabled=!track.enabled;$('micButton').textContent=track.enabled?'마이크':'마이크 꺼짐'});$('copyLinkButton')?.addEventListener('click',async()=>{await navigator.clipboard?.writeText?.($('shareLink').value);note('참여 링크를 복사했습니다.')});
void bootstrapAuthHandoff().catch(error=>note(`로그인 연결 실패: ${error.message}`,'entryNote')).finally(()=>{if(params.get('mode')==='studio')prepareStudio();else if(params.get('room'))joinViewer(params.get('room'));else refreshLive()});
})();
