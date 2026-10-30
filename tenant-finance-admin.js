const API='/api/finance/banking';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const krw=value=>`${Math.round(Number(value)||0).toLocaleString('ko-KR')}원`;
const dateText=value=>{if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'})};
const statusLabel=value=>({pending:'연결대기',active:'연결됨',disconnected:'연결끊김',error:'오류',requested:'승인대기',approved:'승인완료',rejected:'반려',executing:'이체중',completed:'이체완료',failed:'실패',cancelled:'취소'})[value]||value||'—';
const dirLabel=value=>value==='in'?'입금':'출금';
const tag=value=>`<span class="tag ${['active','completed','approved'].includes(value)?'live':['failed','error','rejected'].includes(value)?'warn':''}">${esc(statusLabel(value))}</span>`;

const parseCsv=value=>{
  const rows=[];let row=[],field='',quoted=false;
  const text=String(value||'').replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
    else if(ch==='"')quoted=true;
    else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'){row.push(field);rows.push(row);row=[];field='';}
    else if(ch!=='\r')field+=ch;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  return rows.filter(item=>item.some(cell=>String(cell).trim()));
};
const csvKey=value=>String(value||'').trim().toLowerCase().replace(/[\s_().-]+/g,'');
const csvPick=(record,aliases)=>{for(const key of aliases){const value=record[csvKey(key)];if(value!==undefined&&String(value).trim()!=='')return String(value).trim();}return'';};
const csvNumber=value=>{const raw=String(value||'').trim();const negative=/^\(.*\)$/.test(raw)||raw.startsWith('-');const number=Number(raw.replace(/[^0-9.]/g,''));return Number.isFinite(number)?Math.round(Math.abs(number))*(negative?-1:1):0;};
const csvDirection=(record,amount)=>{
  const explicit=csvPick(record,['구분','입출금','거래구분','direction','type']).toLowerCase();
  if(['입금','수입','in','income','credit'].some(value=>explicit.includes(value)))return'in';
  if(['출금','지출','out','expense','debit'].some(value=>explicit.includes(value)))return'out';
  if(csvNumber(csvPick(record,['입금액','수입','deposit','income']))>0)return'in';
  if(csvNumber(csvPick(record,['출금액','지출','withdrawal','expense']))>0)return'out';
  return amount<0?'out':'in';
};
const csvTransactions=text=>{
  const rows=parseCsv(text);if(rows.length<2)throw new Error('CSV 헤더와 거래 행을 확인해 주세요.');
  const headers=rows[0].map(csvKey);
  return rows.slice(1,501).map((cells,index)=>{
    const record=Object.fromEntries(headers.map((key,column)=>[key,cells[column]??'']));
    const signed=csvNumber(csvPick(record,['금액','거래금액','amount']))||csvNumber(csvPick(record,['입금액','수입','deposit','income']))||-csvNumber(csvPick(record,['출금액','지출','withdrawal','expense']));
    const bookedAt=csvPick(record,['거래일시','거래일','일자','날짜','bookedAt','date','datetime']);
    const description=csvPick(record,['적요','내용','거래내용','메모','description','memo']);
    const counterpartyName=csvPick(record,['거래처','상대명','보낸분받는분','counterparty','counterpartyName']);
    const direction=csvDirection(record,signed);
    const amount=Math.abs(signed);
    if(!bookedAt||!amount)return null;
    const suppliedId=csvPick(record,['거래번호','고유번호','externalId','id']);
    return{bookedAt,direction,amount,balanceAfter:csvNumber(csvPick(record,['잔액','거래후잔액','balance','balanceAfter']))||null,
      description,counterpartyName,category:csvPick(record,['분류','카테고리','category']),
      externalId:suppliedId||['csv',bookedAt,direction,amount,description,counterpartyName,index+2].join(':')};
  }).filter(Boolean);
};

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

    const importForm=caps.manage&&accounts.length?`<form id="bankCsvImportForm" class="trade-form">
      <h3>거래내역 파일 불러오기</h3>
      <p class="empty">금융기관에서 내려받은 CSV를 선택하세요. 거래일·금액은 필수이며, 구분·적요·잔액·거래처·거래번호 열을 함께 읽습니다. 한 번에 최대 500건을 처리합니다.</p>
      <div class="trade-grid">
        <label>대상계좌<select name="bankConnectionId" required>${accounts.map(a=>`<option value="${esc(a.id)}">${esc(accountMap.get(a.id)||a.accountAlias)}</option>`).join('')}</select></label>
        <label>CSV 파일<input name="csvFile" type="file" accept=".csv,text/csv" required></label>
      </div><div class="actions"><button class="button primary" type="submit">거래내역 불러오기</button></div>
    </form>`:caps.manage?'<p class="empty">파일을 연결할 계좌가 없습니다. 먼저 최고관리자에서 계좌 연결 메타데이터를 등록해 주세요.</p>':'';

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
      ${importForm}
      <h3>최근 거래내역</h3><div class="table-wrap"><table><thead><tr><th>일시</th><th>계좌</th><th>내용</th><th>구분</th><th>금액</th><th>잔액</th></tr></thead><tbody>${transactionRows}</tbody></table></div>
      <h3>이체 요청 · 승인</h3><div class="table-wrap"><table><thead><tr><th>요청일</th><th>수취인</th><th>금액</th><th>상태</th><th>요청자</th><th>처리</th></tr></thead><tbody>${transferRows}</tbody></table></div>
      ${transferForm}`;

    root.querySelectorAll('[data-bank-sync]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;try{notice('계좌 동기화 중…');await request(`/accounts/${encodeURIComponent(button.dataset.bankSync)}/sync`,{method:'POST',body:'{}'});notice('계좌 거래내역을 동기화했습니다.','good');await render();}catch(error){notice(`동기화 실패: ${error.message}`,'error');button.disabled=false;}
    });
    root.querySelector('#bankCsvImportForm')?.addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget;const file=form.elements.csvFile.files?.[0];
      if(!file)return notice('CSV 파일을 선택해 주세요.','error');
      try{
        notice('CSV 거래내역을 확인하고 있습니다.');
        const transactions=csvTransactions(await file.text());
        if(!transactions.length)throw new Error('불러올 수 있는 거래 행이 없습니다.');
        if(!window.confirm(`${transactions.length.toLocaleString('ko-KR')}건을 선택한 계좌에 반영하시겠습니까?`))return notice('파일 불러오기를 취소했습니다.');
        const result=await request('/transactions/import',{method:'POST',body:JSON.stringify({bankConnectionId:form.elements.bankConnectionId.value,transactions})});
        form.reset();notice(`${Number(result.imported||0).toLocaleString('ko-KR')}건을 반영했습니다. 같은 거래번호는 다시 불러와도 중복 생성되지 않습니다.`,'good');await render();
      }catch(error){notice(`파일 불러오기 실패: ${error.message}`,'error');}
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
