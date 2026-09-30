const cfg=window.EKODI_MANAGEMENT_CONFIG||{};
const SESSION_KEY='ekodi-management-session';
const SELECTION_KEY='ekodi-management-selection-v1';
const $=id=>document.getElementById(id);
const state={session:null,catalog:[],selection:null};

function storedSession(){try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');return value?.accessToken&&value?.refreshToken?value:null}catch{return null}}
function saveSession(value){state.session=value;sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));renderIdentity()}
function clearSession(){state.session=null;sessionStorage.removeItem(SESSION_KEY);renderIdentity()}
function storedSelection(){try{return JSON.parse(localStorage.getItem(SELECTION_KEY)||'null')||{workspaceKind:'person',modules:['chief','marketing']}}catch{return{workspaceKind:'person',modules:['chief','marketing']}}}
function authUrl(){return cfg.authUrl||'https://auth.ekodi.kr/?site=management&return_to=https%3A%2F%2Fmanagement.ekodi.kr%2F'}
function renderIdentity(){
  const member=Boolean(state.session?.accessToken);document.body.dataset.member=member?'1':'0';$('memberApp').hidden=!member;
  const auth=$('authLink');auth.href=member?'#logout':authUrl();auth.textContent=member?'로그아웃':'Google 로그인';
  if(member)$('memberMeta').textContent=`무료등급 · ${state.session?.user?.email||'Google 회원'} · 기능 선택형`;
}
function sessionExpiry(value){const explicit=Number(value?.expiresAt||0);return explicit>0?explicit:Math.floor(Date.now()/1000)+Number(value?.expiresIn||3600)}
async function exchangeCentralToken(){
  const params=new URLSearchParams(location.hash.slice(1));const tokenHash=params.get('ekodi_token');if(!tokenHash)return false;
  const response=await fetch('/api/auth/exchange',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tokenHash,type:params.get('ekodi_type')||'email'})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'auth_exchange_failed');data.expiresAt=sessionExpiry(data);saveSession(data);history.replaceState(null,'',location.pathname+location.search);return true;
}
async function loadCatalog(){
  const response=await fetch('/api/catalog',{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`catalog_${response.status}`);const data=await response.json();state.catalog=data.modules||[];renderPublicCatalog();renderMemberPicker();
}
function renderPublicCatalog(){
  const host=$('publicModuleGrid');host.replaceChildren();
  state.catalog.forEach(module=>{const card=document.createElement('article');card.className='module-card';card.dataset.state=module.state;const strong=document.createElement('strong');strong.textContent=module.name;const copy=document.createElement('p');copy.textContent=module.description||moduleDescription(module.id);const small=document.createElement('small');small.textContent=module.state==='existing'?'기존 공통서비스 연결':module.phase===1?'1차 구축군':'2차 확장군';card.append(strong,copy,small);host.append(card)});
}
function moduleDescription(id){return({chief:'전체 전문 AI를 연결하고 다음 행동을 제안합니다.',marketing:'콘텐츠·캠페인·채널 운영을 맡습니다.',menu:'여러 판매채널의 메뉴 원본과 매핑을 한곳에서 관리합니다.',order:'QR·포장·배달앱 등 들어오는 주문 흐름을 관리합니다.',review:'여러 채널의 리뷰를 모아 분석하고 답변 초안을 만듭니다.',customer:'고객·재방문·휴면·관계 흐름을 관리합니다.',sales:'매출 변화와 메뉴·채널 성과를 분석합니다.',inventory:'재고·품절·발주 신호를 관리합니다.',delivery:'주문 이후 배달 배정과 상태를 관리합니다.',settlement:'채널별 정산·수수료·손익을 맞춥니다.',staff:'근무·업무·교육 흐름을 관리합니다.',booking:'예약·변경·알림·노쇼를 관리합니다.'})[id]||'전문 경영 기능을 담당합니다.'}
function renderMemberPicker(){
  if(!state.selection)state.selection=storedSelection();$('workspaceKind').value=state.selection.workspaceKind||'person';const selected=new Set(state.selection.modules||[]);const host=$('memberModuleGrid');host.replaceChildren();
  state.catalog.forEach(module=>{const label=document.createElement('label');label.className='module-choice';const input=document.createElement('input');input.type='checkbox';input.value=module.id;input.checked=selected.has(module.id);const text=document.createElement('span');const strong=document.createElement('strong');strong.textContent=module.name;const small=document.createElement('small');small.textContent=module.state==='existing'?'바로 연결 가능':module.phase===1?'1차 구축군':'2차 확장군';text.append(strong,small);label.append(input,text);host.append(label)});
}
function saveSelection(){
  if(!state.session){location.assign(authUrl());return}
  const modules=[...document.querySelectorAll('#memberModuleGrid input:checked')].map(input=>input.value);state.selection={workspaceKind:$('workspaceKind').value,modules};localStorage.setItem(SELECTION_KEY,JSON.stringify(state.selection));$('saveStatus').textContent=`저장됨 · ${modules.length}개 AI 선택 · 회원등급과 기능선택은 서로 독립적으로 유지됩니다.`;
}
function logout(){clearSession();location.hash='';$('saveStatus').textContent='로그아웃했습니다. 실제 기능은 Google 로그인한 무료회원부터 이용할 수 있습니다.'}
async function boot(){
  state.session=storedSession();renderIdentity();try{await exchangeCentralToken()}catch(error){console.error('management auth exchange',error);clearSession()}
  try{await loadCatalog()}catch(error){console.error(error);$('publicModuleGrid').textContent='서비스 목록을 불러오지 못했습니다.'}
}

$('saveSelection').addEventListener('click',saveSelection);$('logoutButton').addEventListener('click',logout);$('authLink').addEventListener('click',event=>{if(state.session){event.preventDefault();logout()}});
boot();
