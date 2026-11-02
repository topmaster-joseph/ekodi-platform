(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const MODES=new Set(['video','video-ppt','video-bulletin','all','ppt','bulletin','ppt-bulletin']);
  const query=new URLSearchParams(location.search);
  // The public weekly registry, not last week's copied live settings, selects the default deck.
  // An explicit ?date=YYYY-MM-DD continues to support rehearsal and archived services.
  const requestedDate=query.get('date');
  const ISO_DATE=/^20\d{2}-\d{2}-\d{2}$/;
  let date='';
  function kstDate(){
    const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const fields=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return fields.year+'-'+fields.month+'-'+fields.day;
  }
  async function resolveServiceDate(){
    if(requestedDate!==null){
      if(!ISO_DATE.test(requestedDate))throw new Error('invalid_service_date');
      return requestedDate;
    }
    const response=await fetch('/ekodichurch/worship/weekly.json',{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw new Error('weekly_index_unavailable');
    const index=await response.json();
    if(index?.schema!=='ekodi.church.worship.index.v1'||!Array.isArray(index.services))
      throw new Error('weekly_index_invalid');
    const dates=[...new Set(index.services
      .filter(item=>item&&ISO_DATE.test(item.date)&&item.page==='/ekodichurch/worship/'+item.date+'/')
      .map(item=>item.date))].sort();
    if(!dates.length)throw new Error('no_published_sunday');
    return dates.find(day=>day>=kstDate())||dates[dates.length-1];
  }
  let packet=null;
  let slideIndex=0;
  let roomId='';
  let roomRole='';
  let followPresenter=false;
  let latestRevision=0;
  let followInterval=null;
  let publishing=false;
  let mode='video';
  try{const preference=sessionStorage.getItem('ekodi:church:viewer-material-mode');if(MODES.has(preference))mode=preference;}catch{}
  const status=(message)=>{if($('viewerMaterialStatus'))$('viewerMaterialStatus').textContent=message;};
  const make=(tag,text='',className='')=>{const element=document.createElement(tag);element.textContent=String(text);if(className)element.className=className;return element;};
  function showMode(next){
    if(!MODES.has(next))return;
    mode=next;
    const video=['video','video-ppt','video-bulletin','all'].includes(mode);
    const slides=['ppt','video-ppt','ppt-bulletin','all'].includes(mode);
    const bulletin=['bulletin','video-bulletin','ppt-bulletin','all'].includes(mode);
    $('viewerContentLayout').dataset.materialLayout=mode;
    $('viewerVideoStage').classList.toggle('hidden',!video);
    $('viewerWorshipSlides').classList.toggle('hidden',!slides);
    $('viewerWorshipBulletin').classList.toggle('hidden',!bulletin);
    document.querySelectorAll('[data-viewer-material-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.viewerMaterialMode===mode)));
    try{sessionStorage.setItem('ekodi:church:viewer-material-mode',mode)}catch{}
    if(!packet&&(slides||bulletin))status('예배자료 연결 확인 중 · 영상은 계속 시청할 수 있습니다.');
  }
  function renderSlide(){
    if(!packet?.slides?.length)return;
    const slide=packet.slides[slideIndex];
    $('viewerSlideKicker').textContent=slide.kicker||'';
    $('viewerSlideTitle').textContent=slide.title||'';
    $('viewerSlideLines').replaceChildren(...(Array.isArray(slide.lines)?slide.lines:[]).map(line=>make('p',line)));
    $('viewerSlideCount').textContent=(slideIndex+1)+' / '+packet.slides.length;
  }
  function moveSlide(by){
    if(!packet?.slides?.length)return;
    slideIndex=Math.max(0,Math.min(packet.slides.length-1,slideIndex+by));
    renderSlide();
  }
  function renderHostSlide(){
    if(!packet?.slides?.length)return;
    const data=packet.slides[slideIndex];
    if($('worshipHostCurrentSlide'))$('worshipHostCurrentSlide').textContent=(data?.title||'').replaceAll('\n',' ');
    if($('worshipHostSlideCount'))$('worshipHostSlideCount').textContent=(slideIndex+1)+' / '+packet.slides.length;
  }
  function renderHostStatus(message){if($('worshipHostSyncStatus'))$('worshipHostSyncStatus').textContent=message;}
  function renderViewerSync(message){if($('viewerSlideSyncStatus'))$('viewerSlideSyncStatus').textContent=message;}
  function authToken(){
    try{
      const central=sessionStorage.getItem('ekodi-auth-token');
      if(central)return central;
      return JSON.parse(sessionStorage.getItem('ekodi-church-pastor-session')||'null')?.accessToken||'';
    }catch{return''}
  }
  let deckId='';
  const presentationEndpoint=()=>'/api/realtime/rooms/'+encodeURIComponent(roomId)+'/presentation';
  async function sendPresenterSlide(){
    if(!roomId||roomRole!=='host'||!packet||publishing)return;
    const token=authToken();
    if(!token){renderHostStatus('방송자 인증이 필요합니다. 영상 방송은 계속 가능합니다.');return}
    publishing=true;
    document.querySelectorAll('#worshipHostPrev,#worshipHostNext').forEach(button=>button.disabled=true);
    const target=slideIndex;
    try{
      const response=await fetch(presentationEndpoint(),{method:'PUT',cache:'no-store',
        headers:{'content-type':'application/json',authorization:'Bearer '+token},
        body:JSON.stringify({deckId,index:target})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok||body?.presentation?.index!==target)throw new Error(body.error||'presentation_update_failed');
      latestRevision=Math.max(latestRevision,Number(body.presentation.revision)||0);
      renderHostStatus('참여자 동기화 전송 완료 · '+(target+1)+' / '+packet.slides.length);
    }catch(error){
      renderHostStatus('참여자 동기화 미연결: '+(error.message||'확인 필요')+' · 방송 영상은 계속됩니다.');
    }finally{
      publishing=false;document.querySelectorAll('#worshipHostPrev,#worshipHostNext').forEach(button=>button.disabled=false);
    }
  }
  function presenterMove(offset){
    if(publishing||!packet?.slides?.length)return;
    slideIndex=Math.min(packet.slides.length-1,Math.max(0,slideIndex+offset));
    renderSlide();renderHostSlide();
    void sendPresenterSlide();
  }
  async function readPresenterSlide(){
    if(!followPresenter||roomRole!=='viewer'||!roomId||!packet||document.visibilityState==='hidden')return;
    try{
      // Private rooms require the same signed-in viewer identity as the media room.
      // Never put bearer credentials into the URL, localStorage, or message payload.
      const access=authToken();
      const response=await fetch(presentationEndpoint(),{
        cache:'no-store',credentials:'omit',
        ...(access?{headers:{authorization:'Bearer '+access}}:{})
      });
      if(response.status===429||response.status===1027){
        followPresenter=false;stopFollowPolling();
        if($('viewerFollowPresenter'))$('viewerFollowPresenter').setAttribute('aria-pressed','false');
        renderViewerSync('서버 보호를 위해 자동 동기화를 잠시 멈췄습니다. 직접 넘겨 보실 수 있습니다.');
        return;
      }
      if(!response.ok)throw new Error('동기화 경로 확인 중');
      const result=await response.json();
      const cursor=result?.presentation;
      if(!cursor){renderViewerSync('진행자가 PPT를 시작하면 여기에 자동 표시됩니다.');return;}
      if(cursor.deckId!==deckId||!Number.isInteger(cursor.index)||cursor.index<0||cursor.index>=packet.slides.length)return;
      const nextRevision=Number(cursor.revision)||0;
      if(nextRevision>=latestRevision){
        latestRevision=nextRevision;slideIndex=cursor.index;renderSlide();renderHostSlide();
        renderViewerSync('진행자 따라가는 중 · '+(slideIndex+1)+' / '+packet.slides.length);
      }
    }catch{
      renderViewerSync('진행자 연결 확인 중 · PPT 수동 넘기기는 정상 이용 가능합니다.');
    }
  }
  function stopFollowPolling(){if(followInterval!==null){clearInterval(followInterval);followInterval=null;}}
  function setFollow(enabled){
    followPresenter=Boolean(enabled);
    if($('viewerFollowPresenter'))$('viewerFollowPresenter').setAttribute('aria-pressed',String(followPresenter));
    stopFollowPolling();
    if(followPresenter){
      renderViewerSync(roomId?'진행자 연결 중':'방송에 입장하면 진행자 따라가기가 시작됩니다.');
      void readPresenterSlide();
      if(roomId)followInterval=setInterval(()=>void readPresenterSlide(),10000);
    }else renderViewerSync('내가 직접 넘기는 PPT · 방송 진행자 화면에는 영향 없음');
  }
  window.addEventListener('ekodi:live:room',event=>{
    const detail=event.detail||{};
    if(!/^room_[a-zA-Z0-9_-]+$/.test(String(detail.roomId||'')))return;
    if(detail.tenant!=='ekodichurch')return;
    // Room replacement must never display the prior room's cursor or keep its timer.
    const roomChanged=roomId!==detail.roomId;
    if(roomChanged){stopFollowPolling();latestRevision=0;slideIndex=0;renderSlide();renderHostSlide();}
    roomId=detail.roomId;roomRole=detail.role==='host'?'host':'viewer';
    if(roomRole==='host'){
      renderHostStatus('방송방 연결됨 · 슬라이드 1장을 포함해 참여자와 동기화합니다.');
      if(packet)void sendPresenterSlide();
    }
    if(roomRole==='viewer'&&followPresenter)setFollow(true);
  });
  window.addEventListener('pagehide',stopFollowPolling);
  document.addEventListener('visibilitychange',()=>{
    if(followPresenter&&roomRole==='viewer'&&document.visibilityState==='visible')void readPresenterSlide();
  });
  function renderBulletin(){
    if(!packet)return;
    const root=$('viewerBulletinBody');
    const fragment=document.createDocumentFragment();
    fragment.append(make('h3',packet.title||'주일예배'));
    fragment.append(make('p',(packet.date||'')+' · '+(packet.scripture||''),'worship-material-scripture'));
    if(packet.preacher)fragment.append(make('p','말씀나눔 · '+packet.preacher));
    const list=make('ol','','viewer-bulletin-order');
    for(const row of Array.isArray(packet.order)?packet.order:[]){
      if(!Array.isArray(row)||row.length<2)continue;
      const li=make('li');
      li.append(make('span',row[0]||''),make('small',row[1]||''));
      list.append(li);
    }
    fragment.append(list);
    fragment.append(make('h3','주간 매일묵상'));
    const devotions=make('ul','','viewer-bulletin-devotions');
    for(const pair of Array.isArray(packet.devotion)?packet.devotion:[]){
      if(!Array.isArray(pair)||pair.length<2)continue;
      devotions.append(make('li',pair.join(' · ')));
    }
    fragment.append(devotions);
    root.replaceChildren(fragment);
    $('viewerBulletinLink').href='/ekodichurch/worship/'+date+'/';
  }
  document.querySelectorAll('[data-viewer-material-mode]').forEach(button=>{
    button.addEventListener('click',()=>showMode(button.dataset.viewerMaterialMode));
  });
  $('viewerSlidePrev')?.addEventListener('click',()=>{setFollow(false);moveSlide(-1)});
  $('viewerSlideNext')?.addEventListener('click',()=>{setFollow(false);moveSlide(1)});
  $('viewerFollowPresenter')?.addEventListener('click',()=>setFollow(!followPresenter));
  $('worshipHostPrev')?.addEventListener('click',()=>presenterMove(-1));
  $('worshipHostNext')?.addEventListener('click',()=>presenterMove(1));
  showMode(mode);

  async function loadPacket(){
    try{
      date=await resolveServiceDate();
      deckId='worship-'+date;
      const materialPath='/ekodichurch/worship/'+date+'/materials.json';
      const response=await fetch(materialPath,{cache:'no-store',credentials:'omit'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const result=await response.json();
      if(result?.schema!=='ekodi.worship.materials.v1'||result?.site!=='ekodichurch'||result.date!==date||!Array.isArray(result.slides)||result.slides.length<1||result.slides.length>120)
        throw new Error('material_schema_invalid');
      packet=result;
      renderSlide();renderBulletin();renderHostSlide();
      if(roomRole==='host'&&roomId)void sendPresenterSlide();
      status((packet.date||date)+' 주일예배 · PPT '+packet.slides.length+'장과 주보 준비됨');
    }catch(error){
      status('해당 날짜 예배자료를 불러올 수 없습니다. 영상 시청은 계속 가능합니다.');
      $('viewerSlideTitle').textContent='자료를 확인해 주세요';
      $('viewerSlideLines').replaceChildren(make('p','방송 중인 날짜의 PPT가 아직 공개되지 않았습니다.'));
      $('viewerBulletinBody').replaceChildren(make('p','예배 주보가 아직 공개되지 않았습니다.'));
      console.warn('[EKODI Live worship materials]',error?.message||error);
    }
  }
  void loadPacket();
})();
