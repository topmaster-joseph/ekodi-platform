const cfg=window.EKODI_TRADE_CONFIG||{};
const $=id=>document.getElementById(id);
const SUPABASE_URL=cfg.supabaseUrl;
const PUBLISHABLE_KEY=cfg.publishableKey;
const WORKSPACE_API=`${SUPABASE_URL}/functions/v1/workspace-api`;
const SURFACE_TENANT_KEY=String(cfg.surfaceTenantKey||'').trim().toLowerCase();
let sb,session,workspaces=[],active=null,access=null,counterparties=[],cases=[];

async function client(){
  if(sb)return sb;
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  sb=createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{detectSessionInUrl:true,persistSession:true}});
  const hash=new URLSearchParams(location.hash.replace(/^#/,''));
  const token=hash.get('ekodi_token');
  if(token){await sb.auth.verifyOtp({token_hash:token,type:hash.get('ekodi_type')||'email'});history.replaceState(null,'',location.pathname+location.search)}
  session=(await sb.auth.getSession()).data.session;
  return sb;
}
function loginUrl(){const u=new URL(cfg.authUrl||'https://auth.ekodi.kr/?site=trade');u.searchParams.set('return_to',location.origin+location.pathname);return u.href}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function slug(v){return String(v||'counterparty').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||crypto.randomUUID().slice(0,8)}
function workspaceSlug(){return String(active?.tenant_slug||SURFACE_TENANT_KEY||'').toLowerCase()}
function canWrite(){return Boolean(access?.can_write)}
function canManageCompanies(){return Boolean(access?.can_manage_companies)}
function setTab(name){document.querySelectorAll('.tab').forEach(el=>el.classList.toggle('hide',el.id!==`tab-${name}`));document.querySelectorAll('.tabs button').forEach(el=>el.classList.toggle('active',el.dataset.tab===name))}

document.querySelectorAll('.tabs button').forEach(btn=>btn.onclick=()=>setTab(btn.dataset.tab));
$('loginBtn').href=loginUrl();
$('refreshBtn').onclick=()=>loadData();
$('newCounterpartyBtn').onclick=()=>$('counterpartyForm').classList.toggle('hide');
$('newCaseBtn').onclick=()=>$('caseForm').classList.toggle('hide');
$('tenantSelect').onchange=()=>{active=workspaces.find(w=>(w.tenant_id||'')===$('tenantSelect').value)||null;loadData()};

async function loadWorkspaces(){
  const api=await client();
  if(!session){$('signedOut').classList.remove('hide');$('workspace').classList.add('hide');return false}
  $('loginBtn').textContent='계정 확인';
  const {data,error}=await api.rpc('current_site_workspaces',{p_site_key:'trade'});
  if(error)throw error;
  workspaces=(data||[]).filter(w=>w.tenant_id);
  if(SURFACE_TENANT_KEY)workspaces=workspaces.filter(w=>String(w.tenant_slug||'').toLowerCase()===SURFACE_TENANT_KEY);
  const select=$('tenantSelect');select.replaceChildren();
  if(!workspaces.length){select.append(new Option('사용 가능한 고객사가 없습니다',''));$('signedOut').innerHTML='<b>Trade 고객사 권한이 없습니다.</b><p>고객사 관리자에게 Trade 권한을 요청해 주세요.</p>';return false}
  for(const w of workspaces)select.append(new Option(`${w.workspace_name} · ${w.role}`,w.tenant_id));
  active=workspaces[0];select.value=active.tenant_id;
  if(SURFACE_TENANT_KEY){select.disabled=true;select.setAttribute('aria-label',`${active.workspace_name||SURFACE_TENANT_KEY} 고정 업무공간`)}
  $('signedOut').classList.add('hide');$('workspace').classList.remove('hide');return true
}
async function workspaceApi(path,options={}){
  const token=session?.access_token;if(!token)throw new Error('login_required');
  const res=await fetch(`${WORKSPACE_API}${path}`,{method:options.method||'GET',headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,...(options.body?{'content-type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
  const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||`workspace_api_${res.status}`);return data
}
async function table(name,query=''){
  const token=session?.access_token;if(!token)throw new Error('login_required');
  const res=await fetch(`${SUPABASE_URL}/rest/v1/${name}?${query}`,{headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,Accept:'application/json'}});
  if(!res.ok)throw new Error((await res.text())||`${name}_${res.status}`);return res.json()
}
async function insert(name,payload){
  const token=session?.access_token;const res=await fetch(`${SUPABASE_URL}/rest/v1/${name}`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,'content-type':'application/json',Prefer:'return=representation'},body:JSON.stringify(payload)});
  if(!res.ok)throw new Error((await res.text())||`${name}_${res.status}`);return res.json()
}
async function loadData(){
  if(!active)return;
  const ws=encodeURIComponent(workspaceSlug());
  const [ctx,companies]=await Promise.all([workspaceApi(`/trade/context?workspace=${ws}`),workspaceApi(`/trade/companies?workspace=${ws}`)]);
  access=ctx.access;counterparties=companies.companies||[];
  cases=await table('trade_cases',`workspace_tenant_id=eq.${encodeURIComponent(active.tenant_id)}&order=updated_at.desc`);
  $('tenantName').textContent=active.workspace_name||active.tenant_slug||'고객사';
  $('roleInfo').textContent=`현재 권한: ${access?.role||active.role||'member'} · 고객사 경계 ${active.tenant_id} · 거래상대 범위 ${access?.scope_mode||'membership'}`;
  render();
}
function render(){
  $('counterpartyCount').textContent=counterparties.length;$('caseCount').textContent=cases.filter(c=>!['closed','cancelled'].includes(c.state)).length;$('customsCount').textContent=cases.filter(c=>c.state==='customs').length;$('approvalCount').textContent=cases.filter(c=>['ordered','ready_to_ship','customs'].includes(c.state)).length;
  $('newCounterpartyBtn').classList.toggle('hide',!canManageCompanies());$('newCaseBtn').classList.toggle('hide',!canWrite());
  $('caseCounterparty').innerHTML='<option value="">거래상대 선택</option>'+counterparties.map(c=>`<option value="${esc(c.id)}">${esc(c.display_name)}</option>`).join('');
  $('counterpartyList').innerHTML=counterparties.length?counterparties.map(c=>`<article class="card"><span class="tag">${esc(c.status)}</span><h3>${esc(c.display_name)}</h3><p>${esc(c.country_code||'국가 미정')} · ${esc(c.legal_name||c.slug)}</p><p>${esc(c.registration_no||'등록번호 미정')}</p></article>`).join(''):'<p class="muted">등록된 거래상대가 없습니다.</p>';
  $('caseList').innerHTML=cases.length?cases.map(c=>`<article class="card"><span class="tag">${esc(c.state)}</span><h3>${esc(c.title||c.trade_key)}</h3><p>${esc(c.direction)} · ${esc(c.incoterm||'Incoterm 미정')} · ${esc(c.currency)}</p><p>HS ${esc(c.hs_code||'미정')}</p></article>`).join(''):'<p class="muted">등록된 거래가 없습니다.</p>';
  const recent=cases.slice(0,6);$('overviewGrid').innerHTML=recent.length?recent.map(c=>`<article class="card"><span class="tag">${esc(c.state)}</span><h3>${esc(c.title||c.trade_key)}</h3><p>${esc(counterparties.find(p=>p.id===c.counterparty_id)?.display_name||'거래상대 미정')}</p></article>`).join(''):'<article class="card"><h3>첫 거래를 준비하세요</h3><p>거래상대 회사를 등록한 뒤 거래건을 만들 수 있습니다.</p></article>';
}
$('counterpartyForm').onsubmit=async e=>{e.preventDefault();if(!active||!canManageCompanies())return;const f=new FormData(e.currentTarget),name=String(f.get('name')||'');await workspaceApi('/trade/companies',{method:'POST',body:{workspace:workspaceSlug(),slug:`${slug(name)}-${crypto.randomUUID().slice(0,6)}`,displayName:name,legalName:name,countryCode:String(f.get('country')||'').toUpperCase(),registrationNo:'',status:'active'}});e.currentTarget.reset();e.currentTarget.classList.add('hide');await loadData()};
$('caseForm').onsubmit=async e=>{e.preventDefault();if(!active||!canWrite())return;const f=new FormData(e.currentTarget),cp=String(f.get('counterparty')||'');if(!cp)return;await insert('trade_cases',{workspace_tenant_id:active.tenant_id,counterparty_id:cp,trade_key:`TR-${Date.now()}`,title:f.get('title'),direction:f.get('direction'),incoterm:String(f.get('incoterm')||'').toUpperCase(),hs_code:f.get('hsCode'),created_by:session.user.id});e.currentTarget.reset();e.currentTarget.classList.add('hide');await loadData()};

(async()=>{try{if(await loadWorkspaces())await loadData()}catch(error){console.error(error);$('signedOut').classList.remove('hide');$('signedOut').innerHTML=`<b>Trade 연결을 확인하지 못했습니다.</b><p>${esc(error.message)}</p>`}})();
