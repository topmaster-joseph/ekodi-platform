const cfg=window.EKODI_MY_CONFIG||{};
const API_ROOT=String(cfg.personalFinanceApi||'https://personal-finance-api.ekodi.kr').replace(/\/$/,'');
const API=`${API_ROOT}/api/finance/personal`;
const root=document.querySelector('#personalFinanceApp');
const money=v=>`${Number(v||0).toLocaleString('ko-KR')}원`;
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const token=()=>window.EKODI_MY_AUTH?.getAccessToken?.()||'';
let state={summary:null,accounts:[],transactions:[],controls:null,insights:[],planning:null,pendingRows:[],pendingFile:''};

function authHref(){
  const target=new URL(cfg.authUrl||'https://auth.ekodi.kr/?site=my');
  target.searchParams.set('site','my');
  target.searchParams.set('return_to',`${location.origin}${location.pathname}#money`);
  return target.href;
}
async function api(path,options={}){
  const access=token();
  if(!access)throw Object.assign(new Error('로그인이 필요합니다.'),{code:'PF_AUTH_REQUIRED'});
  const response=await fetch(`${API}${path}`,{...options,cache:'no-store',headers:{authorization:`Bearer ${access}`,'content-type':'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||'개인재무 요청을 처리하지 못했습니다.'),{code:data.code||`HTTP_${response.status}`});
  return data;
}
function status(text,kind=''){
  const el=document.querySelector('#financeStatus');if(!el)return;
  el.className=`finance-status ${kind}`.trim();el.textContent=text;
}
function signedOut(){
  root.innerHTML=`<div class="finance-empty"><strong>로그인 후 나의 재무를 엽니다.</strong><p>개인재무 원장은 다른 Workspace와 분리되어 있으며, 연결하지 않은 금융기관 데이터는 읽지 않습니다.</p><a class="primary" href="${esc(authHref())}">Google로 시작</a></div>`;
  status('로그인 필요');
}
function summaryHtml(s){
  const safe=state.planning?.safeToSpend?.safeToSpend;
  return `<div class="finance-metrics">
    <article><small>총자산</small><strong>${money(s.assets)}</strong></article>
    <article><small>총부채</small><strong>${money(s.liabilities)}</strong></article>
    <article><small>순자산</small><strong>${money(s.netWorth)}</strong></article>
    <article><small>이번 달 수입</small><strong>${money(s.month?.inflow)}</strong></article>
    <article><small>이번 달 지출</small><strong>${money(s.month?.outflow)}</strong></article>
    <article><small>안전사용가능액</small><strong>${safe==null?'계산 준비':money(safe)}</strong></article>
  </div>`;
}
function accountOptions(selected=''){
  return state.accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===selected?'selected':''}>${esc(a.institutionName||'')} ${esc(a.accountAlias)} · ${money(a.currentBalance)}</option>`).join('');
}
function accountList(){
  if(!state.accounts.length)return '<div class="finance-empty compact"><strong>아직 등록된 계좌가 없습니다.</strong><p>계좌번호 전체가 아니라 별칭·기관·잔액·끝 4자리만 저장할 수 있습니다.</p></div>';
  return `<div class="finance-list">${state.accounts.map(a=>`<article><div><small>${esc(a.accountType)} · ${a.balanceRole==='liability'?'부채':'자산'}</small><strong>${esc(a.institutionName)} ${esc(a.accountAlias)}</strong><span>${a.last4?`끝 ${esc(a.last4)}`:'식별번호 미저장'} · ${esc(a.sourceType)}</span></div><b>${money(a.currentBalance)}</b></article>`).join('')}</div>`;
}
function transactionList(){
  if(!state.transactions.length)return '<div class="finance-empty compact"><strong>아직 거래가 없습니다.</strong><p>수동 입력 또는 파일 가져오기 후 실제 거래만 표시합니다.</p></div>';
  const accounts=new Map(state.accounts.map(a=>[a.id,a.accountAlias]));
  return `<div class="finance-list transactions">${state.transactions.slice(0,30).map(t=>`<article><div><small>${esc(t.transactionDate)} · ${esc(accounts.get(t.accountId)||'계좌')}</small><strong>${esc(t.merchantOriginal||t.memo||'거래')}</strong><span>${esc(t.sourceType)}${t.memo?` · ${esc(t.memo)}`:''}</span></div><b class="${t.direction==='OUTFLOW'?'outflow':'inflow'}">${t.direction==='OUTFLOW'?'-':'+'}${money(t.amount)}</b></article>`).join('')}</div>`;
}
function insightList(){
  if(!state.insights.length)return '<div class="finance-empty compact"><strong>아직 근거 기반 인사이트가 없습니다.</strong><p>거래와 잔액이 쌓인 뒤 근거가 연결된 제안만 여기에 표시됩니다.</p></div>';
  return `<div class="finance-insights">${state.insights.map(i=>`<article><small>${esc(i.severity)} · ${esc(i.insightType)}</small><strong>${esc(i.title)}</strong><p>${esc(i.summary)}</p>${Number.isFinite(Number(i.confidence))?`<span>신뢰도 ${Math.round(Number(i.confidence)*100)}%</span>`:''}</article>`).join('')}</div>`;
}
function controlsHtml(){
  const c=state.controls||{};
  return `<div class="finance-safety"><span>행동 상한 <b>${esc(c.actionCeiling||'L2')}</b></span><span>금융 실행 <b>${c.financialExecution?'허용':'차단'}</b></span><span>외부 연결 <b>${(c.connections||[]).length}개</b></span><span>동의 <b>${(c.consents||[]).filter(v=>v.status==='GRANTED').length}개</b></span></div>`;
}
function formsHtml(){
  return `<div class="finance-forms">
    <details><summary>계좌 추가</summary><form id="financeAccountForm" class="finance-form">
      <label>기관<input name="institutionName" maxlength="120" placeholder="예: NH농협"></label><label>별칭<input name="accountAlias" maxlength="120" required placeholder="생활비"></label>
      <label>유형<select name="accountType"><option>BANK</option><option>CASH</option><option>CARD</option><option>SAVINGS</option><option>INVESTMENT</option><option>LOAN</option><option>INSURANCE</option><option>OTHER</option></select></label>
      <label>구분<select name="balanceRole"><option value="asset">자산</option><option value="liability">부채</option></select></label><label>현재 잔액<input name="currentBalance" type="number" min="0" step="1" value="0" required></label><label>끝 4자리<input name="last4" inputmode="numeric" maxlength="4" pattern="[0-9]{0,4}" placeholder="선택"></label>
      <button class="primary" type="submit">계좌 저장</button></form></details>
    <details><summary>거래 직접 입력</summary><form id="financeTransactionForm" class="finance-form">
      <label>계좌<select name="accountId" required>${accountOptions()}</select></label><label>날짜<input name="transactionDate" type="date" required></label><label>구분<select name="direction"><option value="OUTFLOW">지출</option><option value="INFLOW">수입</option><option value="TRANSFER">이체</option></select></label><label>금액<input name="amount" type="number" min="1" step="1" required></label><label>거래처·내용<input name="merchant" maxlength="240"></label><label>메모<input name="memo" maxlength="500"></label>
      <button class="primary" type="submit" ${state.accounts.length?'':'disabled'}>거래 저장</button></form></details>
  </div>`;
}
function importHtml(){
  const ready=state.accounts.length>0;
  return `<div class="finance-import"><div><strong>거래 파일 가져오기</strong><p>CSV·Excel을 브라우저에서 읽어 필요한 열만 정규화한 뒤, 서버가 중복을 다시 검사합니다. 한 번에 최대 500건입니다.</p></div><div class="finance-import-controls"><select id="financeImportAccount" ${ready?'':'disabled'}>${accountOptions()}</select><input id="financeImportFile" type="file" accept=".csv,.xlsx,.xls" ${ready?'':'disabled'}><button id="financeImportPreview" class="secondary" type="button" ${ready?'':'disabled'}>미리보기</button><button id="financeImportCommit" class="primary" type="button" disabled>가져오기 확정</button></div><div id="financeImportResult" class="finance-import-result"></div></div>`;
}
function planningHtml(){
  const p=state.planning||{},safe=p.safeToSpend||{},settings=p.settings||{minimumReserve:0,windowDays:30},recurring=p.recurring||[],budgets=p.budgets||[],goals=p.goals||[];
  const recurringHtml=recurring.length?`<div class="finance-list">${recurring.map(r=>`<article><div><small>${esc(r.frequency)} · ${esc(r.nextDueDate)} · ${r.essential?'필수':'선택'}</small><strong>${esc(r.name)}</strong><span>${r.direction==='OUTFLOW'?'지출':'수입'} · ${money(r.amount)}</span></div><button class="secondary" type="button" data-plan-off="recurring" data-id="${esc(r.id)}">비활성화</button></article>`).join('')}</div>`:'<div class="finance-empty compact"><strong>등록된 반복 일정이 없습니다.</strong></div>';
  const budgetHtml=budgets.length?`<div class="finance-list">${budgets.map(b=>`<article><div><small>월 예산 · 사용 ${money(b.spentAmount)}</small><strong>${esc(b.name)}</strong><span>한도 ${money(b.limitAmount)} · 남음 ${money(b.remainingAmount)}</span></div><button class="secondary" type="button" data-plan-off="budgets" data-id="${esc(b.id)}">비활성화</button></article>`).join('')}</div>`:'<div class="finance-empty compact"><strong>등록된 월 예산이 없습니다.</strong></div>';
  const goalHtml=goals.length?`<div class="finance-list">${goals.map(g=>`<article><div><small>${esc(g.goalType)} · 우선순위 ${esc(g.priority)}${g.committed?' · 안전사용액 반영':''}</small><strong>${esc(g.name)}</strong><span>${money(g.currentAmount)} / ${money(g.targetAmount)}${g.targetDate?` · ${esc(g.targetDate)}`:''}</span></div><button class="secondary" type="button" data-plan-off="goals" data-id="${esc(g.id)}">비활성화</button></article>`).join('')}</div>`:'<div class="finance-empty compact"><strong>등록된 재무 목표가 없습니다.</strong></div>';
  return `<div class="finance-subhead"><h3>계획 기반 재무 엔진</h3><span>예상수입 미포함 · ${esc(safe.dataReadiness||'EMPTY')}</span></div><div class="finance-safety"><span>현금성 자산 <b>${money(safe.liquidAssets)}</b></span><span>최소 예비금 <b>${money(safe.minimumReserve)}</b></span><span>${safe.windowDays||30}일 예정지출 <b>${money(safe.scheduledOutflows)}</b></span><span>목표 약정액 <b>${money(safe.committedGoalContribution)}</b></span><span>예상수입 <b>계산 제외</b></span></div><div class="finance-columns"><section><div class="finance-subhead"><h3>반복 수입·지출</h3><span>${recurring.length}개</span></div>${recurringHtml}</section><section><div class="finance-subhead"><h3>월 예산</h3><span>${budgets.length}개</span></div>${budgetHtml}</section></div><div class="finance-subhead"><h3>재무 목표</h3><span>${goals.length}개</span></div>${goalHtml}${planningForms(settings)}`;
}
function planningForms(settings){
  return `<div class="finance-forms planning-forms"><details><summary>안전사용 기준</summary><form id="financeSettingsForm" class="finance-form"><label>최소 예비금<input name="minimumReserve" type="number" min="0" step="1" value="${Number(settings.minimumReserve||0)}" required></label><label>계산 기간(일)<input name="windowDays" type="number" min="1" max="90" step="1" value="${Number(settings.windowDays||30)}" required></label><button class="primary" type="submit">기준 저장</button></form></details><details><summary>반복 일정 추가</summary><form id="financeRecurringForm" class="finance-form"><label>이름<input name="name" maxlength="160" required placeholder="예: 보험료"></label><label>금액<input name="amount" type="number" min="1" step="1" required></label><label>구분<select name="direction"><option value="OUTFLOW">지출</option><option value="INFLOW">수입</option></select></label><label>주기<select name="frequency"><option value="MONTHLY">매월</option><option value="WEEKLY">매주</option><option value="YEARLY">매년</option><option value="ONE_TIME">1회</option></select></label><label>다음 예정일<input name="nextDueDate" type="date" required></label><label><input name="essential" type="checkbox" checked> 필수 예정지출</label><button class="primary" type="submit">일정 저장</button></form></details><details><summary>월 예산 추가</summary><form id="financeBudgetForm" class="finance-form"><label>이름<input name="name" maxlength="160" required placeholder="예: 이번 달 생활비"></label><label>월 한도<input name="limitAmount" type="number" min="1" step="1" required></label><button class="primary" type="submit">예산 저장</button></form></details><details><summary>재무 목표 추가</summary><form id="financeGoalForm" class="finance-form"><label>목표명<input name="name" maxlength="160" required></label><label>유형<select name="goalType"><option value="SAVINGS">저축</option><option value="DEBT_REPAYMENT">부채상환</option><option value="RESERVE">비상예비금</option><option value="PURCHASE">구매</option><option value="OTHER">기타</option></select></label><label>목표금액<input name="targetAmount" type="number" min="1" step="1" required></label><label>현재금액<input name="currentAmount" type="number" min="0" step="1" value="0"></label><label>목표일<input name="targetDate" type="date"></label><label>우선순위<input name="priority" type="number" min="1" max="5" value="3"></label><label><input name="committed" type="checkbox"> 안전사용액 계산에 반영</label><button class="primary" type="submit">목표 저장</button></form></details></div>`;
}
function render(){
  if(!root)return;
  if(!token()){signedOut();return;}
  const s=state.summary||{assets:0,liabilities:0,netWorth:0,month:{inflow:0,outflow:0}};
  root.innerHTML=`${summaryHtml(s)}${controlsHtml()}${planningHtml()}<div class="finance-columns"><section><div class="finance-subhead"><h3>내 계좌</h3><span>${state.accounts.length}개</span></div>${accountList()}</section><section><div class="finance-subhead"><h3>최근 거래</h3><span>${state.transactions.length}건</span></div>${transactionList()}</section></div>${formsHtml()}${importHtml()}<div class="finance-subhead"><h3>근거 기반 재무 AI 인사이트</h3><span>읽기·추천 전용</span></div>${insightList()}`;
  bind();
  status('실제 개인원장 연결됨','ok');
}
async function load(){
  if(!root)return;
  if(!token()){signedOut();return;}
  status('개인재무 불러오는 중');
  try{
    const [summary,accounts,transactions,controls,insights,planning]=await Promise.all([api('/summary'),api('/accounts'),api('/transactions?limit=50'),api('/controls'),api('/insights'),api('/planning')]);
    state={...state,summary,accounts:accounts.accounts||[],transactions:transactions.transactions||[],controls,insights:insights.insights||[],planning};
    render();
  }catch(error){root.innerHTML=`<div class="finance-empty"><strong>개인재무를 불러오지 못했습니다.</strong><p>${esc(error.message)}</p><button id="financeRetry" class="secondary" type="button">다시 시도</button></div>`;document.querySelector('#financeRetry')?.addEventListener('click',load);status(error.code||'연결 확인 필요','error')}
}
function cleanDate(value){
  const s=String(value??'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  if(/^\d{8}$/.test(s))return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  const m=s.match(/(\d{4})[.\/]\s*(\d{1,2})[.\/]\s*(\d{1,2})/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return '';
}
function numberValue(v){const n=Number(String(v??'').replace(/[₩,\s]/g,'').replace(/^-/,''));return Number.isFinite(n)?Math.trunc(Math.abs(n)):0}
function normalizedKey(k){return String(k??'').toLowerCase().replace(/[\s_()\-\/]/g,'')}
function pick(row,names){const map=new Map(Object.entries(row||{}).map(([k,v])=>[normalizedKey(k),v]));for(const n of names){const v=map.get(normalizedKey(n));if(v!==undefined&&String(v).trim()!=='')return v}return ''}
function normalizeImportedRow(row){
  const transactionDate=cleanDate(pick(row,['transactionDate','date','거래일','거래일자','일자','승인일','이용일']));
  let direction=String(pick(row,['direction','구분','거래구분','입출금구분'])).toUpperCase().trim();
  const inflow=numberValue(pick(row,['inflow','입금','입금액','수입','받은금액']));const outflow=numberValue(pick(row,['outflow','출금','출금액','지출','사용금액','결제금액']));
  if(/입금|수입|받/.test(direction))direction='INFLOW';else if(/출금|지출|결제|사용/.test(direction))direction='OUTFLOW';else if(/이체/.test(direction))direction='TRANSFER';
  let amount=numberValue(pick(row,['amount','금액','거래금액','이용금액']));if(!amount)amount=inflow||outflow;if(!direction)direction=inflow?'INFLOW':outflow?'OUTFLOW':'';
  if(!transactionDate||!['INFLOW','OUTFLOW','TRANSFER'].includes(direction)||!amount)return null;
  return{transactionDate,direction,amount,currency:'KRW',merchantOriginal:String(pick(row,['merchant','merchantOriginal','거래처','가맹점','적요','내용','거래내용','사용처'])).slice(0,240),memo:String(pick(row,['memo','메모','비고'])).slice(0,500),sourceReference:String(pick(row,['sourceReference','승인번호','거래번호','참조번호'])).slice(0,240)};
}
function csvRows(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);row=[];cell=''}else cell+=ch}
  row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);if(rows.length<2)return[];
  const headers=rows[0].map(v=>String(v).replace(/^\uFEFF/,'').trim());return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}
async function fileRows(file){
  if(file.size>5*1024*1024)throw new Error('파일은 5MB 이하로 나누어 주세요.');
  const ext=file.name.toLowerCase().split('.').pop();
  if(ext==='csv')return csvRows(await file.text());
  if(ext==='xlsx'||ext==='xls'){
    const XLSX=await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const book=XLSX.read(await file.arrayBuffer(),{type:'array'});const sheet=book.Sheets[book.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
  }
  throw new Error('CSV 또는 Excel 파일만 사용할 수 있습니다.');
}
async function previewFile(){
  const file=document.querySelector('#financeImportFile')?.files?.[0];const accountId=document.querySelector('#financeImportAccount')?.value;
  if(!file||!accountId){status('파일과 계좌를 선택해 주세요.','error');return}
  status('파일을 안전하게 읽는 중');
  try{const raw=await fileRows(file);const normalized=raw.map(normalizeImportedRow).filter(Boolean).slice(0,500);if(!normalized.length)throw new Error('인식 가능한 거래 행이 없습니다. 날짜·금액·구분 열을 확인해 주세요.');const preview=await api('/import/preview',{method:'POST',body:JSON.stringify({accountId,rows:normalized})});state.pendingRows=normalized;state.pendingFile=file.name;const box=document.querySelector('#financeImportResult');box.innerHTML=`<strong>${esc(file.name)}</strong><span>원본 ${raw.length}행 · 인식 ${preview.valid} · 중복 ${preview.duplicates} · 제외 ${preview.invalid}${raw.length>500?' · 첫 500행만 처리':''}</span>`;document.querySelector('#financeImportCommit').disabled=false;status('미리보기 완료','ok')}catch(e){state.pendingRows=[];state.pendingFile='';document.querySelector('#financeImportCommit').disabled=true;status(e.message,'error')}
}
async function commitFile(){
  const accountId=document.querySelector('#financeImportAccount')?.value;if(!state.pendingRows.length||!accountId)return;
  status('중복을 다시 확인하고 저장하는 중');
  try{const result=await api('/import/commit',{method:'POST',body:JSON.stringify({accountId,rows:state.pendingRows,sourceType:'CSV',sourceLabel:state.pendingFile})});state.pendingRows=[];state.pendingFile='';status(`${result.imported}건 저장 · 중복 ${result.duplicatesSkipped}건 제외`,'ok');await load()}catch(e){status(e.message,'error')}
}
function bind(){
  document.querySelector('#financeAccountForm')?.addEventListener('submit',async event=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));d.currentBalance=Number(d.currentBalance||0);status('계좌 저장 중');try{await api('/accounts',{method:'POST',body:JSON.stringify(d)});status('계좌가 저장되었습니다.','ok');await load()}catch(e){status(e.message,'error')}});
  document.querySelector('#financeTransactionForm')?.addEventListener('submit',async event=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));d.amount=Number(d.amount||0);status('거래 저장 중');try{await api('/transactions',{method:'POST',body:JSON.stringify(d)});status('거래가 저장되었습니다.','ok');await load()}catch(e){status(e.message,'error')}});
  document.querySelector('#financeImportPreview')?.addEventListener('click',previewFile);
  document.querySelector('#financeImportCommit')?.addEventListener('click',commitFile);
document.querySelector('#financeSettingsForm')?.addEventListener('submit',async event=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));d.minimumReserve=Number(d.minimumReserve||0);d.windowDays=Number(d.windowDays||30);status('안전사용 기준 저장 중');try{await api('/planning/settings',{method:'PUT',body:JSON.stringify(d)});status('안전사용 기준이 저장되었습니다.','ok');await load()}catch(e){status(e.message,'error')}});
  document.querySelector('#financeRecurringForm')?.addEventListener('submit',async event=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));d.amount=Number(d.amount||0);d.essential=Boolean(event.currentTarget.elements.essential?.checked);status('반복 일정 저장 중');try{await api('/recurring',{method:'POST',body:JSON.stringify(d)});status('반복 일정이 저장되었습니다.','ok');await load()}catch(e){status(e.message,'error')}});
  document.querySelector('#financeBudgetForm')?.addEventListener('submit',async event=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));d.limitAmount=Number(d.limitAmount||0);status('월 예산 저장 중');try{await api('/budgets',{method:'POST',body:JSON.stringify(d)});status('월 예산이 저장되었습니다.','ok');await load()}catch(e){status(e.message,'error')}});
  document.querySelector('#financeGoalForm')?.addEventListener('submit',async event=>{event.preventDefault();const d=Object.fromEntries(new FormData(event.currentTarget));d.targetAmount=Number(d.targetAmount||0);d.currentAmount=Number(d.currentAmount||0);d.priority=Number(d.priority||3);d.committed=Boolean(event.currentTarget.elements.committed?.checked);status('재무 목표 저장 중');try{await api('/goals',{method:'POST',body:JSON.stringify(d)});status('재무 목표가 저장되었습니다.','ok');await load()}catch(e){status(e.message,'error')}});
  for(const button of document.querySelectorAll('[data-plan-off]'))button.addEventListener('click',async()=>{const kind=button.dataset.planOff,id=button.dataset.id;if(!kind||!id)return;status('계획 항목 비활성화 중');try{await api(`/${kind}`,{method:'PUT',body:JSON.stringify({id,active:false})});status('계획 항목이 비활성화되었습니다.','ok');await load()}catch(e){status(e.message,'error')}});
  const recurringDate=document.querySelector('#financeRecurringForm [name="nextDueDate"]');if(recurringDate&&!recurringDate.value)recurringDate.value=new Date().toLocaleDateString('sv-SE');
  const date=document.querySelector('#financeTransactionForm [name="transactionDate"]');if(date&&!date.value)date.value=new Date().toLocaleDateString('sv-SE');
}
for(const trigger of document.querySelectorAll('[data-finance-open]'))trigger.addEventListener('click',()=>document.querySelector('#money')?.scrollIntoView({behavior:'smooth'}));
window.addEventListener('ekodi:my-session',()=>void load());
void load();
