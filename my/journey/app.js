import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { EKODI_LIFE_JOURNEY } from '../life-journey.js';

const cfg=window.EKODI_MY_CONFIG||{};
const $=selector=>document.querySelector(selector);
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
let session=null;
const access=new Map();
let reflections=[];

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const activeStages=()=>EKODI_LIFE_JOURNEY.stages.filter(stage=>stage.state==='active');

function authStartUrl(){
  const target=new URL('https://auth.ekodi.kr/');
  target.searchParams.set('site','my');
  target.searchParams.set('return_to','https://my.ekodi.kr/journey/');
  return target.href;
}
function serviceUrl(stage){
  if(stage.state!=='active'||!stage.route)return '';
  if(!session)return stage.route;
  const target=new URL('https://auth.ekodi.kr/');
  target.searchParams.set('site',stage.ownerService);
  target.searchParams.set('return_to',stage.route);
  return target.href;
}
function accessConnected(site){
  const row=access.get(site)||{};
  return ['active','pre_registered'].includes(String(row.status||''));
}
function stateLabel(stage){
  if(stage.state==='planned')return '준비 중';
  if(!enabled)return '운영 서비스';
  return accessConnected(stage.ownerService)?'연결됨':'사용 가능';
}
function renderIdentity(){
  const meta=session?.user?.user_metadata||{};
  const email=session?.user?.email||'';
  $('#journeyStatus').textContent=!enabled?'Isolated':session?'Signed in':'Guest';
  $('#identityName').textContent=session?(meta.full_name||meta.name||email.split('@')[0]||'EKODI Member'):'로그인 전';
  $('#identityText').textContent=!enabled?'격리 환경에서는 개인 접근권한을 읽지 않습니다.':session?'현재 EKODI 로그인 상태로 운영 중인 전문 플랫폼의 연결 상태를 확인합니다.':'로그인하면 이용 중인 전문 플랫폼 상태를 함께 확인합니다.';
  const button=$('#authButton');
  button.disabled=!enabled;
  button.textContent=!enabled?'격리 스테이징':session?'로그아웃':'Google로 시작';
}
function stageCard(stage,index){
  const connected=stage.state==='active'&&accessConnected(stage.ownerService);
  const status=stateLabel(stage);
  const services=[stage.ownerService,...(stage.supportingServices||[])].filter(Boolean);
  const meta=services.length?services.map(service=>`<span>${esc(service)}</span>`).join(''):'';
  const content=`<span class="journey-step"><small>${esc(stage.shortLabel)}</small><span class="journey-number">${index+1}</span></span><span class="journey-state ${esc(stage.state)}">${esc(status)}</span><h3>${esc(stage.label)}</h3><p>${esc(stage.summary)}</p><div class="meta">${meta}</div><span class="journey-action">${stage.state==='active'?(connected?'계속하기 →':'열기 →'):'검증 후 공개'}</span>`;
  if(stage.state!=='active')return `<article class="journey-card" aria-disabled="true">${content}</article>`;
  return `<a class="journey-card" href="${esc(serviceUrl(stage))}">${content}</a>`;
}
function renderJourney(){
  const host=$('#journeyList');
  host.innerHTML=EKODI_LIFE_JOURNEY.stages.map(stageCard).join('');
}
async function handoff(){
  if(!sb||!location.hash.startsWith('#'))return;
  const params=new URLSearchParams(location.hash.slice(1));
  const token=params.get('ekodi_token');
  if(!token)return;
  const {error}=await sb.auth.verifyOtp({token_hash:token,type:params.get('ekodi_type')||'email'});
  history.replaceState({},document.title,location.pathname+location.search);
  if(error)throw error;
}
async function loadAccess(){
  access.clear();
  if(!sb||!session)return;
  await Promise.all(activeStages().map(async stage=>{
    const {data,error}=await sb.rpc('current_site_access',{p_site_key:stage.ownerService});
    if(!error)access.set(stage.ownerService,data||{status:'unregistered'});
  }));
}
function renderReflections(){
  const host=$('#lifeReflectionList');if(!host)return;
  if(!session){host.innerHTML='<div class="empty"><strong>로그인하면 저장한 질문을 확인할 수 있습니다.</strong></div>';return;}
  if(!reflections.length){host.innerHTML='<div class="empty"><strong>아직 저장한 질문이 없습니다.</strong><p>인생AI에서 “나의 여정에 저장”을 선택하면 이곳에 나타납니다.</p></div>';return;}
  host.innerHTML=reflections.map(row=>{const date=row.created_at?new Date(row.created_at).toLocaleDateString('ko-KR'):'';const scripture=(row.scriptures||[]).join(' · ');return '<article class="question-journey-card"><small>'+esc(date)+' · '+esc(row.topic||'삶')+'</small><h3>'+esc(row.root_question||row.question_text||'오늘의 질문')+'</h3><p>'+esc(row.question_text||'')+'</p>'+(scripture?'<span class="question-scripture">'+esc(scripture)+'</span>':'')+'<strong>오늘의 한 걸음</strong><p>'+esc(row.action_text||'')+'</p></article>';}).join('');
}
async function loadReflections(){
  reflections=[];if(!sb||!session){renderReflections();return;}
  try{const response=await fetch('https://life.ekodi.kr/api/journey',{headers:{authorization:`Bearer ${session.access_token}`},cache:'no-store'});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||`life_${response.status}`);reflections=Array.isArray(payload.reflections)?payload.reflections:[]}catch(error){console.error('life reflections contract',error);reflections=[]}renderReflections();
}
async function refresh(){
  if(enabled&&sb){
    const {data}=await sb.auth.getSession();
    session=data.session;
    await loadAccess();
  }
  renderIdentity();
  renderJourney();
}
async function authAction(){
  if(!enabled)return;
  if(!session){location.assign(authStartUrl());return;}
  await sb.auth.signOut();
  session=null;
  access.clear();
  renderIdentity();
  renderJourney();
}

$('#authButton').addEventListener('click',authAction);
if(enabled){
  try{await handoff();}catch(error){console.error('journey auth handoff',error);}
}
await refresh();
if(sb)sb.auth.onAuthStateChange(async(_event,next)=>{session=next;await loadAccess();await loadReflections();renderIdentity();renderJourney();});
