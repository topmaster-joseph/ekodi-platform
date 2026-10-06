(()=>{
const API='/api/seonammedi/admin/minutes';
const PLATFORM_TOKEN_KEY='ekodi-auth-token';
const SESSION_KEY='ekodi-seonam-admin-session';
const CENTRAL_SESSION_KEY='sb-renzehysxirjilvdxacv-auth-token';
const $=id=>document.getElementById(id);
const form=$('minutesForm'), list=$('minutesList'), message=$('minutesMessage');
if(!form||!list)return;
let items=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function sessionToken(){
  const platform=sessionStorage.getItem(PLATFORM_TOKEN_KEY)||'';
  if(platform)return platform;
  try{
    const raw=sessionStorage.getItem(SESSION_KEY);
    const s=raw&&JSON.parse(raw);
    if(s?.accessToken)return String(s.accessToken);
  }catch{}
  try{
    const raw=localStorage.getItem(CENTRAL_SESSION_KEY)||'';
    if(!raw)return'';
    const parsed=JSON.parse(raw);
    const session=parsed?.currentSession||parsed?.session||parsed;
    const access=String(session?.access_token||'');
    const expires=Number(session?.expires_at||0);
    if(!access)return'';
    if(expires&&expires<=Math.floor(Date.now()/1000)+30)return'';
    return access;
  }catch{return''}
}
const authHeaders=()=>{const h={'content-type':'application/json'};const access=sessionToken();if(access)h.authorization='Bearer '+access;return h};
async function api(url,options={}){
  const r=await fetch(url,{cache:'no-store',credentials:'same-origin',...options,headers:{...authHeaders(),...(options.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(r.status===401)throw new Error('로그인 인증이 필요합니다. 관리자 페이지를 새로고침한 뒤 다시 시도해 주세요.');
  if(!r.ok)throw new Error(d.error||('HTTP '+r.status));
  return d
}
const dtLocal=v=>{if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return'';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};
function reset(){form.reset();form.elements.id.value='';form.status.value='shared';form.showViewers.checked=true;$('minutesFormTitle').textContent='회의록 작성';message.textContent=''}
function fill(x){form.elements.id.value=x.id;form.meetingAt.value=dtLocal(x.meetingAt);form.title.value=x.title||'';form.attendees.value=x.attendees||'';form.body.value=x.body||'';form.status.value=x.status||'closed';form.showViewers.checked=Boolean(x.showViewers);$('minutesFormTitle').textContent='회의록 수정';window.scrollTo({top:0,behavior:'smooth'})}
async function copyLink(x){const url=location.origin+'/minutes/?token='+encodeURIComponent(x.shareToken);try{await navigator.clipboard.writeText(url);message.textContent='공유 링크를 복사했습니다.'}catch{prompt('공유 링크',url)}}
function render(){list.innerHTML=items.map(x=>`<article class="admin-item"><div><strong>${esc(x.title)}</strong><p>${esc(new Date(x.meetingAt).toLocaleString('ko-KR'))} · 확인 ${Number(x.viewerCount||0)}명 · ${x.status==='shared'?'공유중':'중지'}</p></div><div class="actions"><button type="button" data-copy="${x.id}">링크복사</button><button type="button" data-edit="${x.id}">수정</button><button type="button" data-del="${x.id}">삭제</button></div></article>`).join('')||'<p class="muted">등록된 회의록이 없습니다.</p>'}
async function load(){message.textContent='';const d=await api(API);items=d.items||[];render()}
form.addEventListener('submit',async e=>{e.preventDefault();message.textContent='저장 중...';const fd=new FormData(form);const id=fd.get('id');const body={meetingAt:new Date(fd.get('meetingAt')).toISOString(),title:fd.get('title'),attendees:fd.get('attendees'),body:fd.get('body'),status:fd.get('status'),showViewers:fd.get('showViewers')==='on'};try{await api(id?API+'/'+id:API,{method:id?'PUT':'POST',body:JSON.stringify(body)});message.textContent='저장했습니다.';reset();await load()}catch(err){message.textContent='저장 실패: '+err.message}});
list.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const id=Number(b.dataset.edit||b.dataset.copy||b.dataset.del);const x=items.find(v=>v.id===id);if(!x)return;if(b.dataset.edit)fill(x);if(b.dataset.copy)copyLink(x);if(b.dataset.del&&confirm('이 회의록을 삭제할까요?')){try{await api(API+'/'+id,{method:'DELETE'});await load()}catch(err){message.textContent='삭제 실패: '+err.message}}});
$('minutesReset')?.addEventListener('click',reset);$('reloadMinutes')?.addEventListener('click',()=>load().catch(err=>message.textContent='불러오기 실패: '+err.message));
document.querySelector('[data-panel-target="minutes"]')?.addEventListener('click',()=>load().catch(err=>message.textContent='불러오기 실패: '+err.message));
})();