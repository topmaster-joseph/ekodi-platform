import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.EKODI_MY_CONFIG||{};
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const MODE_LABELS={writer:'Writer',video:'Video',podcast:'Podcast',lecture:'Educator',research:'Research',visual:'Visual',mission:'Mission',ai:'AI Creator'};
const MODE_KO={writer:'글·책',video:'영상·쇼츠',podcast:'오디오·팟캐스트',lecture:'강의·교육',research:'연구·전문지식',visual:'비주얼·디자인',mission:'설교·선교·공동체',ai:'AI 협업형 창작'};
const authUrl=cfg.authUrl||'https://auth.ekodi.kr/?site=my';
const dataEnabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=dataEnabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
let session=null;
let items=[];
let activeFilter='all';
let focusApplied=false;

function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])}
function compact(value,max=260){return String(value??'').replace(/\s+/g,' ').trim().slice(0,max)}
function mode(value){return MODE_LABELS[value]?value:'writer'}
function visibilityLabel(value){return value==='public'?'공개':value==='unlisted'?'링크 공개':'비공개'}
function cleanHash(){if(location.hash.includes('ekodi_token='))history.replaceState({},document.title,`${location.pathname}${location.search}`)}
async function consumeHandoff(){
  if(!sb||!location.hash.startsWith('#'))return;
  const params=new URLSearchParams(location.hash.slice(1));
  const tokenHash=params.get('ekodi_token');
  if(!tokenHash)return;
  const type=params.get('ekodi_type')||'email';
  const {error}=await sb.auth.verifyOtp({token_hash:tokenHash,type});
  cleanHash();
  if(error)throw error;
}
function renderAuth(){
  const button=$('#authButton');
  if(!dataEnabled){button.textContent='격리 스테이징';button.disabled=true;return}
  button.disabled=false;
  button.textContent=session?'로그아웃':'Google로 시작';
}
function renderIdentity(){
  const email=session?.user?.email||'';
  $('#identityName').textContent=email?email.split('@')[0]:'로그인 전';
  $('#identityEmail').textContent=email||'Google 인증 후 연결됩니다.';
  const known=items.find(item=>item.workspace_key)?.workspace_key;
  $('#workspaceKey').textContent=known|| (session?'personal: connected':'personal:…');
}
function renderSummary(){
  const modes=new Set(items.map(item=>mode(item.creator_mode)));
  $('#creatorCount').textContent=String(items.length);
  $('#modeCount').textContent=String(modes.size);
  $('#privateCount').textContent=String(items.filter(item=>item.visibility!=='public').length);
  $('#connectedCount').textContent=items.length||session?'1':'0';
}
function destinationText(item){
  const destinations=Array.isArray(item.destinations)?item.destinations:[];
  return destinations.length?destinations.join(' · '):'My EKODI';
}
function renderPortfolio(){
  const host=$('#creatorList');
  const visible=activeFilter==='all'?items:items.filter(item=>mode(item.creator_mode)===activeFilter);
  if(!dataEnabled){host.innerHTML='<div class="empty"><strong>격리 스테이징에서는 개인 데이터를 읽지 않습니다.</strong><p>화면과 연결 계약만 검증하고 실제 My EKODI 데이터는 운영환경에서만 불러옵니다.</p></div>';return}
  if(!session){host.innerHTML='<div class="empty"><strong>Google 인증 후 나의 창작물을 볼 수 있습니다.</strong><p>My EKODI는 다른 사람의 공개 피드가 아니라 먼저 나 자신을 위한 개인 허브입니다.</p></div>';return}
  if(!visible.length){host.innerHTML=`<div class="empty"><strong>${items.length?'이 유형의 창작물이 아직 없습니다.':'아직 My EKODI에 연결된 창작물이 없습니다.'}</strong><p>Creator AI에서 작업을 최종 승인한 뒤 “My EKODI에 등록”을 선택하면 여기에 비공개로 연결됩니다.</p></div>`;return}
  host.innerHTML=visible.map(item=>{
    const m=mode(item.creator_mode);
    const updated=item.updated_at?new Date(item.updated_at).toLocaleDateString('ko-KR'):'';
    return `<article class="portfolio-card" data-project="${esc(item.project_id)}"><small>${esc(MODE_LABELS[m])} · ${esc(MODE_KO[m])}</small><h3>${esc(item.title||'제목 없는 창작물')}</h3><p>${esc(compact(item.summary)||'Creator AI에서 연결된 나의 창작물입니다.')}</p><div class="meta"><span>${esc(visibilityLabel(item.visibility))}</span><span>${esc(destinationText(item))}</span>${updated?`<span>${esc(updated)}</span>`:''}</div><div class="actions"><a class="secondary" href="https://author.ekodi.kr/#projects">Creator AI에서 열기</a></div></article>`;
  }).join('');
  applyFocus();
}
function applyFocus(){
  if(focusApplied)return;
  const project=new URLSearchParams(location.search).get('creator_project');
  if(!project)return;
  const card=[...document.querySelectorAll('[data-project]')].find(node=>node.dataset.project===project);
  if(!card)return;
  card.classList.add('focus');
  card.scrollIntoView({behavior:'smooth',block:'center'});
  focusApplied=true;
}
async function loadItems(){
  if(!sb||!session){items=[];renderIdentity();renderSummary();renderPortfolio();return}
  const {data,error}=await sb.from('creator_portfolio_items').select('id,project_id,workspace_key,title,summary,creator_mode,status,visibility,source_service,destinations,metadata,published_at,updated_at').order('updated_at',{ascending:false});
  if(error)throw error;
  items=data||[];
  renderIdentity();renderSummary();renderPortfolio();
}
async function authAction(){
  if(!dataEnabled)return;
  if(!session){location.assign(authUrl);return}
  await sb.auth.signOut();
  session=null;items=[];focusApplied=false;renderAuth();renderIdentity();renderSummary();renderPortfolio();
}
async function refresh(){
  const button=$('#refreshButton');
  button.disabled=true;
  const before=button.textContent;
  button.textContent='새로고침 중…';
  try{await loadItems()}catch(error){console.error('My EKODI refresh',error);button.textContent='불러오기 실패';setTimeout(()=>{button.textContent=before;button.disabled=false},1800);return}
  button.textContent='새로고침 완료';
  setTimeout(()=>{button.textContent=before;button.disabled=false},1000);
}

$('#authButton').addEventListener('click',authAction);
$('#refreshButton').addEventListener('click',refresh);
$$('[data-filter]').forEach(button=>button.addEventListener('click',()=>{
  activeFilter=button.dataset.filter||'all';
  $$('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));
  renderPortfolio();
}));

if(!dataEnabled){
  renderAuth();renderIdentity();renderSummary();renderPortfolio();
}else{
  try{await consumeHandoff()}catch(error){console.error('My EKODI auth handoff',error)}
  const {data}=await sb.auth.getSession();session=data.session;renderAuth();
  try{await loadItems()}catch(error){console.error('My EKODI load',error);$('#creatorList').innerHTML='<div class="empty"><strong>내 창작물을 불러오지 못했습니다.</strong><p>데이터를 변경하지 않았습니다. 잠시 후 새로고침해 주세요.</p></div>';renderIdentity();renderSummary()}
  sb.auth.onAuthStateChange(async(_event,next)=>{session=next;renderAuth();try{await loadItems()}catch(error){console.error('My EKODI session refresh',error)}});
}
