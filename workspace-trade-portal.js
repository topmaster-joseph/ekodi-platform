const CSS=`:root{font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif;color:#17251f;background:#f6f8f5;--ink:#17251f;--muted:#6b7b72;--line:#dce5df;--green:#173f2b;--paper:#fff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 86% 0,#e7f3e8 0,transparent 32rem),#f6f8f5;color:var(--ink)}a{color:inherit}button,input,select,textarea{font:inherit}.top{height:64px;display:flex;align-items:center;gap:14px;padding:0 max(18px,calc((100vw - 1120px)/2));border-bottom:1px solid var(--line);background:rgba(255,255,255,.92);position:sticky;top:0;z-index:20;backdrop-filter:blur(12px)}.brand{font-weight:900;text-decoration:none}.context{font-size:12px;color:var(--muted)}.account{margin-left:auto;display:flex;gap:8px;align-items:center;font-size:12px}.quiet,.button{border:1px solid #cfdad3;background:#fff;color:#31463a;border-radius:9px;padding:8px 11px;text-decoration:none;cursor:pointer}.button.primary{background:var(--green);border-color:var(--green);color:#fff}.shell{width:min(1120px,calc(100% - 32px));margin:34px auto 80px}.hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:18px}.eyebrow{font-size:10px;letter-spacing:.18em;color:#587063;font-weight:800}.hero h1{font-size:clamp(30px,5vw,48px);letter-spacing:-.055em;line-height:1.05;margin:6px 0}.hero p{margin:0;color:var(--muted);font-size:14px}.state{font-size:11px;padding:7px 10px;border-radius:999px;border:1px solid #d2ded6;background:#fff;color:#5e7066;white-space:nowrap}.panel{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:18px;margin-top:12px}.panel h2{font-size:16px;margin:0 0 12px}.hidden{display:none!important}.company-tabs{display:flex;gap:8px;overflow:auto;padding-bottom:4px}.company-tab{border:1px solid var(--line);background:#fff;border-radius:10px;padding:10px 12px;min-width:160px;text-align:left;cursor:pointer}.company-tab.active{border-color:#688f75;background:#eef5ef}.company-tab strong{display:block;font-size:13px}.company-tab small,.empty{color:var(--muted);font-size:11px}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.metric{border:1px solid #e4ebe6;border-radius:12px;padding:12px}.metric span{display:block;color:var(--muted);font-size:10px}.metric strong{display:block;margin-top:4px;font-size:16px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.list,.timeline{display:grid;gap:8px}.row{border:1px solid #e4ebe6;border-radius:11px;padding:12px;cursor:pointer}.row.active{border-color:#71957c;background:#f1f6f2}.row-head{display:flex;justify-content:space-between;gap:12px}.row h3,.record h3{font-size:13px;margin:0}.row p,.record p{font-size:12px;color:var(--muted);margin:5px 0}.tag{font-size:9px;padding:3px 7px;border-radius:999px;background:#eef2ef;color:#5f7167}.tag.official{background:#fff3d8;color:#845b12}.record{border-left:3px solid #a8bcae;padding:10px 12px;background:#fafcf9;border-radius:0 10px 10px 0}.record.confirmed{border-left-color:#477457}.record p{white-space:pre-wrap}.record small{color:#839088;font-size:10px}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.form{margin-top:14px;padding-top:14px;border-top:1px solid #edf1ee}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.fields label{display:grid;gap:5px;font-size:11px;color:#687970}.fields .wide{grid-column:1/-1}.fields input,.fields select,.fields textarea{width:100%;border:1px solid #d7e1da;border-radius:9px;padding:9px;background:#fff;color:#17251f}.flash{min-height:18px;font-size:11px;color:#9b5c13;margin-top:8px}@media(max-width:760px){.summary{grid-template-columns:1fr 1fr}.grid,.fields{grid-template-columns:1fr}.fields .wide{grid-column:auto}.hero{align-items:flex-start;flex-direction:column}.shell{width:min(100% - 20px,1120px);margin-top:22px}.top{padding:0 12px}.context{display:none}}`;

function client(){
  const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
  const KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const API=`${SUPABASE_URL}/functions/v1/workspace-api`;
  const WORKSPACE='ekodi-biz';
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const roleLabel=r=>({workspace_admin:'에코디비즈 전체관리자',trade_admin:'무역 전체관리자',trade_manager:'거래 운영관리자',trade_viewer:'조회 관리자',counterparty_admin:'상대회사 관리자',counterparty_member:'상대회사 관계자'}[r]||r||'-');
  let sb=null,companies=[],company=null,access=null,engagements=[],engagement=null,records=[];
  const state=text=>{$('pageState').textContent=text;};
  async function session(){const {data,error}=await sb.auth.getSession();if(error)throw error;return data.session;}
  async function api(path,options={}){const s=await session();if(!s?.access_token)throw Object.assign(new Error('login_required'),{status:401});const headers={apikey:KEY,Authorization:`Bearer ${s.access_token}`,...(options.body?{'content-type':'application/json'}:{})};const response=await fetch(`${API}${path}`,{method:options.method||'GET',headers,body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||`api_${response.status}`),{status:response.status});return data;}
  async function consume(){
    const params=new URLSearchParams(location.hash.slice(1));const token=params.get('ekodi_token');if(!token)return;
    const {error}=await sb.auth.verifyOtp({token_hash:token,type:params.get('ekodi_type')||'email'});if(error)throw error;
    history.replaceState({},document.title,location.pathname+location.search);
  }
  function login(){const url=new URL('https://auth.ekodi.kr/');url.searchParams.set('site','trade');url.searchParams.set('return_to',location.origin+location.pathname);location.assign(url.href);}
  function signedOut(){
    $('accountEmail').textContent='관계자 전용';$('logout').classList.add('hidden');$('companyPanel').classList.add('hidden');$('workPanel').classList.add('hidden');$('introPanel').classList.remove('hidden');
    $('introPanel').innerHTML='<h2>거래 관계자 로그인</h2><p class="empty">에코디비즈 관계자와 사전에 등록된 상대회사 관계자만 이용할 수 있습니다. 처음에는 Google 로그인으로 EKODI ID를 연결합니다.</p><div class="actions"><button class="button primary" id="loginButton" type="button">Google로 로그인</button></div>';
    $('loginButton').onclick=login;state('로그인 필요');
  }
  function renderCompanies(){
    $('introPanel').classList.add('hidden');$('companyPanel').classList.remove('hidden');
    if(!companies.length){$('companyTabs').innerHTML='<p class="empty">현재 계정에 연결된 거래회사가 없습니다. 에코디비즈 담당자가 회사를 등록하고 관계자를 승인하면 이곳에 표시됩니다.</p>';$('workPanel').classList.add('hidden');state('회사 연결 대기');return;}
    $('companyTabs').innerHTML=companies.map(c=>`<button type="button" class="company-tab ${company?.id===c.id?'active':''}" data-company="${escape(c.id)}"><strong>${escape(c.display_name)}</strong><small>${escape(c.country_code||c.slug)} · ${escape(roleLabel(c.access_role))}</small></button>`).join('');
    document.querySelectorAll('[data-company]').forEach(button=>button.onclick=()=>selectCompany(button.dataset.company));
  }
  function renderSummary(){
    $('companyTitle').textContent=company?.display_name||'거래회사';$('companyMeta').textContent=`${company?.legal_name||company?.slug||''}${company?.country_code?` · ${company.country_code}`:''}`;
    const side=access?.side==='ekodibiz'?'에코디비즈':'상대회사';
    $('summary').innerHTML=[['관계',side],['권한',roleLabel(access?.role)],['거래건',engagements.length],['현재기록',records.length]].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${escape(value)}</strong></div>`).join('');
  }
  function engagementRows(){
    if(!engagements.length)return '<p class="empty">등록된 거래가 없습니다.</p>';
    return `<div class="list">${engagements.map(item=>`<div class="row ${engagement?.id===item.id?'active':''}" data-engagement="${escape(item.id)}"><div class="row-head"><h3>${escape(item.title)}</h3><span class="tag">${escape(item.status)}</span></div><p>${escape(item.code||'')} · ${escape(item.phase||'진행단계 미지정')}</p></div>`).join('')}</div>`;
  }
  function engagementForm(){
    if(!access?.can_write)return '';const item=engagement||{};
    const statuses=['prospecting','negotiating','contracted','in_progress','on_hold','completed','cancelled'];
    return `<form id="engagementForm" class="form"><div class="fields"><label>거래코드<input name="code" required maxlength="80" value="${escape(item.code||'')}"></label><label>상태<select name="status">${statuses.map(value=>`<option value="${value}" ${item.status===value?'selected':''}>${value}</option>`).join('')}</select></label><label class="wide">거래명<input name="title" required maxlength="240" value="${escape(item.title||'')}"></label><label>현재 단계<input name="phase" maxlength="120" value="${escape(item.phase||'')}"></label><label>목표일<input name="targetAt" type="date" value="${escape((item.target_at||'').slice(0,10))}"></label><label class="wide">요약<textarea name="summary" rows="3" maxlength="6000">${escape(item.summary||'')}</textarea></label></div><div class="actions"><button class="button primary" type="submit">${item.id?'거래정보 저장':'새 거래 등록'}</button></div><p class="flash" id="engagementFlash"></p></form>`;
  }
  function recordRows(){
    if(!engagement)return '<p class="empty">왼쪽에서 거래를 선택하면 진행기록을 볼 수 있습니다.</p>';
    if(!records.length)return '<p class="empty">아직 공유된 진행기록이 없습니다.</p>';
    return `<div class="timeline">${records.map(item=>`<article class="record ${item.status==='confirmed'?'confirmed':''}"><div class="row-head"><h3>${escape(item.title)}</h3><span class="tag ${['official','decision'].includes(item.record_type)?'official':''}">${escape(item.record_type)} · ${escape(item.status)}</span></div><p>${escape(item.body||'')}</p><small>${escape(new Date(item.event_at).toLocaleString('ko-KR'))} · ${escape(item.visibility)}</small><div class="actions">${item.visibility==='shared'?`<button class="button" type="button" data-ack="${escape(item.id)}">확인 기록</button>`:''}${access?.can_create_official&&item.status==='draft'?`<button class="button primary" type="button" data-confirm="${escape(item.id)}">공식 확정</button>`:''}</div></article>`).join('')}</div>`;
  }
  function recordForm(){
    if(!engagement||!access?.can_write)return '';
    const types=access?.can_create_official?['progress','milestone','official','decision','document','note']:['progress','milestone','document','note'];
    const visibility=access?.side==='ekodibiz'?'<option value="shared">양사 공유</option><option value="internal">에코디비즈 내부</option>':'<option value="shared">양사 공유</option>';
    return `<form id="recordForm" class="form"><div class="fields"><label>기록유형<select name="recordType">${types.map(value=>`<option value="${value}">${value}</option>`).join('')}</select></label><label>공개범위<select name="visibility">${visibility}</select></label><label class="wide">제목<input name="title" maxlength="240" required></label><label class="wide">내용<textarea name="body" rows="5" maxlength="12000"></textarea></label></div><div class="actions"><button class="button primary" type="submit">진행기록 추가</button></div><p class="flash" id="recordFlash"></p></form>`;
  }
  async function loadMembers(){if(!access?.can_manage_members)return null;try{return await api(`/trade/partner/companies/${company.id}/members`);}catch{return null;}}
  function memberPanel(data){
    if(!access?.can_manage_members){$('memberPanel').classList.add('hidden');return;}
    const members=Array.isArray(data?.members)?data.members:[];$('memberPanel').classList.remove('hidden');
    $('memberPanel').innerHTML=`<h2>회사 관계자</h2>${members.length?`<div class="list">${members.map(member=>`<div class="row"><div class="row-head"><h3>${escape(member.email)}</h3><span class="tag">${escape(roleLabel(member.role))}</span></div><p>${escape(member.status)}</p></div>`).join('')}</div>`:'<p class="empty">등록된 회사 관계자가 없습니다.</p>'}<form id="memberForm" class="form"><div class="fields"><label>이메일<input type="email" name="email" required maxlength="254"></label><label>권한<select name="role"><option value="counterparty_member">회사 관계자</option><option value="counterparty_admin">회사 관리자</option></select></label><label>상태<select name="status"><option value="pre_registered">사전등록</option><option value="active">활성</option><option value="disabled">중지</option></select></label></div><div class="actions"><button class="button primary" type="submit">관계자 저장</button></div><p class="flash" id="memberFlash"></p></form>`;
    $('memberForm').onsubmit=async event=>{event.preventDefault();const fd=new FormData(event.currentTarget);try{await api(`/trade/partner/companies/${company.id}/members`,{method:'POST',body:{email:fd.get('email'),role:fd.get('role'),status:fd.get('status')}});memberPanel(await loadMembers());state('관계자 저장 완료');}catch(error){$('memberFlash').textContent=error.message;}};
  }
  async function renderWork(){
    $('workPanel').classList.remove('hidden');renderSummary();$('engagementList').innerHTML=engagementRows();$('engagementEditor').innerHTML=engagementForm();$('recordList').innerHTML=recordRows();$('recordEditor').innerHTML=recordForm();
    document.querySelectorAll('[data-engagement]').forEach(element=>element.onclick=()=>selectEngagement(element.dataset.engagement));
    const engagementEditor=$('engagementForm');if(engagementEditor)engagementEditor.onsubmit=saveEngagement;
    const recordEditor=$('recordForm');if(recordEditor)recordEditor.onsubmit=saveRecord;
    document.querySelectorAll('[data-ack]').forEach(button=>button.onclick=()=>ackRecord(button.dataset.ack));
    document.querySelectorAll('[data-confirm]').forEach(button=>button.onclick=()=>confirmRecord(button.dataset.confirm));
    memberPanel(await loadMembers());
  }
  async function selectCompany(id){
    company=companies.find(item=>item.id===id)||companies[0];engagement=null;records=[];renderCompanies();state('거래 불러오는 중');
    const data=await api(`/trade/partner/companies/${company.id}/engagements`);access=data.access;engagements=Array.isArray(data.engagements)?data.engagements:[];engagement=engagements[0]||null;
    if(engagement){const recordData=await api(`/trade/partner/engagements/${engagement.id}/records`);records=Array.isArray(recordData.records)?recordData.records:[];}
    await renderWork();state(access?.side==='ekodibiz'?'에코디비즈 관계자':'상대회사 관계자');
  }
  async function selectEngagement(id){
    engagement=engagements.find(item=>item.id===id)||null;records=[];
    if(engagement){const data=await api(`/trade/partner/engagements/${engagement.id}/records`);records=Array.isArray(data.records)?data.records:[];}
    await renderWork();state('거래 선택됨');
  }
  async function saveEngagement(event){
    event.preventDefault();const fd=new FormData(event.currentTarget);const target=fd.get('targetAt');
    try{await api(`/trade/partner/companies/${company.id}/engagements`,{method:'POST',body:{id:engagement?.id||null,code:fd.get('code'),title:fd.get('title'),summary:fd.get('summary'),status:fd.get('status'),phase:fd.get('phase'),targetAt:target?new Date(`${target}T12:00:00+09:00`).toISOString():null}});await selectCompany(company.id);state('거래 저장 완료');}catch(error){$('engagementFlash').textContent=error.message;state('확인 필요');}
  }
  async function saveRecord(event){
    event.preventDefault();const fd=new FormData(event.currentTarget);
    try{await api(`/trade/partner/engagements/${engagement.id}/records`,{method:'POST',body:{recordType:fd.get('recordType'),visibility:fd.get('visibility'),title:fd.get('title'),body:fd.get('body')}});await selectEngagement(engagement.id);state('기록 추가 완료');}catch(error){$('recordFlash').textContent=error.message;state('확인 필요');}
  }
  async function ackRecord(id){try{await api(`/trade/partner/records/${id}/ack`,{method:'POST',body:{acknowledgement:'acknowledged'}});await selectEngagement(engagement.id);state('확인 기록됨');}catch(error){state(`확인 실패 · ${error.message}`);}}
  async function confirmRecord(id){try{await api(`/trade/partner/records/${id}/confirm`,{method:'POST',body:{}});await selectEngagement(engagement.id);state('공식 기록 확정');}catch(error){state(`확정 실패 · ${error.message}`);}}
  async function boot(){
    const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');sb=mod.createClient(SUPABASE_URL,KEY,{auth:{detectSessionInUrl:false,persistSession:true}});await consume();const current=await session();
    if(!current){signedOut();return;}$('accountEmail').textContent=current.user?.email||'EKODI';$('logout').classList.remove('hidden');$('logout').onclick=async()=>{await sb.auth.signOut();signedOut();};
    try{
      await api('/trade/partner/claim',{method:'POST',body:{workspace:WORKSPACE}}).catch(()=>null);
      const data=await api(`/trade/partner/companies?workspace=${encodeURIComponent(WORKSPACE)}`);companies=Array.isArray(data.companies)?data.companies:[];renderCompanies();
      if(companies.length)await selectCompany(companies[0].id);else state('회사 연결 대기');
    }catch(error){$('introPanel').classList.remove('hidden');$('introPanel').innerHTML=`<h2>접근할 수 없습니다.</h2><p class="empty">에코디비즈 관계자 또는 승인된 무역 상대회사 관계자 계정이 필요합니다.</p><p class="flash">${escape(error.message)}</p>`;state('권한 없음');}
  }
  boot().catch(error=>{console.error('trade partner portal',error);signedOut();});
}

export function tradePartnerPage(){return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><title>거래업무 · 에코디비즈</title><link rel="stylesheet" href="/workspace-trade-portal.css"></head><body><header class="top"><a class="brand" href="https://ekodi.kr/ekodibiz">EKODIBIZ</a><span class="context">TRADE PARTNER WORKSPACE</span><div class="account"><span id="accountEmail">확인 중</span><button id="logout" class="quiet hidden" type="button">로그아웃</button></div></header><main class="shell"><section class="hero"><div><span class="eyebrow">PRIVATE TRADE WORKSPACE</span><h1>함께 진행하고,<br>거래의 역사를 남깁니다.</h1><p>에코디비즈와 거래 상대회사가 진행상황·결정·공식기록을 회사별 권한 안에서 안전하게 공유합니다.</p></div><span class="state" id="pageState">확인 중</span></section><section id="introPanel" class="panel"><p class="empty">계정과 회사 연결을 확인하고 있습니다.</p></section><section id="companyPanel" class="panel hidden"><h2>내 거래회사</h2><div id="companyTabs" class="company-tabs"></div></section><section id="workPanel" class="hidden"><section class="panel"><div class="row-head"><div><h2 id="companyTitle">거래회사</h2><p id="companyMeta" class="empty"></p></div></div><div class="summary" id="summary"></div></section><section class="grid"><section class="panel"><h2>거래 진행</h2><div id="engagementList"></div><div id="engagementEditor"></div></section><section class="panel"><h2>공유 · 공식 기록</h2><div id="recordList"></div><div id="recordEditor"></div></section></section><section id="memberPanel" class="panel hidden"></section></section></main><script src="/workspace-trade-portal.js" defer></script></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co https://cdn.jsdelivr.net; img-src 'self' data: https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'x-ekodi-route':'trade-partner-workspace'}})}
export function tradePartnerCss(){return new Response(CSS,{headers:{'content-type':'text/css; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}})}
export function tradePartnerScript(){return new Response(`(${client.toString()})();`,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'public, max-age=300','x-content-type-options':'nosniff'}})}
export function isTradePartnerPath(pathname){return /^\/ekodibiz\/trade\/?$/i.test(pathname)}
