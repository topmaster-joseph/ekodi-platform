import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.EKODI_EDU_CONFIG||{};
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
const area=document.body.dataset.area||'home';
const STORAGE_KEY='ekodi_education_planner_v1';
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'})[ch]);
let session=null;
let state=load();

function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    return {tasks:Array.isArray(raw.tasks)?raw.tasks:[],shortlist:Array.isArray(raw.shortlist)?raw.shortlist:[],study:Array.isArray(raw.study)?raw.study:[]};
  }catch{return{tasks:[],shortlist:[],study:[]}}
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));renderAll()}
function makeId(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function isHttps(value){try{return new URL(value).protocol==='https:'}catch{return false}}
function safeText(value,max=180){return String(value||'').replace(/[<>]/g,'').trim().slice(0,max)}
function authUrl(returnTo=location.href){const u=new URL(cfg.authUrl||'https://auth.ekodi.kr/?site=edu');u.searchParams.set('site','edu');u.searchParams.set('return_to',returnTo.split('#')[0]);return u.href}
async function handoff(){
  if(!sb||!location.hash.startsWith('#'))return;
  const params=new URLSearchParams(location.hash.slice(1));
  const token=params.get('ekodi_token');
  if(!token)return;
  const {error}=await sb.auth.verifyOtp({token_hash:token,type:params.get('ekodi_type')||'email'});
  history.replaceState({},document.title,location.pathname+location.search);
  if(error)throw error;
}
async function refreshSession(){if(!sb)return;const {data}=await sb.auth.getSession();session=data.session;renderIdentity()}
function renderIdentity(){
  const button=$('#authButton');if(!button)return;
  const name=$('#identityName');
  if(!enabled){button.textContent='격리 스테이징';button.disabled=true;if(name)name.textContent='데이터 격리 모드';return}
  button.disabled=false;
  if(session){const meta=session.user.user_metadata||{};button.textContent='로그아웃';if(name)name.textContent=meta.full_name||meta.name||session.user.email?.split('@')[0]||'EKODI Member'}
  else{button.textContent='Google로 시작';if(name)name.textContent='로그인 전'}
}
async function authAction(){if(!enabled)return;if(!session){location.assign(authUrl());return}await sb.auth.signOut();session=null;renderIdentity()}
function dueValue(item){const t=Date.parse(item.due||'');return Number.isFinite(t)?t:Number.MAX_SAFE_INTEGER}
function todayTasks(){return state.tasks.filter(x=>!x.done).sort((a,b)=>dueValue(a)-dueValue(b)).slice(0,3)}
function renderToday(){
  const host=$('#todayList');if(!host)return;
  const tasks=todayTasks();
  host.innerHTML=tasks.length?tasks.map(task=>`<article class="task-card"><div><small>${esc(task.area==='study'?'STUDY':'ADMISSION')}</small><h3>${esc(task.title)}</h3><p>${task.due?`기한 ${esc(task.due)}`:'기한 미정'}${task.source&&isHttps(task.source)?` · <a href="${esc(task.source)}" target="_blank" rel="noreferrer">공식 근거 확인 ↗</a>`:''}</p></div><button class="chip" data-done="${esc(task.id)}" type="button">완료</button></article>`).join(''):`<div class="empty"><strong>지금 등록된 할 일이 없습니다.</strong><p>Admission 또는 Study에서 다음 행동을 추가하면 최대 3개만 여기 표시합니다.</p></div>`;
  $$('[data-done]',host).forEach(btn=>btn.addEventListener('click',()=>{const row=state.tasks.find(x=>x.id===btn.dataset.done);if(row){row.done=true;save()}}));
}
function renderSummary(){
  const map={taskCount:state.tasks.filter(x=>!x.done).length,shortlistCount:state.shortlist.length,studyCount:state.study.length};
  Object.entries(map).forEach(([id,value])=>{const el=$(`#${id}`);if(el)el.textContent=String(value)})
}
function renderAdmission(){
  const host=$('#shortlist');if(!host)return;
  host.innerHTML=state.shortlist.length?state.shortlist.map(item=>`<article class="record-card"><div><small>${esc(item.level||'PROGRAM')}</small><h3>${esc(item.institution)}</h3><p>${esc(item.program||'과정 미정')}</p>${item.source&&isHttps(item.source)?`<a href="${esc(item.source)}" target="_blank" rel="noreferrer">공식 모집요강 확인 ↗</a>`:'<span class="warning">공식 근거 링크 필요</span>'}</div><button class="icon-button" type="button" data-remove-shortlist="${esc(item.id)}" aria-label="삭제">×</button></article>`).join(''):`<div class="empty"><strong>지원 후보가 아직 없습니다.</strong><p>학교·과정을 찾은 뒤 반드시 해당 기관의 공식 모집요강 주소와 함께 저장하세요.</p></div>`;
  $$('[data-remove-shortlist]',host).forEach(btn=>btn.addEventListener('click',()=>{state.shortlist=state.shortlist.filter(x=>x.id!==btn.dataset.removeShortlist);save()}));
}
function renderStudy(){
  const host=$('#studyRecords');if(!host)return;
  host.innerHTML=state.study.length?state.study.map(item=>`<article class="record-card"><div><small>${esc(item.kind||'STUDY')}</small><h3>${esc(item.title)}</h3><p>${esc(item.note||'')}</p>${item.source&&isHttps(item.source)?`<a href="${esc(item.source)}" target="_blank" rel="noreferrer">공식 안내 확인 ↗</a>`:'<span class="warning">공식 근거 링크 필요</span>'}</div><button class="icon-button" type="button" data-remove-study="${esc(item.id)}" aria-label="삭제">×</button></article>`).join(''):`<div class="empty"><strong>학습 기록이 아직 없습니다.</strong><p>수강·장학·학사·생활 준비처럼 다음에 확인할 항목을 공식 안내와 함께 저장하세요.</p></div>`;
  $$('[data-remove-study]',host).forEach(btn=>btn.addEventListener('click',()=>{state.study=state.study.filter(x=>x.id!==btn.dataset.removeStudy);save()}));
}
function addTask(areaName,title,due,source){const cleanTitle=safeText(title,120);if(!cleanTitle)return;state.tasks.push({id:makeId(),area:areaName,title:cleanTitle,due:String(due||''),source:isHttps(source)?source:'',done:false});save()}
function bindForms(){
  $('#taskForm')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.currentTarget);addTask(area,safeText(form.get('title'),120),form.get('due'),safeText(form.get('source'),500));event.currentTarget.reset()});
  $('#shortlistForm')?.addEventListener('submit',event=>{event.preventDefault();const f=new FormData(event.currentTarget);const institution=safeText(f.get('institution'),120);if(!institution)return;state.shortlist.push({id:makeId(),institution,program:safeText(f.get('program'),140),level:safeText(f.get('level'),60),source:isHttps(f.get('source'))?String(f.get('source')):''});save();event.currentTarget.reset()});
  $('#studyForm')?.addEventListener('submit',event=>{event.preventDefault();const f=new FormData(event.currentTarget);const title=safeText(f.get('title'),140);if(!title)return;state.study.push({id:makeId(),kind:safeText(f.get('kind'),60),title,note:safeText(f.get('note'),220),source:isHttps(f.get('source'))?String(f.get('source')):''});save();event.currentTarget.reset()});
}
function renderAll(){renderToday();renderSummary();renderAdmission();renderStudy()}

bindForms();$('#authButton')?.addEventListener('click',authAction);renderAll();renderIdentity();
if(enabled){try{await handoff()}catch(error){console.error('education auth handoff',error)}await refreshSession();sb?.auth.onAuthStateChange((_event,next)=>{session=next;renderIdentity()})}
