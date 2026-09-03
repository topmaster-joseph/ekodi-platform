function tradeAdminClient(){
  const route=location.pathname.replace(/\/+$/,'').match(/^(?:\/org\/([^/]+)|\/(ekodibiz))\/trade\/admin(?:\/([^/]+))?$/i);
  if(!route)return;
  const workspaceUrlSlug=(route[1]||route[2]).toLowerCase();
  const workspace=workspaceUrlSlug==='ekodibiz'?'ekodi-biz':workspaceUrlSlug;
  const section=(route[3]||'overview').toLowerCase();
  const API='https://renzehysxirjilvdxacv.supabase.co/functions/v1/workspace-api';
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const base=workspaceUrlSlug==='ekodibiz'?'/ekodibiz/trade/admin':`/org/${workspaceUrlSlug}/trade/admin`;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleLabel={workspace_admin:'에코디비즈 전체관리자',trade_admin:'무역 전체관리자',trade_manager:'거래 운영관리자',trade_viewer:'조회 관리자'};
  const scopeLabel=value=>value==='all'?'전체 거래회사':'선택 거래회사';
  let sb=null,access=null,companies=[],admins=[];

  function state(text){if($('pageState'))$('pageState').textContent=text;}
  function card(label,value,small=''){return `<article class="card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(small)}</small></article>`;}
  function sectionTitle(title,copy){$('pageTitle').textContent=title;$('pageCopy').textContent=copy;document.title=`${title} · 에코디비즈`;}
  function setHeader(){
    $('serviceName').textContent='무역거래 관리';
    $('breadcrumb').textContent='에코디비즈 / 무역거래 / ADMIN';
    $('publicLink').href=workspaceUrlSlug==='ekodibiz'?'/ekodibiz/trade':`/org/${workspaceUrlSlug}/trade`;
    $('publicLink').textContent='관계자 화면';
    const nav=$('adminNav');nav.replaceChildren();
    [['overview','대시보드'],['companies','거래회사'],['access','관리자 · 권한']].forEach(([key,label])=>{
      const a=document.createElement('a');a.href=key==='overview'?base:`${base}/${key}`;a.textContent=label;if(key===section)a.classList.add('active');nav.append(a);
    });
  }
  async function currentSession(){const {data,error}=await sb.auth.getSession();if(error)throw error;return data.session;}
  async function consumeHandoff(){
    const params=new URLSearchParams(location.hash.slice(1));const token=params.get('ekodi_token');if(!token)return;
    const {error}=await sb.auth.verifyOtp({token_hash:token,type:params.get('ekodi_type')||'email'});if(error)throw error;
    history.replaceState({},document.title,location.pathname+location.search);
  }
  async function api(path,options={}){
    const session=await currentSession();if(!session?.access_token)throw Object.assign(new Error('login_required'),{status:401});
    const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,...(options.body?{'content-type':'application/json'}:{})};
    const response=await fetch(`${API}${path}`,{method:options.method||'GET',headers,body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
    const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||`api_${response.status}`),{status:response.status,code:data.error});return data;
  }
  function authRequired(){
    sectionTitle('무역거래 관리자','에코디비즈 권한으로 거래회사별 관리 범위를 확인합니다.');
    $('summaryCards').innerHTML=card('상태','로그인 필요','EKODI 통합 인증');
    const target=new URL('https://auth.ekodi.kr/');target.searchParams.set('site','trade');target.searchParams.set('return_to',location.origin+location.pathname);
    $('mainPanel').innerHTML=`<h2>관리자 인증</h2><p class="empty">로그인 후 에코디비즈 전체 권한 또는 지정된 거래회사 범위만 표시합니다.</p><div class="actions"><a class="button primary" href="${esc(target.href)}">Google 계정으로 계속</a></div>`;
    state('인증 필요');
  }
  function accessSummary(){
    const selected=access?.scope_mode==='selected'?companies.length:'전체';
    $('summaryCards').innerHTML=[card('관리자 등급',roleLabel[access?.role]||access?.role||'-','에코디비즈 무역'),card('회사 범위',scopeLabel(access?.scope_mode),access?.scope_mode==='selected'?`${selected}개 지정`:'모든 거래회사'),card('수정 권한',access?.can_write?'가능':'조회만','역할 기반'),card('권한관리',access?.can_manage_access?'가능':'불가','전체관리자 전용')].join('');
  }
  async function loadContext(){const data=await api(`/trade/context?workspace=${encodeURIComponent(workspace)}`);access=data.access;if(!access?.allowed)throw Object.assign(new Error(access?.reason||'trade_access_required'),{status:403});}
  async function loadCompanies(){const data=await api(`/trade/companies?workspace=${encodeURIComponent(workspace)}`);access=data.access||access;companies=Array.isArray(data.companies)?data.companies:[];}
  async function loadAdmins(){if(!access?.can_manage_access){admins=[];return;}const data=await api(`/trade/admins?workspace=${encodeURIComponent(workspace)}`);admins=Array.isArray(data.admins)?data.admins:[];}
  function companyRows(){
    if(!companies.length)return '<p class="empty">현재 권한 범위에 등록된 거래회사가 없습니다.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>회사</th><th>국가</th><th>등록번호</th><th>상태</th><th></th></tr></thead><tbody>${companies.map(c=>`<tr><td><strong>${esc(c.display_name)}</strong><br><small>${esc(c.legal_name||c.slug)}</small></td><td>${esc(c.country_code||'-')}</td><td>${esc(c.registration_no||'-')}</td><td><span class="tag ${c.status==='active'?'live':'warn'}">${esc(c.status)}</span></td><td>${access?.can_manage_companies?`<button class="button trade-edit-company" data-id="${esc(c.id)}" type="button">수정</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function companyForm(company={}){
    if(!access?.can_manage_companies)return '';
    return `<form id="tradeCompanyForm" class="trade-form"><input type="hidden" name="id" value="${esc(company.id||'')}"><div class="trade-grid"><label>표시 회사명<input name="displayName" required maxlength="180" value="${esc(company.display_name||'')}"></label><label>고유 slug<input name="slug" required maxlength="100" pattern="[a-z0-9][a-z0-9-]{0,98}" value="${esc(company.slug||'')}"></label><label>법인명<input name="legalName" maxlength="240" value="${esc(company.legal_name||'')}"></label><label>국가 코드<input name="countryCode" maxlength="8" placeholder="CN" value="${esc(company.country_code||'')}"></label><label>회사/사업자 등록번호<input name="registrationNo" maxlength="120" value="${esc(company.registration_no||'')}"></label><label>상태<select name="status"><option value="active" ${company.status!=='paused'&&company.status!=='archived'?'selected':''}>운영</option><option value="paused" ${company.status==='paused'?'selected':''}>일시중지</option><option value="archived" ${company.status==='archived'?'selected':''}>보관</option></select></label></div><div class="actions"><button class="button primary" type="submit">${company.id?'회사정보 저장':'거래회사 등록'}</button><button class="button" type="button" id="tradeCompanyReset">초기화</button></div><p class="trade-flash" id="tradeCompanyFlash"></p></form>`;
  }
  function bindCompanyForm(){
    const form=$('tradeCompanyForm');if(!form)return;
    form.addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));try{state('저장 중');await api('/trade/companies',{method:'POST',body:{workspace,id:data.id||null,slug:data.slug,displayName:data.displayName,legalName:data.legalName,countryCode:data.countryCode,registrationNo:data.registrationNo,status:data.status}});await loadCompanies();renderCompanies();state('저장 완료');}catch(error){$('tradeCompanyFlash').textContent=`저장 실패: ${error.message}`;state('확인 필요');}});
    $('tradeCompanyReset')?.addEventListener('click',()=>renderCompanies());
  }
  function renderCompanies(editId=''){
    sectionTitle('거래회사','내 권한 범위에 포함된 무역거래 상대회사를 관리합니다.');accessSummary();
    const company=companies.find(item=>item.id===editId)||{};$('mainPanel').innerHTML=`<h2>거래회사 목록</h2>${companyRows()}${companyForm(company)}`;
    document.querySelectorAll('.trade-edit-company').forEach(btn=>btn.addEventListener('click',()=>renderCompanies(btn.dataset.id||'')));bindCompanyForm();state(access?.scope_mode==='all'?'전체 범위':'지정 범위');
  }
  function companyScopeChecks(selected=[]){
    if(!companies.length)return '<p class="empty">먼저 거래회사를 등록해 주세요.</p>';
    const set=new Set(selected.map(String));return `<div class="trade-company-checks">${companies.filter(c=>c.status!=='archived').map(c=>`<label><input type="checkbox" name="companyIds" value="${esc(c.id)}" ${set.has(String(c.id))?'checked':''}><span>${esc(c.display_name)}</span><small>${esc(c.country_code||c.slug)}</small></label>`).join('')}</div>`;
  }
  function adminRows(){
    if(!admins.length)return '<p class="empty">별도로 위임된 무역 관리자가 없습니다. 에코디비즈 전체관리자는 별도 등록 없이 전체 권한을 유지합니다.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>관리자</th><th>권한</th><th>회사 범위</th><th>상태</th><th></th></tr></thead><tbody>${admins.map(a=>{const names=a.scope_mode==='all'?'모든 거래회사':(a.companies||[]).map(c=>c.name).join(', ')||'미지정';return `<tr><td>${esc(a.email)}</td><td>${esc(roleLabel[a.role]||a.role)}</td><td>${esc(names)}</td><td><span class="tag ${a.status==='active'?'live':'warn'}">${a.status==='active'?'활성':'중지'}</span></td><td><button type="button" class="button trade-edit-admin" data-id="${esc(a.id)}">수정</button></td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function adminForm(admin={}){
    if(!access?.can_manage_access)return '';
    const selected=(admin.companies||[]).map(item=>item.id);
    return `<form id="tradeAdminForm" class="trade-form"><div class="trade-grid"><label>관리자 이메일<input name="email" type="email" required maxlength="254" value="${esc(admin.email||'')}"></label><label>관리자 권한<select name="role"><option value="trade_admin" ${admin.role==='trade_admin'?'selected':''}>무역 전체관리자</option><option value="trade_manager" ${admin.role==='trade_manager'?'selected':''}>거래 운영관리자</option><option value="trade_viewer" ${admin.role==='trade_viewer'?'selected':''}>조회 관리자</option></select></label><label>회사 지정범위<select name="scopeMode" id="tradeScopeMode"><option value="all" ${admin.scope_mode!=='selected'?'selected':''}>모든 거래회사</option><option value="selected" ${admin.scope_mode==='selected'?'selected':''}>선택한 회사만</option></select></label><label>상태<select name="status"><option value="active" ${admin.status!=='disabled'?'selected':''}>활성</option><option value="disabled" ${admin.status==='disabled'?'selected':''}>중지</option></select></label></div><div id="tradeCompanyScope" class="trade-scope-box"><strong>관리할 회사</strong>${companyScopeChecks(selected)}</div><div class="actions"><button class="button primary" type="submit">관리자 권한 저장</button><button class="button" type="button" id="tradeAdminReset">초기화</button></div><p class="trade-flash" id="tradeAdminFlash"></p></form>`;
  }
  function bindAdminForm(){
    const form=$('tradeAdminForm');if(!form)return;const scope=$('tradeScopeMode'),scopeBox=$('tradeCompanyScope');
    const sync=()=>scopeBox?.classList.toggle('hidden',scope?.value!=='selected');sync();scope?.addEventListener('change',sync);
    form.addEventListener('submit',async event=>{event.preventDefault();const fd=new FormData(form);const companyIds=fd.getAll('companyIds').map(String);if(fd.get('scopeMode')==='selected'&&!companyIds.length){$('tradeAdminFlash').textContent='선택 범위에는 한 개 이상의 거래회사를 지정해야 합니다.';return;}try{state('권한 저장 중');await api('/trade/admins',{method:'POST',body:{workspace,email:fd.get('email'),role:fd.get('role'),scopeMode:fd.get('scopeMode'),companyIds,status:fd.get('status')}});await loadAdmins();renderAccess();state('권한 저장 완료');}catch(error){$('tradeAdminFlash').textContent=`저장 실패: ${error.message}`;state('확인 필요');}});
    $('tradeAdminReset')?.addEventListener('click',()=>renderAccess());
  }
  function renderAccess(editId=''){
    sectionTitle('관리자 · 권한','에코디비즈 전체관리자가 무역 담당자의 회사별 관리범위를 지정합니다.');accessSummary();
    if(!access?.can_manage_access){$('mainPanel').innerHTML='<h2>권한 경계</h2><p class="empty">관리자 등록과 회사 범위 변경은 에코디비즈 전체관리자만 할 수 있습니다. 현재 계정에는 지정된 회사 업무만 표시합니다.</p>';state('위임 권한');return;}
    const admin=admins.find(item=>item.id===editId)||{};$('mainPanel').innerHTML=`<h2>위임 관리자</h2><p class="empty">관리자마다 한 회사, 여러 회사 또는 모든 거래회사를 지정할 수 있습니다.</p>${adminRows()}${adminForm(admin)}`;
    document.querySelectorAll('.trade-edit-admin').forEach(btn=>btn.addEventListener('click',()=>renderAccess(btn.dataset.id||'')));bindAdminForm();state('전체관리자');
  }
  function renderOverview(){
    sectionTitle('무역거래 대시보드','에코디비즈 전체권한과 거래회사별 위임권한을 분리해 운영합니다.');accessSummary();
    const visible=companies.length,active=companies.filter(c=>c.status==='active').length;
    $('mainPanel').innerHTML=`<h2>현재 관리 범위</h2><div class="service-list"><div class="service-row"><div><strong>${esc(scopeLabel(access?.scope_mode))}</strong><p>${access?.scope_mode==='all'?'현재와 앞으로 등록되는 모든 거래회사를 관리합니다.':`지정된 ${visible}개 거래회사만 접근합니다.`}</p></div><a href="${base}/companies">거래회사 보기</a></div><div class="service-row"><div><strong>활성 거래회사 ${active}개</strong><p>회사별 데이터와 업무는 동일한 권한 범위로 제한합니다.</p></div>${access?.can_manage_access?`<a href="${base}/access">관리자 지정</a>`:'<span class="tag">위임됨</span>'}</div></div>`;
    state(access?.role==='workspace_admin'?'전체관리자':'범위 관리자');
  }
  async function boot(){
    setHeader();
    try{
      const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      sb=mod.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{detectSessionInUrl:false,persistSession:true}});
      await consumeHandoff();const session=await currentSession();if(!session){authRequired();return;}
      await loadContext();await loadCompanies();if(section==='access')await loadAdmins();
      if(section==='companies')renderCompanies();else if(section==='access')renderAccess();else renderOverview();
    }catch(error){
      console.error('trade admin bootstrap',error);if(error.status===401||error.message==='login_required'){authRequired();return;}
      sectionTitle('무역거래 관리자','현재 계정의 에코디비즈 무역 권한을 확인합니다.');$('summaryCards').innerHTML=card('접근','제한됨','권한 확인');
      $('mainPanel').innerHTML=`<h2>접근할 수 없습니다.</h2><p class="empty">에코디비즈 전체관리자이거나 하나 이상의 거래회사에 위임된 관리자만 사용할 수 있습니다.</p><p class="trade-flash">${esc(error.message)}</p>`;state('권한 없음');
    }
  }
  boot();
}

export function workspaceTradeAdminScript(){return new Response(`(${tradeAdminClient.toString()})();`,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}})}
