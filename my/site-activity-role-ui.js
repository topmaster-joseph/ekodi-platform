import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const cfg=window.EKODI_MY_CONFIG||{};
const OWNED_SITE_URLS=Object.freeze({
  church:'https://church.ekodi.kr/',
  biz:'https://biz.ekodi.kr/',
  lab:'https://lab.ekodi.kr/',
  trade:'https://trade.ekodi.kr/',
  cafe:'https://cafe.ekodi.kr/',
});
const ROLE_FALLBACK=Object.freeze({
  church:'목사',
  biz:'대표',
  lab:'연구소장',
  trade:'대표',
  cafe:'대표',
});

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const enabled=Boolean(cfg.dataEnabled&&cfg.supabaseUrl&&cfg.supabasePublishableKey);
const sb=enabled?createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:false,persistSession:true}}):null;
let contexts=[];
let adminAvailable=false;
let rendering=false;
let initialized=false;

function roleLabel(context){return context?.activity_role_label||ROLE_FALLBACK[context?.site]||context?.authorization_role||'구성원'}
function rememberWorkspace(key){try{if(key)localStorage.setItem('ekodi_my_active_workspace',key)}catch{}}
function routeFor(context){
  const returnTo=OWNED_SITE_URLS[context.site];
  if(!returnTo)return '#workspaces';
  const target=new URL('https://auth.ekodi.kr/');
  target.searchParams.set('site',context.site);
  target.searchParams.set('return_to',returnTo);
  target.searchParams.set('workspace',context.workspace_key);
  return target.href;
}
function workspaceIcon(kind){return kind==='business'?'사':kind==='church'?'교':kind==='organization'?'기':'공'}

function markExistingCard(card,context){
  if(!card||!context)return;
  card.dataset.activityRole=context.activity_role||'';
  card.dataset.authorityScope='tenant';
  card.dataset.operatingModel='customer-site';
  card.setAttribute('aria-label',`${context.workspace_name||'내 공간'} · ${roleLabel(context)}`);
  const meta=card.querySelector('.meta');
  if(meta){
    const roleNode=[...meta.querySelectorAll('span')].find(node=>node.dataset.localRole==='1')||meta.querySelectorAll('span')[1];
    if(roleNode&&roleNode.textContent!==roleLabel(context))roleNode.textContent=roleLabel(context);
    if(roleNode){roleNode.dataset.localRole='1';roleNode.title=`사이트 역할 ${roleLabel(context)} · 권한 ${context.authorization_role||'member'}`;}
  }
}

function appendMissingCard(host,context){
  if(!host||host.querySelector(`[data-owned-context="${CSS.escape(context.workspace_key)}"]`))return;
  const link=document.createElement('a');
  link.className='workspace-card workspace-button owned-site-workspace';
  link.href=routeFor(context);
  link.dataset.workspaceKey=context.workspace_key;
  link.dataset.ownedContext=context.workspace_key;
  link.dataset.activityRole=context.activity_role||'';
  link.dataset.authorityScope='tenant';
  link.dataset.operatingModel='customer-site';
  link.setAttribute('aria-label',`${context.workspace_name||'내 공간'} · ${roleLabel(context)}`);
  link.innerHTML=`<span class="workspace-icon">${esc(workspaceIcon(context.workspace_kind))}</span><span class="workspace-body"><small>${esc(context.workspace_kind||'organization')} · 고객사이트</small><h3>${esc(context.workspace_name||'내 공간')}</h3><p>${esc(context.site||'EKODI')}</p><span class="meta"><span>Standard</span><span data-local-role="1">${esc(roleLabel(context))}</span><span>사이트 역할</span><span>열기 →</span></span></span>`;
  link.addEventListener('click',()=>rememberWorkspace(context.workspace_key));
  host.append(link);
}

function renderAdminContext(){
  const host=document.querySelector('#workspaceList');
  if(!host)return;
  const existing=host.querySelector('[data-platform-admin-context="1"]');
  if(!adminAvailable){existing?.remove();return;}
  if(existing)return;
  const link=document.createElement('a');
  link.className='workspace-card workspace-button platform-admin-workspace';
  link.href='https://auth.ekodi.kr/?site=admin&return_to=https%3A%2F%2Fadmin.ekodi.kr%2F';
  link.dataset.platformAdminContext='1';
  link.dataset.authorityScope='platform';
  link.innerHTML='<span class="workspace-icon">관</span><span class="workspace-body"><small>platform · 별도 관리자 모드</small><h3>EKODI 생태계 관리자</h3><p>전체 생태계 제어와 운영을 위한 독립 컨텍스트</p><span class="meta"><span>Platform</span><span>최고관리자</span><span>전역 권한</span><span>관리자 열기 →</span></span></span>';
  host.prepend(link);
}

function updateActiveSummary(){
  let key='';try{key=localStorage.getItem('ekodi_my_active_workspace')||''}catch{}
  const current=contexts.find(item=>item.workspace_key===key);
  const summary=document.querySelector('#workspaceSummary');
  if(!current||!summary)return;
  const parts=summary.textContent.split(' · ');
  const prefix=parts.length>=2?`${parts[0]} · ${parts[1]}`:(current.workspace_name||'내 공간');
  const next=`${prefix} · ${roleLabel(current)}`;
  if(summary.textContent!==next)summary.textContent=next;
  summary.dataset.authorityScope='tenant';
  summary.title=`현재 사이트 역할: ${roleLabel(current)}. 최고관리자 권한은 이 사이트에서 활성화되지 않습니다.`;
}

function render(){
  if(rendering)return;
  rendering=true;
  try{
    const host=document.querySelector('#workspaceList');
    if(!host)return;
    for(const context of contexts){
      const selector=`[data-workspace-key="${CSS.escape(context.workspace_key)}"]`;
      const existing=host.querySelector(selector);
      if(existing)markExistingCard(existing,context);
      else appendMissingCard(host,context);
    }
    renderAdminContext();
    updateActiveSummary();
  }finally{rendering=false;}
}

async function load(){
  if(!sb)return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){contexts=[];adminAvailable=false;render();return;}
  const [activityResult,adminResult]=await Promise.all([
    sb.rpc('current_site_activity_contexts'),
    sb.rpc('current_site_access',{p_site_key:'admin'}),
  ]);
  if(!activityResult.error)contexts=Array.isArray(activityResult.data)?activityResult.data:[];
  const admin=adminResult.data||{};
  adminAvailable=!adminResult.error&&admin.authenticated===true&&admin.status==='active'&&admin.role==='platform_admin';
  render();
}

export function initSiteActivityRoleUi(){
  if(initialized)return;
  initialized=true;
  if(!enabled)return;
  const host=document.querySelector('#workspaceList');
  if(host){
    const observer=new MutationObserver(()=>queueMicrotask(render));
    observer.observe(host,{childList:true,subtree:true});
  }
  window.addEventListener('storage',event=>{if(event.key==='ekodi_my_active_workspace')render()});
  sb.auth.onAuthStateChange(()=>queueMicrotask(load));
  void load();
}
