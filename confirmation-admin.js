(()=>{
'use strict';
const SECTION='confirmations',BASE='/api/control/confirmations';
let root=null,kind='payment',workspaces=[],records=[];
const $=(selector,host=root)=>host?.querySelector(selector);
const ae=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=value=>new Intl.NumberFormat('ko-KR').format(Number(value||0));
const statusLabel={draft:'작성중',confirmation_pending:'확인대기',confirmed:'확인완료',issued:'발급완료',cancelled:'취소'};
const kindLabel={payment:'지급',receipt:'수령'};
const methodLabel={bank_transfer:'계좌이체',cash:'현금',card:'카드',goods:'물품',service:'서비스',other:'기타'};

function authHeaders(){
  const token=sessionStorage.getItem('ekodi-auth-token')||localStorage.getItem('ekodi-auth-token')||'';
  return {'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})};
}
async function api(path='',options={}){
  const response=await fetch(BASE+path,{...options,headers:{...authHeaders(),...(options.headers||{})},cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(data.error||('요청 실패 '+response.status)),{status:response.status,code:data.code});
  return data;
}
function installStyle(){
  if(document.querySelector('link[data-ekodi-confirmation-admin]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href='/confirmation-admin.css';link.dataset.ekodiConfirmationAdmin='true';document.head.append(link);
}
function panel(){
  let host=document.querySelector('[data-panel~="confirmations"]');
  if(host)return host;
  const content=document.querySelector('.content')||document.querySelector('main')||document.body;
  host=document.createElement('section');host.className='panel hidden-panel';host.hidden=true;host.dataset.panel='confirmations';content.append(host);return host;
}
function today(){return new Date().toISOString().slice(0,10)}
function workspaceOptions(){
  return workspaces.map(w=>`<option value="${ae(w.slug)}">${ae(w.name||w.slug)} · ${ae(w.slug)}</option>`).join('');
}
function formHtml(){
  return `<section class="confirmation-card"><h3>${kind==='payment'?'지급확인 등록':'수령확인 등록'}</h3><form class="confirmation-form" data-confirmation-form>
    <label class="confirmation-span">운영공간<select name="workspaceSlug" required><option value="">선택</option>${workspaceOptions()}</select></label>
    <label>지급자<input name="payerName" required maxlength="160" placeholder="지급 주체"></label>
    <label>수령자<input name="recipientName" required maxlength="160" placeholder="수령 주체"></label>
    <label>유형<select name="valueType"><option value="money">금전</option><option value="goods">물품</option><option value="service">서비스</option><option value="support">지원</option><option value="other">기타</option></select></label>
    <label>지급 방법<select name="method"><option value="bank_transfer">계좌이체</option><option value="cash">현금</option><option value="card">카드</option><option value="goods">물품</option><option value="service">서비스</option><option value="other">기타</option></select></label>
    <label>금액<input name="amount" inputmode="decimal" placeholder="예: 100000"></label>
    <label>통화<input name="currency" value="KRW" maxlength="3"></label>
    <label class="confirmation-span">물품·서비스 설명<input name="valueDescription" maxlength="500" placeholder="금전 외 지급 또는 보충 설명"></label>
    <label class="confirmation-span">목적<input name="purpose" required maxlength="500" placeholder="예: 행사 강사 사례비"></label>
    <label>지급·수령일<input name="occurredAt" type="date" value="${today()}"></label>
    <label>연결 거래번호<input name="transactionId" maxlength="80" placeholder="비우면 자동 생성"></label>
    <label class="confirmation-span">메모<textarea name="note" maxlength="1000"></textarea></label>
    <div class="confirmation-actions"><button class="primary" type="submit">${kind==='payment'?'지급확인서 작성':'수령확인서 작성'}</button></div>
  </form><p class="confirmation-note" data-confirmation-note></p></section>`;
}
function actionButtons(item){
  const out=[];
  if(item.kind==='receipt'&&['draft','confirmation_pending'].includes(item.status))out.push(`<button data-action="request" data-id="${ae(item.id)}">확인요청</button>`);
  if((item.kind==='payment'&&item.status==='draft')||(item.kind==='receipt'&&item.status==='confirmed'))out.push(`<button data-action="issue" data-id="${ae(item.id)}">발급</button>`);
  if(item.status==='issued'&&item.documentUrl)out.push(`<button data-action="document" data-url="${ae(item.documentUrl)}">문서</button>`);
  if(item.status!=='cancelled')out.push(`<button data-action="counterpart" data-id="${ae(item.id)}">${item.kind==='payment'?'수령 연결':'지급 연결'}</button>`);
  if(item.status!=='cancelled')out.push(`<button data-action="cancel" data-id="${ae(item.id)}">취소</button>`);
  return out.join('');
}
function amountText(item){return item.amount?`${ae(item.amount)} ${ae(item.currency)}`:ae(item.valueDescription||'-')}
function tableHtml(){
  const rows=records.map(item=>`<tr><td>${ae(item.workspaceName||item.workspaceSlug)}</td><td>${kindLabel[item.kind]||item.kind}</td><td><strong>${ae(item.documentNumber)}</strong><br><small>${ae(item.transactionId)}</small></td><td>${ae(item.payerName)} → ${ae(item.recipientName)}<br><small>${ae(item.purpose)}</small></td><td>${amountText(item)}</td><td><span class="confirmation-status ${ae(item.status)}">${statusLabel[item.status]||ae(item.status)}</span></td><td>${item.occurredAt?ae(item.occurredAt.slice(0,10)):'-'}</td><td><div class="confirmation-row-actions">${actionButtons(item)}</div></td></tr>`).join('');
  return `<section class="confirmation-card"><div class="confirmation-tools"><input data-filter-q placeholder="문서번호·거래번호·이름·목적 검색"><select data-filter-workspace><option value="">전체 운영공간</option>${workspaceOptions()}</select><select data-filter-status><option value="">전체 상태</option><option value="draft">작성중</option><option value="confirmation_pending">확인대기</option><option value="confirmed">확인완료</option><option value="issued">발급완료</option><option value="cancelled">취소</option></select><button data-filter-search>검색</button></div><div class="confirmation-table"><table><thead><tr><th>운영공간</th><th>구분</th><th>문서·거래번호</th><th>지급자 → 수령자</th><th>금액·내용</th><th>상태</th><th>일자</th><th>조치</th></tr></thead><tbody>${rows||'<tr><td colspan="8">등록된 확인서가 없습니다.</td></tr>'}</tbody></table></div></section>`;
}
function render(data={summary:{}}){
  const s=data.summary||{};
  root.innerHTML=`<div class="confirmation-admin"><div class="confirmation-head"><div><h2>지급 · 수령 확인</h2><p>업무·문서 흐름은 분리하고 동일 거래번호로 필요할 때만 연결합니다.</p></div><div class="confirmation-tabs"><button data-kind="payment" class="${kind==='payment'?'active':''}">지급</button><button data-kind="receipt" class="${kind==='receipt'?'active':''}">수령</button></div></div><div class="confirmation-summary"><article><small>조회 건수</small><strong>${fmt(s.total)}</strong></article><article><small>지급</small><strong>${fmt(s.payment)}</strong></article><article><small>수령</small><strong>${fmt(s.receipt)}</strong></article><article><small>확인대기</small><strong>${fmt(s.pending)}</strong></article><article><small>발급완료</small><strong>${fmt(s.issued)}</strong></article></div><div class="confirmation-layout">${formHtml()}${tableHtml()}</div><div class="confirmation-boundary">지급확인서와 수령확인서는 사실확인용 내부 증빙입니다. 세금계산서·현금영수증·급여명세서 등 법정 세무증빙은 별도 세금·증빙 서비스와 연결해 관리합니다.</div></div>`;
  bind();
}
async function load(filters={}){
  const params=new URLSearchParams({kind,...filters});const data=await api('?'+params.toString());records=data.records||[];render(data);
}
function note(message,link=''){
  const el=$('[data-confirmation-note]');if(!el)return;el.innerHTML=link?`${ae(message)} <a href="${ae(link)}" target="_blank" rel="noopener">${ae(link)}</a>`:ae(message);
}
function bind(){
  root.querySelectorAll('[data-kind]').forEach(btn=>btn.onclick=async()=>{kind=btn.dataset.kind;await load()});
  $('[data-confirmation-form]').onsubmit=async event=>{
    event.preventDefault();const body=Object.fromEntries(new FormData(event.currentTarget).entries());body.kind=kind;
    try{note('저장 중…');const data=await api('',{method:'POST',body:JSON.stringify(body)});note(`${data.record.documentNumber} 작성 완료`);await load()}catch(error){note(error.message)}
  };
  $('[data-filter-search]').onclick=()=>load({q:$('[data-filter-q]').value,workspace:$('[data-filter-workspace]').value,status:$('[data-filter-status]').value});
  root.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=async()=>{
    const action=btn.dataset.action,id=btn.dataset.id;
    if(action==='document'){window.open(btn.dataset.url,'_blank','noopener');return}
    if(action==='cancel'&&!confirm('이 확인서를 취소하시겠습니까?'))return;
    try{
      note('처리 중…');
      const data=await api('/'+encodeURIComponent(id)+'/'+action,{method:'POST',body:'{}'});
      if(action==='request'){const link=data.acceptanceUrl||'';if(link&&navigator.clipboard?.writeText)await navigator.clipboard.writeText(link).catch(()=>{});note('수령 확인 링크를 생성했습니다. 링크를 복사해 수령자에게 전달하세요.',link);return}
      if(action==='issue'&&data.record?.documentUrl){window.open(data.record.documentUrl,'_blank','noopener')}
      if(action==='counterpart')kind=data.record?.kind||kind;
      await load();
    }catch(error){note(error.message)}
  });
}
async function mount(){
  installStyle();root=panel();root.hidden=false;root.classList.remove('hidden-panel');
  root.innerHTML='<p>지급·수령 확인 엔진을 불러오는 중입니다.</p>';
  try{const data=await api('/workspaces');workspaces=data.workspaces||[];await load()}catch(error){root.innerHTML=`<div class="confirmation-card"><h3>지급 · 수령 확인</h3><p>${ae(error.message)}</p></div>`}
}
function activate(){mount()}
window.EKODIConfirmationAdmin={activate,mount};
window.addEventListener('ekodi-admin-section-changed',event=>{if(event.detail?.section===SECTION)activate()});
if(location.hash.toLowerCase()==='#confirmations')queueMicrotask(activate);
})();