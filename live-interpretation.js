/* EKODI Live add-ons: multilingual interpretation captions + external simulcast.
   Shared by every tenant live page (tenant-live-page.js). Independent of
   tenant-live.js: it reads the same auth token and talks to /api/realtime. */
(()=>{
'use strict';
const API='/api/realtime';
const body=document.body;
const tenant=body?.dataset?.tenant||'';
if(!tenant)return;
const $=id=>document.getElementById(id);
const LANGS={ko:['한국어','ko-KR'],en:['English','en-US'],zh:['中文','zh-CN'],ja:['日本語','ja-JP'],vi:['Tiếng Việt','vi-VN'],mn:['Монгол','mn-MN'],uz:['Oʻzbek','uz-UZ'],ru:['Русский','ru-RU'],th:['ไทย','th-TH'],id:['Bahasa Indonesia','id-ID'],ne:['नेपाली','ne-NP'],tl:['Filipino','fil-PH'],es:['Español','es-ES'],fr:['Français','fr-FR']};
const DEFAULT_TARGETS=['en','zh','ja','vi','mn'];
const el=(tag,attrs={},children=[])=>{const node=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(v==null||v===false)continue;if(k==='text')node.textContent=v;else if(k.startsWith('on'))node.addEventListener(k.slice(2),v);else node.setAttribute(k,v===true?'':String(v))}for(const child of [].concat(children))if(child!=null)node.append(child);return node};
function token(){try{return sessionStorage.getItem('ekodi-auth-token')||''}catch{return ''}}
async function api(path,{method='GET',payload}={}){
  try{await window.EKODI_LIVE_AUTH?.()}catch{}
  const headers={accept:'application/json'};
  if(token())headers.authorization=`Bearer ${token()}`;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await fetch(API+path,{method,headers,credentials:'same-origin',body:payload===undefined?undefined:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({ok:false,error:'invalid_response'}));
  if(!response.ok||data.ok===false)throw Object.assign(new Error(data.error||`http_${response.status}`),{status:response.status,data});
  return data;
}
const q=`tenant=${encodeURIComponent(tenant)}`;
const ERR={authentication_required:'로그인 세션이 만료됐습니다. 다시 로그인해 주세요.',tenant_host_permission_required:'이 사이트의 방송 관리자 권한이 필요합니다.',stream_not_configured:'동시송출 엔진(Cloudflare Stream)이 아직 켜지지 않았습니다.',invalid_stream_key:'스트림 키를 다시 확인해 주세요.',ingest_host_not_allowed_for_platform:'선택한 플랫폼의 송출 주소가 아닙니다.',ingest_url_must_be_rtmp:'송출 주소는 rtmp:// 또는 rtmps:// 로 시작해야 합니다.',ingest_url_must_be_rtmps:'이 채널은 rtmps:// 주소만 사용할 수 있습니다.',target_language_required:'통역할 언어를 하나 이상 고르세요.',caption_session_ended:'통역 자막이 종료되었습니다.',stream_input_not_created:'먼저 송출 주소를 만드세요.',simulcast_destination_limit:'동시송출 채널은 최대 10개입니다.',relay_device_not_bound:'먼저 송출 PC를 지정하세요.',relay_binding_super_admin_required:'송출 PC 지정은 에코디 플랫폼 소유자 계정만 할 수 있습니다.',relay_device_not_found:'송출 PC를 찾을 수 없습니다.'};
const say=error=>ERR[error?.message]||ERR[error?.data?.error]||'처리하지 못했습니다. 잠시 뒤 다시 시도하세요.';

/* ---------------- viewer captions ---------------- */
const viewer={after:0,session:'',lang:'original',voice:false,timer:0,lines:[],spoken:Infinity,overlays:new Set()};
function captionLang(){const select=$('viewerListenLanguage')||$('streamListenLanguage');return select?.value||'original'}
function renderCaptions(){
  for(const overlay of viewer.overlays){
    overlay.replaceChildren(...viewer.lines.slice(-2).map(line=>el('p',{text:line})));
    overlay.hidden=!viewer.lines.length;
  }
}
function speak(text,lang){
  if(!viewer.voice||!('speechSynthesis' in window)||lang==='original')return;
  const utter=new SpeechSynthesisUtterance(text);utter.lang=(LANGS[lang]||[])[1]||lang;utter.rate=1.05;
  speechSynthesis.speak(utter);
}
async function pollCaptions(){
  clearTimeout(viewer.timer);
  if(document.hidden||!viewer.overlays.size){viewer.timer=setTimeout(pollCaptions,4000);return}
  const lang=captionLang();
  if(lang!==viewer.lang){viewer.lang=lang;viewer.after=0;viewer.lines=[];viewer.spoken=Infinity;renderCaptions()}
  let delay=1500;
  try{
    const data=await api(`/captions?${q}&lang=${encodeURIComponent(lang)}&after=${viewer.after}`);
    if(!data.session){viewer.session='';viewer.lines=[];delay=6000}
    else{
      if(data.session.id!==viewer.session){viewer.session=data.session.id;viewer.after=0;viewer.lines=[];viewer.spoken=Infinity}
      const firstLoad=viewer.spoken===Infinity;
      for(const seg of data.segments||[]){
        viewer.lines.push(seg.text);
        if(!firstLoad)speak(seg.text,data.lang);
      }
      viewer.lines=viewer.lines.slice(-6);
      viewer.after=data.next||viewer.after;viewer.spoken=viewer.after;
      for(const node of document.querySelectorAll('[data-caption-state]'))node.textContent=`자막 ${LANGS[data.lang]?.[0]||data.lang}`;
    }
    renderCaptions();
  }catch{delay=8000}
  viewer.timer=setTimeout(pollCaptions,delay);
}
function attachCaptionOverlay(stage){
  if(!stage||stage.querySelector('.live-caption-overlay'))return;
  const overlay=el('div',{class:'live-caption-overlay','aria-live':'polite',hidden:true});
  stage.append(overlay);viewer.overlays.add(overlay);
}
function voiceToggle(){
  const wrap=el('label',{class:'live-caption-voice'},[el('input',{type:'checkbox',onchange:e=>{viewer.voice=e.target.checked;if(!viewer.voice&&'speechSynthesis' in window)speechSynthesis.cancel()}}),el('span',{text:'통역 음성으로 듣기'}),el('small',{'data-caption-state':'',text:'자막 대기'})]);
  if(!('speechSynthesis' in window))wrap.querySelector('input').disabled=true;
  return wrap;
}
function setupViewer(){
  attachCaptionOverlay(document.querySelector('#viewerView .viewer-stage'));
  const select=$('viewerListenLanguage');
  if(select){
    for(const [code,[label]] of Object.entries(LANGS))if(!select.querySelector(`option[value="${code}"]`))select.append(el('option',{value:code,text:label}));
    select.closest('section')?.append(voiceToggle());
    select.addEventListener('change',()=>{viewer.after=0;pollCaptions()});
  }
}

/* ---------------- external stream (RTMPS encoder) viewer ---------------- */
async function setupStreamViewer(){
  const entry=$('entryView');if(!entry)return;
  try{
    const [sfu,stream]=await Promise.all([api(`/live?${q}`).catch(()=>({live:false})),api(`/simulcast/public?${q}`)]);
    if(sfu.live||!stream.live||!stream.player)return;
    const options=[el('option',{value:'original',text:'원음 자막'}),...Object.entries(LANGS).map(([code,[label]])=>el('option',{value:code,text:label}))];
    const select=el('select',{id:'streamListenLanguage','aria-label':'자막 언어'},options);
    select.addEventListener('change',()=>{viewer.after=0;pollCaptions()});
    const stage=el('div',{class:'stage live-stream-stage'},[el('iframe',{src:stream.player,title:'실시간 방송',allow:'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen',allowfullscreen:true,loading:'lazy'})]);
    const section=el('section',{class:'live-stream-viewer',id:'streamViewer'},[stage,el('div',{class:'interpretation-box language-control'},[el('div',{class:'source-head'},[el('strong',{text:'자막·통역 언어'})]),select,voiceToggle()])]);
    entry.after(section);
    attachCaptionOverlay(stage);
    const state=$('liveState');if(state)state.textContent='방송 중';
  }catch{}
}

/* ---------------- studio: interpretation console ---------------- */
function setupConsole(){
  const host=document.querySelector('[data-live-interpretation-console]');if(!host)return;
  const st={session:null,recog:null,listening:false,queue:Promise.resolve()};
  const sourceSelect=el('select',{'aria-label':'원어'},Object.entries(LANGS).map(([code,[label]])=>el('option',{value:code,text:label,selected:code==='ko'})));
  const targetSummary=el('summary',{class:'live-lang-summary','aria-label':'변환어 선택'});
  const targetList=el('div',{class:'live-lang-picks live-lang-menu',role:'group','aria-label':'변환어'},Object.entries(LANGS).map(([code,[label]])=>el('label',{},[el('input',{type:'checkbox',value:code,checked:DEFAULT_TARGETS.includes(code)}),el('span',{text:label})])));
  const targets=el('details',{class:'live-lang-dropdown'},[targetSummary,targetList]);
  const syncTargets=()=>{const picked=[...targetList.querySelectorAll('input')].filter(x=>x.checked&&!x.disabled);const names=picked.map(x=>LANGS[x.value][0]);targetSummary.textContent=names.length?(names.length>2?`${names.slice(0,2).join(', ')} 외 ${names.length-2}개`:names.join(', ')):'변환어를 선택하세요'};
  const syncSourceLock=()=>{for(const box of targetList.querySelectorAll('input')){const same=box.value===sourceSelect.value;box.closest('label').classList.toggle('is-source',same);if(same)box.checked=false}syncTargets()};
  targetList.addEventListener('change',syncTargets);targetSummary.addEventListener('click',e=>{if(targets.classList.contains('is-locked'))e.preventDefault()});sourceSelect.addEventListener('change',syncSourceLock);
  document.addEventListener('click',e=>{if(targets.open&&!targets.contains(e.target))targets.open=false});
  const state=el('span',{class:'live-addon-state',text:'대기'});
  const preview=el('p',{class:'live-caption-preview',text:'통역 자막을 시작하면 여기 원문과 번역이 보입니다.'});
  const startBtn=el('button',{type:'button',class:'primary',text:'통역 자막 시작'});
  const micBtn=el('button',{type:'button',text:'음성 자동 인식',disabled:true,'aria-pressed':'false'});
  const input=el('input',{maxlength:'400',autocomplete:'off',placeholder:'직접 입력 후 Enter',disabled:true});
  const form=el('form',{class:'chat-form'},[input,el('button',{type:'submit',text:'보내기',disabled:true})]);
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  syncSourceLock();
  const note=el('small',{class:'live-addon-note',text:SR?'설교 음성이 들리는 기기에서 자동 인식을 켜세요. 통역자가 직접 입력해도 됩니다.':'이 브라우저는 음성 인식을 지원하지 않습니다. Chrome·Edge를 쓰거나 직접 입력하세요.'});
  host.replaceChildren(el('div',{class:'source-head'},[el('strong',{text:'통역 상태'}),state]),el('div',{class:'live-lang-row'},[el('label',{class:'live-inline'},[el('span',{text:'원어'}),sourceSelect]),el('div',{class:'live-inline'},[el('span',{text:'변환어'}),targets])]),el('div',{class:'live-console-actions'},[startBtn,micBtn]),form,preview,note);
  const setRunning=on=>{startBtn.textContent=on?'통역 자막 종료':'통역 자막 시작';micBtn.disabled=!on||!SR;input.disabled=!on;form.querySelector('button').disabled=!on;sourceSelect.disabled=on;targets.classList.toggle('is-locked',on);if(on)targets.open=false;for(const box of targetList.querySelectorAll('input'))box.disabled=on};
  const send=text=>{const clean=String(text||'').trim();if(!clean||!st.session)return;st.queue=st.queue.then(async()=>{try{const data=await api(`/captions/sessions/${encodeURIComponent(st.session.id)}/segments`,{method:'POST',payload:{text:clean}});const t=data.translations.map(x=>`${x.lang.toUpperCase()}${x.status==='failed'?'(원문)':''}: ${x.text}`).join('\n');preview.textContent=`${data.source.text}\n${t}`;state.textContent=`송출 중 · #${data.seq} · ${data.latencyMs}ms`}catch(error){state.textContent=say(error);if(error.message==='caption_session_ended'){st.session=null;stopMic();setRunning(false)}}})};
  function stopMic(){st.listening=false;try{st.recog?.stop()}catch{}micBtn.setAttribute('aria-pressed','false');micBtn.textContent='음성 자동 인식'}
  function startMic(){
    if(!SR||!st.session)return;
    const recog=new SR();recog.lang=(LANGS[sourceSelect.value]||LANGS.ko)[1];recog.continuous=true;recog.interimResults=true;
    recog.onresult=event=>{let interim='';for(let i=event.resultIndex;i<event.results.length;i++){const r=event.results[i];if(r.isFinal)send(r[0].transcript);else interim+=r[0].transcript}if(interim)preview.textContent=`… ${interim}`};
    recog.onerror=event=>{if(['not-allowed','service-not-allowed'].includes(event.error)){stopMic();state.textContent='마이크 권한을 허용해 주세요.'}};
    recog.onend=()=>{if(st.listening)setTimeout(()=>{try{recog.start()}catch{}},250)};
    st.recog=recog;st.listening=true;try{recog.start()}catch{}
    micBtn.setAttribute('aria-pressed','true');micBtn.textContent='자동 인식 끄기';
  }
  micBtn.addEventListener('click',()=>st.listening?stopMic():startMic());
  form.addEventListener('submit',e=>{e.preventDefault();send(input.value);input.value=''});
  startBtn.addEventListener('click',async()=>{
    startBtn.disabled=true;
    try{
      if(st.session){stopMic();await api(`/captions/sessions/${encodeURIComponent(st.session.id)}/end`,{method:'POST',payload:{}}).catch(()=>{});st.session=null;setRunning(false);state.textContent='종료'}
      else{
        const picked=[...targetList.querySelectorAll('input:checked')].map(x=>x.value).filter(x=>x!==sourceSelect.value);if(!picked.length){state.textContent=ERR.target_language_required;targets.open=true;return}
        const data=await api('/captions/sessions',{method:'POST',payload:{tenant,sourceLang:sourceSelect.value,targetLangs:picked}});
        st.session=data.session;setRunning(true);
        state.textContent=`시작 · ${data.session.targetLangs.map(x=>x.toUpperCase()).join(' ')}${data.trimmedByPlan?` (요금제 한도로 ${data.trimmedByPlan}개 제외)`:''}`;
        if(SR)startMic();
      }
    }catch(error){state.textContent=say(error)}
    finally{startBtn.disabled=false}
  });
}

/* ---------------- studio: simulcast panel ---------------- */
function setupSimulcast(){
  const host=document.querySelector('[data-live-simulcast]');if(!host)return;
  const status=el('span',{class:'live-addon-state',text:'확인 전'});
  const content=el('div',{class:'live-simulcast-body'});
  const refresh=el('button',{type:'button',text:'확인',onclick:()=>load()});
  host.replaceChildren(el('div',{class:'external-head'},[el('strong',{text:'유튜브·페이스북 동시송출'}),refresh]),status,content);
  const fail=error=>{status.textContent=say(error);const url=error?.data?.loginUrl;if(error?.status===401||url){const link=el('a',{class:'studio-host-login',rel:'nofollow',text:'다시 로그인 · 진행자 권한 확인',href:url||`/auth/?site=${encodeURIComponent(body.dataset.authSite||tenant)}&select_account=1&return_to=${encodeURIComponent(location.href)}`});content.replaceChildren(link)}else content.replaceChildren()};
  const copyBtn=value=>el('button',{type:'button',text:'복사',onclick:async e=>{try{await navigator.clipboard.writeText(value);e.target.textContent='복사됨'}catch{}}});

  // EKODI-owned relay (EKODI-SIMULCAST-RELAY-001): OBS on the broadcast PC →
  // EKODI Device Agent → YouTube / Facebook / Instagram / other RTMP at once.
  const channelForm=(platforms,onAdded,enabled=true)=>{
    const platform=el('select',{'aria-label':'플랫폼'},platforms.map(p=>el('option',{value:p.id,text:p.label})));
    const label=el('input',{placeholder:'채널 이름 (예: 에코디교회 YouTube)',maxlength:'60'});
    const url=el('input',{placeholder:'rtmps://…','aria-label':'송출 서버 주소'});
    const key=el('input',{type:'password',placeholder:'스트림 키',autocomplete:'off','aria-label':'스트림 키'});
    const help=el('a',{target:'_blank',rel:'noopener',text:'스트림 키 받는 곳 ↗'});
    const sync=()=>{const p=platforms.find(x=>x.id===platform.value);url.value=p?.defaultUrl||'';help.href=p?.keyHelpUrl||'#';help.hidden=!p?.keyHelpUrl};
    platform.addEventListener('change',sync);sync();
    const submit=el('button',{type:'submit',class:'primary',text:'채널 추가',disabled:!enabled});
    const form=el('form',{class:'live-simulcast-add'},[el('strong',{class:'live-simulcast-add-title',text:'＋ 동시송출 채널 추가'}),platform,label,url,key,help,submit]);
    form.addEventListener('submit',async e=>{e.preventDefault();if(!key.value.trim()){status.textContent='스트림 키를 입력하세요.';key.focus();return}submit.disabled=true;try{await onAdded({platform:platform.value,url:url.value,streamKey:key.value,label:label.value});key.value='';label.value='';status.textContent='채널을 추가했습니다.';await load()}catch(error){status.textContent=say(error)}finally{submit.disabled=!enabled}});
    return form;
  };

  // EKODI-owned relay (EKODI-SIMULCAST-RELAY-001): OBS on the broadcast PC →
  // EKODI Device Agent → YouTube / Facebook / Instagram / other RTMP at once.
  async function renderRelay(){
    let r;
    try{r=await api(`/relay?${q}`)}catch(error){fail(error);return}
    const nodes=[el('p',{class:'live-addon-note',text:'에코디 송출 PC가 방송 하나를 받아 유튜브·페이스북 등 여러 채널로 동시에 내보냅니다. 추가 비용이 없습니다.'})];
    const addRelay=payload=>api('/relay/destinations',{method:'POST',payload:{tenant,...payload}});
    if(!r.binding){
      status.textContent='① 송출 PC 지정 → ② 채널 추가';
      if(!r.canBind){
        nodes.push(el('p',{class:'live-addon-note',text:'송출 PC 지정은 에코디 플랫폼 소유자 계정으로 로그인해야 할 수 있습니다. 지정 후 바로 아래에서 채널을 추가합니다.'}));
        nodes.push(channelForm(r.platforms||[],async()=>{throw new Error('relay_device_not_bound')},false));
        content.replaceChildren(...nodes);return;
      }
      let list;try{list=await api(`/relay/devices?${q}`)}catch(error){fail(error);return}
      const box=el('div',{class:'destination-options'},[el('strong',{class:'live-simulcast-add-title',text:'① 송출 PC 지정'})]);
      for(const d of list.devices){
        box.append(el('div',{class:'live-simulcast-row'},[el('label',{},[el('b',{text:d.label||d.hostname||d.id}),el('small',{text:`${d.hostname||''} · ${d.online?'온라인':'오프라인'} · Agent ${d.agentVersion||'?'}${d.relayCapable?'':' · 업데이트 필요'}`})]),el('button',{type:'button',class:d.online?'primary':'',text:'이 PC로 지정',onclick:async e=>{e.target.disabled=true;try{await api('/relay/bind',{method:'POST',payload:{tenant,deviceId:d.id}});status.textContent='송출 PC를 지정했습니다. 이제 채널을 추가하세요.';await load()}catch(error){status.textContent=say(error);e.target.disabled=false}}})]));
      }
      if(!list.devices.length)box.append(el('small',{},['등록된 PC가 없습니다. ',el('a',{href:'/admin/ops/devices',target:'_blank',rel:'noopener',text:'에코디 관리자 → 기기'}),'에서 방송 PC를 등록하세요.']));
      nodes.push(box,channelForm(r.platforms||[],async()=>{throw new Error('relay_device_not_bound')},false));
      content.replaceChildren(...nodes);return;
    }
    const dev=r.binding.device||{},last=r.lastResult?.relay;
    const running=last?.running,armed=r.binding.armed;
    status.textContent=!dev.online?'송출 PC 오프라인':armed?(running?'동시송출 대기 중 — OBS에서 방송을 시작하세요':'동시송출 준비 중'):'동시송출 꺼짐';
    nodes.push(el('small',{class:'live-addon-note',text:`송출 PC: ${dev.label||dev.hostname||r.binding.deviceId} · ${dev.online?'온라인':'오프라인'} · Agent ${dev.agentVersion||'?'}${dev.relayCapable?'':' (Agent 업데이트 필요)'}${r.pendingCommands?` · 처리 대기 ${r.pendingCommands}건`:''}`}));
    if(last?.lastError)nodes.push(el('small',{class:'live-addon-note',text:'최근 오류: '+last.lastError}));
    const list=el('div',{class:'destination-options'});
    for(const d of r.destinations){
      const toggle=el('input',{type:'checkbox',checked:d.enabled,onchange:async e=>{try{await api(`/relay/destinations/${encodeURIComponent(d.id)}`,{method:'POST',payload:{tenant,enabled:e.target.checked}})}catch(error){e.target.checked=!e.target.checked;status.textContent=say(error)}}});
      list.append(el('div',{class:'live-simulcast-row'},[el('label',{},[toggle,el('b',{text:d.label}),el('small',{text:`${d.ingestHost} · ${d.keyHint}`})]),el('button',{type:'button',text:'삭제',onclick:async()=>{if(!confirm(`${d.label} 채널을 삭제할까요?`))return;try{await api(`/relay/destinations/${encodeURIComponent(d.id)}`,{method:'DELETE',payload:{tenant}});await load()}catch(error){status.textContent=say(error)}}})]));
    }
    if(!r.destinations.length)list.append(el('small',{text:'연결된 채널이 없습니다. 아래에서 유튜브·페이스북·인스타그램을 추가하세요.'}));
    const act=(label,path,cls)=>el('button',{type:'button',class:cls||'',text:label,onclick:async e=>{e.target.disabled=true;try{await api(path,{method:'POST',payload:{tenant}});status.textContent='송출 PC에 전달했습니다. 10초 안에 반영됩니다.';setTimeout(load,12000)}catch(error){status.textContent=say(error)}finally{e.target.disabled=false}}});
    const obs=el('details',{class:'live-simulcast-obs'},[el('summary',{text:'OBS 연결 정보'}),el('div',{class:'live-simulcast-secret'},[el('label',{},[el('span',{text:'OBS 서버'}),el('input',{readonly:true,value:r.ingest.server}),copyBtn(r.ingest.server)]),el('label',{},[el('span',{text:'스트림 키'}),el('input',{readonly:true,value:r.ingest.streamKey}),copyBtn(r.ingest.streamKey)]),el('small',{class:'live-addon-note',text:r.ingest.note})])]);
    nodes.push(list,channelForm(r.platforms||[],addRelay,true),el('div',{class:'live-console-actions'},[armed?act('동시송출 끄기','/relay/disarm'):act('동시송출 켜기','/relay/arm','primary'),act('상태 확인','/relay/status')]),obs);
    content.replaceChildren(...nodes);
  }
  async function load(){
    status.textContent='확인 중';
    let data;
    try{data=await api(`/simulcast?${q}`)}catch(error){fail(error);return}
    if(!data.configured){await renderRelay();return}
    const nodes=[];
    if(!data.input){
      status.textContent='송출 주소 없음';
      nodes.push(el('button',{type:'button',class:'primary',text:'송출 주소 만들기',onclick:async e=>{e.target.disabled=true;try{await api('/simulcast/input',{method:'POST',payload:{tenant}});await load()}catch(error){status.textContent=say(error);e.target.disabled=false}}}));
      content.replaceChildren(...nodes);return;
    }
    status.textContent=data.input.state==='connected'?'방송 신호 수신 중':'방송 신호 대기 (OBS·Larix에서 송출 시작)';
    const secret=el('div',{class:'live-simulcast-secret'});
    nodes.push(el('button',{type:'button',text:'인코더 주소·키 보기',onclick:async()=>{try{const s=await api('/simulcast/input/reveal',{method:'POST',payload:{tenant}});secret.replaceChildren(el('label',{},[el('span',{text:'서버(URL)'}),el('input',{readonly:true,value:s.rtmpsUrl}),copyBtn(s.rtmpsUrl)]),el('label',{},[el('span',{text:'스트림 키'}),el('input',{readonly:true,type:'password',value:s.streamKey}),copyBtn(s.streamKey)]),el('small',{class:'live-addon-note',text:s.warning}))}catch(error){status.textContent=say(error)}}}),secret);
    const list=el('div',{class:'destination-options'});
    for(const out of data.outputs){
      const toggle=el('input',{type:'checkbox',checked:out.enabled,onchange:async e=>{try{await api(`/simulcast/outputs/${encodeURIComponent(out.id)}`,{method:'POST',payload:{enabled:e.target.checked}})}catch(error){e.target.checked=!e.target.checked;status.textContent=say(error)}}});
      list.append(el('div',{class:'live-simulcast-row'},[el('label',{},[toggle,el('b',{text:out.label}),el('small',{text:`${out.ingestHost} · ${out.keyHint}`})]),el('button',{type:'button',text:'삭제',onclick:async()=>{if(!confirm(`${out.label} 동시송출을 삭제할까요?`))return;try{await api(`/simulcast/outputs/${encodeURIComponent(out.id)}`,{method:'DELETE'});await load()}catch(error){status.textContent=say(error)}}})]));
    }
    if(!data.outputs.length)list.append(el('small',{text:'연결된 채널이 없습니다.'}));
    const platform=el('select',{},data.platforms.map(p=>el('option',{value:p.id,text:p.label})));
    const url=el('input',{placeholder:'rtmps://…',value:data.platforms[0]?.defaultUrl||''});
    const key=el('input',{type:'password',placeholder:'스트림 키',autocomplete:'off'});
    const label=el('input',{placeholder:'채널 이름 (예: 에코디교회 YouTube)',maxlength:'60'});
    const help=el('a',{target:'_blank',rel:'noopener',text:'키 받는 곳'});
    const syncHelp=()=>{const p=data.platforms.find(x=>x.id===platform.value);url.value=p?.defaultUrl||'';help.href=p?.keyHelpUrl||'#';help.hidden=!p?.keyHelpUrl};
    platform.addEventListener('change',syncHelp);syncHelp();
    const add=el('form',{class:'live-simulcast-add'},[platform,label,url,key,help,el('button',{type:'submit',class:'primary',text:'채널 추가'})]);
    add.addEventListener('submit',async e=>{e.preventDefault();try{await api('/simulcast/outputs',{method:'POST',payload:{tenant,platform:platform.value,url:url.value,streamKey:key.value,label:label.value}});key.value='';label.value='';await load()}catch(error){status.textContent=say(error)}});
    nodes.push(list,add);
    content.replaceChildren(...nodes);
  }
  host.closest('details')?.addEventListener('toggle',e=>{if(e.target.open)load()},{once:true});
  if(!host.closest('details'))load();
}

function boot(){setupViewer();setupConsole();setupSimulcast();setupStreamViewer();pollCaptions();document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollCaptions()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
