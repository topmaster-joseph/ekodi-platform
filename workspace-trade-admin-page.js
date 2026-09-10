import { ekodiBizAdminScopeSnapshot } from './ekodibiz-admin-registry.js';
function tradeAdminClient(ADMIN_HUB){
  const route=location.pathname.replace(/\/+$/,'').match(/^\/([^/]+)\/trade\/admin(?:\/([^/]+))?$/i);
  if(!route)return;
  const workspaceUrlSlug=route[1].toLowerCase();
  const workspace=workspaceUrlSlug==='ekodibiz'?'ekodi-biz':workspaceUrlSlug;
  const section=(route[2]||'overview').toLowerCase();
  const API='https://renzehysxirjilvdxacv.supabase.co/functions/v1/workspace-api';
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const SUPABASE_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const base=`/${workspaceUrlSlug}/trade/admin`;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleLabel={workspace_admin:'에코디비즈 전체관리자',trade_admin:'무역 전체관리자',trade_manager:'거래 운영관리자',trade_viewer:'조회 관리자'};
  const scopeLabel=value=>value==='all'?'전체 거래회사':'선택 거래회사';
  const adminHubScopes=Array.isArray(ADMIN_HUB?.scopes)?ADMIN_HUB.scopes:[];
  let sb=null,access=null,companies=[],admins=[];

  function state(text){if($('pageState'))$('pageState').textContent=text;}
  function renderAdminScopeSwitcher(){const host=$('adminScopeSwitcher');if(!host)return;host.replaceChildren();if(access?.role!=='workspace_admin'||!adminHubScopes.length){host.hidden=true;return}host.hidden=false;const label=document.createElement('span');label.className='admin-scope-label';label.textContent='관리 영역';host.append(label);for(const scope of adminHubScopes){const a=document.createElement('a');a.href=scope.adminHref;a.textContent=scope.label;a.dataset.adminScope=scope.id;a.title=scope.description||scope.label;if(scope.id==='trade'){a.classList.add('active');a.setAttribute('aria-current','page')}host.append(a)}}
  function card(label,value,small=''){return `<article class="card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(small)}</small></article>`;}
  function sectionTitle(title,copy){$('pageTitle').textContent=title;$('pageCopy').textContent=copy;document.title=`${title} · 에코디비즈`;}
  function sectionHref(key){return key==='overview'?base:`${base}/${key}`;}
  function renderSecondaryNav(group=section){
    const sub=$('sectionNav');if(!sub)return;sub.replaceChildren();
    const items=group==='access'?[['access','admins','관리자'],['access','roles','역할 · 권한']]:group==='companies'?[['companies','list','거래회사'],['companies','editor','등록 · 수정']]:[['overview','scope','대시보드']];
    items.forEach(([routeKey,anchor,label],index)=>{const a=document.createElement('a');a.href=`${sectionHref(routeKey)}#${anchor}`;a.textContent=label;if(routeKey===section&&index===0)a.classList.add('active');sub.append(a);});
  }
  function setHeader(){
    $('workspaceName').textContent='에코디비즈';$('scopeLabel').textContent='에코디비즈';$('serviceName').textContent='무역거래 관리';
    $('breadcrumb').textContent='에코디비즈 / 무역거래 / ADMIN';$('publicLink').href=`/${workspaceUrlSlug}/trade`;$('publicLink').textContent='관계자 화면';    const nav=$('adminNav');nav.replaceChildren();
    [['overview','운영'],['companies','거래관리'],['access','사용자 · 관리자']].forEach(([key,label])=>{
      const b=document.createElement('button');b.type='button';b.dataset.adminGroup=key;b.textContent=label;
      if(key===section)b.classList.add('active');b.onclick=()=>{nav.querySelectorAll('[data-admin-group]').forEach(node=>node.classList.toggle('active',node===b));renderSecondaryNav(key);};nav.append(b);
    });
    renderSecondaryNav();
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
    const target=new URL('/auth/',location.origin);target.searchParams.set('site','trade');target.searchParams.set('direct','1');target.searchParams.set('return_to',location.origin+location.pathname);
    $('mainPanel').innerHTML=`<h2>관리자 인증</h2><p class="empty">로그인 후 에코디비즈 전체 권한 또는 지정된 거래회사 범위만 표시합니다.</p><div class="actions"><a class="button primary" href="${esc(target.href)}">Google 계정으로 계속</a></div>`;
    state('인증 필요');
  }
  function accessSummary(){
    if(section==='access'&&access?.can_manage_access){const active=admins.filter(a=>a.status==='active').length,all=admins.filter(a=>a.scope_mode==='all').length,selected=admins.filter(a=>a.scope_mode==='selected').length;
      $('summaryCards').innerHTML=[card('위임 관리자',admins.length+'명','무역 권한 등록'),card('활성 관리자',active+'명','현재 접근 가능'),card('전체 범위',all+'명','모든 거래회사'),card('지정 범위',selected+'명','선택 회사만')].join('');return;}
    const selected=access?.scope_mode==='selected'?companies.length:'전체';
    $('summaryCards').innerHTML=[card('내 권한',roleLabel[access?.role]||access?.role||'-','에코디비즈 무역'),card('회사 범위',scopeLabel(access?.scope_mode),access?.scope_mode==='selected'?`${selected}개 지정`:'모든 거래회사'),card('수정',access?.can_write?'가능':'조회만','역할 기반'),card('권한관리',access?.can_manage_access?'가능':'불가','테넌트 경계')].join('');
  }  async function loadContext(){const data=await api(`/trade/context?workspace=${encodeURIComponent(workspace)}`);access=data.access;if(!access?.allowed)throw Object.assign(new Error(access?.reason||'trade_access_required'),{status:403});}
  async function loadCompanies(){const data=await api(`/trade/companies?workspace=${encodeURIComponent(workspace)}`);access=data.access||access;companies=Array.isArray(data.companies)?data.companies:[];}
  async function loadAdmins(){if(!access?.can_manage_access){admins=[];return;}const data=await api(`/trade/admins?workspace=${encodeURIComponent(workspace)}`);admins=Array.isArray(data.admins)?data.admins:[];}
  function companyRows(){
    if(!companies.length)return '<p class="empty">현재 권한 범위에 등록된 거래회사가 없습니다.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>회사</th><th>국가</th><th>등록번호</th><th>상태</th><th></th></tr></thead><tbody>${companies.map(c=>`<tr><td><strong>${esc(c.display_name)}</strong><br><small>${esc(c.legal_name||c.slug)}</small></td><td>${esc(c.country_code||'-')}</td><td>${esc(c.registration_no||'-')}</td><td><span class="tag ${c.status==='active'?'live':'warn'}">${esc(c.status)}</span></td><td>${access?.can_manage_companies?`<button class="button trade-edit-company" data-id="${esc(c.id)}" type="button">수정</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function companyForm(company={}){
    if(!access?.can_manage_companies)return '';
    return `<form id="tradeCompanyForm" class="trade-form"><input type="hidden" name="id" value="${esc(company.id||'')}"><div class="trade-grid"><label>표시 회사명<input name="displayName" required maxlength="180" value="${esc(company.display_name||'')}"></label><label>고유 slug<input name="slug" required maxlength="100" pattern="[a-z0-9][a-z0-9-]{0,98}" value="${esc(company.slug||'')}"></label><label>법인명<input name="legalName" maxlength="240" value="${esc(company.legal_name||'')}"></label><label>국가 코드<input name="countryCode" maxlength="8" placeholder="CN" value="${esc(company.country_code||'')}"></label><label>회사/사업자 등록번호<input name="registrationNo" maxlength="120" value="${esc(company.registration_no||'')}"></label><label>상태<select name="status"><option value="active" ${company.status!=='paused'&&company.status!=='archived'?'selected':''}>운영</option><option value="paused" ${company.status==='paused'?'selected':''}>일시중지</option><option value="archived" ${company.status==='archived'?'selected':''}>보관</option></select></label></div><div class="actions"><button class="button primary" type="submit">${company.id?'회사정보 저장':'거래회사 등록'}</button><button class="button" type="button" id="tradeCompanyReset">취소</button></div><p class="trade-flash" id="tradeCompanyFlash"></p></form>`;
  }
  function bindCompanyForm(){
    const form=$('tradeCompanyForm');if(!form)return;
    form.addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(form));try{state('저장 중');await api('/trade/companies',{method:'POST',body:{workspace,id:data.id||null,slug:data.slug,displayName:data.displayName,legalName:data.legalName,countryCode:data.countryCode,registrationNo:data.registrationNo,status:data.status}});await loadCompanies();renderCompanies();state('저장 완료');}catch(error){$('tradeCompanyFlash').textContent=`저장 실패: ${error.message}`;state('확인 필요');}});
    $('tradeCompanyReset')?.addEventListener('click',()=>renderCompanies());
  }
  function renderCompanies(editId=''){
    if(!editId&&location.hash==='#editor')editId='__new__';
    sectionTitle('거래회사','내 권한 범위에 포함된 무역거래 상대회사를 관리합니다.');accessSummary();
    const company=companies.find(item=>item.id===editId)||{};const editing=Boolean(editId);
    $('mainPanel').innerHTML=`<section id="list"><div class="panel-head"><div><h2>거래회사 목록</h2><p class="empty">회사별 데이터와 권한 범위의 기준이 되는 거래처 원장입니다.</p></div>${access?.can_manage_companies?'<button class="button primary" id="tradeCompanyAdd" type="button">거래회사 등록</button>':''}</div>${companyRows()}</section>${access?.can_manage_companies&&editing?`<section id="editor" class="editor-shell"><h2>${company.id?'거래회사 수정':'거래회사 등록'}</h2>${companyForm(company)}</section>`:''}`;
    document.querySelectorAll('.trade-edit-company').forEach(btn=>btn.addEventListener('click',()=>renderCompanies(btn.dataset.id||'')));$('tradeCompanyAdd')?.addEventListener('click',()=>renderCompanies('__new__'));bindCompanyForm();if(editing)document.querySelector('.editor-shell')?.scrollIntoView({block:'nearest'});state(access?.scope_mode==='all'?'전체 범위':'지정 범위');
  }
  function companyScopeChecks(selected=[]){
    if(!companies.length)return '<p class="empty">먼저 거래회사를 등록해 주세요.</p>';
    const set=new Set(selected.map(String));return `<div class="trade-company-checks">${companies.filter(c=>c.status!=='archived').map(c=>`<label><input type="checkbox" name="companyIds" value="${esc(c.id)}" ${set.has(String(c.id))?'checked':''}><span>${esc(c.display_name)}</span><small>${esc(c.country_code||c.slug)}</small></label>`).join('')}</div>`;
  }  function adminRows(list=admins){
    if(!list.length)return '<p class="empty">조건에 맞는 위임 관리자가 없습니다.</p>';
    return `<div class="table-wrap"><table><thead><tr><th>관리자</th><th>역할</th><th>관리 범위</th><th>상태</th><th>최근 변경</th><th></th></tr></thead><tbody>${list.map(a=>{const names=a.scope_mode==='all'?'모든 거래회사':(a.companies||[]).map(c=>c.name).join(', ')||'미지정';const changed=a.updated_at||a.created_at;return `<tr><td><strong>${esc(a.email)}</strong></td><td>${esc(roleLabel[a.role]||a.role)}</td><td>${esc(names)}</td><td><span class="tag ${a.status==='active'?'live':'warn'}">${a.status==='active'?'활성':'중지'}</span></td><td>${changed?esc(new Date(changed).toLocaleDateString('ko-KR')):'-'}</td><td><button type="button" class="button trade-edit-admin" data-id="${esc(a.id)}">수정</button></td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function adminForm(admin={}){
    if(!access?.can_manage_access)return '';
    const selected=(admin.companies||[]).map(item=>item.id);
    return `<form id="tradeAdminForm" class="trade-form"><div class="trade-grid"><label>관리자 이메일<input name="email" type="email" required maxlength="254" value="${esc(admin.email||'')}"></label><label>관리자 역할<select name="role"><option value="trade_admin" ${admin.role==='trade_admin'?'selected':''}>무역 전체관리자</option><option value="trade_manager" ${admin.role==='trade_manager'?'selected':''}>거래 운영관리자</option><option value="trade_viewer" ${admin.role==='trade_viewer'?'selected':''}>조회 관리자</option></select></label><label>회사 관리범위<select name="scopeMode" id="tradeScopeMode"><option value="all" ${admin.scope_mode!=='selected'?'selected':''}>모든 거래회사</option><option value="selected" ${admin.scope_mode==='selected'?'selected':''}>선택한 회사만</option></select></label><label>상태<select name="status"><option value="active" ${admin.status!=='disabled'?'selected':''}>활성</option><option value="disabled" ${admin.status==='disabled'?'selected':''}>중지</option></select></label></div><div id="tradeCompanyScope" class="trade-scope-box"><strong>관리할 회사</strong>${companyScopeChecks(selected)}</div><div class="actions"><button class="button primary" type="submit">관리자 권한 저장</button><button class="button" type="button" id="tradeAdminReset">취소</button></div><p class="trade-flash" id="tradeAdminFlash"></p></form>`;
  }
  function bindAdminForm(){
    const form=$('tradeAdminForm');if(!form)return;const scope=$('tradeScopeMode'),scopeBox=$('tradeCompanyScope');
    const sync=()=>scopeBox?.classList.toggle('hidden',scope?.value!=='selected');sync();scope?.addEventListener('change',sync);
    form.addEventListener('submit',async event=>{event.preventDefault();const fd=new FormData(form);const companyIds=fd.getAll('companyIds').map(String);if(fd.get('scopeMode')==='selected'&&!companyIds.length){$('tradeAdminFlash').textContent='선택 범위에는 한 개 이상의 거래회사를 지정해야 합니다.';return;}try{state('권한 저장 중');await api('/trade/admins',{method:'POST',body:{workspace,email:fd.get('email'),role:fd.get('role'),scopeMode:fd.get('scopeMode'),companyIds,status:fd.get('status')}});await loadAdmins();renderAccess();state('권한 저장 완료');}catch(error){$('tradeAdminFlash').textContent=`저장 실패: ${error.message}`;state('확인 필요');}});
    $('tradeAdminReset')?.addEventListener('click',()=>renderAccess());
  }
  function roleGuide(){return '<section id="roles" style="margin-top:18px"><h2>역할 · 권한 기준</h2><div class="role-guide"><article class="role-card"><strong>무역 전체관리자</strong><p>무역 업무를 총괄합니다. 회사 범위는 전체 또는 지정 범위로 제한할 수 있습니다.</p></article><article class="role-card"><strong>거래 운영관리자</strong><p>허용된 거래회사 업무를 수정·운영합니다. 플랫폼 전체 권한은 상속하지 않습니다.</p></article><article class="role-card"><strong>조회 관리자</strong><p>허용된 거래회사 범위의 정보를 조회합니다. 변경 권한은 부여하지 않습니다.</p></article></div></section>';}
  function renderAccess(editId=''){
    sectionTitle('관리자 · 권한','역할(Role)과 관리범위(Scope)를 분리해 무역 담당자의 최소 권한을 지정합니다.');accessSummary();
    if(!access?.can_manage_access){$('mainPanel').innerHTML='<h2>권한 경계</h2><p class="empty">관리자 등록과 회사 범위 변경은 에코디비즈 전체관리자만 할 수 있습니다. 현재 계정에는 지정된 회사 업무만 표시합니다.</p>';state('위임 권한');return;}
    const admin=admins.find(item=>item.id===editId)||{};const editing=Boolean(editId);
    $('mainPanel').innerHTML=`<section id="admins"><div class="panel-head"><div><h2>관리자</h2><p class="empty">위임된 무역 관리자 ${admins.length}명. 검색과 필터로 권한 상태를 확인합니다.</p></div><button class="button primary" id="tradeAdminAdd" type="button">관리자 추가</button></div><div class="panel-tools"><input id="tradeAdminSearch" type="search" placeholder="이메일 검색" aria-label="관리자 이메일 검색"><select id="tradeAdminRole"><option value="">모든 역할</option><option value="trade_admin">무역 전체관리자</option><option value="trade_manager">거래 운영관리자</option><option value="trade_viewer">조회 관리자</option></select><select id="tradeAdminStatus"><option value="">모든 상태</option><option value="active">활성</option><option value="disabled">중지</option></select></div><div id="tradeAdminRows">${adminRows()}</div></section>${editing?`<section class="editor-shell"><h2>${admin.id?'관리자 권한 수정':'관리자 추가'}</h2>${adminForm(admin)}</section>`:''}${roleGuide()}`;    const bindRows=()=>document.querySelectorAll('.trade-edit-admin').forEach(btn=>btn.addEventListener('click',()=>renderAccess(btn.dataset.id||'')));
    bindRows();$('tradeAdminAdd')?.addEventListener('click',()=>renderAccess('__new__'));
    const apply=()=>{const q=String($('tradeAdminSearch')?.value||'').trim().toLowerCase(),role=$('tradeAdminRole')?.value||'',status=$('tradeAdminStatus')?.value||'';const filtered=admins.filter(a=>(!q||String(a.email||'').toLowerCase().includes(q))&&(!role||a.role===role)&&(!status||a.status===status));$('tradeAdminRows').innerHTML=adminRows(filtered);bindRows();};
    $('tradeAdminSearch')?.addEventListener('input',apply);$('tradeAdminRole')?.addEventListener('change',apply);$('tradeAdminStatus')?.addEventListener('change',apply);bindAdminForm();if(editing)document.querySelector('.editor-shell')?.scrollIntoView({block:'nearest'});state('전체관리자');
  }
  function renderOverview(){
    sectionTitle('무역거래 대시보드','에코디비즈 전체권한과 거래회사별 위임권한을 분리해 운영합니다.');accessSummary();
    const visible=companies.length,active=companies.filter(c=>c.status==='active').length;
    $('mainPanel').innerHTML=`<section id="scope"><h2>현재 관리 범위</h2><div class="service-list"><div class="service-row"><div><strong>${esc(scopeLabel(access?.scope_mode))}</strong><p>${access?.scope_mode==='all'?'현재와 앞으로 등록되는 모든 거래회사를 관리합니다.':`지정된 ${visible}개 거래회사만 접근합니다.`}</p></div><a href="${base}/companies">거래회사 보기</a></div><div class="service-row"><div><strong>활성 거래회사 ${active}개</strong><p>회사별 데이터와 업무는 동일한 권한 범위로 제한합니다.</p></div>${access?.can_manage_access?`<a href="${base}/access">관리자 지정</a>`:'<span class="tag">위임됨</span>'}</div></div></section>`;
    state(access?.role==='workspace_admin'?'전체관리자':'범위 관리자');
  }
  async function boot(){
    setHeader();
    try{
      const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      sb=mod.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{detectSessionInUrl:false,persistSession:true}});
      $('workspaceLogout')?.addEventListener('click',async()=>{try{await sb.auth.signOut();}finally{location.assign(base);}});
      await consumeHandoff();const session=await currentSession();if(!session){authRequired();return;}
      await loadContext();renderAdminScopeSwitcher();await loadCompanies();if(section==='access')await loadAdmins();
      if(section==='companies')renderCompanies();else if(section==='access')renderAccess();else renderOverview();
    }catch(error){
      console.error('trade admin bootstrap',error);if(error.status===401||error.message==='login_required'){authRequired();return;}
      sectionTitle('무역거래 관리자','현재 계정의 에코디비즈 무역 권한을 확인합니다.');$('summaryCards').innerHTML=card('접근','제한됨','권한 확인');
      $('mainPanel').innerHTML=`<h2>접근할 수 없습니다.</h2><p class="empty">에코디비즈 전체관리자이거나 하나 이상의 거래회사에 위임된 관리자만 사용할 수 있습니다.</p><p class="trade-flash">${esc(error.message)}</p>`;state('권한 없음');
    }
  }
  boot();
}

export function workspaceTradeAdminScript(){return new Response(`(${tradeAdminClient.toString()})(${JSON.stringify(ekodiBizAdminScopeSnapshot())});`,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}