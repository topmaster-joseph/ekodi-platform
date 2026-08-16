import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.EKODI_MY_CONFIG||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const MODES={writer:'Writer',video:'Video',podcast:'Podcast',lecture:'Educator',research:'Research',visual:'Visual',mission:'Mission',ai:'AI Creator'};
const SERVICES=[
 ['church','에코디교회','https://church.ekodi.kr'],['biz','에코디비즈','https://biz.ekodi.kr'],['books','에코디출판','https://books.ekodi.kr'],['author','EKODI Creator AI','https://author.ekodi.kr'],['lab','에코디연구소','https://lab.ekodi.kr'],['community','에코디커뮤니티','https://community.ekodi.kr'],['work','EKODI Work','https://work.ekodi.kr'],['social','EKODI Social','https://social.ekodi.kr'],['energy','EKODI Energy AI','https://energy.ekodi.kr'],['business','EKODI Business OS','https://business.ekodi.kr'],['mall','에코디몰','https://mall.ekodi.kr'],['marketing','EKODI Marketing AI','https://marketing.ekodi.kr']
];
const authUrl=cfg.authUrl||'https://auth.ekodi.kr/?site=my';
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}}):null;
let session=null, items=[], access=new Map(), workspaces=new Map(), filter='all';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const mode=v=>MODES[v]?v:'writer';
const plan=v=>({free:'Free',basic:'Basic',pro:'Pro',enterprise:'Business',standard:'Standard'})[String(v||'free').toLowerCase()]||String(v||'Free');
const paid=v=>['basic','pro','enterprise'].includes(String(v||'').toLowerCase());

async function handoff(){
 if(!sb||!location.hash.startsWith('#'))return;
 const p=new URLSearchParams(location.hash.slice(1)), token=p.get('ekodi_token');
 if(!token)return;
 const {error}=await sb.auth.verifyOtp({token_hash:token,type:p.get('ekodi_type')||'email'});
 history.replaceState({},document.title,`${location.pathname}${location.search}`);
 if(error)throw error;
}
function authUi(){
 const label=session?'로그아웃':'Google로 시작';
 for(const b of [$('#authButton'),$('#accountAuthButton')])if(b){b.disabled=!enabled;b.textContent=enabled?label:'격리 스테이징'}
}
function uniqueWorkspaces(){
 const map=new Map();
 for(const [sid,rows] of workspaces)for(const row of rows||[]){
  const key=row.workspace_key||`${sid}:${row.workspace_name||'workspace'}`;
  const found=map.get(key)||{...row,services:[]};
  if(!found.services.includes(sid))found.services.push(sid);
  if(paid(row.plan)&&!paid(found.plan))found.plan=row.plan;
  map.set(key,found);
 }
 return [...map.values()];
}
function connected(id){
 const a=access.get(id)||{}, rows=workspaces.get(id)||[];
 return ['active','pre_registered'].includes(a.status)||rows.some(r=>r.source==='synthetic'||r.status==='active');
}
function identityUi(){
 const email=session?.user?.email||'', meta=session?.user?.user_metadata||{};
 $('#identityName').textContent=session?(meta.full_name||meta.name||email.split('@')[0]||'EKODI Member'):'로그인 전';
 $('#identityEmail').textContent=email||'Google 인증 후 연결됩니다.';
 const personal=uniqueWorkspaces().find(w=>String(w.workspace_key||'').startsWith('personal:'))?.workspace_key||items.find(i=>i.workspace_key)?.workspace_key;
 $('#workspaceKey').textContent=personal||(session?'personal: connected':'personal:…');
 const paidCount=[...access.values()].filter(a=>paid(a.plan)).length;
 $('#accountPlan').textContent=session?(paidCount?`${paidCount} Paid Plan${paidCount>1?'s':''}`:'Free Member'):'Guest';
 $('#accountLoginText').textContent=email?`${email} 계정으로 EKODI 통합인증에 연결되어 있습니다.`:'로그인 전입니다.';
}
function summaryUi(){
 $('#serviceCount').textContent=String(SERVICES.filter(([id])=>connected(id)).length);
 $('#paidCount').textContent=String(SERVICES.filter(([id])=>paid(access.get(id)?.plan)||(workspaces.get(id)||[]).some(w=>paid(w.plan))).length);
 $('#workspaceCount').textContent=String(uniqueWorkspaces().length);
 $('#creatorCount').textContent=String(items.length);
}
function platformUi(){
 const host=$('#platformList');
 if(!enabled){host.innerHTML='<div class="empty"><strong>격리 스테이징에서는 개인 접근권한을 읽지 않습니다.</strong><p>UI와 인증 계약만 검증합니다.</p></div>';return}
 if(!session){host.innerHTML='<div class="empty"><strong>Google 인증 후 내 플랫폼 상태를 볼 수 있습니다.</strong><p>한 번 로그인하면 각 서비스의 접근권한과 플랜을 확인합니다.</p></div>';return}
 host.innerHTML=SERVICES.map(([id,name,url])=>{
  const a=access.get(id)||{}, rows=workspaces.get(id)||[], on=connected(id), best=rows.find(w=>paid(w.plan))||rows[0], p=best?.plan||a.plan||'free';
  return `<article class="platform-card"><div class="platform-head"><h3>${esc(name)}</h3><span class="plan plan-${esc(String(p).toLowerCase())}">${esc(on?plan(p):'Available')}</span></div><p>${on?'통합인증으로 연결된 서비스입니다.':'필요할 때 자유롭게 시작할 수 있습니다.'}</p><div class="meta"><span>${on?'연결됨':'미연결'}</span><span>${rows.length} Workspace</span></div><a class="card-link" href="${esc(url)}">${on?'열기':'둘러보기'} →</a></article>`;
 }).join('');
}
function workspaceUi(){
 const host=$('#workspaceList');
 if(!enabled){host.innerHTML='<div class="empty"><strong>격리 스테이징에서는 실제 Workspace를 읽지 않습니다.</strong></div>';return}
 if(!session){host.innerHTML='<div class="empty"><strong>Google 인증 후 Workspace를 확인할 수 있습니다.</strong></div>';return}
 const rows=uniqueWorkspaces();
 if(!rows.length){host.innerHTML='<div class="empty"><strong>아직 연결된 Workspace가 없습니다.</strong><p>개인 서비스를 시작하거나 기관 초대를 받으면 여기에 나타납니다.</p></div>';return}
 host.innerHTML=rows.map(w=>`<article class="workspace-card"><div class="workspace-icon">${w.workspace_kind==='business'?'사':w.workspace_kind==='organization'?'기':'개'}</div><div><small>${esc(w.workspace_kind||'personal')}</small><h3>${esc(w.workspace_name||'내 Workspace')}</h3><p>${esc(w.services.join(' · '))}</p><div class="meta"><span>${esc(plan(w.plan))}</span><span>${esc(w.role||'member')}</span></div></div></article>`).join('');
}
function portfolioUi(){
 const host=$('#creatorList'), visible=filter==='all'?items:items.filter(i=>mode(i.creator_mode)===filter);
 if(!enabled){host.innerHTML='<div class="empty"><strong>격리 스테이징에서는 개인 데이터를 읽지 않습니다.</strong></div>';return}
 if(!session){host.innerHTML='<div class="empty"><strong>Google 인증 후 나의 창작물을 볼 수 있습니다.</strong></div>';return}
 if(!visible.length){host.innerHTML='<div class="empty"><strong>아직 My EKODI에 연결된 창작물이 없습니다.</strong><p>Creator AI에서 최종 승인 후 My EKODI에 등록하면 여기에 비공개로 연결됩니다.</p></div>';return}
 host.innerHTML=visible.map(i=>`<article class="portfolio-card"><small>${esc(MODES[mode(i.creator_mode)])}</small><h3>${esc(i.title||'제목 없는 창작물')}</h3><p>${esc(String(i.summary||'Creator AI에서 연결된 나의 창작물입니다.').slice(0,260))}</p><div class="meta"><span>${i.visibility==='public'?'공개':'비공개'}</span></div><div class="actions"><a class="secondary" href="https://author.ekodi.kr/#projects">Creator AI에서 열기</a></div></article>`).join('');
}
async function rpc(name,args){const {data,error}=await sb.rpc(name,args);if(error){console.warn(name,args,error);return null}return data}
async function loadAccess(){
 access=new Map();workspaces=new Map();
 if(!sb||!session)return;
 await Promise.all(SERVICES.map(async([id])=>{
  const [a,w]=await Promise.all([rpc('current_site_access',{p_site_key:id}),rpc('current_site_workspaces',{p_site_key:id})]);
  access.set(id,a||{status:'unregistered',plan:'free'});workspaces.set(id,Array.isArray(w)?w:[]);
 }));
}
async function loadPortfolio(){
 items=[];if(!sb||!session)return;
 const {data,error}=await sb.from('creator_portfolio_items').select('id,project_id,workspace_key,title,summary,creator_mode,status,visibility,updated_at').order('updated_at',{ascending:false});
 if(error)throw error;items=data||[];
}
async function loadAll(){await Promise.all([loadAccess(),loadPortfolio()]);identityUi();summaryUi();platformUi();workspaceUi();portfolioUi()}
async function authAction(){if(!enabled)return;if(!session){location.assign(authUrl);return}await sb.auth.signOut();session=null;await loadAll();authUi()}
async function refresh(){const b=$('#refreshButton'), old=b.textContent;b.disabled=true;b.textContent='새로고침 중…';try{await loadAll();b.textContent='새로고침 완료'}catch(e){console.error(e);b.textContent='불러오기 실패'}setTimeout(()=>{b.textContent=old;b.disabled=false},1200)}

$('#authButton').addEventListener('click',authAction);$('#accountAuthButton').addEventListener('click',authAction);$('#refreshButton').addEventListener('click',refresh);
$$('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter||'all';$$('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));portfolioUi()}));
if(!enabled){authUi();await loadAll()}else{try{await handoff()}catch(e){console.error('auth handoff',e)}const {data}=await sb.auth.getSession();session=data.session;authUi();try{await loadAll()}catch(e){console.error('My EKODI load',e)}sb.auth.onAuthStateChange(async(_e,next)=>{session=next;authUi();await loadAll()})}
