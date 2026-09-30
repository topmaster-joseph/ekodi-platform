const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CONNECT_API=`${SUPABASE_URL}/functions/v1/connect-api`;
const sb=window.supabase.createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const LABELS={friend:'친구',colleague:'동료',mentor:'멘토',collaborator:'협력자',marriage:'배우자'};
const VALUES=['정직','배려','책임','성장','가족','공동체','나눔','유머','안정','도전','신앙 존중','생활 균형'];
const PRIORITIES=['관계','가족','일과 사명','배움','건강한 생활','지역 공동체','재정 안정','새로운 도전','봉사와 나눔','문화와 여행'];
const FOCUS_KEY='ekodi.connect.focus';
const state={session:null,settings:null,communityProfile:null,intent:'',focus:null};

function toast(t){
  const e=$('#toast');
  e.textContent=t;
  e.classList.add('show');
  clearTimeout(toast.t);
  toast.t=setTimeout(()=>e.classList.remove('show'),2300);
}

function readFocus(){
  try{
    const raw=sessionStorage.getItem(FOCUS_KEY);
    if(!raw)return null;
    const item=JSON.parse(raw);
    if(!/^[0-9a-f-]{36}$/i.test(String(item?.user_id||''))||Number(item?.expires_at||0)<Date.now()){sessionStorage.removeItem(FOCUS_KEY);return null}
    return {user_id:String(item.user_id),display_name:String(item.display_name||'EKODI 회원').slice(0,80),source:'community'};
  }catch{sessionStorage.removeItem(FOCUS_KEY);return null}
}
function clearFocus(userId=''){
  if(userId&&state.focus?.user_id!==userId)return;
  try{sessionStorage.removeItem(FOCUS_KEY)}catch{}
  state.focus=null;
}

function login(){
  location.href='https://auth.ekodi.kr/?site=community&return_to='+encodeURIComponent('/connect/');
}

async function logout(){
  await sb.auth.signOut();
  location.reload();
}

async function exchangeCentralToken(){
  const p=new URLSearchParams(location.hash.slice(1));
  const token=p.get('ekodi_token');
  const type=p.get('ekodi_type')||'email';
  if(!token)return;
  try{
    const {error}=await sb.auth.verifyOtp({token_hash:token,type});
    if(error)throw error;
    history.replaceState(null,'',location.pathname+location.search);
    toast('EKODI Connect에 연결되었습니다.');
  }catch(e){
    console.error(e);
    toast('로그인 연결을 완료하지 못했습니다.');
  }
}

async function api(path,options={}){
  const session=state.session||(await sb.auth.getSession()).data.session;
  if(!session)throw new Error('login_required');
  const headers={apikey:PUBLISHABLE_KEY,authorization:`Bearer ${session.access_token}`,...(options.headers||{})};
  if(options.body&&!headers['content-type'])headers['content-type']='application/json';
  const r=await fetch(`${CONNECT_API}${path}`,{...options,headers,cache:'no-store'});
  const text=await r.text();
  let data={};
  try{data=text?JSON.parse(text):{}}catch{}
  if(!r.ok)throw Object.assign(new Error(data.error||`http_${r.status}`),{status:r.status,data});
  return data;
}

function openModal(id){
  $(id).classList.add('open');
  $(id).setAttribute('aria-hidden','false');
}

function closeModals(){
  $$('.modal.open').forEach(e=>{
    e.classList.remove('open');
    e.setAttribute('aria-hidden','true');
  });
}

function chips(host,values,name,labels=null){
  host.replaceChildren();
  values.forEach(v=>{
    const l=document.createElement('label');
    l.className='choice';
    const i=document.createElement('input');
    i.type='checkbox';
    i.name=name;
    i.value=v;
    const s=document.createElement('span');
    s.textContent=labels?.[v]||v;
    l.append(i,s);
    host.append(l);
  });
}

function selected(form,name){
  return $$(`input[name="${name}"]:checked`,form).map(x=>x.value);
}

function fill(name,values){
  $$(`input[name="${name}"]`,$('#settingsForm')).forEach(x=>x.checked=(values||[]).includes(x.value));
}

function updateMarriageBox(){
  const f=$('#settingsForm');
  const on=$('input[name="intents"][value="marriage"]',f)?.checked;
  $('#marriageBox').hidden=!on;
  if(!on){
    f.marriage_enabled.checked=false;
    f.age_19_confirmed.checked=false;
  }
}

function updateStatus(){
  const enabled=state.settings?.discoverable===true;
  $('#discoverableLabel').textContent=enabled?'켜짐':'꺼짐';
  $('#currentIntentLabel').textContent=state.intent?LABELS[state.intent]:'선택 전';
  $$('#intentGrid button').forEach(b=>b.classList.toggle('active',b.dataset.intent===state.intent));
}

function renderCard(p){
  const card=document.createElement('article');
  card.className='person-card';
  const focused=state.focus?.user_id===p.user_id;
  if(focused)card.classList.add('focus-card');
  const head=document.createElement('div');
  head.className='person-head';
  const av=document.createElement('span');
  av.className='avatar';
  av.textContent=(p.display_name||'?').charAt(0);
  const info=document.createElement('div');
  const h=document.createElement('h3');
  h.textContent=p.display_name||'EKODI 회원';
  const sm=document.createElement('small');
  sm.textContent=p.region||'지역 비공개';
  info.append(h,sm);
  head.append(av,info);
  const bio=document.createElement('p');
  bio.textContent=p.bio||'서로 공개를 허용한 EKODI 회원입니다.';
  const tags=document.createElement('div');
  tags.className='tag-row';
  [...(p.shared_values||[]),...(p.shared_priorities||[]),...(p.shared_interests||[])].slice(0,6).forEach(v=>{
    const s=document.createElement('span');
    s.className='tag';
    s.textContent=v;
    tags.append(s);
  });
  const why=document.createElement('div');
  why.className='why';
  why.textContent=(p.reasons||[]).join(' · ')||'공개된 정보 안에서 연결 가능성을 발견했습니다.';
  const actions=document.createElement('div');
  actions.className='card-actions';
  const pass=document.createElement('button');
  pass.className='pass';
  pass.textContent='이번엔 지나가기';
  pass.onclick=()=>act('pass',p,card);
  const interest=document.createElement('button');
  interest.className='interest';
  interest.textContent='관심 보내기';
  interest.onclick=()=>act('interest',p,card);
  const more=document.createElement('button');
  more.className='more';
  more.textContent='⋯';
  more.title='신고/차단';
  more.onclick=()=>openReport(p.user_id);
  actions.append(pass,interest,more);
  card.append(head);
  if(focused){const note=document.createElement('div');note.className='focus-note';note.textContent='Community에서 선택한 사람 · 이 목적의 공개 조건 확인됨';card.append(note)}
  card.append(bio,tags,why,actions);
  return card;
}

function buildConnectionRow(item,{pending=false}={}){
  const person=item.person||{};
  const row=document.createElement('article');
  row.className='match-row';
  const av=document.createElement('span');
  av.className='avatar';
  av.textContent=(person.display_name||'?').charAt(0);
  const c=document.createElement('div');
  c.className='match-copy';
  const h=document.createElement('h3');
  h.textContent=person.display_name||'EKODI 회원';
  const p=document.createElement('p');
  p.textContent=`${LABELS[item.intent]||item.intent} · ${person.region||'지역 비공개'} · 연락처 비공개`;
  c.append(h,p);
  const badge=document.createElement('span');
  badge.className='match-badge';
  badge.textContent=pending?'응답 대기':'상호 관심';
  const actions=document.createElement('div');
  actions.className='match-actions';
  const withdraw=document.createElement('button');
  withdraw.className='text-button danger-link';
  withdraw.textContent=pending?'관심 철회':'연결 종료';
  withdraw.onclick=()=>withdrawInterest(person.user_id,item.intent,!pending);
  const safety=document.createElement('button');
  safety.className='text-button';
  safety.textContent='안전';
  safety.onclick=()=>openReport(person.user_id);
  actions.append(withdraw,safety);
  row.append(av,c,badge,actions);
  return row;
}

async function loadRecommendations(){
  if(!state.intent)return;
  $('#recommendationTitle').textContent=`${LABELS[state.intent]} 연결을 찾습니다`;
  $('#refreshBtn').hidden=false;
  const notice=$('#recommendationNotice');
  notice.textContent='서로 같은 목적을 켜고 공개를 허용한 사람만 확인하고 있습니다.';
  $('#peopleGrid').replaceChildren();
  try{
    const data=await api(`/recommendations?intent=${encodeURIComponent(state.intent)}`);
    if(data.reason==='profile_required'){
      notice.innerHTML='Community 연결 프로필이 먼저 필요합니다. <a href="/">Community에서 프로필 만들기</a>';
      return;
    }
    if(['intent_not_enabled','marriage_not_enabled','adult_confirmation_required'].includes(data.reason)){
      notice.textContent='이 목적의 추천을 받으려면 내 연결 설정에서 공개와 해당 목적의 안전 조건을 확인해 주세요.';
      return;
    }
    const people=data.people||[];
    const focusIndex=state.focus?people.findIndex(p=>p.user_id===state.focus.user_id):-1;
    const ordered=focusIndex>0?[people[focusIndex],...people.filter((_,i)=>i!==focusIndex)]:people;
    if(!people.length){
      notice.textContent=state.focus?'Community에서 선택한 사람은 이 연결 목적의 현재 공개 조건에 맞지 않습니다. 조건을 우회하거나 추측하지 않습니다.':'현재 서로의 공개 조건에 맞는 새 연결이 없습니다. 사람을 채우기 위해 조건을 억지로 넓히지는 않습니다.';
      return;
    }
    if(state.focus&&focusIndex>=0)notice.textContent=`Community에서 선택한 ${state.focus.display_name}님을 먼저 표시했습니다. 이 목적에 서로 공개를 허용한 경우에만 보입니다.`;
    else if(state.focus)notice.textContent='Community에서 선택한 사람은 이 연결 목적의 현재 공개 조건에 맞지 않습니다. 조건을 우회하지 않고 다른 추천만 보여드립니다.';
    else notice.textContent=`${people.length}개의 가능한 연결을 발견했습니다. 점수는 선별 판정이 아니라 공개된 공통점의 정렬 기준입니다.`;
    ordered.forEach(p=>$('#peopleGrid').append(renderCard(p)));
  }catch(e){
    console.error(e);
    notice.textContent='추천을 불러오지 못했습니다.';
  }
}

async function act(kind,p,card){
  try{
    if(kind==='pass'){
      await api('/pass',{method:'POST',body:JSON.stringify({target_user_id:p.user_id,intent:state.intent})});
      clearFocus(p.user_id);
      card.remove();
      toast('이번 추천에서 숨겼습니다.');
      return;
    }
    const data=await api('/interest',{method:'POST',body:JSON.stringify({target_user_id:p.user_id,intent:state.intent})});
    clearFocus(p.user_id);
    card.remove();
    if(data.mutual){
      toast('서로 관심이 닿았습니다 ✨');
      await Promise.all([loadMatches(),loadOutgoing()]);
    }else{
      toast('관심을 보냈습니다. 상대에게 연락처는 공개되지 않습니다.');
      await loadOutgoing();
    }
  }catch(e){
    console.error(e);
    toast('요청을 처리하지 못했습니다.');
  }
}

async function loadOutgoing(){
  try{
    const data=await api('/outgoing');
    const host=$('#outgoingList');
    const items=data.outgoing||[];
    host.replaceChildren();
    items.forEach(item=>host.append(buildConnectionRow(item,{pending:true})));
    $('#outgoingEmpty').hidden=items.length>0;
  }catch(e){
    console.error(e);
  }
}

async function loadMatches(){
  try{
    const data=await api('/matches');
    const host=$('#matchList');
    const matches=data.matches||[];
    host.replaceChildren();
    matches.forEach(m=>host.append(buildConnectionRow(m)));
    $('#matchEmpty').hidden=matches.length>0;
  }catch(e){
    console.error(e);
  }
}

async function withdrawInterest(targetUserId,intent,matched=false){
  const message=matched?'이 상호 연결을 종료하시겠습니까? 종료해도 상대의 연락처가 공개되지는 않습니다.':'보낸 관심을 철회하시겠습니까?';
  if(!window.confirm(message))return;
  try{
    await api('/withdraw',{method:'POST',body:JSON.stringify({target_user_id:targetUserId,intent})});
    toast(matched?'연결 동의를 철회했습니다.':'보낸 관심을 철회했습니다.');
    await Promise.all([loadOutgoing(),loadMatches()]);
  }catch(e){
    console.error(e);
    toast('철회를 처리하지 못했습니다.');
  }
}

function openSettings(){
  const f=$('#settingsForm');
  const s=state.settings||{};
  fill('intents',s.intents||[]);
  fill('relationship_values',s.relationship_values||[]);
  fill('life_priorities',s.life_priorities||[]);
  f.conversation_style.value=s.conversation_style||'';
  f.discoverable.checked=s.discoverable===true;
  f.age_19_confirmed.checked=s.age_19_confirmed===true;
  f.marriage_enabled.checked=s.marriage_enabled===true;
  f.consent.checked=false;
  updateMarriageBox();
  openModal('#settingsModal');
}

async function saveSettings(ev){
  ev.preventDefault();
  const f=ev.currentTarget;
  const payload={
    intents:selected(f,'intents'),
    relationship_values:selected(f,'relationship_values'),
    life_priorities:selected(f,'life_priorities'),
    conversation_style:f.conversation_style.value,
    discoverable:f.discoverable.checked,
    age_19_confirmed:f.age_19_confirmed.checked,
    marriage_enabled:f.marriage_enabled.checked,
    consent:f.consent.checked
  };
  if(payload.marriage_enabled&&!payload.age_19_confirmed)return toast('결혼 Match는 만 19세 이상 확인이 필요합니다.');
  if((payload.discoverable||payload.marriage_enabled)&&!payload.consent)return toast('공개와 철회 원칙 확인이 필요합니다.');
  const btn=$('button[type="submit"]',f);
  btn.disabled=true;
  try{
    const data=await api('/settings',{method:'POST',body:JSON.stringify(payload)});
    state.settings=data.connect;
    closeModals();
    updateStatus();
    toast('연결 설정을 저장했습니다.');
    if(state.intent)await loadRecommendations();
  }catch(e){
    console.error(e);
    toast(e.message==='consent_required'?'동의 확인이 필요합니다.':e.message==='adult_confirmation_required'?'결혼 Match는 만 19세 이상 확인이 필요합니다.':'설정을 저장하지 못했습니다.');
  }finally{
    btn.disabled=false;
  }
}

function openReport(id){
  const f=$('#reportForm');
  f.reset();
  f.target_user_id.value=id;
  f.block.checked=true;
  openModal('#reportModal');
}

async function sendReport(ev){
  ev.preventDefault();
  const f=ev.currentTarget;
  try{
    await api('/report',{method:'POST',body:JSON.stringify({target_user_id:f.target_user_id.value,category:f.category.value,detail:f.detail.value,block:f.block.checked})});
    clearFocus(f.target_user_id.value);
    closeModals();
    toast('신고를 접수하고 해당 연결을 숨겼습니다.');
    if(state.intent)await loadRecommendations();
    await Promise.all([loadMatches(),loadOutgoing()]);
  }catch(e){
    console.error(e);
    toast('신고를 접수하지 못했습니다.');
  }
}

async function chooseIntent(intent){
  state.intent=intent;
  updateStatus();
  if(!state.session)return login();
  if(!state.settings?.intents?.includes(intent)||(intent==='marriage'&&(!state.settings?.marriage_enabled||!state.settings?.age_19_confirmed))){
    openSettings();
    toast(`${LABELS[intent]} 연결을 사용하려면 내 설정에서 직접 허용해 주세요.`);
    return;
  }
  await loadRecommendations();
}

async function init(){
  chips($('#intentChoices'),Object.keys(LABELS),'intents',LABELS);
  chips($('#valueChoices'),VALUES,'relationship_values');
  chips($('#priorityChoices'),PRIORITIES,'life_priorities');
  $('input[name="intents"][value="marriage"]',$('#settingsForm')).addEventListener('change',updateMarriageBox);
  $$('[data-close]').forEach(x=>x.addEventListener('click',closeModals));
  $$('[data-login]').forEach(x=>x.addEventListener('click',login));
  $('#loginBtn').addEventListener('click',()=>state.session?logout():login());
  $('#settingsBtn').addEventListener('click',openSettings);
  $('#settingsForm').addEventListener('submit',saveSettings);
  $('#reportForm').addEventListener('submit',sendReport);
  $('#refreshBtn').addEventListener('click',loadRecommendations);
  $$('#intentGrid button').forEach(b=>b.addEventListener('click',()=>chooseIntent(b.dataset.intent)));
  await exchangeCentralToken();
  state.session=(await sb.auth.getSession()).data.session;
  if(!state.session){
    $('#signedOutPanel').hidden=false;
    $('#signedInArea').hidden=true;
    return;
  }
  $('#signedOutPanel').hidden=true;
  $('#signedInArea').hidden=false;
  state.focus=readFocus();
  $('#loginBtn').textContent='로그아웃';
  try{
    const data=await api('/settings');
    state.settings=data.connect;
    state.communityProfile=data.communityProfile;
    updateStatus();
    await Promise.all([loadMatches(),loadOutgoing()]);
    if(!state.settings)setTimeout(openSettings,250);
    else if(state.focus)setTimeout(()=>toast(`${state.focus.display_name}님을 이어서 보려면 연결 목적을 선택하세요.`),250);
  }catch(e){
    console.error(e);
    toast('Connect 정보를 불러오지 못했습니다.');
  }
}

init();
