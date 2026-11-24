(() => {
  // 관리자 페이지 CSP(connect-src 'self')에 맞춰 같은 주소(ekodi.kr) 경로로 호출한다.
  const API='';
  const STATUS={DRAFT:'작성중',AI_DRAFT:'AI 초안',REVIEW:'검토중',APPROVED:'승인',SENT:'발송완료'};
  const SOURCE_STATUS={not_loaded:'미수집',ready:'수집완료',error:'수집오류'};
  let state=null,installed=false,loading=false,currentId='',sourceState=null,sourceLoading=false;
  const token=()=>{try{return JSON.parse(sessionStorage.getItem('ekodi-church-pastor-session')||'null')?.accessToken||''}catch{return''}};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function request(path,options={}){const h=new Headers(options.headers||{});if(token())h.set('authorization',`Bearer ${token()}`);if(options.body&&!h.has('content-type'))h.set('content-type','application/json');const r=await fetch(`${API}${path}`,{...options,headers:h,cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`사역보고 API 오류 (${r.status})`);return d}
  function flash(msg,error=false){const el=document.querySelector('#churchReportFlash');if(!el)return;el.textContent=msg||'';el.style.color=error?'#fda4af':''}
  function install(){if(installed)return true;const root=document.querySelector('#churchReportsRoot');if(!root)return false;installed=true;root.innerHTML=`
      <div class="church-head"><div><p class="church-kicker">EKODI CHURCH · MINISTRY REPORTS</p><h2>사역보고</h2><p>2·4·6·8·10·12월 에코디교회 사역보고를 준비하고, 예배·말씀·교회 일정의 실제 기록을 원자료로 모아 검토·승인·발송까지 관리합니다.</p></div><div><a class="secondary" href="/ekodichurch" target="_blank" rel="noopener">교회 화면 ↗</a> <button class="secondary" id="churchReportRefresh" type="button">↻ Refresh</button></div></div>
      <p class="church-report-flash" id="churchReportFlash" role="status"></p>
      <div class="church-capabilities" id="churchReportCapabilities"></div>
      <div class="church-report-metrics" id="churchReportMetrics"></div>
      <section class="church-report-card"><div class="church-report-card-head"><strong>사역보고 발송 설정</strong><small>승인 전에는 발송되지 않습니다.</small></div>
        <form id="churchReportSettings" class="church-settings-grid"><label>보고 수신 이메일<input name="recipientEmail" type="email" placeholder="hq@example.org"></label><label>참조 이메일<input name="ccEmail" placeholder="a@example.org, b@example.org"></label><label>발신 표시명<input name="senderName" value="에코디교회"></label><label>보고 기준일<input name="dueDay" type="number" min="0" max="28" placeholder="0 = 미설정"></label><label class="church-report-checkbox"><input name="autoSendAfterApproval" type="checkbox" checked><span>승인 후 자동발송</span></label><div><button class="books-compact-button primary" type="submit">Save Settings</button></div></form>
      </section>
      <section class="church-report-card"><div class="church-report-card-head"><strong>사역보고 목록</strong><button class="books-compact-button" id="churchEnsureReport" type="button">+ Upcoming Report</button></div><div id="churchReportList" class="church-report-list"></div></section>
      <section class="church-report-card church-report-editor" id="churchReportEditor" hidden><div class="church-report-card-head"><div><strong id="churchReportEditorTitle">Report</strong><small id="churchReportEditorPeriod"></small></div><button class="books-compact-button" id="churchReportClose" type="button">Close</button></div>
        <p class="church-report-note">AI는 관리자 입력과 에코디교회에 실제 기록된 예배·말씀·교회 일정만 사용합니다. 교인 연락처와 돌봄 상세는 사역보고 AI 원자료에서 제외합니다.</p>
        <section class="church-report-source-panel" id="churchReportSourcePanel">
          <div class="church-report-card-head"><div><strong>교회 원자료</strong><small id="churchReportSourceMeta">아직 불러오지 않음</small></div><button class="books-compact-button" id="churchReportSyncSources" type="button">↻ Sync Sources</button></div>
          <div class="church-source-summary" id="churchReportSourceSummary"></div>
          <div class="church-source-list" id="churchReportSourceList"><p class="church-report-empty">동기화하면 보고기간의 예배·말씀·교회 일정 기록을 여기에 표시합니다.</p></div>
          <p class="church-report-error" id="churchReportSourceError"></p>
        </section>
        <form id="churchReportForm" class="church-report-grid"><label class="wide">제목<input name="title"></label><label>상태<input name="statusLabel" readonly></label><label>AI 모드<input name="aiMode" readonly></label><label class="wide">지난 2개월 주요 사역<textarea name="activities"></textarea></label><label class="wide">참여·성과·변화<textarea name="outcomes"></textarea></label><label class="wide">감사와 평가<textarea name="evaluation"></textarea></label><label class="wide">향후 2개월 계획<textarea name="plans"></textarea></label><label class="wide">협조 요청<textarea name="requests"></textarea></label><label class="wide">기도제목<textarea name="prayers"></textarea></label><label class="full">추가 AI 참고자료 · 관리자 메모<textarea name="sourceNotes" placeholder="시스템에 없는 오프라인 사역, 협조사항, 다음 2개월 확정계획 등 확인된 사실자료를 보완하세요."></textarea></label><label class="full church-report-body">최종 발송 본문<textarea name="body"></textarea></label><div class="full church-report-error" id="churchReportSendError"></div>
          <div class="full church-report-editor-actions"><div><button class="books-compact-button" id="churchReportSave" type="button">Save</button> <button class="books-compact-button" id="churchReportGenerate" type="button">✨ Sync + AI Draft</button> <button class="books-compact-button" id="churchReportReview" type="button">Review</button></div><div class="right"><button class="books-compact-button primary" id="churchReportApprove" type="button">Approve & Send</button><button class="books-compact-button" id="churchReportSend" type="button">Send Approved</button></div></div>
        </form></section>`;
    root.querySelector('#churchReportRefresh').addEventListener('click',load);root.querySelector('#churchReportSettings').addEventListener('submit',saveSettings);root.querySelector('#churchEnsureReport').addEventListener('click',ensureUpcoming);root.querySelector('#churchReportClose').addEventListener('click',()=>{root.querySelector('#churchReportEditor').hidden=true;currentId='';sourceState=null});root.querySelector('#churchReportSave').addEventListener('click',()=>saveCurrent());root.querySelector('#churchReportGenerate').addEventListener('click',generateCurrent);root.querySelector('#churchReportReview').addEventListener('click',()=>saveCurrent('REVIEW'));root.querySelector('#churchReportApprove').addEventListener('click',approveCurrent);root.querySelector('#churchReportSend').addEventListener('click',sendCurrent);root.querySelector('#churchReportSyncSources').addEventListener('click',syncSources);load();return true}
  async function load(){if(loading)return;if(!token()){flash('관리자 인증 후 에코디교회 사역보고를 불러올 수 있습니다.',true);return}loading=true;flash('사역보고 운영정보를 불러오는 중입니다.');try{state=await request('/api/church/admin/reports');render();flash(`마지막 갱신 ${new Date().toLocaleTimeString('ko-KR')}`)}catch(e){flash(e.message,true)}finally{loading=false}}
  function render(){renderCapabilities();renderMetrics();renderSettings();renderList();if(currentId){const r=state.reports.find(x=>x.id===currentId);if(r)fillEditor(r)}}
  function renderCapabilities(){const c=state?.capabilities||{};document.querySelector('#churchReportCapabilities').innerHTML=`<article class="church-capability"><small>교회 원자료</small><strong>${c.sources?'Connected':'Unavailable'}</strong></article><article class="church-capability"><small>AI Draft</small><strong>${c.ai?'OpenAI Connected':'Smart Fallback'}</strong></article><article class="church-capability"><small>Gmail Delivery</small><strong>${c.gmail?'Connected':'Setup Required'}</strong></article><article class="church-capability"><small>Approval Gate</small><strong>Required</strong></article>`}
  function renderMetrics(){const reports=state?.reports||[],up=state?.upcoming||{};const pending=reports.filter(r=>r.status!=='SENT').length,sent=reports.filter(r=>r.status==='SENT').length,sourced=reports.filter(r=>r.sourceStatus==='ready').length;document.querySelector('#churchReportMetrics').innerHTML=`<article class="church-report-metric"><small>Next Report</small><strong>${up.year||''}.${String(up.month||'').padStart(2,'0')}</strong></article><article class="church-report-metric"><small>Open</small><strong>${pending}</strong></article><article class="church-report-metric"><small>Sources Ready</small><strong>${sourced}</strong></article><article class="church-report-metric"><small>Sent Archive</small><strong>${sent}</strong></article>`}
  function renderSettings(){const f=document.querySelector('#churchReportSettings'),s=state.settings,c=state?.capabilities||{};f.recipientEmail.value=s.recipientEmail||'';f.ccEmail.value=s.ccEmail||'';f.senderName.value=s.senderName||'에코디교회';f.dueDay.value=s.dueDay||'';f.autoSendAfterApproval.checked=s.autoSendAfterApproval!==false;f.querySelectorAll('input,button').forEach(el=>el.disabled=!c.canWrite)}
  function sourceLabel(r){const label=SOURCE_STATUS[r.sourceStatus]||r.sourceStatus||'미수집';const count=Number(r.sourceCount||0);return `${label}${r.sourceStatus==='ready'?` · ${count}건`:''}`}
  function renderList(){const host=document.querySelector('#churchReportList'),reports=state?.reports||[],c=state?.capabilities||{};const ensure=document.querySelector('#churchEnsureReport');if(ensure)ensure.disabled=!c.canWrite;if(!reports.length){host.innerHTML='<p class="church-report-empty">등록된 사역보고가 없습니다.</p>';return}host.innerHTML=reports.map(r=>`<article class="church-report-row"><div><strong>${esc(r.title)}</strong><small>${esc(r.activityFrom)} ~ ${esc(r.activityTo)}</small></div><div><span class="church-source-status" data-source-status="${esc(r.sourceStatus||'not_loaded')}">${esc(sourceLabel(r))}</span>${r.sourceRefreshedAt?`<small>원자료 ${esc(new Date(r.sourceRefreshedAt).toLocaleString('ko-KR'))}</small>`:''}</div><span class="church-report-status" data-status="${esc(r.status)}">${esc(STATUS[r.status]||r.status)}</span><div class="church-report-actions"><button class="books-compact-button" data-open-report="${esc(r.id)}" type="button">Open</button></div></article>`).join('');host.querySelectorAll('[data-open-report]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.openReport)))}
  async function openReport(id){currentId=id;sourceState=null;const r=state.reports.find(x=>x.id===id);if(!r)return;fillEditor(r);renderSources();const box=document.querySelector('#churchReportEditor');box.hidden=false;box.scrollIntoView({behavior:'smooth',block:'nearest'});await loadSources(false)}
  function fillEditor(r){const f=document.querySelector('#churchReportForm');document.querySelector('#churchReportEditorTitle').textContent=r.title;document.querySelector('#churchReportEditorPeriod').textContent=`활동 ${r.activityFrom} ~ ${r.activityTo} · 계획 ${r.planFrom} ~ ${r.planTo}`;for(const k of ['title','activities','outcomes','evaluation','plans','requests','prayers','sourceNotes','body'])f.elements[k].value=r[k]||'';f.statusLabel.value=STATUS[r.status]||r.status;f.aiMode.value=r.aiMode||'';document.querySelector('#churchReportSendError').textContent=r.sendError||'';document.querySelector('#churchReportSourceError').textContent=r.sourceError||'';const c=state?.capabilities||{},locked=r.status==='SENT'||!c.canWrite;f.querySelectorAll('textarea,input[name="title"]').forEach(x=>x.disabled=locked);document.querySelector('#churchReportApprove').disabled=r.status==='SENT'||!c.canApprove;document.querySelector('#churchReportGenerate').disabled=locked;document.querySelector('#churchReportReview').disabled=locked;document.querySelector('#churchReportSave').disabled=locked;document.querySelector('#churchReportSyncSources').disabled=locked;document.querySelector('#churchReportSend').disabled=r.status!=='APPROVED'||!c.canApprove}
  function payload(status){const f=document.querySelector('#churchReportForm');return{title:f.title.value,activities:f.activities.value,outcomes:f.outcomes.value,evaluation:f.evaluation.value,plans:f.plans.value,requests:f.requests.value,prayers:f.prayers.value,sourceNotes:f.sourceNotes.value,body:f.body.value,...(status?{status}:{})}}
  async function saveCurrent(status){if(!currentId)return;try{await request(`/api/church/admin/reports/${currentId}`,{method:'PUT',body:JSON.stringify(payload(status))});flash(status==='REVIEW'?'검토중 상태로 저장했습니다.':'사역보고를 저장했습니다.');await load()}catch(e){flash(e.message,true)}}
  function sourceItemText(item){const body=item?.body&&typeof item.body==='object'?item.body:{};const detail=item.summary||body.summary||body.public_summary||body.text||body.result||body.note||body.prayer_request||body.prayer||'';return [item.date,item.label||item.type,item.title||item.circle,detail].filter(Boolean).map(esc).join(' · ')}
  function renderSources(){const meta=document.querySelector('#churchReportSourceMeta'),summary=document.querySelector('#churchReportSourceSummary'),list=document.querySelector('#churchReportSourceList'),error=document.querySelector('#churchReportSourceError');const report=state?.reports?.find(r=>r.id===currentId);if(!report)return;error.textContent=report.sourceError||sourceState?.sourceError||'';if(sourceLoading){meta.textContent='원자료 불러오는 중…';summary.innerHTML='';list.innerHTML='<p class="church-report-empty">교회 기록을 확인하고 있습니다.</p>';return}const s=sourceState?.source||{};const counts=s.counts||{};const status=sourceState?.sourceStatus||report.sourceStatus||'not_loaded';const refreshed=sourceState?.sourceRefreshedAt||report.sourceRefreshedAt||'';meta.textContent=`${SOURCE_STATUS[status]||status}${refreshed?` · ${new Date(refreshed).toLocaleString('ko-KR')}`:''}`;if(status!=='ready'){summary.innerHTML='';list.innerHTML='<p class="church-report-empty">Sync Sources를 누르면 보고기간의 실제 교회 기록을 수집합니다.</p>';return}const metrics=[['예배·말씀',counts.services],['교회 일정',counts.events],['등록 교인',counts.members],['원자료',counts.items]];summary.innerHTML=metrics.map(([label,value])=>`<span><small>${esc(label)}</small><strong>${Number(value||0).toLocaleString('ko-KR')}</strong></span>`).join('');const items=Array.isArray(s.items)?s.items.slice(0,14):[];list.innerHTML=items.length?items.map(item=>`<article class="church-source-item"><span>${esc(item.date||'')}</span><p>${sourceItemText(item)}</p></article>`).join(''):'<p class="church-report-empty">해당 보고기간에 수집된 교회 활동 기록이 없습니다. 필요한 오프라인 사역은 관리자 메모로 보완하세요.</p>'}
  async function loadSources(force=false){if(!currentId||sourceLoading)return;if(!force&&sourceState?.id===currentId)return;sourceLoading=true;renderSources();try{sourceState=await request(`/api/church/admin/reports/${currentId}/sources`)}catch(e){flash(e.message,true)}finally{sourceLoading=false;renderSources()}}
  async function syncSources(){if(!currentId||sourceLoading)return;const b=document.querySelector('#churchReportSyncSources');sourceLoading=true;b.disabled=true;b.textContent='동기화 중…';renderSources();try{const d=await request(`/api/church/admin/reports/${currentId}/sources/refresh`,{method:'POST'});sourceState={id:currentId,sourceStatus:d.report?.sourceStatus||'ready',sourceCount:d.report?.sourceCount||d.source?.counts?.items||0,sourceRefreshedAt:d.report?.sourceRefreshedAt||new Date().toISOString(),sourceError:'',source:d.source||{}};flash(`교회 원자료 ${Number(sourceState.sourceCount||0).toLocaleString('ko-KR')}건을 동기화했습니다.`);await load();renderSources()}catch(e){flash(e.message,true);await load();sourceState=null;await loadSources(true)}finally{sourceLoading=false;b.disabled=false;b.textContent='↻ Sync Sources';renderSources()}}
  async function generateCurrent(){if(!currentId)return;await saveCurrent();const b=document.querySelector('#churchReportGenerate');b.disabled=true;b.textContent='원자료 + AI 작성 중…';try{const d=await request(`/api/church/admin/reports/${currentId}/generate`,{method:'POST'});const sourceMsg=d.sourceSynced?`교회 원자료 ${Number(d.sourceCount||0).toLocaleString('ko-KR')}건을 반영해 `:'기존 자료를 사용해 ';flash(d.aiMode==='openai'?`${sourceMsg}AI 초안을 작성했습니다. 사실관계를 검토해 주세요.`:`${sourceMsg}스마트 초안을 작성했습니다.`);sourceState=null;await load();await openReport(currentId)}catch(e){flash(e.message,true)}finally{b.disabled=false;b.textContent='✨ Sync + AI Draft'}}
  async function approveCurrent(){if(!currentId)return;if(!confirm('현재 최종 본문을 승인하시겠습니까? 승인 후 자동발송이 켜져 있고 Gmail이 연결되어 있으면 즉시 설정된 수신처로 발송됩니다.'))return;await saveCurrent('REVIEW');try{const d=await request(`/api/church/admin/reports/${currentId}/approve`,{method:'POST'});if(d.delivery?.sent)flash('승인과 동시에 설정된 수신처로 발송했습니다.');else if(d.delivery?.error)flash(`승인했습니다. 자동발송 대기: ${d.delivery.error}`,true);else flash('승인했습니다. 자동발송은 현재 꺼져 있습니다.');await load();await openReport(currentId)}catch(e){flash(e.message,true)}}
  async function sendCurrent(){if(!currentId)return;try{await request(`/api/church/admin/reports/${currentId}/send`,{method:'POST'});flash('승인된 사역보고를 설정된 수신처로 발송했습니다.');await load();await openReport(currentId)}catch(e){flash(e.message,true);await load();await openReport(currentId)}}
  async function saveSettings(ev){ev.preventDefault();const f=ev.currentTarget;try{await request('/api/church/admin/reports/settings',{method:'PUT',body:JSON.stringify({recipientEmail:f.recipientEmail.value,ccEmail:f.ccEmail.value,senderName:f.senderName.value,dueDay:Number(f.dueDay.value||0),autoSendAfterApproval:f.autoSendAfterApproval.checked})});flash('발송 설정을 저장했습니다.');await load()}catch(e){flash(e.message,true)}}
  async function ensureUpcoming(){const u=state?.upcoming;if(!u)return;try{const d=await request('/api/church/admin/reports/ensure',{method:'POST',body:JSON.stringify({year:u.year,month:u.month})});flash(`${d.report.title}을 준비했습니다.`);await load();await openReport(d.report.id)}catch(e){flash(e.message,true)}}
  window.addEventListener('ekodi:church-reports-ready',install,{once:true});install();
  // 문서보관 (/ekodichurch/admin/documents)
  const DOC_API=`${API}/api/church/admin/reports/documents`;
  const CATEGORIES=['제출서류','신청서','목회계획서','정관','회의록','결산','공문','기타'];
  const docHeaders=()=>{const h=new Headers({'content-type':'application/json'});if(token())h.set('authorization',`Bearer ${token()}`);return h};
  const safeUrl=u=>/^https:\/\//.test(String(u||''))?String(u):'';
  const link=(url,label)=>safeUrl(url)?`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${label}</a>`:'-';
  async function loadDocuments(){
    const root=document.querySelector('#churchDocumentsRoot');if(!root)return;
    if(!token()){root.innerHTML='<p class="empty">관리자 인증 후 문서보관 목록을 불러올 수 있습니다.</p>';return}
    let data;
    try{const r=await fetch(DOC_API,{headers:docHeaders(),cache:'no-store'});data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`)}
    catch(err){root.innerHTML=`<p class="empty">문서 목록을 불러오지 못했습니다: ${esc(err.message)}</p>`;return}
    const docs=Array.isArray(data.documents)?data.documents:[];
    const bundles=[];for(const d of docs){const name=d.bundle||'기타 문서';let b=bundles.find(x=>x.name===name);if(!b){b={name,url:d.bundleUrl||'',items:[]};bundles.push(b)}b.items.push(d)}
    // 한눈에 보이는 탭 + 카드 배치(모바일·웹 공통). 표 대신 카드라 가로로 넘치지 않는다.
    const card=d=>`<article class="church-doc-card"><div class="church-doc-card-head"><span class="church-doc-tag">${esc(d.category||'문서')}</span><span class="church-doc-year">${esc(d.year||'')}</span></div><h4>${esc(d.title)}</h4>${d.note?`<p class="church-doc-note">${esc(d.note)}</p>`:''}<div class="church-doc-actions">${d.editable?`<button class="button primary" type="button" data-doc-edit="${esc(d.id)}">${data.canWrite?'열기·편집':'열기'}</button>`:(safeUrl(d.gdocUrl)?`<a class="button primary" href="${esc(safeUrl(d.gdocUrl))}" target="_blank" rel="noopener noreferrer">열기</a>`:'')}${safeUrl(d.hwpxUrl)?`<a class="button" href="${esc(safeUrl(d.hwpxUrl))}" target="_blank" rel="noopener noreferrer">${d.editable?'한글(이전본)':'한글 내려받기'}</a>`:''}${(d.editable||d.attachmentType||data.canWrite)?`<button class="button" type="button" data-doc-print="${esc(d.id)}">인쇄</button>`:''}${data.canWrite?`<button class="button quiet" type="button" data-doc-archive="${esc(d.id)}">내리기</button>`:''}</div></article>`;
    const shortName=n=>/자립화/.test(n)?'자립화 지원신청':/대표자/.test(n)?'대표자 서류':(n.length>10?n.slice(0,10)+'…':n);
    const tabs=bundles.map((b,i)=>({key:`bundle-${i}`,label:shortName(b.name),count:b.items.length,html:`<div class="church-doc-panel-head"><strong>${esc(b.name)}</strong><button class="button primary" type="button" data-doc-bundle-print="${i}">전체 인쇄 · PDF 묶음</button>${safeUrl(b.url)?link(b.url,'드라이브 폴더 열기'):''}</div><div class="church-doc-grid">${b.items.map(card).join('')}</div>`}));
    tabs.push({key:'issued',label:'발급서류',count:null,html:'<section id="churchIssuedRoot" class="church-issued-in-tab"><p class="loading">발급서류를 불러오고 있습니다.</p></section>'});
    if(data.canWrite)tabs.push({key:'add',label:'+ 등록',count:null,html:`<h4 class="church-doc-subhead">한글·워드 파일 올려서 바로 편집 <small>(컴퓨터에 한글·워드가 없어도 됩니다)</small></h4><form id="churchDocImport" class="church-doc-form"><label>파일(.hwpx·.docx)<input name="file" type="file" accept=".hwpx,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></label><label>문서 제목<input name="title" maxlength="200" placeholder="비우면 파일 이름"></label><label>묶음 이름<input name="bundle" maxlength="200" placeholder="예: 2027 목포노회 동반성장 자립화교회 지원신청"></label><label>구분<select name="category">${CATEGORIES.map(c=>`<option>${c}</option>`).join('')}</select></label><button class="button primary" type="submit">올리고 열기</button><button class="button" type="button" data-doc-blank>빈 문서 만들기</button><p class="empty" data-import-status></p></form><h4 class="church-doc-subhead">링크로 등록</h4><form id="churchDocForm" class="church-doc-form"><label>묶음 이름<input name="bundle" maxlength="200" placeholder="예: 2027 목포노회 동반성장 자립화교회 지원신청"></label><label>묶음 폴더 링크<input name="bundleUrl" type="url" placeholder="https://drive.google.com/..."></label><label>문서 제목<input name="title" required maxlength="200"></label><label>구분<select name="category">${CATEGORIES.map(c=>`<option>${c}</option>`).join('')}</select></label><label>연도<input name="year" maxlength="20"></label><label>웹페이지 링크<input name="gdocUrl" type="url"></label><label>한글 파일 링크<input name="hwpxUrl" type="url"></label><label>비고<input name="note" maxlength="500"></label><button class="button primary" type="submit">등록</button></form>`});
    let active='';try{active=sessionStorage.getItem('ekodi:church-doc-tab')||''}catch{}
    if(!tabs.some(t=>t.key===active))active=tabs[0]?.key||'issued';
    root.innerHTML=`<h2>문서보관</h2><p class="empty">원본은 joseph@ekodi.kr 구글드라이브에 있으며, 공유받은 계정으로 로그인해야 열립니다.</p>
      <div class="church-doc-tabs" role="tablist">${tabs.map(t=>`<button type="button" role="tab" class="church-doc-tab${t.key===active?' active':''}" data-doc-tab="${t.key}" aria-selected="${t.key===active}" title="${esc(t.label)}"><span>${esc(t.label)}</span>${t.count!=null?`<b>${t.count}</b>`:''}</button>`).join('')}</div>
      ${tabs.map(t=>`<div class="church-doc-panel" role="tabpanel" data-doc-panel="${t.key}"${t.key===active?'':' hidden'}>${t.html}</div>`).join('')}${bundles.length?'':'<p class="empty">등록된 문서가 없습니다.</p>'}`;
    root.querySelectorAll('[data-doc-tab]').forEach(btn=>btn.addEventListener('click',()=>{const key=btn.dataset.docTab;try{sessionStorage.setItem('ekodi:church-doc-tab',key)}catch{}root.querySelectorAll('[data-doc-tab]').forEach(x=>{const on=x===btn;x.classList.toggle('active',on);x.setAttribute('aria-selected',String(on))});root.querySelectorAll('[data-doc-panel]').forEach(p=>{p.hidden=p.dataset.docPanel!==key})}));
    const imp=root.querySelector('#churchDocImport');
    const doImport=async(blank)=>{const st=imp.querySelector('[data-import-status]');const fd=new FormData(imp);if(blank){fd.delete('file');fd.set('blank','1')}else if(!imp.file.files.length){st.textContent='파일을 골라 주세요.';return}
      st.textContent=blank?'새 문서를 만드는 중…':'파일을 여는 중… (한글·워드를 웹 문서로 바꾸고 있습니다)';const headers=new Headers();if(token())headers.set('authorization',`Bearer ${token()}`);
      try{const r=await fetch(`${DOC_API}/import`,{method:'POST',headers,body:fd});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);st.textContent='';await loadDocuments();await openDocEditor(d.id)}catch(err){st.textContent=`실패: ${err.message}`}};
    imp?.addEventListener('submit',e=>{e.preventDefault();void doImport(false)});
    imp?.querySelector('[data-doc-blank]')?.addEventListener('click',()=>void doImport(true));
    // 열기·편집은 새 창에서 연다(문서함은 그대로 두고 문서만 크게). 새 창이 막히면 이 화면에서 연다.
    root.querySelectorAll('[data-doc-print]').forEach(btn=>btn.addEventListener('click',()=>{const d=docs.find(x=>x.id===btn.dataset.docPrint);if(d)void openBundlePrint({name:d.title,items:[d]},Boolean(data.canWrite))}));
    root.querySelectorAll('[data-doc-bundle-print]').forEach(btn=>btn.addEventListener('click',()=>{const b=bundles[Number(btn.dataset.docBundlePrint)];if(b)void openBundlePrint(b,Boolean(data.canWrite))}));
    root.querySelectorAll('[data-doc-edit]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.docEdit;const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('edit',id);const w=window.open(url.toString(),`ekodi-doc-${id}`);if(!w)openDocEditor(id)}));
    const editParam=new URLSearchParams(location.search).get('edit');
    if(editParam&&/^cdoc-[A-Za-z0-9-]{1,80}$/.test(editParam)&&!window.__ekodiDocEditOpened){window.__ekodiDocEditOpened=true;void openDocEditor(editParam,{standalone:true})}
    void loadIssued();
    root.querySelectorAll('[data-doc-archive]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('이 문서를 목록에서 내릴까요? 드라이브 원본은 그대로 남습니다.'))return;try{const r=await fetch(`${DOC_API}/${encodeURIComponent(button.dataset.docArchive)}/archive`,{method:'POST',headers:docHeaders()});if(!r.ok)throw new Error(`HTTP ${r.status}`);await loadDocuments()}catch(err){alert(`처리 실패: ${err.message}`)}}));
    root.querySelector('#churchDocForm')?.addEventListener('submit',async event=>{event.preventDefault();const body=Object.fromEntries(new FormData(event.target).entries());try{const r=await fetch(DOC_API,{method:'POST',headers:docHeaders(),body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);await loadDocuments()}catch(err){alert(`등록 실패: ${err.message}`)}});
  }

  // ── 문서 바로 편집: 열어서 고치고 바로 저장(입력이 멈추면 자동 저장, 이전본은 서버에 보관) ──
  function importDocHtml(sheet,html){
    const parsed=new DOMParser().parseFromString(`<body>${html}</body>`,'text/html');
    const styled=[];parsed.body.querySelectorAll('[style]').forEach(el=>{styled.push([el,el.getAttribute('style')]);el.removeAttribute('style')});
    styled.forEach(([el,css])=>el.setAttribute('data-ekodi-css',css));
    sheet.replaceChildren(...Array.from(parsed.body.childNodes).map(n=>document.importNode(n,true)));
    sheet.querySelectorAll('[data-ekodi-css]').forEach(el=>{el.style.cssText=el.getAttribute('data-ekodi-css');el.removeAttribute('data-ekodi-css')});
  }
  // 빨간 글씨는 인라인 스타일 대신 .need 클래스로 표시한다(관리자 화면 보안정책: style 속성 금지).
  function markRed(sheet){const sel=window.getSelection();if(!sel||!sel.rangeCount)return;const range=sel.getRangeAt(0);if(range.collapsed||!sheet.contains(range.commonAncestorContainer))return;const span=document.createElement('span');span.className='need';span.append(range.extractContents());range.insertNode(span);sel.removeAllRanges();const r=document.createRange();r.selectNodeContents(span);sel.addRange(r)}
  function unmarkRed(sheet){const sel=window.getSelection();if(!sel||!sel.rangeCount)return;const range=sel.getRangeAt(0);const hits=[...sheet.querySelectorAll('.need')].filter(el=>range.intersectsNode(el));hits.forEach(el=>{if(el.tagName==='SPAN')el.replaceWith(...el.childNodes);else el.classList.remove('need')})}
  // 표 크기 조절: 칸 경계를 끌면 열 너비, 표 오른쪽 끝을 끌면 표 전체 너비가 바뀐다(퍼센트로 저장되어 인쇄에도 그대로).
  function enableTableResize(sheet,onChange){
    const EDGE=6;let drag=null;
    const colsOf=table=>{let cg=table.querySelector(':scope>colgroup');const first=table.rows[0];if(!first)return [];
      const count=Math.max(...[...table.rows].map(r=>[...r.cells].reduce((n,c)=>n+(Number(c.colSpan)||1),0)));
      if(!cg||cg.children.length!==count){const tw=table.getBoundingClientRect().width||1;const probe=[...table.rows].find(r=>r.cells.length===count);
        const widths=probe?[...probe.cells].map(c=>c.getBoundingClientRect().width):Array(count).fill(tw/count);
        const total=widths.reduce((x,y)=>x+y,0)||1;cg?.remove();cg=document.createElement('colgroup');widths.forEach(w=>{const col=document.createElement('col');col.style.width=`${(w/total*100).toFixed(2)}%`;cg.append(col)});table.prepend(cg);table.classList.remove('auto')}
      const cols=[...cg.children];const sum=cols.reduce((x,c)=>x+(parseFloat(c.style.width)||0),0);
      if(!sum||Math.abs(sum-100)>0.5){const each=100/cols.length;cols.forEach(c=>{const w=parseFloat(c.style.width);c.style.width=`${(sum&&w?w/sum*100:each).toFixed(2)}%`})}
      return cols};
    const topTable=t=>{let top=t;for(let p=t.parentElement?.closest('table');p&&sheet.contains(p);p=p.parentElement?.closest('table'))top=p;return top};
    // 칸 경계(왼쪽·오른쪽·아래)에 가까우면 그 경계를 돌려준다. 합쳐진 칸이 있어도 화면 좌표로 판단한다.
    const hit=(x,y,target)=>{const cell=target?.closest?.('td,th');if(!cell||!sheet.contains(cell)||cell.classList.contains('cdoc-rowsplit'))return null;const table=cell.closest('table');const top=topTable(table);
      const r=cell.getBoundingClientRect(),t=table.getBoundingClientRect(),T=top.getBoundingClientRect();
      let edge=null;if(Math.abs(x-r.right)<=EDGE)edge=r.right;else if(Math.abs(x-r.left)<=EDGE&&r.left-T.left>EDGE)edge=r.left;
      if(edge!==null)return {kind:'x',cell,table,top,edge,outer:Math.abs(edge-T.right)<=EDGE+1};
      if(Math.abs(y-r.bottom)<=EDGE&&x>r.left+EDGE&&x<r.right-EDGE)return {kind:'y',cell,table,top};
      return null};
    // 한 줄(행)만 따로 조절할 수 있게: 그 줄의 칸들을 한 칸짜리 안쪽 표로 옮긴다. 세로로 합쳐진 칸이 걸린 줄은 열 전체 조절로 대신한다.
    const splitRow=cell=>{const table=cell.closest('table');if(table.classList.contains('cdoc-rowsplit-inner'))return table;
      const tr=cell.parentElement;const cells=[...tr.cells];if(cells.length<2||cells.some(c=>(Number(c.rowSpan)||1)>1))return null;
      const rows=[...table.rows],i=rows.indexOf(tr);for(let j=0;j<i;j++)for(const c of rows[j].cells)if((Number(c.rowSpan)||1)>i-j)return null;
      const widths=cells.map(c=>c.getBoundingClientRect().width),total=widths.reduce((x,y)=>x+y,0)||1,span=cells.reduce((n,c)=>n+(Number(c.colSpan)||1),0);
      const inner=document.createElement('table');inner.className='cdoc-rowsplit-inner';const cg=document.createElement('colgroup');
      widths.forEach(w=>{const col=document.createElement('col');col.style.width=`${(w/total*100).toFixed(2)}%`;cg.append(col)});inner.append(cg);
      const itr=document.createElement('tr');cells.forEach(c=>{c.colSpan=1;itr.append(c)});inner.createTBody().append(itr);
      const holder=document.createElement('td');holder.className='cdoc-rowsplit';holder.colSpan=span;holder.append(inner);tr.append(holder);return inner};
    const colDrag=(table,x,edge)=>{const cols=colsOf(table);if(cols.length<2)return false;const t=table.getBoundingClientRect();let acc=t.left,best=-1,dist=1e9;
      cols.forEach((c,k)=>{acc+=(parseFloat(c.style.width)||0)/100*t.width;if(k<cols.length-1&&Math.abs(acc-edge)<dist){dist=Math.abs(acc-edge);best=k}});
      if(best<0||dist>EDGE*3)return false;drag={mode:'col',cols,i:best,startX:x,a:parseFloat(cols[best].style.width)||0,b:parseFloat(cols[best+1].style.width)||0,tw:t.width};return true};
    // 기본: 그 줄의 칸만 조절 · Shift: 열 전체 조절 · 표 오른쪽 끝: 표 너비 · 칸 아래쪽: 줄 높이
    const start=(x,y,h,shift)=>{
      if(h.kind==='y'){let tr=h.cell.parentElement;const own=h.cell.closest('table');if(own.classList.contains('cdoc-rowsplit-inner'))tr=own.closest('tr');
        else{const rows=[...own.rows];tr=rows[Math.min(rows.length-1,rows.indexOf(tr)+(Number(h.cell.rowSpan)||1)-1)]}
        drag={mode:'row',tr,startY:y,startH:tr.getBoundingClientRect().height};return true}
      if(h.outer){const cs=getComputedStyle(sheet);drag={mode:'table',table:h.top,startX:x,startW:h.top.getBoundingClientRect().width,base:sheet.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)};return true}
      if(!shift){const inner=splitRow(h.cell);if(inner&&colDrag(inner,x,h.edge))return true}
      return colDrag(h.table,x,h.edge)};
    const move=(x,y)=>{
      if(drag.mode==='row'){drag.tr.style.height=`${Math.max(18,drag.startH+(y-drag.startY)).toFixed(0)}px`;return}
      const dx=x-drag.startX;
      if(drag.mode==='table'){const pct=Math.max(30,Math.min(100,(drag.startW+dx)/drag.base*100));drag.table.style.width=`${pct.toFixed(1)}%`}
      else{const d=dx/drag.tw*100;const a=Math.max(3,Math.min(drag.a+drag.b-3,drag.a+d));drag.cols[drag.i].style.width=`${a.toFixed(2)}%`;drag.cols[drag.i+1].style.width=`${(drag.a+drag.b-a).toFixed(2)}%`}};
    sheet.addEventListener('pointermove',e=>{if(drag)return;const h=hit(e.clientX,e.clientY,e.target);sheet.classList.toggle('church-doc-resize-cursor',h?.kind==='x');sheet.classList.toggle('church-doc-resize-row',h?.kind==='y')});
    sheet.addEventListener('pointerdown',e=>{if(e.button!==0)return;const h=hit(e.clientX,e.clientY,e.target);if(!h)return;if(!start(e.clientX,e.clientY,h,e.shiftKey))return;e.preventDefault();
      try{sheet.setPointerCapture(e.pointerId)}catch{}document.body.classList.add(drag.mode==='row'?'church-doc-resizing-row':'church-doc-resizing')});
    sheet.addEventListener('pointermove',e=>{if(drag){e.preventDefault();move(e.clientX,e.clientY)}});
    const end=()=>{if(!drag)return;drag=null;document.body.classList.remove('church-doc-resizing','church-doc-resizing-row');onChange()};
    sheet.addEventListener('pointerup',end);sheet.addEventListener('pointercancel',end);
  }
  // 표 안 ↑·↓: 칸의 첫·마지막 줄에서 누르면 옆 칸이 아니라 바로 위·아래 칸(같은 세로 위치)으로 이동한다.
  function enableTableArrows(sheet){
    sheet.addEventListener('keydown',e=>{
      if((e.key!=='ArrowDown'&&e.key!=='ArrowUp')||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;
      const sel=window.getSelection();if(!sel||!sel.rangeCount)return;
      const node=sel.focusNode;const cell=(node?.nodeType===1?node:node?.parentElement)?.closest?.('td,th');if(!cell||!sheet.contains(cell))return;
      const range=sel.getRangeAt(0).cloneRange();range.collapse(true);let rect=range.getClientRects()[0]||range.getBoundingClientRect();
      if(!rect||(!rect.width&&!rect.height&&!rect.top))rect=(node.nodeType===1?node:node.parentElement).getBoundingClientRect();
      const box=cell.getBoundingClientRect();const line=parseFloat(getComputedStyle(cell).lineHeight)||16;
      const down=e.key==='ArrowDown';
      if(down?(rect.bottom+line<box.bottom-2):(rect.top-line>box.top+2))return; // 칸 안에 아래·위 줄이 더 있으면 기본 이동
      const row=cell.parentElement.getBoundingClientRect();const x=Math.min(Math.max(rect.left||box.left+4,box.left+2),box.right-2);
      const y=down?row.bottom+3:row.top-3;const target=document.elementFromPoint(x,y)?.closest?.('td,th');
      if(!target||target===cell||target.closest('table')!==cell.closest('table'))return;
      e.preventDefault();
      const r=document.createRange();const tb=target.getBoundingClientRect();let placed=false;
      if(document.caretRangeFromPoint){const c=document.caretRangeFromPoint(x,down?tb.top+Math.min(line/2+2,tb.height/2):tb.bottom-Math.min(line/2+2,tb.height/2));if(c&&target.contains(c.startContainer)){r.setStart(c.startContainer,c.startOffset);placed=true}}
      if(!placed){r.selectNodeContents(target);r.collapse(down)}
      r.collapse(true);sel.removeAllRanges();sel.addRange(r);
    });
  }
  // ── 제출서류 전체 인쇄(PDF 묶음): 묶음 안 문서를 순서대로 한 번에 인쇄한다. 편집 문서는 현재 본문, 통장·증명서는 올린 원본(PDF·이미지) ──
  let pdfjsLib=null;
  const loadPdfjs=async()=>{if(!pdfjsLib){pdfjsLib=await import('/church-pdf.min.mjs');pdfjsLib.GlobalWorkerOptions.workerSrc='/church-pdf.worker.min.mjs'}return pdfjsLib};
  const pageCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));c.className='church-doc-attach-canvas';return c};
  async function renderAttachment(target,id){
    const r=await fetch(`${DOC_API}/${encodeURIComponent(id)}/attachment`,{headers:docHeaders(),cache:'no-store'});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||`HTTP ${r.status}`)}
    const type=(r.headers.get('content-type')||'').toLowerCase();const blob=await r.blob();
    if(type.startsWith('image/')){const bmp=await createImageBitmap(blob);const c=pageCanvas(bmp.width,bmp.height);c.getContext('2d').drawImage(bmp,0,0);const page=document.createElement('div');page.className='church-doc-attach-page';page.append(c);target.append(page);return 1}
    const pdfjs=await loadPdfjs();const pdf=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise;
    for(let n=1;n<=pdf.numPages;n++){const pg=await pdf.getPage(n);const vp=pg.getViewport({scale:2});const c=pageCanvas(vp.width,vp.height);await pg.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;const page=document.createElement('div');page.className='church-doc-attach-page';page.append(c);target.append(page)}
    return pdf.numPages}
  async function openBundlePrint(bundle,canWrite){
    document.querySelector('#churchDocBundle')?.remove();
    const box=document.createElement('div');box.id='churchDocBundle';box.className='church-doc-editor church-doc-bundle';box.setAttribute('role','dialog');box.setAttribute('aria-label',`${bundle.name} 전체 인쇄`);
    box.innerHTML=`<div class="church-doc-editor-bar"><strong title="${esc(bundle.name)}">${bundle.items.length>1?'전체 인쇄 · ':'인쇄 미리보기 · '}${esc(bundle.name)}</strong><span class="church-doc-editor-status" data-status>문서를 모으는 중…</span>
      <button class="button primary" type="button" data-print disabled>인쇄 · PDF 저장</button><button class="button" type="button" data-close>닫기</button></div>
      <div class="church-doc-editor-scroll"><p class="church-doc-bundle-help">순서대로 한 장씩 이어서 인쇄됩니다. PDF로 받으려면 인쇄 창에서 <b>대상: PDF로 저장</b>을 고르세요. 원본 파일이 없는 서류는 회색 칸에 파일을 올리면 함께 인쇄됩니다(빈 칸은 인쇄되지 않습니다).</p><div data-pages></div></div>`;
    document.body.append(box);document.body.classList.add('church-doc-editing');
    const status=box.querySelector('[data-status]'),pages=box.querySelector('[data-pages]'),printBtn=box.querySelector('[data-print]');
    const close=()=>{box.remove();if(!document.querySelector('#churchDocEditor'))document.body.classList.remove('church-doc-editing')};
    box.querySelector('[data-close]').addEventListener('click',close);
    const doPrint=()=>{const b=document.body;b.classList.add('church-doc-printing','church-doc-bundle-printing','ekodi-allow-print');const done=()=>{b.classList.remove('church-doc-printing','church-doc-bundle-printing','ekodi-allow-print');window.removeEventListener('afterprint',done)};window.addEventListener('afterprint',done);window.print();setTimeout(done,60000)};
    printBtn.addEventListener('click',doPrint);
    box.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();e.stopPropagation();if(!printBtn.disabled)doPrint()}else if(e.key==='Escape')close()});
    let printed=0;const missing=[],failed=[];
    for(const d of bundle.items){
      const slot=document.createElement('section');slot.className='church-doc-bundle-item';slot.dataset.docId=d.id;pages.append(slot);
      status.textContent=`문서를 모으는 중… ${d.title}`;
      try{
        if(d.editable){const r=await fetch(`${DOC_API}/${encodeURIComponent(d.id)}/content`,{headers:docHeaders(),cache:'no-store'});const doc=await r.json().catch(()=>({}));if(!r.ok)throw new Error(doc.error||`HTTP ${r.status}`);
          const sheet=document.createElement('article');sheet.className='church-doc-sheet';importDocHtml(sheet,String(doc.html||''));slot.append(sheet);printed++;continue}
        if(d.attachmentType){await renderAttachment(slot,d.id);printed++;continue}
        missing.push(d.title);slot.classList.add('church-doc-bundle-missing');
        slot.innerHTML=`<div class="church-doc-bundle-slot"><strong>${esc(d.title)}</strong><span>원본 파일(PDF·JPG·PNG)이 아직 없어 이 서류는 인쇄되지 않습니다.</span>${safeUrl(d.gdocUrl||d.hwpxUrl)?`<a href="${esc(safeUrl(d.gdocUrl||d.hwpxUrl))}" target="_blank" rel="noopener noreferrer">드라이브에서 원본 열기</a>`:''}${canWrite?`<label class="button">파일 올리기<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" data-attach="${esc(d.id)}" hidden></label>`:''}</div>`;
      }catch(err){failed.push(d.title);slot.innerHTML=`<div class="church-doc-bundle-slot"><strong>${esc(d.title)}</strong><span>불러오지 못했습니다: ${esc(err.message)}</span></div>`;slot.classList.add('church-doc-bundle-missing')}
    }
    pages.querySelectorAll('[data-attach]').forEach(input=>input.addEventListener('change',async()=>{const file=input.files?.[0];if(!file)return;const id=input.dataset.attach;const slot=input.closest('.church-doc-bundle-item');
      const span=slot.querySelector('span');span.textContent='올리는 중…';
      try{const fd=new FormData();fd.append('file',file);const h=docHeaders();h.delete('content-type');const r=await fetch(`${DOC_API}/${encodeURIComponent(id)}/attachment`,{method:'POST',headers:h,body:fd});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
        slot.replaceChildren();slot.classList.remove('church-doc-bundle-missing');await renderAttachment(slot,id);const k=missing.indexOf(bundle.items.find(x=>x.id===id)?.title);if(k>=0)missing.splice(k,1);printed++;report();void loadDocuments()}
      catch(err){span.textContent=`올리지 못했습니다: ${err.message}`}}));
    const report=()=>{status.textContent=`${printed}건 인쇄 준비 완료${missing.length?` · 원본 없음 ${missing.length}건(${missing.join(', ')})`:''}${failed.length?` · 오류 ${failed.length}건`:''}`;printBtn.disabled=printed===0};
    report();printBtn.focus();
  }
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.data?.type==='ekodi:church-doc-saved'&&document.querySelector('#churchDocumentsRoot'))void loadDocuments()});
  async function openDocEditor(id,opts={}){
    let doc;
    try{const r=await fetch(`${DOC_API}/${encodeURIComponent(id)}/content`,{headers:docHeaders(),cache:'no-store'});doc=await r.json().catch(()=>({}));if(!r.ok)throw new Error(doc.error||`HTTP ${r.status}`)}
    catch(err){alert(`문서를 열지 못했습니다: ${err.message}`);return}
    document.querySelector('#churchDocEditor')?.remove();
    const box=document.createElement('div');box.id='churchDocEditor';box.className='church-doc-editor';box.setAttribute('role','dialog');box.setAttribute('aria-label',doc.title);
    const w=doc.canWrite;
    box.innerHTML=`<div class="church-doc-editor-bar"><strong title="${esc(doc.title)}">${esc(doc.title)}</strong><span class="church-doc-editor-status" data-status>${w?'열림 · 고치면 자동 저장됩니다':'읽기 전용'}</span>
      <div class="church-doc-editor-tools">${w?`<button type="button" class="button" data-cmd="bold" title="굵게"><b>가</b></button><button type="button" class="button" data-cmd="underline" title="밑줄"><u>가</u></button><button type="button" class="button" data-cmd="red" title="빨간 글씨">빨강</button><button type="button" class="button" data-cmd="black" title="검은 글씨">검정</button><button type="button" class="button" data-cmd="undo" title="되돌리기">↶</button><button type="button" class="button primary" data-save>저장</button>`:''}<button type="button" class="button" data-print>인쇄</button><button type="button" class="button" data-close>닫기</button></div></div>
      <div class="church-doc-editor-scroll"><article class="church-doc-sheet" ${w?'contenteditable="true" spellcheck="false"':''}></article></div>`;
    document.body.append(box);document.body.classList.add('church-doc-editing');
    const sheet=box.querySelector('.church-doc-sheet'),status=box.querySelector('[data-status]');
    importDocHtml(sheet,doc.html);
    let base=doc.updatedAt,dirty=false,saving=false,timer=null;
    const stamp=t=>{try{return new Date(t).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}catch{return ''}};
    const setStatus=(t,bad)=>{status.textContent=t;status.classList.toggle('bad',Boolean(bad))};
    async function save(){
      if(!w||saving||!dirty)return true;saving=true;clearTimeout(timer);setStatus('저장 중…');
      try{const r=await fetch(`${DOC_API}/${encodeURIComponent(id)}/content`,{method:'PUT',headers:docHeaders(),body:JSON.stringify({html:sheet.innerHTML,baseUpdatedAt:base})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);base=d.updatedAt||base;dirty=false;setStatus(`저장됨 ${stamp(base)}`);return true}
      catch(err){setStatus(`저장 안 됨: ${err.message}`,true);return false}
      finally{saving=false}
    }
    if(w){
      sheet.addEventListener('input',()=>{dirty=true;setStatus('고치는 중… (잠시 멈추면 자동 저장)');clearTimeout(timer);timer=setTimeout(save,2500)});
      enableTableResize(sheet,()=>{sheet.dispatchEvent(new Event('input'))});
      enableTableArrows(sheet);
      try{document.execCommand('styleWithCSS',false,false)}catch{}
      box.querySelectorAll('[data-cmd]').forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));
      box.querySelectorAll('[data-cmd]').forEach(b=>b.addEventListener('click',()=>{const c=b.dataset.cmd;if(c==='red')markRed(sheet);else if(c==='black')unmarkRed(sheet);else document.execCommand(c);sheet.dispatchEvent(new Event('input'))}));
      box.querySelector('[data-save]').addEventListener('click',()=>{dirty=true;void save()});
      box.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();dirty=true;void save()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();e.stopPropagation();void doPrint()}});
      window.addEventListener('beforeunload',warn);
    }
    function warn(e){if(dirty){e.preventDefault();e.returnValue=''}}
    const doPrint=async()=>{if(dirty)await save();const b=document.body;b.classList.add('church-doc-printing','ekodi-allow-print');const done=()=>{b.classList.remove('church-doc-printing','ekodi-allow-print');window.removeEventListener('afterprint',done)};window.addEventListener('afterprint',done);window.print();setTimeout(done,60000)};
    box.querySelector('[data-print]').addEventListener('click',()=>{void doPrint()});
    box.querySelector('[data-close]').addEventListener('click',async()=>{if(dirty&&!(await save())&&!confirm('저장되지 않은 내용이 있습니다. 그래도 닫을까요?'))return;window.removeEventListener('beforeunload',warn);if(opts.standalone){try{window.opener?.postMessage({type:'ekodi:church-doc-saved',id},location.origin)}catch{}window.close();const u=new URL(location.href);u.searchParams.delete('edit');history.replaceState(null,'',u.toString())}box.remove();document.body.classList.remove('church-doc-editing');void loadDocuments()});
    if(opts.standalone)document.title=`${doc.title} · 문서 편집`;
    if(w)sheet.focus();
  }
  // 발급서류: 업로드해 두고 다음 제출 때 '최근서류'를 그대로 다시 쓴다.
  const ISSUED_API=`${API}/api/church/admin/reports/documents/issued`;
  const sizeText=n=>n>=1048576?(n/1048576).toFixed(1)+'MB':Math.max(1,Math.round(n/1024))+'KB';
  async function loadIssued(){
    const box=document.querySelector('#churchIssuedRoot');if(!box)return;
    let data;
    try{const r=await fetch(ISSUED_API,{headers:docHeaders(),cache:'no-store'});data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`)}
    catch(err){box.innerHTML=`<p class="empty">발급서류를 불러오지 못했습니다: ${esc(err.message)}</p>`;return}
    const docs=Array.isArray(data.documents)?data.documents:[];const types=Array.isArray(data.types)?data.types:[];
    const latest=docs.filter(d=>d.latest),history=docs.filter(d=>!d.latest);
    const row=d=>`<article class="church-doc-card"><div class="church-doc-card-head"><span class="church-doc-tag">${esc(d.type)}</span><span class="church-doc-year">${esc(d.issuedOn)}</span></div><h4>${esc(d.title||d.type)}</h4><p class="church-doc-note">${esc(d.holder||'-')}${d.note?` · ${esc(d.note)}`:''} · ${esc(sizeText(d.size))}</p><div class="church-doc-actions"><button class="button primary" type="button" data-issued-download="${esc(d.id)}" data-name="${esc(d.fileName)}">내려받기</button><button class="button quiet" type="button" data-issued-archive="${esc(d.id)}">내리기</button></div></article>`;
    box.innerHTML=`<p class="empty">건강보험료 납부확인서·소득금액증명·통장사본 등 발급받은 서류를 올려 두면, 종류·대상자별 가장 최근 발급분이 '최근서류'로 표시됩니다. 파일은 목회자 관리자만 내려받을 수 있습니다.</p>
      <div class="church-doc-grid">${latest.map(row).join('')||'<p class="empty">아직 올린 발급서류가 없습니다.</p>'}</div>
      ${history.length?`<details><summary>이전 발급분 ${history.length}건</summary><div class="church-doc-grid">${history.map(row).join('')}</div></details>`:''}
      <details class="church-doc-add"><summary>+ 발급서류 올리기</summary><form id="churchIssuedForm" class="church-doc-form"><label>종류<select name="type">${types.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label><label>대상자(예: 본인·배우자·교회)<input name="holder" maxlength="60"></label><label>발급일<input name="issuedOn" type="date" required></label><label>제목<input name="title" maxlength="200" placeholder="예: 2026년 11월 건강보험료 납부확인서"></label><label>파일(PDF·JPG·PNG, 10MB 이하)<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required></label><label>비고<input name="note" maxlength="500"></label><button class="button primary" type="submit">올리기</button><p class="empty" data-issued-status></p></form></details>`;
    box.querySelectorAll('[data-issued-download]').forEach(button=>button.addEventListener('click',async()=>{
      try{const r=await fetch(`${ISSUED_API}/${encodeURIComponent(button.dataset.issuedDownload)}/file`,{headers:docHeaders(),cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=button.dataset.name||'document';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
      catch(err){alert(`내려받기 실패: ${err.message}`)}}));
    box.querySelectorAll('[data-issued-archive]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('이 발급서류를 목록에서 내릴까요?'))return;try{const r=await fetch(`${ISSUED_API}/${encodeURIComponent(button.dataset.issuedArchive)}/archive`,{method:'POST',headers:docHeaders()});if(!r.ok)throw new Error(`HTTP ${r.status}`);await loadIssued()}catch(err){alert(`처리 실패: ${err.message}`)}}));
    box.querySelector('#churchIssuedForm')?.addEventListener('submit',async event=>{event.preventDefault();const status=box.querySelector('[data-issued-status]');status.textContent='올리는 중입니다…';
      const headers=new Headers();if(token())headers.set('authorization',`Bearer ${token()}`);
      try{const r=await fetch(ISSUED_API,{method:'POST',headers,body:new FormData(event.target)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);await loadIssued()}
      catch(err){status.textContent=`올리기 실패: ${err.message}`}});
  }
  
  window.addEventListener('ekodi:church-documents-ready',loadDocuments);
})();
