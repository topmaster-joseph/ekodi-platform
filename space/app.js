const cfg=window.EKODI_SPACE_CONFIG||{};
const $=id=>document.getElementById(id);
const routeMatch=location.pathname.match(/^\/(personal|org|group|project)\/([a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)\/?$/);
let sb=null;

function authStart(){const target=new URL('/auth/start',location.origin);target.searchParams.set('return_to',location.href.split('#')[0]);location.assign(target.href)}
function status(text,type=''){const el=$('status');if(!el)return;el.textContent=text;el.dataset.type=type}
function show(id,on=true){$(id)?.classList.toggle('hidden',!on)}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pathFor(space){return `/${space.path_type}/${encodeURIComponent(space.slug)}`}
async function session(){const {data,error}=await sb.auth.getSession();if(error)throw error;return data.session}
async function api(path){
  const current=await session();if(!current?.access_token)throw new Error('login_required');
  const response=await fetch(`${cfg.workspaceApi}${path}`,{headers:{apikey:cfg.supabasePublishableKey,Authorization:`Bearer ${current.access_token}`},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||`api_${response.status}`),{status:response.status});
  return data;
}
async function consumeHandoff(){
  const hash=new URLSearchParams(location.hash.slice(1));const tokenHash=hash.get('ekodi_token');if(!tokenHash)return;
  const type=hash.get('ekodi_type')||'email';const {error}=await sb.auth.verifyOtp({token_hash:tokenHash,type});if(error)throw error;
  history.replaceState({},document.title,location.pathname+location.search);
}
function renderSignedOut(){show('signedOut',true);show('signedIn',false);show('login',true);$('login').onclick=authStart;status('로그인하면 내가 참여하는 운영공간만 안전하게 연결됩니다.')}
function renderSpaces(spaces){
  const list=$('spaceList');list.replaceChildren();
  if(!spaces.length){list.innerHTML='<div class="empty"><strong>연결된 운영공간이 아직 없습니다.</strong><span>공간이 생성되거나 초대되면 이곳에 자동으로 나타납니다.</span></div>';return;}
  for(const item of spaces){const a=document.createElement('a');a.className='space-card';a.href=pathFor(item);a.innerHTML=`<span class="type">${esc(item.path_type)}</span><strong>${esc(item.name)}</strong><small>${esc(item.role)} · ${esc(item.kind)}</small>`;list.append(a)}
}
async function renderWorkspace(){
  if(!routeMatch){show('workspaceView',false);show('spaceIndex',true);return;}
  const [,type,slug]=routeMatch;show('spaceIndex',false);show('workspaceView',true);status('공간 권한을 확인하고 있습니다.');
  try{
    const {space}=await api(`/spaces/resolve?type=${encodeURIComponent(type)}&slug=${encodeURIComponent(slug)}`);
    $('workspaceType').textContent=space.path_type;$('workspaceName').textContent=space.name;$('workspaceMeta').textContent=`${space.role} · ${space.kind}`;
    $('workspaceHome').href='/';$('workspaceMy').href='https://my.ekodi.kr/';document.documentElement.dataset.workspaceId=space.workspace_id;status('공간 연결이 확인되었습니다.','ok');
  }catch(error){
    if(error.status===404){$('workspaceName').textContent='접근할 수 없는 공간';$('workspaceMeta').textContent='공간이 없거나 현재 계정에 권한이 없습니다.';status('공간 접근 권한을 확인해 주세요.','error');return;}
    throw error;
  }
}
async function renderSignedIn(){
  show('signedOut',false);show('signedIn',true);const current=await session();$('account').textContent=current?.user?.email||'EKODI 사용자';
  $('logout').onclick=async()=>{await sb.auth.signOut();renderSignedOut()};
  const {spaces}=await api('/spaces');renderSpaces(Array.isArray(spaces)?spaces:[]);await renderWorkspace();
}
async function boot(){
  if(!cfg.dataEnabled||!cfg.supabaseUrl||!cfg.supabasePublishableKey||!cfg.workspaceApi){show('signedOut',true);show('signedIn',false);show('login',false);status('이 환경은 개인 운영데이터와 분리된 검증 환경입니다.');return;}
  try{
    const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');sb=mod.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:false,persistSession:true}});
    await consumeHandoff();const current=await session();if(!current){renderSignedOut();return;}await renderSignedIn();
  }catch(error){console.error('space bootstrap',error);if(error.message==='login_required'){renderSignedOut();return;}status('운영공간을 불러오지 못했습니다. 다시 로그인해 주세요.','error');show('signedOut',true);show('signedIn',false);show('login',true);$('login').onclick=authStart;}
}
boot();
