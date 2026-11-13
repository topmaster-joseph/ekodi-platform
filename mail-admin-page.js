const SUPABASE_URL='https://renzehysxirjilvdxacv.supabase.co';
const DEFAULT_KEY='sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
function baseHeaders(){return{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer'}}
export function mailAdminPage(){
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>EKODI Mail Admin</title><style>
  :root{color-scheme:light;font-family:Inter,Pretendard,"Noto Sans KR",system-ui,sans-serif}*{box-sizing:border-box}
  body{margin:0;background:#f3f6fb!important;color:#172033!important}
  .ma,.ma *{color:inherit}.ma{color:#172033;background:#f3f6fb;min-height:100vh;font-size:15px;line-height:1.5}
  .ma .top{height:58px;display:flex;align-items:center;gap:10px;padding:0 18px;background:#fff;border-bottom:1px solid #e3e8f0}
  .ma .top strong{font-size:16px;color:#14306e}.ma .top span{font-size:13px;color:#5b6577}
  .ma .top a{margin-left:auto;color:#14306e;text-decoration:none;border:1px solid #c9d3e3;border-radius:10px;padding:8px 12px;font-size:14px;font-weight:600;background:#fff}
  .ma .top .switch{border:1px solid #1f3c88;background:#1f3c88;color:#fff!important;border-radius:10px;padding:8px 12px;font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  .ma .wrap{max-width:880px;margin:0 auto;padding:18px}
  .ma .intro{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
  .ma .intro h1{font-size:24px;margin:0;color:#0f1b33!important}.ma .intro p{margin:4px 0 0;color:#4b5565!important;font-size:14px}
  .ma .badge{flex:none;font-size:13px;font-weight:600;border:1px solid #c9d3e3;background:#fff;color:#14306e!important;border-radius:999px;padding:6px 12px}
  .ma .scopebar{background:#fff;border:1px solid #e3e8f0;border-radius:14px;padding:12px 14px;margin-bottom:12px}
  .ma .scopebar label{display:block;font-size:13px;font-weight:700;color:#4b5565!important;margin-bottom:6px}
  .ma select,.ma input[type=text],.ma input[type=email],.ma input[type=password]{width:100%;border:1px solid #c9d3e3;border-radius:10px;padding:12px;font:inherit;font-size:16px;color:#0f1b33!important;background:#fff!important}
  .ma .scopehint{margin:6px 0 0;font-size:13px;color:#5b6577!important}
  .ma .tabs{display:flex;gap:6px;background:#e7ecf5;border-radius:12px;padding:4px;margin-bottom:12px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin;scroll-padding-inline:4px}
  .ma .tabs button{flex:1 1 0;min-width:0;border:0;background:transparent;color:#36425a!important;font:inherit;font-size:15px;font-weight:700;padding:11px 8px;border-radius:9px;cursor:pointer;white-space:nowrap;min-height:44px}
  .ma .tabs button[aria-selected=true]{background:#fff;color:#14306e!important;box-shadow:0 1px 3px rgba(15,27,51,.12)}
  .ma .tabs .count{display:inline-block;min-width:20px;margin-left:4px;padding:0 6px;border-radius:999px;background:#14306e;color:#fff!important;font-size:12px;line-height:20px}
  .ma .tabs button:focus-visible,.ma .btn:focus-visible{outline:3px solid #6386d9;outline-offset:2px}
  .ma .tabpanel{background:#fff;border:1px solid #e3e8f0;border-radius:14px;padding:14px}.ma .tabpanel[hidden]{display:none}
  .ma .panel-title{font-size:17px;font-weight:800;margin:0 0 12px;color:#0f1b33!important}
  .ma .panel-head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px}.ma .panel-head .panel-title{margin:0}.ma .panel-head .btn{padding:8px 12px;font-size:14px}
  .ma .accounts{display:grid;gap:10px}
  .ma .account{border:1px solid #dfe5ee;border-radius:12px;padding:14px;background:#fbfcfe}
  .ma .account-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
  .ma .account-name{font-size:17px;font-weight:800;color:#0f1b33!important;word-break:break-all}
  .ma .account-meta{font-size:14px;color:#4b5565!important;margin-top:2px;word-break:break-all}
  .ma .status{flex:none;font-size:13px;font-weight:700;border-radius:999px;padding:5px 10px;background:#fff1de;color:#8a4b06!important}
  .ma .status.ok{background:#e3f5ea;color:#1d6b3a!important}.ma .status.bad{background:#fde8e8;color:#9b1c1c!important}
  .ma .account-help{margin:10px 0 0;font-size:14px;color:#36425a!important}
  .ma .actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .ma .btn{border:1px solid #c9d3e3;background:#fff;color:#14306e!important;border-radius:10px;padding:11px 14px;font:inherit;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
  .ma .btn.primary{background:#1f3c88;border-color:#1f3c88;color:#fff!important}.ma .btn.danger{color:#9b1c1c!important;border-color:#f0c4c4}
  .ma .perms{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:10px;font-size:15px;color:#172033!important}
  .ma .perms label,.ma .check{display:inline-flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:#172033!important}
  .ma input[type=checkbox]{width:20px;height:20px;accent-color:#1f3c88}
  .ma .form{display:grid;gap:12px}.ma .field label{display:block;font-size:14px;font-weight:700;margin-bottom:5px;color:#36425a!important}
  .ma .checks{display:flex;flex-wrap:wrap;gap:16px}
  .ma .mail-original{margin-top:12px;border-top:1px solid #dfe5ee;padding-top:12px;min-width:0}
  .ma .mail-original h4{margin:0 0 6px;font-size:15px}
  .ma .mail-source-body{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;max-height:340px;overflow:auto;font:13px/1.6 ui-monospace,monospace;background:#f3f6fb;border:1px solid #e2e8f0;border-radius:9px;padding:10px}
  .ma .note{font-size:14px;line-height:1.7;color:#36425a!important;margin:0}.ma .note li{margin-bottom:6px}
  .ma .empty{padding:20px 6px;font-size:15px;color:#4b5565!important}
  .ma .links{margin-top:12px}.ma .links a{font-size:14px;font-weight:700;color:#1f3c88!important}
  .ma .oppush{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;background:#eef4ff;border:1px solid #c9d8f5;border-radius:14px;padding:12px 14px;margin-bottom:12px}.ma .oppush[hidden]{display:none}
  .ma .oppush b{display:block;font-size:16px;color:#0f1b33!important}.ma .oppush span{font-size:14px;color:#36425a!important}
  @media(max-width:780px){.ma .oppush .btn{width:100%}}
  .ma .gsetup{background:#fff;border:1px solid #f0d9a8;border-radius:14px;padding:14px;margin-bottom:12px}.ma .gsetup[hidden]{display:none}
  .ma .gsetup h2{font-size:17px;margin:0 0 4px;color:#0f1b33!important}.ma .gsetup>p{margin:0 0 10px;font-size:14px;color:#36425a!important}
  .ma .gsetup ol{margin:0;padding-left:20px;display:grid;gap:12px}.ma .gsetup li{font-size:15px;color:#172033!important;line-height:1.55}
  .ma .gsetup .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.ma .gsetup code{display:block;word-break:break-all;background:#f3f6fb;border:1px solid #dfe5ee;border-radius:8px;padding:8px;font-size:13px;color:#0f1b33!important;margin-top:6px}
  .ma .gsetup input{width:100%;margin-top:6px}.ma .gsetup .ok{font-weight:700;color:#1d6b3a!important}
  @media(min-width:781px){.ma .form{grid-template-columns:1fr 1fr 180px}.ma .form .checks,.ma .form .submit{grid-column:1/-1}.ma .form .submit{justify-self:start;min-width:200px}}
  @media(max-width:780px){.ma .wrap{padding:12px}.ma .intro{align-items:flex-start}.ma .intro h1{font-size:22px}.ma .actions .btn{flex:1 1 100%}.ma .form .submit{width:100%}.ma .tabs button{flex:0 0 auto;min-width:108px}.ma .tabs{gap:4px}}
  @media(max-width:380px){.ma .intro{flex-wrap:wrap}.ma .panel-head .btn{width:100%}}
  </style></head><body><div class="ma"><header class="top"><strong>EKODI Mail</strong><span>통합 메일 관리</span><a href="/">메일함</a><button type="button" class="switch" id="switchAccount" title="다른 에코디 계정으로 로그인">계정 바꾸기</button></header><main class="wrap">
  <section class="intro"><div><h1>메일 관리</h1><p>기관마다 권한은 그대로 분리해서 관리합니다.</p></div><span class="badge" id="state">인증 확인 중</span></section>
  <section class="scopebar"><label for="scopeSelect">관리 범위</label><select id="scopeSelect" aria-label="관리 범위 선택"></select><p class="scopehint" id="scopeHint"></p></section>
  <nav class="tabs" role="tablist" aria-label="메일 관리 메뉴"><button type="button" role="tab" id="tab-accounts" data-tab="accounts" aria-selected="true" aria-controls="panel-accounts" tabindex="0">메일 계정<span class="count" id="accountCount">0</span></button><button type="button" role="tab" id="tab-add" data-tab="add" aria-selected="false" aria-controls="panel-add" tabindex="-1">계정 추가</button><button type="button" role="tab" id="tab-docs" data-tab="docs" aria-selected="false" aria-controls="panel-docs" tabindex="-1">문서 발행</button><button type="button" role="tab" id="tab-setup" data-tab="setup" aria-selected="false" aria-controls="panel-setup" tabindex="-1">연결·알림</button><button type="button" role="tab" id="tab-help" data-tab="help" aria-selected="false" aria-controls="panel-help" tabindex="-1">도움말</button></nav>
  <section class="tabpanel" role="tabpanel" id="panel-accounts" aria-labelledby="tab-accounts"><div class="panel-head"><h2 class="panel-title" id="scopeTitle">메일 계정</h2><button class="btn" type="button" id="accountQuickAdd">＋ 계정 추가</button></div><div class="accounts" id="accounts"><div class="empty">계정을 불러오는 중입니다.</div></div><div class="links" id="workspaceLinks"></div></section>
  <section class="tabpanel" role="tabpanel" id="panel-add" aria-labelledby="tab-add" hidden><h2 class="panel-title">새 메일 계정 등록</h2><form class="form" id="accountForm"><div class="field"><label for="displayName">표시 이름</label><input id="displayName" type="text" placeholder="예: 에코디비즈"></div><div class="field"><label for="emailAddress">이메일 주소</label><input id="emailAddress" type="email" required placeholder="name@example.com"></div><div class="field"><label for="provider">메일 종류</label><select id="provider"><option value="">자동 감지</option><option value="gmail">Gmail</option><option value="outlook">Outlook / Microsoft</option><option value="naver">Naver</option><option value="daum">Daum</option><option value="kakao">Kakao</option><option value="generic-imap">기타 IMAP</option></select></div><div class="checks"><label class="check grant-option"><input id="grantSelfRead" type="checkbox">내 읽기</label><label class="check grant-option"><input id="grantSelfSend" type="checkbox">내 발송</label></div><button class="btn primary submit" type="submit">계정 등록</button></form><p class="note" style="margin-top:12px">등록한 뒤 「메일 계정」 탭에서 <b>Google 연결</b>을 눌러야 실제로 읽기·발송이 됩니다.</p></section>
  <section class="tabpanel" role="tabpanel" id="panel-docs" aria-labelledby="tab-docs" hidden>
    <h2 class="panel-title">메일 요청 · 세금계산서 · 매출확인서</h2>
    <p class="note">사이트별 메일과 승인권한을 기준으로 운영합니다. 이메일 발견만으로 발행하지 않으며, 매출확인서는 거래증빙과 담당자 승인 후 발행합니다. 전자세금계산서의 법적 발행·국세청 전송은 기존 에코디 Finance 발행 경로를 이용합니다.</p>
    <form id="documentRuleForm" class="form" style="margin-top:14px">
      <div class="field"><label for="docAccount">요청 메일 계정</label><select id="docAccount" required></select></div>
      <div class="field"><label for="docKind">요청 문서 종류</label><select id="docKind"><option value="tax_invoice">전자세금계산서</option><option value="sales_certificate">매출확인서</option></select></div>
      <div class="field"><label for="docQuery">Gmail 검색어</label><input type="text" id="docQuery" required maxlength="180" placeholder="예: 한국전력 세금계산서"></div>
      <div class="field"><label for="docFrom">매월 시작일</label><input id="docFrom" type="number" min="1" max="31" value="20"></div>
      <div class="field"><label for="docTo">매월 종료일</label><input id="docTo" type="number" min="1" max="31" value="25"></div>
      <button class="btn primary submit" type="submit">메일 자동점검 규칙 저장</button>
    </form>
    <div class="actions" style="margin:14px 0"><button id="docManual" class="btn" type="button">＋ 매출확인서 요청 직접 등록</button><button id="docManualTax" class="btn" type="button">＋ 세금계산서 요청 직접 등록</button><button id="docReload" class="btn" type="button">새로고침</button><a class="btn" href="https://ekodi.kr/admin?route=finance">전자세금계산서 발행 관리</a></div>
    <p id="docNotice" class="note" aria-live="polite"></p>
    <h3 class="panel-title">자동점검 규칙</h3><div id="docRules" class="accounts"></div>
    <h3 class="panel-title">발행 요청 및 문서 대장</h3><div id="docCases" class="accounts"></div>
  </section>
  <section class="tabpanel" role="tabpanel" id="panel-setup" aria-labelledby="tab-setup" hidden>
    <h2 class="panel-title">연결·알림 설정</h2>
    <p class="note" id="setupAccess">Gmail 연결용 보안 설정과 휴대폰 운영 알림은 승인된 운영자 계정에서 관리할 수 있습니다.</p>
    <section class="oppush" id="opPush" hidden><div><b>휴대폰 운영 알림</b><span id="opPushState">확인 중</span></div><button class="btn primary" type="button" id="opPushBtn">이 기기에서 알림 받기</button></section>
<section class="gsetup" id="gSetup" hidden><h2>Gmail 연결 설정 (휴대폰으로 가능)</h2><p id="gSetupState">Google 연결용 보안 비밀번호를 한 번만 등록하면 Gmail 연결이 열립니다. 아래 순서대로 누르세요.</p><ol>
<li><b>Gmail API 켜기</b> — 열리는 화면에서 「사용」을 누릅니다.<div class="row"><a class="btn" target="_blank" rel="noopener" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=ekodi-platform">Gmail API 화면 열기</a></div></li>
<li><b>리디렉션 주소 추가</b> — 클라이언트 화면 「승인된 리디렉션 URI」에서 「URI 추가」 → 아래 주소 붙여넣기 → 「저장」.<code id="gRedirect">https://ekodi.kr/api/mail/control/oauth/google/callback</code><div class="row"><button class="btn" type="button" id="gCopyRedirect">주소 복사</button><a class="btn" target="_blank" rel="noopener" id="gClientLink" href="https://console.cloud.google.com/auth/clients?project=ekodi-platform">클라이언트 화면 열기</a></div></li>
<li><b>보안 비밀번호 만들기</b> — 같은 클라이언트 화면에서 「보안 비밀번호 추가」 → 새로 보이는 <b>GOCSPX-</b>로 시작하는 값을 복사합니다. (기존 비밀번호는 지우지 마세요.)</li>
<li><b>여기에 붙여넣고 저장</b><input id="gSecret" type="password" autocomplete="off" placeholder="GOCSPX-로 시작하는 값 붙여넣기"><div class="row"><button class="btn primary" type="button" id="gSave">암호화해서 저장</button></div></li>
<li><b>(앱이 「테스트」 상태일 때만)</b> 테스트 사용자에 연결할 Gmail 주소를 추가합니다.<div class="row"><a class="btn" target="_blank" rel="noopener" href="https://console.cloud.google.com/auth/audience?project=ekodi-platform">테스트 사용자 화면 열기</a></div></li>
</ol></section>
  </section>
  <section class="tabpanel" role="tabpanel" id="panel-help" aria-labelledby="tab-help" hidden><h2 class="panel-title">도움말</h2><ul class="note"><li>Gmail은 Google 공식 연결(OAuth)을 쓰고, 읽기와 발송 동의를 따로 받습니다.</li><li>에코디 운영 알림을 보내려면 ekodibiz@gmail.com을 <b>읽기·발송</b>으로 연결하세요.</li><li>Outlook·Naver·Daum·Kakao·기타 IMAP은 계정 등록만 가능하며, 연결 기능은 준비 중입니다.</li><li>비밀번호·refresh token은 이 화면이나 계정 레지스트리에 평문 저장하지 않습니다.</li></ul></section>
  </main></div><script type="module">
  import{createClient}from'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const SB='${SUPABASE_URL}',KEY='${DEFAULT_KEY}',CONTROL='https://ekodi.kr/api/mail/control',sb=createClient(SB,KEY,{auth:{persistSession:true,detectSessionInUrl:false}}),$=id=>document.getElementById(id);
  let token='',model=null,current=null;
  async function api(path,init={}){const r=await fetch(CONTROL+path,{...init,headers:{authorization:'Bearer '+token,'content-type':'application/json',...(init.headers||{})},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'메일 관리 요청 실패'),{code:d.code||'MAIL_ADMIN_ERROR',status:r.status});return d}
  function rows(){return[{type:'person',key:model.person.id,label:'내 개인 메일',sub:model.person.email,canManage:true},...model.workspaces.map(w=>({type:'workspace',key:w.workspaceId,slug:w.workspaceSlug,label:w.workspaceName,sub:w.activityRoleLabel||w.authorizationRole,canManage:w.canManage}))]}
  const STATUS={connected:['연결됨','ok'],pending_oauth:['Google 연결 대기',''],disconnected:['연결 해제됨','bad'],error:['확인 필요','bad'],reauth_required:['다시 연결 필요','bad']};
  function showTab(name){if(!['accounts','add','docs','setup','help'].includes(name))name='accounts';document.querySelectorAll('[data-tab]').forEach(b=>{const selected=b.dataset.tab===name;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1});['accounts','add','docs','setup','help'].forEach(t=>{$('panel-'+t).hidden=t!==name});if(location.hash!=='#'+name)history.replaceState({},document.title,location.pathname+'#'+name)}
  document.querySelectorAll('[data-tab]').forEach(b=>{b.onclick=()=>showTab(b.dataset.tab);b.onkeydown=e=>{const tabs=[...document.querySelectorAll('[data-tab]')],i=tabs.indexOf(b);let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft')next=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();showTab(tabs[next].dataset.tab);tabs[next].focus()}});
  $('accountQuickAdd').onclick=()=>showTab('add');
  function selectScope(s){current=s;$('scopeSelect').value=s.type+':'+s.key;$('scopeHint').textContent=s.sub+(s.canManage?'':' · 조회 전용');document.querySelectorAll('.grant-option').forEach(x=>x.style.display=s.type==='workspace'?'inline-flex':'none');if(s.type!=='workspace'){$('grantSelfRead').checked=true;$('grantSelfSend').checked=true}else{$('grantSelfRead').checked=false;$('grantSelfSend').checked=false}$('scopeTitle').textContent=s.label+' · 메일 계정';renderAccounts();renderLink();renderDocAccounts();loadDocuments()}
  function renderScopes(){const sel=$('scopeSelect');sel.replaceChildren(...rows().map(s=>{const o=document.createElement('option');o.value=s.type+':'+s.key;o.textContent=s.label+' — '+s.sub;return o}));sel.onchange=()=>{const t=rows().find(s=>s.type+':'+s.key===sel.value);if(t)selectScope(t)};selectScope(rows()[0])}
  function accountButton(label,fn,kind=''){const b=document.createElement('button');b.type='button';b.className='btn'+(kind?' '+kind:'');b.textContent=label;b.onclick=fn;return b}
  async function connectGoogle(a,capability){try{$('state').textContent='Google 연결 준비';const d=await api('/accounts/'+a.id+'/connect/google',{method:'POST',body:JSON.stringify({capability})});location.href=d.authorizeUrl}catch(e){$('state').textContent='연결 확인 필요';alert(e.message)}}
  async function disconnectAccount(a){if(!confirm(a.emailAddress+' 연결을 해제할까요? 메일 원본은 삭제되지 않습니다.'))return;try{await api('/accounts/'+a.id+'/disconnect',{method:'POST',body:'{}'});await refresh({type:current.type,key:current.key})}catch(e){alert(e.message)}}
  async function saveSelfGrant(a,read,send){try{await api('/accounts/'+a.id+'/grants/self',{method:'PUT',body:JSON.stringify({read,send})});await refresh({type:current.type,key:current.key})}catch(e){alert(e.message)}}
  function renderAccounts(){const list=(model.accounts||[]).filter(a=>a.ownerType===current.type&&a.ownerKey===current.key);$('accountCount').textContent=String(list.length);$('accounts').replaceChildren(...(list.length?list.map(a=>{const d=document.createElement('article');d.className='account';const head=document.createElement('div'),left=document.createElement('div'),name=document.createElement('div'),meta=document.createElement('div'),tag=document.createElement('span'),actions=document.createElement('div');head.className='account-head';name.className='account-name';meta.className='account-meta';actions.className='actions';name.textContent=a.displayName||a.emailAddress;meta.textContent=a.emailAddress+' · '+a.providerLabel;const st=STATUS[a.connectionStatus]||[a.connectionStatus,''];tag.className='status'+(st[1]?' '+st[1]:'');tag.textContent=st[0];left.append(name,meta);head.append(left,tag);d.append(head);if(a.provider==='gmail'&&a.connectionStatus!=='connected'){const help=document.createElement('p');help.className='account-help';help.textContent='아래 버튼을 눌러 Google 화면에서 '+a.emailAddress+'(으)로 로그인하고 권한을 허용하세요.';d.append(help)}if(a.ownerType==='workspace'&&a.permissions?.manage){const box=document.createElement('div'),r=document.createElement('label'),rc=document.createElement('input'),sn=document.createElement('label'),sc=document.createElement('input');box.className='perms';rc.type=sc.type='checkbox';rc.checked=Boolean(a.permissions?.read);sc.checked=Boolean(a.permissions?.send);r.append(rc,document.createTextNode('내 읽기'));sn.append(sc,document.createTextNode('내 발송'));box.append(r,sn,accountButton('내 권한 저장',()=>saveSelfGrant(a,rc.checked,sc.checked)));d.append(box)}if(a.provider==='gmail'&&a.permissions?.manage){if(a.connectionStatus!=='connected'){actions.append(accountButton('Gmail 읽기·발송 연결',()=>connectGoogle(a,'read_send'),'primary'),accountButton('Gmail 읽기 연결',()=>connectGoogle(a,'read')))}else{actions.append(accountButton('발송 권한 추가',()=>connectGoogle(a,'send')),accountButton('권한 다시 연결',()=>connectGoogle(a,'read_send')),accountButton('연결 해제',()=>disconnectAccount(a),'danger'))}}else if(a.provider!=='gmail'){const wait=document.createElement('span');wait.className='status';wait.textContent='연결 기능 준비 중';actions.append(wait)}if(a.connectionStatus==='connected'&&a.permissions?.read){const open=document.createElement('a');open.className='btn';open.href='/?account='+encodeURIComponent(a.id);open.textContent='메일 보기';actions.append(open)}if(actions.childNodes.length)d.append(actions);return d}):[Object.assign(document.createElement('div'),{className:'empty',textContent:'등록된 메일 계정이 없습니다. 「계정 추가」 탭에서 등록하세요.'})]))}
  function renderLink(){const box=$('workspaceLinks');box.replaceChildren();if(current?.type==='workspace'&&current.slug){const a=document.createElement('a');a.href='https://ekodi.kr/'+encodeURIComponent(current.slug)+'/admin/mail';a.textContent='기관 메일 도메인·주소 상세설정';box.append(a)}}

  let documentModel={rules:[],cases:[]};
  function docText(tag,value,className=''){const n=document.createElement(tag);n.textContent=String(value??'');if(className)n.className=className;return n}
  function docButton(label,action,kind=''){const b=docText('button',label,'btn '+kind);b.type='button';b.addEventListener('click',action);return b}
  function docNotice(message){$('docNotice').textContent=message}
  function renderDocAccounts(){
    const sel=$('docAccount');if(!sel||!model)return;
    const list=(model.accounts||[]).filter(a=>current?.type==='workspace'&&a.ownerType==='workspace'&&a.ownerKey===current.key&&a.permissions?.manage&&a.permissions?.read&&a.provider==='gmail');
    sel.replaceChildren(...list.map(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=a.emailAddress+(a.connectionStatus==='connected'?' · 연결됨':' · 인증 필요');return o}));
    const solar=list.find(a=>a.emailAddress==='ekodisolar@gmail.com');
    if(solar){sel.value=solar.id;$('docKind').value='tax_invoice';if(!$('docQuery').value)$('docQuery').value='"한국전력" "세금계산서"'}
  }
  async function loadDocuments(){
    if(!current||current.type!=='workspace'){documentModel={rules:[],cases:[]};renderDocModel();docNotice('사이트를 선택하면 해당 사이트의 발행 요청과 문서를 확인할 수 있습니다.');return}
    try{const data=await api('/documents/overview?workspace='+encodeURIComponent(current.slug));documentModel=data;renderDocModel();docNotice('사이트별 승인 대장을 불러왔습니다. 요청 메일의 발신자와 거래증빙은 발행 전에 확인해야 합니다.')}
    catch(e){documentModel={rules:[],cases:[]};renderDocModel();docNotice('문서 대장을 확인할 수 없습니다: '+e.message)}
  }
  function renderDocModel(){
    const ruleBox=$('docRules'),caseBox=$('docCases');ruleBox.replaceChildren();caseBox.replaceChildren();
    for(const r of documentModel.rules||[]){
      const d=document.createElement('article');d.className='account';d.append(docText('strong',r.document_type==='tax_invoice'?'전자세금계산서 요청':'매출확인서 요청'));
      d.append(docText('p',r.search_query+' · 매월 '+r.day_from+'~'+r.day_to+'일 · '+(r.active?'점검 설정':'중단'),'note'));
      d.append(docText('p','마지막 전체 점검 완료: '+(r.last_checked_kst_day||'없음')+' · 최근 페이지 확인: '+(r.last_checked_at||'없음')+(r.last_error?' · 오류: '+r.last_error:''),'note'));
      d.append(docButton('지금 메일 확인',async()=>{try{docNotice('메일 확인 중');const x=await api('/documents/rules/'+r.id+'/sync',{method:'POST',body:JSON.stringify({workspace:current.slug})});await loadDocuments();docNotice('이번 페이지 조회 '+x.scanned+'건 · 신규 요청 '+x.inserted+'건'+(x.hasMore?' · 다음 페이지가 남아 있습니다. 자동 점검 또는 이 버튼으로 계속 진행합니다.':' · 이번 검색 전체 확인 완료'))}catch(e){docNotice(e.code==='MAIL_PAGE_CURSOR_LOOP'?'메일 제공자의 이어받기 위치가 만료되었을 수 있습니다. 「처음부터 다시 점검」을 눌러주세요.':e.message)}},'primary'));
      if(r.active)d.append(docButton('처음부터 다시 점검',async()=>{if(!confirm('현재 점검 위치만 초기화합니다. 접수된 요청과 승인 기록은 보존됩니다. 진행할까요?'))return;try{await api('/documents/rules/'+r.id+'/reset',{method:'POST',body:JSON.stringify({workspace:current.slug})});await loadDocuments();docNotice('검색 위치를 초기화했습니다. 다음 점검에서 첫 페이지부터 중복 없이 확인합니다.')}catch(e){docNotice(e.message)}}));
      if(r.active)d.append(docButton('규칙 중단',async()=>{if(!confirm('이 사이트의 해당 메일 자동점검을 중단할까요? 기존 요청과 발행 기록은 유지됩니다.'))return;try{await api('/documents/rules/'+r.id+'/disable',{method:'POST',body:JSON.stringify({workspace:current.slug})});await loadDocuments()}catch(e){docNotice(e.message)}},'danger'));
      ruleBox.append(d);
    }
    if(!ruleBox.childNodes.length)ruleBox.append(docText('p','등록된 점검 규칙이 없습니다. 사이트 메일 연결 후 위에서 등록하세요.','note'));
    for(const r of documentModel.cases||[]){
      const d=document.createElement('article');d.className='account';
      d.append(docText('strong',(r.document_type==='tax_invoice'?'세금계산서':'매출확인서')+' · '+r.status));
      d.append(docText('p',(r.source_subject||'직접 등록')+' · '+(r.source_from||'관리자 등록'),'note'));
      d.append(docText('p','거래처: '+(r.counterparty||'미확인')+' · 공급가액/매출액 '+Number(r.sale_amount||0).toLocaleString('ko-KR')+'원 · 증빙: '+(r.evidence_reference||'미입력'),'note'));
      if(r.source_type==='mail'&&Number.isSafeInteger(Number(r.account_id))&&Number(r.account_id)>0&&/^[A-Za-z0-9_-]{5,128}$/.test(String(r.source_message_id||'')))d.append(docButton('원본 요청 메일 확인',()=>docShowOriginal(d,r)));
      if(r.status==='REVIEW')d.append(docButton('증빙 검토·승인',()=>docApproveForm(d,r),'primary'));
      if(r.status==='APPROVED'&&r.document_type==='sales_certificate')d.append(docButton('매출확인서 발행',async()=>{if(!confirm('실제 거래와 증빙을 확인했고, 매출확인서를 발행하시겠습니까?'))return;try{await api('/documents/requests/'+r.id+'/issue',{method:'POST',body:JSON.stringify({workspace:current.slug})});await loadDocuments()}catch(e){docNotice(e.message)}},'primary'));
      if(r.status==='APPROVED'&&r.document_type==='tax_invoice')d.append(docButton('세금계산서 발행정보 복사',async()=>{const summary=['문서종류: 전자세금계산서(발행 전)','거래처: '+r.counterparty,'공급자: '+r.issuer_name,'매출기간: '+r.sale_period,'공급가액/매출액: '+r.sale_amount,'세액: '+r.tax_amount,'증빙: '+r.evidence_reference].join('\\n');await navigator.clipboard.writeText(summary);docNotice('발행용 정보가 복사되었습니다. 에코디 Finance에서 별도 승인·최종발행을 진행하세요.')}));
      if(r.status==='ISSUED'&&r.document_type==='sales_certificate')d.append(docButton('매출확인서 보기·인쇄',()=>docPrint(r)));
      caseBox.append(d);
    }
    if(!caseBox.childNodes.length)caseBox.append(docText('p','검토할 요청이 없습니다. 메일 확인 또는 직접 등록으로 시작할 수 있습니다.','note'));
  }
  async function docShowOriginal(box,record){
    // Reuse the mail account's authoritative read permission checks.
    // Source bodies and attachment metadata are displayed only on demand
    // and are never copied into the site document ledger.
    const existing=box.querySelector('[data-original-mail-view]');
    if(existing){existing.hidden=!existing.hidden;return}
    const view=document.createElement('section');view.className='mail-original';view.dataset.originalMailView='true';
    view.append(docText('p','원본 Gmail 메일을 권한 확인 후 불러오는 중입니다.','note'));box.append(view);
    try{
      const response=await api('/accounts/'+Number(record.account_id)+'/messages/'+encodeURIComponent(record.source_message_id));
      const mail=response.message||{};
      const metadata=docText('p','보낸 사람: '+String(mail.from||'확인 필요')+' · 날짜: '+String(mail.date||'확인 필요')+' · 제목: '+String(mail.subject||'제목 없음'),'note');
      const body=document.createElement('pre');body.className='mail-source-body';
      // Never use innerHTML: message bodies are untrusted third-party input.
      body.textContent=String(mail.body||mail.snippet||'(본문 없음)').slice(0,20000);
      const parts=Array.isArray(mail.attachments)?mail.attachments:[];
      const attachmentText=parts.length?parts.map(p=>String(p.filename||'첨부파일').slice(0,180)).join(', '):'목록 없음';
      view.replaceChildren(docText('h4','원본 메일 · 읽기 전용'),metadata,body,docText('p','첨부파일: '+attachmentText,'note'),docText('p','발행 전에 실제 공급자·금액·거래기간과 첨부 증빙을 따로 확인하세요. 이 화면은 세금계산서를 발행하지 않습니다.','note'));
    }catch(error){view.replaceChildren(docText('p','원본 메일을 불러올 수 없습니다: '+error.message,'note'))}
  }
  function docApproveForm(box,record){
    if(box.querySelector('form'))return;
    const f=document.createElement('form');f.className='form';f.style.marginTop='12px';
    const fields=[['counterparty','거래처 / 공급받는 자'],['issuerName','발행 사업자명'],['salePeriod','매출 기간(예: 2026-10)'],['saleAmount','매출액 또는 공급가액(원)'],['taxAmount','부가세액(원)'],['evidenceReference','원본 증빙 번호·거래 명세']];
    const controls={};
    for(const [key,label] of fields){const wrap=document.createElement('label');wrap.className='field';wrap.append(docText('span',label));const el=document.createElement('input');el.required=true;el.type=['saleAmount','taxAmount'].includes(key)?'number':'text';if(el.type==='number'){el.min='0';el.step='1';el.value='0'}else{el.maxLength=key==='evidenceReference'?500:120}wrap.append(el);f.append(wrap);controls[key]=el}
    f.append(docText('p','승인하기 전에 메일 발신자·공급자·거래증빙과 금액을 확인하세요. 이메일만으로 매출이 입증되지는 않습니다.','note'));
    const b=docButton('검토 완료 · 승인',()=>{} ,'primary');b.type='submit';b.onclick=null;f.append(b);
    f.onsubmit=async e=>{e.preventDefault();const data={workspace:current.slug};for(const [key]of fields)data[key]=controls[key].value;try{await api('/documents/requests/'+record.id+'/approve',{method:'POST',body:JSON.stringify(data)});await loadDocuments()}catch(err){docNotice(err.message)}};
    box.append(f);
  }
  async function docPrint(record){
    const win=window.open('about:blank','_blank');if(!win){docNotice('인쇄 창이 차단되었습니다. 팝업을 허용하세요.');return}
    try{const url=CONTROL+'/documents/requests/'+record.id+'/print?workspace='+encodeURIComponent(current.slug);const res=await fetch(url,{headers:{authorization:'Bearer '+token},cache:'no-store'});if(!res.ok)throw Error('발행 문서를 불러오지 못했습니다.');const html=await res.text();win.document.open();win.document.write(html);win.document.close()}
    catch(e){win.close();docNotice(e.message)}
  }
  $('documentRuleForm').onsubmit=async e=>{e.preventDefault();if(current?.type!=='workspace'){docNotice('사이트를 선택하세요.');return}try{await api('/documents/rules',{method:'POST',body:JSON.stringify({workspace:current.slug,accountId:Number($('docAccount').value),documentType:$('docKind').value,searchQuery:$('docQuery').value,dayFrom:Number($('docFrom').value),dayTo:Number($('docTo').value)})});await loadDocuments()}catch(e){docNotice(e.message)}};
  async function createDocumentRequest(kind){if(current?.type!=='workspace')return;try{await api('/documents/requests',{method:'POST',body:JSON.stringify({workspace:current.slug,documentType:kind})});await loadDocuments()}catch(e){docNotice(e.message)}};
  $('docManual').onclick=()=>createDocumentRequest('sales_certificate');
  $('docManualTax').onclick=()=>createDocumentRequest('tax_invoice');
  $('docReload').onclick=()=>loadDocuments();

  function keyBytes(b){const p='='.repeat((4-b.length%4)%4),r=atob((b+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(r,c=>c.charCodeAt(0))}
  async function loadGSetup(){try{const d=await api('/google-oauth-setup');$('gSetup').hidden=false;if(d.clientId)$('gClientLink').href='https://console.cloud.google.com/auth/clients/'+encodeURIComponent(d.clientId)+'?project=ekodi-platform';if(d.redirectUri)$('gRedirect').textContent=d.redirectUri;if(d.configured){$('gSetupState').innerHTML='<span class="ok">✓ 설정 완료</span> — 이제 메일 계정 카드에서 「Gmail 읽기·발송 연결」을 누르면 됩니다.'+(d.source==='stored'?' (저장: '+(d.updatedAt||'').slice(0,10)+')':'');$('gSetup').querySelector('ol').hidden=true}else if(!d.credentialKeyReady){$('gSetupState').textContent='메일 암호화 키가 아직 준비되지 않았습니다. 잠시 후 다시 확인해 주세요.'}}catch{}}
  $('gCopyRedirect').onclick=async()=>{try{await navigator.clipboard.writeText($('gRedirect').textContent);alert('주소를 복사했습니다.')}catch{alert('길게 눌러 직접 복사해 주세요.')}};
  $('gSave').onclick=async()=>{const v=$('gSecret').value.trim();if(!/^GOCSPX-[A-Za-z0-9_-]{20,64}$/.test(v)){alert('GOCSPX-로 시작하는 보안 비밀번호를 그대로 붙여넣어 주세요.');return}$('gSave').disabled=true;try{await api('/google-oauth-setup',{method:'POST',body:JSON.stringify({secret:v})});$('gSecret').value='';await loadGSetup();alert('저장했습니다. 이제 Gmail 연결을 진행할 수 있습니다.')}catch(e){alert(e.message)}finally{$('gSave').disabled=false}};
  async function loadOpPush(){try{const d=await api('/operator-push');if(!d.isOperator)return;$('setupAccess').hidden=true;loadGSetup();$('opPush').hidden=false;$('opPushState').textContent=!d.available?'알림 암호키 준비 중입니다(배포 후 자동 준비).':d.devices?('켜짐 · 등록된 기기 '+d.devices+'대 — 새 주문·발주 필요 알림이 옵니다.'):'꺼짐 — 아래 버튼을 눌러 이 휴대폰을 등록하세요.';$('opPushBtn').disabled=!d.available;$('opPushBtn').textContent=d.devices?'이 기기 다시 등록':'이 기기에서 알림 받기';$('opPushBtn').onclick=()=>enableOpPush(d.publicKey)}catch{}}
  function swActive(reg){if(reg.active)return Promise.resolve(reg);const w=reg.installing||reg.waiting;if(!w)return Promise.reject(new Error('알림 기능을 시작하지 못했습니다. 잠시 후 다시 눌러 주세요.'));return new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('알림 기능 준비가 늦어지고 있습니다. 잠시 후 다시 눌러 주세요.')),15000);w.addEventListener('statechange',()=>{if(w.state==='activated'){clearTimeout(t);res(reg)}else if(w.state==='redundant'){clearTimeout(t);rej(new Error('알림 기능 설치에 실패했습니다.'))}})})}
  async function enableOpPush(publicKey){try{if(!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('이 브라우저는 알림을 지원하지 않습니다. 휴대폰 Chrome에서 열어 주세요.');const perm=await Notification.requestPermission();if(perm!=='granted')throw new Error('알림이 허용되지 않았습니다. 브라우저 설정에서 ekodi.kr 알림을 허용해 주세요.');$('opPushBtn').disabled=true;$('opPushBtn').textContent='등록 중…';const reg=await navigator.serviceWorker.register('/notifications/sw.js',{scope:'/notifications/'});await swActive(reg);const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});await api('/operator-push',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})});await loadOpPush();alert('등록했습니다. 이제 새 주문·발주 필요 알림이 이 기기로 옵니다.')}catch(e){alert(e.message);loadOpPush()}}
  async function refresh(preferred=null){$('state').textContent='불러오는 중';model=await api('/contexts');renderScopes();if(preferred){const target=rows().find(s=>s.type===preferred.type&&s.key===preferred.key);if(target)selectScope(target)}$('state').textContent='권한 분리 정상'}
  $('switchAccount').onclick=async()=>{if(!confirm('지금 계정에서 로그아웃하고 다른 에코디 계정으로 로그인할까요?'))return;try{await sb.auth.signOut()}catch{}location.replace('https://ekodi.kr/auth/?site=mail&return_to='+encodeURIComponent(location.origin+location.pathname))};
  async function boot(){const h=new URLSearchParams(location.hash.slice(1)),handoff=h.get('ekodi_token');if(handoff){try{await sb.auth.verifyOtp({token_hash:handoff,type:h.get('ekodi_type')||'email'})}catch{}history.replaceState({},document.title,location.pathname)}const {data}=await sb.auth.getSession();if(!data.session){location.replace('https://ekodi.kr/auth/?site=mail&return_to='+encodeURIComponent(location.href));return}token=data.session.access_token;loadOpPush();try{await refresh()}catch(e){$('state').textContent='확인 필요';$('accounts').replaceChildren(Object.assign(document.createElement('div'),{className:'empty',textContent:e.message}))}}
  $('accountForm').onsubmit=async e=>{e.preventDefault();if(!current?.canManage){alert('이 범위의 메일 계정을 변경할 권한이 없습니다.');return}const keep={type:current.type,key:current.key};try{$('state').textContent='저장 중';await api('/accounts',{method:'POST',body:JSON.stringify({scope:current.type==='workspace'?'workspace':'person',workspace:current.slug||'',emailAddress:$('emailAddress').value.trim(),displayName:$('displayName').value.trim(),provider:$('provider').value,grantSelfRead:current.type==='person'?true:$('grantSelfRead').checked,grantSelfSend:current.type==='person'?true:$('grantSelfSend').checked})});$('emailAddress').value='';$('displayName').value='';$('grantSelfRead').checked=false;$('grantSelfSend').checked=false;await refresh(keep);showTab('accounts')}catch(err){$('state').textContent='저장 실패';alert(err.message)}};
  showTab(['add','help','docs','setup'].includes(location.hash.slice(1))?location.hash.slice(1):'accounts');
  boot();
  </script></body></html>`;
  const h=baseHeaders();h['content-security-policy']="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self' https://renzehysxirjilvdxacv.supabase.co https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";h['x-ekodi-route']='mail-admin';return new Response(html,{headers:h});
}
