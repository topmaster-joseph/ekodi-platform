const API='/api/finance/banking';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const krw=value=>`${Math.round(Number(value)||0).toLocaleString('ko-KR')}원`;
const dateText=value=>{if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'})};
const statusLabel=value=>({pending:'연결대기',active:'연결됨',disconnected:'연결끊김',error:'오류',requested:'승인대기',approved:'승인완료',rejected:'반려',executing:'이체중',completed:'이체완료',failed:'실패',cancelled:'취소'})[value]||value||'—';
const dirLabel=value=>value==='in'?'입금':'출금';
const tag=value=>`<span class="tag ${['active','completed','approved'].includes(value)?'live':['failed','error','rejected'].includes(value)?'warn':''}">${esc(statusLabel(value))}</span>`;

export async function mountTenantBankingAdmin({root,summaryRoot,getToken,workspace,state=()=>{},mode='workspace'}){
  if(!root||!summaryRoot||typeof getToken!=='function')throw new Error('BANKING_UI_TARGET_REQUIRED');
  const scope=String(workspace||'').trim().toLowerCase();
  const headers=async(body=false)=>{
    const token=await getToken();
    if(!token)throw Object.assign(new Error('로그인이 필요합니다.'),{status:401});
    return {authorization:`Bearer ${token}`,'x-ekodi-workspace':scope,...(body?{'content-type':'application/json'}:{})};
  };
  const request=async(path='',options={})=>{
    const url=new URL(API+path,location.origin);
    if(scope)url.searchParams.set('workspace',scope);
    const h=await headers(Boolean(options.body));
    if(options.idempotencyKey)h['idempotency-key']=options.idempotencyKey;
    const response=await fetch(url,{...options,headers:{...h,...(options.headers||{})},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||`Finance Banking ${response.status}`),{status:response.status,data});
    return data;
  };
  const accountName=(item,map)=>map.get(item.bankConnectionId)||'계좌';
  const notice=(text,kind='')=>{
    let node=root.querySelector('[data-banking-message]');
    if(!node){node=document.createElement('p');node.dataset.bankingMessage='1';node.className='trade-flash';root.prepend(node);}
    node.className=`trade-flash ${kind}`;node.textContent=text;
  };
  const render=async()=>{
    state('통장 · 이체 확인 중');
    const data=await request('/overview');
    const accounts=Array.isArray(data.accounts)?data.accounts:[];
    const transactions=Array.isArray(data.transactions)?data.transactions:[];
    const transfers=Array.isArray(data.transfers)?data.transfers:[];
    const caps=data.capabilities||{},ready=data.readiness||{};
    const accountMap=new Map(accounts.map(a=>[a.id,`${a.institutionName||a.provider||'금융기관'} · ${a.accountAlias}${a.accountLast4?` ****${a.accountLast4}`:''}`]));
    summaryRoot.innerHTML=[
      ['연결계좌',String(data.summary?.accounts||0),`활성 ${data.summary?.activeAccounts||0}`],
      ['현재잔액',krw(data.summary?.currentBalance||0),'연결계좌 합계'],
      ['승인·실행 대기',String(data.summary?.pendingTransfers||0),'이체 요청'],
      ['실이체 연결',ready.executorConnected&&ready.transferExecutionEnabled?'사용 가능':'안전 잠금',ready.readerConnected?'거래조회 연결':'조회 연동 대기']
    ].map(([label,value,small])=>`<article class="card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(small)}</small></article>`).join('');

    const accountRows=accounts.length?accounts.map(a=>`<tr>
      <td><strong>${esc(a.accountAlias)}</strong><br><small>${esc(a.institutionName||a.provider||'')}</small></td>
      <td>${a.accountLast4?`****${esc(a.accountLast4)}`:'참조값만 저장'}</td>
      <td class="right"><strong>${esc(krw(a.currentBalance))}</strong><br><small>${esc(dateText(a.balanceAsOf))}</small></td>
      <td>${tag(a.connectionStatus)}</td>
      <td>${a.transferEnabled?'이체 허용':'조회 전용'}</td>
      <td>${caps.manage&&ready.readerConnected?`<button type="button" data-bank-sync="${esc(a.id)}">동기화</button>`:'—'}</td>
    </tr>`).join(''):`<tr><td colspan="6" class="empty">연결된 은행계좌가 없습니다. 계좌 연결은 최고관리자에서 등록합니다.</td></tr>`;

    const transactionRows=transactions.length?transactions.map(t=>`<tr>
      <td>${esc(dateText(t.bookedAt))}</td><td>${esc(accountName(t,accountMap))}</td>
      <td><strong>${esc(t.counterpartyName||t.description||'—')}</strong><br><small>${esc(t.description||t.category||'')}</small></td>
      <td>${esc(dirLabel(t.direction))}</td><td class="right"><strong>${esc(krw(t.amount))}</strong></td>
      <td class="right">${t.balanceAfter==null?'—':esc(krw(t.balanceAfter))}</td>
    </tr>`).join(''):`<tr><td colspan="6" class="empty">수집된 통장 거래내역이 없습니다.</td></tr>`;

    const transferRows=transfers.length?transfers.map(t=>{
      const approve=caps.approve&&t.status==='requested'? `<button type="button" data-transfer-approve="${esc(t.id)}">승인</button><button type="button" data-transfer-reject="${esc(t.id)}">반려</button>`:'';
      const execute=caps.execute&&t.status==='approved'&&ready.executorConnected&&ready.transferExecutionEnabled?
        `<button class="button primary" type="button" data-transfer-execute="${esc(t.id)}">실제 이체</button>`:
        (t.status==='approved'?'<small>실이체 연결 대기</small>':'');
      return `<tr><td>${esc(dateText(t.requestedAt))}</td><td><strong>${esc(t.recipientName)}</strong><br><small>${esc(t.recipientBankName||'')} ${t.recipientAccountLast4?`****${esc(t.recipientAccountLast4)}`:''}</small></td>
      <td class="right"><strong>${esc(krw(t.amount))}</strong></td><td>${tag(t.status)}</td><td>${esc(t.requesterEmail||'')}</td><td><div class="actions">${approve}${execute}</div></td></tr>`;
    }).join(''):`<tr><td colspan="6" class="empty">이체 요청이 없습니다.</td></tr>`;

    const transferAccounts=accounts.filter(account=>Boolean(account.transferEnabled));
    const transferForm=caps.manage&&transferAccounts.length?`<form id="bankTransferRequestForm" class="trade-form">
      <h3>이체 요청</h3><p class="empty">수취계좌 전체번호는 요청 단계에서 저장하지 않습니다. 승인 후 실제 실행 시에만 금융기관 연결로 전달합니다.</p>
      <div class="trade-grid">
        <label>출금계좌<select name="bankConnectionId" required>${transferAccounts.map(a=>`<option value="${esc(a.id)}">${esc(accountMap.get(a.id)||a.accountAlias)}</option>`).join('')}</select></label>
        <label>수취은행<input name="recipientBankName" maxlength="120" required></label>
        <label>예금주<input name="recipientName" maxlength="120" required></label>
        <label>수취계좌 끝 4자리<input name="recipientAccountLast4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>
        <label>금액<input name="amount" type="number" min="1" step="1" inputmode="numeric" required></label>
        <label>메모<input name="memo" maxlength="500"></label>
      </div><div class="actions"><button class="button primary" type="submit">이체 요청 등록</button></div>
    </form>`:caps.manage?'<p class="empty">이체가 허용된 출금계좌가 없습니다.</p>':'';

    root.innerHTML=`<div data-banking-message class="trade-flash"></div>
      <div class="panel-head"><div><h2>${mode==='church'?'교회 통장 · 이체':'통장 · 이체'}</h2>
      <p class="empty">조회·요청·승인을 분리합니다. 전체 계좌번호·인터넷뱅킹 비밀번호·인증서는 EKODI 데이터베이스에 저장하지 않습니다.</p></div>
      <span class="tag ${ready.executorConnected&&ready.transferExecutionEnabled?'live':'warn'}">${ready.executorConnected&&ready.transferExecutionEnabled?'실이체 연결':'실이체 잠금'}</span></div>
      <h3>연결계좌</h3><div class="table-wrap"><table><thead><tr><th>계좌</th><th>표시번호</th><th>잔액</th><th>상태</th><th>권한</th><th>동기화</th></tr></thead><tbody>${accountRows}</tbody></table></div>
      <h3>최근 거래내역</h3><div class="table-wrap"><table><thead><tr><th>일시</th><th>계좌</th><th>내용</th><th>구분</th><th>금액</th><th>잔액</th></tr></thead><tbody>${transactionRows}</tbody></table></div>
      <h3>이체 요청 · 승인</h3><div class="table-wrap"><table><thead><tr><th>요청일</th><th>수취인</th><th>금액</th><th>상태</th><th>요청자</th><th>처리</th></tr></thead><tbody>${transferRows}</tbody></table></div>
      ${transferForm}`;

    root.querySelectorAll('[data-bank-sync]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;try{notice('계좌 동기화 중…');await request(`/accounts/${encodeURIComponent(button.dataset.bankSync)}/sync`,{method:'POST',body:'{}'});notice('계좌 거래내역을 동기화했습니다.','good');await render();}catch(error){notice(`동기화 실패: ${error.message}`,'error');button.disabled=false;}
    });
    root.querySelector('#bankTransferRequestForm')?.addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget;const payload=Object.fromEntries(new FormData(form));payload.amount=Number(payload.amount||0);
      try{notice('이체 요청 등록 중…');await request('/transfers',{method:'POST',body:JSON.stringify(payload),idempotencyKey:crypto.randomUUID()});form.reset();notice('이체 요청을 등록했습니다. 승인 후에만 실행할 수 있습니다.','good');await render();}catch(error){notice(`요청 실패: ${error.message}`,'error');}
    });
    root.querySelectorAll('[data-transfer-approve]').forEach(button=>button.onclick=async()=>{
      try{await request(`/transfers/${encodeURIComponent(button.dataset.transferApprove)}/approve`,{method:'POST',body:'{}'});notice('이체 요청을 승인했습니다.','good');await render();}catch(error){notice(`승인 실패: ${error.message}`,'error');}
    });
    root.querySelectorAll('[data-transfer-reject]').forEach(button=>button.onclick=async()=>{
      const reason=window.prompt('반려 사유를 입력해 주세요.','');if(reason===null)return;
      try{await request(`/transfers/${encodeURIComponent(button.dataset.transferReject)}/reject`,{method:'POST',body:JSON.stringify({reason})});notice('이체 요청을 반려했습니다.','good');await render();}catch(error){notice(`반려 실패: ${error.message}`,'error');}
    });
    root.querySelectorAll('[data-transfer-execute]').forEach(button=>button.onclick=async()=>{
      const accountNumber=window.prompt('실제 이체 실행용 수취계좌 전체번호를 입력하세요. 이 값은 EKODI DB에 저장되지 않습니다.','');
      if(!accountNumber)return;
      if(!window.confirm('승인된 이체를 실제 금융기관으로 실행합니다. 계속하시겠습니까?'))return;
      try{button.disabled=true;notice('금융기관 이체 실행 중…');await request(`/transfers/${encodeURIComponent(button.dataset.transferExecute)}/execute`,{method:'POST',body:JSON.stringify({recipientAccountNumber:accountNumber})});notice('금융기관 이체가 완료되었습니다.','good');await render();}catch(error){notice(`이체 실행 실패: ${error.message}`,'error');button.disabled=false;}
    });
    state('통장 · 이체');
  };
  try{await render();}catch(error){
    summaryRoot.innerHTML='<article class="card"><span>통장 · 이체</span><strong>확인 필요</strong><small>권한·연결 확인</small></article>';
    root.innerHTML=`<h2>통장 · 이체</h2><p class="empty">${esc(error.message)}</p>`;state('확인 필요');
  }
}
