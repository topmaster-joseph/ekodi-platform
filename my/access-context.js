import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.EKODI_MY_CONFIG||{};
const WORKSPACE_KEY_RE=/^[a-z]+:[a-zA-Z0-9:_-]+$/;
const SERVICE_ID_RE=/^[a-z][a-z0-9-]*$/;
const ACTIVE_STATUSES=new Set(['active','pre_registered']);
const params=new URLSearchParams(location.search);
const source=String(params.get('from')||'').trim().toLowerCase();
const requestedWorkspace=String(params.get('workspace')||'').trim();
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);

function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch])}
function sourceAllowed(){return SERVICE_ID_RE.test(source)}
function workspaceAllowed(){return !requestedWorkspace||(requestedWorkspace.length<=180&&WORKSPACE_KEY_RE.test(requestedWorkspace))}
function authUrl(){const target=new URL(cfg.authUrl||'https://auth.ekodi.kr/?site=my');target.searchParams.set('site','my');target.searchParams.set('return_to',location.href.split('#')[0]);return target.href}
function canonicalWorkspacePath(key){return WORKSPACE_KEY_RE.test(String(key||''))?`/w/${encodeURIComponent(key)}`:'/#workspaces'}
function rememberWorkspace(key){try{if(WORKSPACE_KEY_RE.test(String(key||'')))localStorage.setItem('ekodi_my_active_workspace',key)}catch{}}
function planLabel(value){return ({free:'Free',basic:'Basic',standard:'Standard',pro:'Pro',enterprise:'Enterprise'})[String(value||'free').toLowerCase()]||String(value||'Free')}
function accessStatusLabel(value){return ({active:'이용 가능',pre_registered:'사전등록',pending:'승인 대기',rejected:'승인되지 않음',unregistered:'미연결'})[String(value||'unregistered')]||'권한 확인'}

async function manifestService(){
  try{
    const response=await fetch('/service-manifest.json',{cache:'no-store'});
    if(!response.ok)return null;
    const manifest=await response.json();
    return (manifest.services||[]).find(item=>item.id===source)||null;
  }catch{return null}
}
function safeServiceReturn(service){
  const fallback=service?.url||'https://ekodi.kr/';
  const raw=params.get('return_to');
  if(!raw)return fallback;
  try{
    const target=new URL(raw),base=new URL(fallback);
    if(target.protocol!=='https:'||target.username||target.password||target.origin!==base.origin)return fallback;
    const basePath=base.pathname.replace(/\/+$/,'')||'/';
    if(basePath!=='/'&&target.pathname!==basePath&&!target.pathname.startsWith(`${basePath}/`))return fallback;
    target.hash='';
    return target.href;
  }catch{return fallback}
}
function mountPanel(service){
  const welcome=document.querySelector('.welcome-shell');
  if(!welcome)return null;
  let section=document.getElementById('accessContext');
  if(section)return section;
  section=document.createElement('section');
  section.id='accessContext';
  section.className='section soft-section';
  section.setAttribute('aria-live','polite');
  section.innerHTML=`<div class="section-head"><div><p class="eyebrow">SERVICE ACCESS · 내 이용상태</p><h2 id="accessContextTitle">${esc(service?.name||source)} 연결 확인</h2></div><p id="accessContextCopy">로그인과 공간 권한을 확인하고 있습니다.</p></div><div class="recommendation-grid"><article class="recommendation-card"><small id="accessContextState">확인 중</small><h3 id="accessContextHeadline">내가 지금 할 수 있는 일을 확인합니다.</h3><p id="accessContextDetail">개인·사업장·기관 데이터는 내 권한 범위 안에서만 확인합니다.</p><div class="actions"><a id="accessContextPrimary" class="primary" href="#workspaces">내 공간 보기</a><a id="accessContextSecondary" class="secondary" href="${esc(safeServiceReturn(service))}">서비스 안내</a></div></article></div>`;
  welcome.insertAdjacentElement('afterend',section);
  return section;
}
function render(section,{state,headline,detail,copy,primaryLabel,primaryHref,secondaryLabel='서비스 안내',secondaryHref}){
  section.querySelector('#accessContextState').textContent=state;
  section.querySelector('#accessContextHeadline').textContent=headline;
  section.querySelector('#accessContextDetail').textContent=detail;
  section.querySelector('#accessContextCopy').textContent=copy;
  const primary=section.querySelector('#accessContextPrimary');primary.textContent=primaryLabel;primary.href=primaryHref;
  const secondary=section.querySelector('#accessContextSecondary');secondary.textContent=secondaryLabel;secondary.href=secondaryHref;
}
async function resolve(){
  if(!sourceAllowed()||!workspaceAllowed())return;
  const service=await manifestService();
  if(!service)return;
  const section=mountPanel(service);if(!section)return;
  const serviceReturn=safeServiceReturn(service);
  if(!enabled){render(section,{state:'격리 스테이징',headline:'운영 개인데이터를 읽지 않습니다.',detail:'개발계정에서는 UI와 접근 경계만 확인합니다.',copy:`${service.name} 연결 흐름을 운영 데이터 없이 검증 중입니다.`,primaryLabel:'내 공간 보기',primaryHref:'#workspaces',secondaryHref:serviceReturn});return}
  const sb=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:true,persistSession:true}});
  const {data,error}=await sb.auth.getSession();
  const session=data?.session||null;
  if(error||!session){render(section,{state:'로그인 필요',headline:'Google 무료회원 확인 후 이어집니다.',detail:'로그인 전에는 서비스 안내까지만 보이고 개인·공간 데이터는 읽지 않습니다.',copy:`${service.name}의 내 이용범위는 로그인 후 확인합니다.`,primaryLabel:'Google로 무료 시작',primaryHref:authUrl(),secondaryHref:serviceReturn});return}
  const [{data:access,error:accessError},{data:rows,error:workspaceError}]=await Promise.all([
    sb.rpc('current_site_access',{p_site_key:source}),
    sb.rpc('current_site_workspaces',{p_site_key:source})
  ]);
  if(accessError||workspaceError){render(section,{state:'권한 확인 지연',headline:'내 이용상태를 지금 확인하지 못했습니다.',detail:'권한을 추측해 열지 않고 기존 상태를 유지합니다. 잠시 후 다시 확인해 주세요.',copy:`${service.name} 접근정보 조회가 지연되고 있습니다.`,primaryLabel:'내 공간 보기',primaryHref:'#workspaces',secondaryHref:serviceReturn});return}
  const workspaces=(Array.isArray(rows)?rows:[]).filter(row=>ACTIVE_STATUSES.has(String(row?.status||'')));
  const exact=requestedWorkspace?workspaces.find(row=>row?.workspace_key===requestedWorkspace):null;
  const minimumTier=service?.userAccessPolicy?.minimumTier||'free';
  if(requestedWorkspace&&!exact){render(section,{state:'공간 권한 확인',headline:'요청한 공간을 바로 열 수 없습니다.',detail:'다른 공간으로 임의 전환하지 않습니다. 아래 내 공간에서 내가 실제로 참여 중인 공간을 선택해 주세요.',copy:`${service.name} · 요청 공간의 접근권한이 확인되지 않았습니다.`,primaryLabel:'내 공간 선택',primaryHref:'#workspaces',secondaryHref:serviceReturn});return}
  if(exact){rememberWorkspace(exact.workspace_key);render(section,{state:'이용 가능',headline:`${exact.workspace_name||'요청한 공간'}으로 이어갈 수 있습니다.`,detail:`${planLabel(exact.plan||access?.plan)} · ${exact.role||access?.role||'member'} · ${accessStatusLabel(exact.status||access?.status)}`,copy:`${service.name}에 사용할 공간과 권한을 확인했습니다.`,primaryLabel:'이 공간에서 계속',primaryHref:canonicalWorkspacePath(exact.workspace_key),secondaryHref:serviceReturn});return}
  if(workspaces.length>1){render(section,{state:'공간 선택',headline:`${workspaces.length}개의 이용 가능한 공간이 있습니다.`,detail:'서비스를 열기 전에 사용할 공간을 직접 선택합니다. 선택하지 않은 다른 공간으로 자동 전환하지 않습니다.',copy:`${service.name}에 사용할 공간을 선택해 주세요.`,primaryLabel:'내 공간 선택',primaryHref:'#workspaces',secondaryHref:serviceReturn});return}
  if(workspaces.length===1){const row=workspaces[0];rememberWorkspace(row.workspace_key);render(section,{state:'이용 가능',headline:`${row.workspace_name||'내 공간'}에서 이용할 수 있습니다.`,detail:`${planLabel(row.plan||access?.plan)} · ${row.role||access?.role||'member'} · ${accessStatusLabel(row.status||access?.status)}`,copy:`${service.name}에 연결된 공간을 확인했습니다.`,primaryLabel:'이 공간에서 계속',primaryHref:canonicalWorkspacePath(row.workspace_key),secondaryHref:serviceReturn});return}
  if(ACTIVE_STATUSES.has(String(access?.status||''))){render(section,{state:'회원 확인 완료',headline:'로그인은 확인됐지만 연결된 공간은 없습니다.',detail:'공간이 필요한 기능은 공간이 연결될 때까지 열지 않습니다. 개인 범위 기능과 공개 안내는 계속 이용할 수 있습니다.',copy:`${service.name} · ${planLabel(access?.plan||minimumTier)} 회원`,primaryLabel:'내 공간 확인',primaryHref:'#workspaces',secondaryHref:serviceReturn});return}
  const status=String(access?.status||'unregistered');
  const denied=status==='rejected'||status==='denied'||status==='suspended';
  render(section,{state:denied?'권한 확인 필요':'무료회원',headline:denied?'이 서비스의 추가 권한이 현재 열려 있지 않습니다.':'무료회원으로 서비스 안내와 기본 범위를 이용할 수 있습니다.',detail:denied?'기존 권한 상태를 우회하지 않습니다. 필요한 경우 해당 공간 또는 서비스의 정상 승인 절차를 이용해 주세요.':`최소 이용등급은 ${planLabel(minimumTier)}입니다. 공간 전용 기능은 내 공간이 연결된 뒤 표시됩니다.`,copy:`${service.name} · ${accessStatusLabel(status)}`,primaryLabel:'내 공간 확인',primaryHref:'#workspaces',secondaryHref:serviceReturn});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void resolve(),{once:true});else void resolve();
