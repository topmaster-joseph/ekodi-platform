const cfg=window.EKODI_TRADE_CONFIG||{};
const $=id=>document.getElementById(id);
const SUPABASE_URL=cfg.supabaseUrl;
const PUBLISHABLE_KEY=cfg.publishableKey;
let sb,session,workspaces=[],active=null,counterparties=[],cases=[];

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
function slug(v){return String(v||'counterparty').trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||crypto.randomUUID().slice(0,8)}
function tenantRole(){return active?.role||'member'}
function canManage(){return tenantRole()==='tenant_admin'}
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
  const select=$('tenantSelect');select.replaceChildren();
  if(!workspaces.length){select.append(new Option('권한 있는 고객사 없음',''));$('signedOut').innerHTML='<b>Trade 고객사 권한이 없습니다.</b><p>My EKODI 또는 고객사 관리자가 Trade 권한을 부여하면 이곳에 표시됩니다.</p>';return false}
  for(const w of workspaces)select.append(new Option(`${w.workspace_name} · ${w.role}`,w.tenant_id));
  active=workspaces[0];select.value=active.tenant_id;
  $('signedOut').classList.add('hide');$('workspace').classList.remove('hide');return true
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
  $('tenantName').textContent=active.workspace_name||active.tenant||'고객사';
  $('roleInfo').textContent=`현재 권한: ${tenantRole()} · 데이터 경계: tenant ${active.tenant_id} · 다른 고객사 데이터는 RLS에서 차단됩니다. 플랫폼 관리자 권한은 고객사 권한으로 자동 전환되지 않습니다.`;
  const q=`tenant_id=eq.${encodeURIComponent(active.tenant_id)}&order=updated_at.desc`;
  [counterparties,cases]=await Promise.all([table('trade_counterparties',q),table('trade_cases',q)]);
  render();
}
function render(){
  $('counterpartyCount').textContent=counterparties.length;$('caseCount').textContent=cases.filter(c=>!['closed','cancelled'].includes(c.state)).length;$('customsCount').textContent=cases.filter(c=>c.state==='customs').length;$('approvalCount').textContent=cases.filter(c=>['ordered','ready_to_ship','customs'].includes(c.state)).length;
  $('newCounterpartyBtn').classList.toggle('hide',!canManage());
  $('caseCounterparty').innerHTML='<option value="">거래상대 선택</option>'+counterparties.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  $('counterpartyList').innerHTML=counterparties.length?counterparties.map(c=>`<article class="card"><span class="tag">${esc(c.type)}</span><h3>${esc(c.name)}</h3><p>${esc(c.country_code||'국가 미지정')} · ${esc(c.status)}</p><p>${esc(c.unique_profile?.contact||'담당자 미지정')}</p></article>`).join(''):'<p class="muted">등록된 거래상대가 없습니다.</p>';
  $('caseList').innerHTML=cases.length?cases.map(c=>`<article class="card"><span class="tag">${esc(c.state)}</span><h3>${esc(c.title||c.trade_key)}</h3><p>${esc(c.direction)} · ${esc(c.incoterm||'Incoterm 미정')} · ${esc(c.currency)}</p><p>HS ${esc(c.hs_code||'미정')}</p></article>`).join(''):'<p class="muted">등록된 거래가 없습니다.</p>';
  const recent=cases.slice(0,6);$('overviewGrid').innerHTML=(recent.length?recent.map(c=>`<article class="card"><span class="tag">${esc(c.state)}</span><h3>${esc(c.title||c.trade_key)}</h3><p>${esc(counterparties.find(p=>p.id===c.counterparty_id)?.name||'거래상대 미지정')}</p></article>`).join(''):'<article class="card"><h3>첫 거래를 준비하세요</h3><p>거래상대 회사를 등록한 뒤 거래건을 만들 수 있습니다.</p></article>');
}
$('counterpartyForm').onsubmit=async e=>{e.preventDefault();if(!active||!canManage())return;const f=new FormData(e.currentTarget),name=f.get('name');await insert('trade_counterparties',{tenant_id:active.tenant_id,name,slug:`${slug(name)}-${crypto.randomUUID().slice(0,6)}`,type:f.get('type'),country_code:String(f.get('country')||'').toUpperCase(),unique_profile:{contact:f.get('contact')},created_by:session.user.id});e.currentTarget.reset();e.currentTarget.classList.add('hide');await loadData()};
$('caseForm').onsubmit=async e=>{e.preventDefault();if(!active)return;const f=new FormData(e.currentTarget),cp=f.get('counterparty');await insert('trade_cases',{tenant_id:active.tenant_id,counterparty_id:cp||null,trade_key:`TR-${Date.now()}`,title:f.get('title'),direction:f.get('direction'),incoterm:String(f.get('incoterm')||'').toUpperCase(),hs_code:f.get('hsCode'),created_by:session.user.id});e.currentTarget.reset();e.currentTarget.classList.add('hide');await loadData()};

(async()=>{try{if(await loadWorkspaces())await loadData()}catch(error){console.error(error);$('signedOut').classList.remove('hide');$('signedOut').innerHTML=`<b>Trade 연결을 확인할 수 없습니다.</b><p>${esc(error.message)}</p>`}})();
