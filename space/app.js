const cfg=window.EKODI_SPACE_CONFIG||{};
const $=id=>document.getElementById(id);
const routeMatch=location.pathname.match(/^\/([a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)\/?$/);
const providerLabels={baemin:'배달의민족',coupang_eats:'쿠팡이츠',yogiyo:'요기요',store:'매장'};
const statusLabels={active:'연결됨',ready:'준비됨',setup_required:'설정 필요',partner_required:'공식 연결 필요',credentials_required:'인증 필요',paused:'일시중지',error:'오류'};
const sourceLabels={not_connected:'미연결',official_api:'공식 API',partner_import:'파트너 자료',verified_file:'검증 파일',manual_verified:'운영자 확인'};
const roleLabels={store_owner:'점포 운영자',store_staff:'점포 담당자',tenant_admin:'조직 관리자',platform_admin:'플랫폼 관리자',member:'구성원'};
let sb=null;
let currentSpaces=[];

function authStart(){const target=new URL('/auth/start',location.origin);target.searchParams.set('return_to',location.href.split('#')[0]);location.assign(target.href)}
function status(text,type=''){const el=$('status');if(!el)return;el.textContent=text;el.dataset.type=type}
function show(id,on=true){$(id)?.classList.toggle('hidden',!on)}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pathFor(space){return `/${encodeURIComponent(space.slug)}`}
function won(value){return Number.isFinite(Number(value))?`${Number(value).toLocaleString('ko-KR')}원`:'—'}
function dateText(value){if(!value)return '기록 없음';const date=new Date(value);return Number.isNaN(date.getTime())?'기록 없음':date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}
async function session(){const {data,error}=await sb.auth.getSession();if(error)throw error;return data.session}
async function api(path){
  const current=await session();if(!current?.access_token)throw new Error('login_required');
  const response=await fetch(`${cfg.workspaceApi}${path}`,{headers:{apikey:cfg.supabasePublishableKey,Authorization:`Bearer ${current.access_token}`},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||`api_${response.status}`),{status:response.status});
  return data;
}
async function consumeHandoff(){
  const hash=new URLSearchParams(location.hash.slice(1));
  const tokenHash=hash.get('ekodi_token');if(!tokenHash)return;
  const type=hash.get('ekodi_type')||'email';
  const {error}=await sb.auth.verifyOtp({token_hash:tokenHash,type});if(error)throw error;
  history.replaceState({},document.title,location.pathname+location.search);
}
function renderSignedOut(){
  show('signedOut',true);show('signedIn',false);show('spaceSwitcherWrap',false);show('login',true);
  $('login').onclick=authStart;
  status('로그인하면 내가 권한을 가진 운영공간만 연결됩니다.');
}
function renderSpaces(spaces){
  const list=$('spaceList');list.replaceChildren();
  if(!spaces.length){
    list.innerHTML='<div class="empty"><strong>연결된 운영공간이 아직 없습니다.</strong><span>점포 또는 조직 권한이 연결되면 이곳에 나타납니다.</span></div>';
    return;
  }
  for(const item of spaces){
    const a=document.createElement('a');
    a.className='space-card';a.href=pathFor(item);
    const kind=item.kind==='store'?'STORE':'WORKSPACE';
    a.innerHTML=`<span class="space-kind">${kind}</span><strong>${esc(item.name)}</strong><small>${esc(roleLabels[item.role]||item.role||'구성원')}</small>`;
    list.append(a);
  }
}
function renderSwitcher(spaces){
  const select=$('spaceSwitcher');select.replaceChildren();
  for(const item of spaces){
    const option=document.createElement('option');
    option.value=pathFor(item);option.textContent=item.name;
    if(routeMatch?.[1]===item.slug)option.selected=true;
    select.append(option);
  }
  show('spaceSwitcherWrap',spaces.length>1);
  select.onchange=()=>{if(select.value)location.assign(select.value)};
}
function formatHours(value){
  if(!value||typeof value!=='object'||!Object.keys(value).length)return '영업시간 정보 확인 필요';
  if(Array.isArray(value))return value.map(String).join(' · ');
  return Object.entries(value).map(([key,val])=>`${key} ${Array.isArray(val)?val.join(', '):String(val)}`).join(' · ');
}
function renderStoreBasics(store={}){
  const basics=[['매장 주소',store.address||'주소 정보 확인 필요'],['전화번호',store.phone||'전화번호 확인 필요'],['영업시간',formatHours(store.business_hours)],['주문 운영',store.order_enabled?'EKODI 주문 사용':'외부 판매채널 중심']];
  $('storeBasics').innerHTML=basics.map(([label,value])=>`<article class="basic-card"><small>${esc(label)}</small><strong>${esc(value)}</strong></article>`).join('');
}
function renderChannels(channels=[]){
  const list=$('channelList');
  if(!channels.length){
    list.innerHTML='<div class="menu-empty"><strong>판매채널 정보가 아직 없습니다.</strong><span>공식 연결 계약 또는 검증된 가져오기 경로를 설정하면 채널 상태가 표시됩니다.</span></div>';
    $('channelCount').textContent='0 / 0 연결';return;
  }
  const connected=channels.filter(item=>['active','ready'].includes(item.connection_status)).length;
  $('channelCount').textContent=`${connected} / ${channels.length} 연결`;
  list.innerHTML=channels.map(item=>`<article class="channel-card">
    <div class="channel-card-head"><strong>${esc(item.display_name||providerLabels[item.provider]||item.provider)}</strong><span class="channel-state ${esc(item.connection_status)}">${esc(statusLabels[item.connection_status]||item.connection_status)}</span></div>
    <dl><dt>데이터 출처</dt><dd>${esc(sourceLabels[item.source_kind]||item.source_kind)}</dd><dt>플랫폼 매장명</dt><dd>${esc(item.platform_store_name||'연결 후 확인')}</dd><dt>최소주문</dt><dd>${item.minimum_order_amount==null?'—':esc(won(item.minimum_order_amount))}</dd><dt>최근 동기화</dt><dd>${esc(dateText(item.last_synced_at))}</dd></dl>
  </article>`).join('');
}
function listingChip(item){
  const label=providerLabels[item.provider]||item.provider;
  return `<span class="listing-chip">${esc(label)}<b>${item.price==null?'가격 확인 필요':esc(won(item.price))}</b></span>`;
}
function renderMenu(menu=[],unmapped=[],summary={}){
  const list=$('menuList');
  $('menuSummary').innerHTML=`<span>기준메뉴 ${Number(summary.canonical_menu_count||0).toLocaleString('ko-KR')}</span><span>플랫폼 등록 ${Number(summary.platform_listing_count||0).toLocaleString('ko-KR')}</span>`;
  if(!menu.length){
    list.innerHTML='<div class="menu-empty"><strong>아직 메뉴 기준정보가 없습니다.</strong><span>배달플랫폼의 공식 API·파트너 제공자료·검증된 파일을 가져온 뒤 메뉴명, 가격, 옵션을 EKODI 기준정보로 연결합니다.</span></div>';
  }else{
    list.innerHTML=menu.map(item=>`<article class="menu-row">
      <div class="menu-copy"><small>${esc(item.category||'미분류')} · ${esc(item.availability||'unknown')}</small><strong>${esc(item.name)}</strong>${item.description?`<p>${esc(item.description)}</p>`:''}</div>
      <div class="menu-base"><small>EKODI 기준가</small><strong>${item.base_price==null?'확인 필요':esc(won(item.base_price))}</strong></div>
      <div class="listing-chips">${Array.isArray(item.listings)&&item.listings.length?item.listings.map(listingChip).join(''):'<span class="listing-chip">플랫폼 매핑 대기</span>'}</div>
    </article>`).join('');
  }
  const target=$('unmappedList');
  target.innerHTML=Array.isArray(unmapped)&&unmapped.length?`<h3>기준메뉴에 아직 연결되지 않은 플랫폼 항목</h3>${unmapped.map(item=>`<div class="unmapped-item"><span>${esc(providerLabels[item.provider]||item.provider)} · ${esc(item.name)}</span><b>${item.price==null?'가격 확인 필요':esc(won(item.price))}</b></div>`).join('')}`:'';
}
function detectPriceDifferences(menu=[]){
  let count=0;
  for(const item of menu){
    const values=[item.base_price,...(Array.isArray(item.listings)?item.listings.map(row=>row.price):[])].filter(value=>value!=null).map(Number);
    if(new Set(values).size>1)count+=1;
  }
  return count;
}
function renderAgentHints(workspace){
  const summary=workspace.summary||{};const menu=Array.isArray(workspace.menu)?workspace.menu:[];
  const hints=[];const connected=Number(summary.connected_channel_count||0);
  if(!connected)hints.push(['배달플랫폼 연결이 필요합니다.','현재 메뉴·가격은 플랫폼 원본과 자동 비교할 수 없습니다.']);
  if(!menu.length)hints.push(['메뉴 기준정보를 만들 준비가 필요합니다.','검증된 플랫폼 자료가 들어오면 동일 메뉴를 묶고 기준가·옵션을 연결합니다.']);
  const differences=detectPriceDifferences(menu);
  if(differences)hints.push(['플랫폼별 가격 차이가 있습니다.',`${differences}개 기준메뉴에서 판매가가 서로 다릅니다. 변경은 사람 승인 후 진행합니다.`]);
  if(!hints.length)hints.push(['현재 연결 데이터에서 즉시 경보가 없습니다.','가격·품절·옵션 차이를 계속 비교할 수 있는 상태입니다.']);
  hints.push(['외부 변경은 자동 확정하지 않습니다.','가격 변경·게시·주문 변경은 승인 게이트를 거친 뒤 공식 어댑터가 실행합니다.']);
  $('agentHints').innerHTML=hints.map(([title,body])=>`<div class="hint"><b>${esc(title)}</b>${esc(body)}</div>`).join('');
}
function renderServiceActions(slug,role){
  const manager=['store_owner','tenant_admin','platform_admin'].includes(String(role||''));
  const admin=manager?`<a href="/${encodeURIComponent(slug)}/admin">점포 관리자 <span>매출 · 주문 · 메뉴 · 운영 →</span></a>`:'';
  $('serviceActions').innerHTML=admin+`<a href="/${encodeURIComponent(slug)}/marketing">Marketing AI <span>콘텐츠 · 캠페인 · 채널 →</span></a><a href="/">운영공간 목록 <span>다른 점포로 전환 →</span></a><a href="https://my.ekodi.kr/">내 홈 <span>개인 허브 →</span></a>`;
}
function showStoreSections(on){document.querySelectorAll('.store-data').forEach(el=>el.classList.toggle('hidden',!on))}
function renderStoreDashboard(workspace){
  renderStoreBasics(workspace.store||{});
  renderChannels(Array.isArray(workspace.channels)?workspace.channels:[]);
  renderMenu(Array.isArray(workspace.menu)?workspace.menu:[],Array.isArray(workspace.unmapped_channel_listings)?workspace.unmapped_channel_listings:[],workspace.summary||{});
  renderAgentHints(workspace);renderServiceActions(workspace.slug,workspace.role);
  $('workspaceName').textContent=workspace.name;
  $('workspaceRole').textContent=roleLabels[workspace.role]||workspace.role||'점포 구성원';
  $('workspaceMeta').textContent='이 점포의 매장·메뉴·가격·판매채널 데이터를 다른 점포와 분리해 운영합니다.';
  document.title=`${workspace.name} · EKODI`;
  document.documentElement.dataset.workspaceId=workspace.workspace_id;
}
async function renderWorkspace(){
  if(!routeMatch){show('workspaceView',false);show('spaceIndex',true);showStoreSections(false);status('운영할 공간을 선택해 주세요.','ok');return;}
  const [,slug]=routeMatch;show('spaceIndex',false);show('workspaceView',true);status('운영공간 권한을 확인하고 있습니다.');
  try{
    const {space}=await api(`/spaces/resolve?slug=${encodeURIComponent(slug)}`);
    $('workspaceName').textContent=space.name;$('workspaceRole').textContent=roleLabels[space.role]||space.role||'구성원';
    document.documentElement.dataset.workspaceId=space.workspace_id;
    if(space.kind==='store'){
      showStoreSections(true);$('workspaceType').textContent='STORE OPERATING SPACE';
      const {workspace}=await api(`/spaces/store-dashboard?slug=${encodeURIComponent(slug)}`);
      renderStoreDashboard(workspace);status(`${workspace.name} 운영공간에 연결되었습니다.`,'ok');return;
    }
    showStoreSections(false);$('workspaceType').textContent='OPERATING SPACE';
    $('workspaceMeta').textContent='이 공간의 권한과 데이터는 고유 workspace ID를 기준으로 연결됩니다.';
    document.title=`${space.name} · EKODI`;status(`${space.name} 운영공간에 연결되었습니다.`,'ok');
  }catch(error){
    if(error.status===404){$('workspaceName').textContent='접근할 수 없는 공간';$('workspaceMeta').textContent='공간이 없거나 현재 계정에 권한이 없습니다.';showStoreSections(false);status('공간 접근 권한을 확인해 주세요.','error');return;}
    if(error.status===403){$('workspaceName').textContent='권한이 필요한 공간';$('workspaceMeta').textContent='현재 계정에는 이 점포 운영정보를 볼 권한이 없습니다.';showStoreSections(false);status('점포 운영 권한을 확인해 주세요.','error');return;}
    throw error;
  }
}
async function renderSignedIn(){
  show('signedOut',false);show('signedIn',true);
  const current=await session();$('account').textContent=current?.user?.email||'EKODI 사용자';
  $('logout').onclick=async()=>{await sb.auth.signOut();renderSignedOut()};
  const {spaces}=await api('/spaces');currentSpaces=Array.isArray(spaces)?spaces:[];
  renderSpaces(currentSpaces);renderSwitcher(currentSpaces);await renderWorkspace();
}
async function boot(){
  if(!cfg.dataEnabled||!cfg.supabaseUrl||!cfg.supabasePublishableKey||!cfg.workspaceApi){show('signedOut',true);show('signedIn',false);show('login',false);show('spaceSwitcherWrap',false);status('이 환경은 개인 운영데이터와 분리된 검증 환경입니다.');return;}
  try{
    const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb=mod.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{detectSessionInUrl:false,persistSession:true}});
    await consumeHandoff();const current=await session();if(!current){renderSignedOut();return;}await renderSignedIn();
  }catch(error){
    console.error('space bootstrap',error);if(error.message==='login_required'){renderSignedOut();return;}
    status('운영공간을 불러오지 못했습니다. 다시 로그인해 주세요.','error');show('signedOut',true);show('signedIn',false);show('login',true);$('login').onclick=authStart;
  }
}
boot();
