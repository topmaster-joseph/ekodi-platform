const API='/api/finance/banking';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const krw=value=>`${Math.round(Number(value)||0).toLocaleString('ko-KR')}원`;
const dateText=value=>{if(!value)return'—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'})};
const statusLabel=value=>({pending:'연결대기',active:'연결됨',disconnected:'연결끊김',error:'오류',requested:'승인대기',approved:'승인완료',rejected:'반려',executing:'이체중',completed:'이체완료',failed:'실패',cancelled:'취소'})[value]||value||'—';
const dirLabel=value=>value==='in'?'입금':'출금';
const isManual=account=>String(account?.provider||'MANUAL').toUpperCase()==='MANUAL';
const accountStatusLabel=account=>isManual(account)?(account.connectionStatus==='disconnected'?'사용 중지':'파일연동 운영'):statusLabel(account.connectionStatus);
const accessLabel=account=>account.transferEnabled?'이체 허용':(!isManual(account)&&account.readEnabled)?'조회 전용 연결':'파일연동 운영';
const signedKrw=value=>`${Number(value)<0?'-':Number(value)>0?'+':''}${krw(Math.abs(Number(value)||0))}`;
const IMPORT_REASON={INVALID_DATE:'거래일 형식 오류',INVALID_AMOUNT:'금액 없음',INVALID_DIRECTION:'입출금 구분 오류',EXTERNAL_ID_REQUIRED:'거래번호 없음',MISSING_DATE_OR_AMOUNT:'거래일 또는 금액 없음'};
const TXN_PAGE=100;
const FINANCE_TABS=[['overview','개요'],['ledger','거래내역'],['accounts','계좌'],['import','파일 불러오기'],['transfers','이체']];
const initialTab=()=>{try{const t=new URL(location.href).searchParams.get('tab');return FINANCE_TABS.some(([key])=>key===t)?t:'overview';}catch{return'overview';}};
const isLegacyApi=error=>Number(error?.status)===404||String(error?.message||'').includes('BANKING_ENDPOINT_NOT_FOUND');
const monthKey=value=>String(value||'').slice(0,7);
const localMonths=list=>{const map=new Map();for(const t of list){const k=monthKey(t.bookedAt);if(!k)continue;const m=map.get(k)||{month:k,count:0,income:0,expense:0};m.count++;if(t.direction==='in')m.income+=Number(t.amount)||0;else m.expense+=Number(t.amount)||0;map.set(k,m);}return[...map.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(m=>({...m,net:m.income-m.expense}));};
const localFilter=(list,f)=>list.filter(t=>{const d=String(t.bookedAt||'').slice(0,10);
  if(f.from&&d<f.from)return false;if(f.to&&d>f.to)return false;if(f.accountId&&t.bankConnectionId!==f.accountId)return false;
  if(f.direction&&t.direction!==f.direction)return false;if(f.category==='__none__'&&t.category)return false;if(f.category&&f.category!=='__none__'&&t.category!==f.category)return false;
  if(f.q&&!`${t.description||''} ${t.counterpartyName||''}`.includes(f.q))return false;return true;});
const csvCellLocal=value=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;return /[",\n\r]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};
const csvTemplateHref='data:text/csv;charset=utf-8,'+encodeURIComponent('\uFEFF거래일시,구분,금액,잔액,적요,거래처,분류,거래번호\n2026-01-02 09:30,입금,100000,350000,후원금,홍길동,후원,example-001\n');
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
  const skippedRows=[];
  const list=rows.slice(1,501).map((cells,index)=>{
    const record=Object.fromEntries(headers.map((key,column)=>[key,cells[column]??'']));
    const signed=csvNumber(csvPick(record,['금액','거래금액','amount']))||csvNumber(csvPick(record,['입금액','수입','deposit','income']))||-csvNumber(csvPick(record,['출금액','지출','withdrawal','expense']));
    const bookedAt=csvPick(record,['거래일시','거래일','일자','날짜','bookedAt','date','datetime']);
    const description=csvPick(record,['적요','내용','거래내용','메모','description','memo']);
    const counterpartyName=csvPick(record,['거래처','상대명','보낸분받는분','counterparty','counterpartyName']);
    const direction=csvDirection(record,signed);
    const amount=Math.abs(signed);
    if(!bookedAt||!amount){skippedRows.push({row:index+2,reason:'MISSING_DATE_OR_AMOUNT'});return null;}
    const suppliedId=csvPick(record,['거래번호','고유번호','externalId','id']);
    return{rowNumber:index+2,bookedAt,direction,amount,balanceAfter:csvNumber(csvPick(record,['잔액','거래후잔액','balance','balanceAfter']))||null,
      description,counterpartyName,category:csvPick(record,['분류','카테고리','category']),
      externalId:suppliedId||['csv',bookedAt,direction,amount,description,counterpartyName,index+2].join(':')};
  }).filter(Boolean);
  return Object.assign(list,{skippedRows,overLimit:Math.max(0,rows.length-501)});
};
const importSummary=(result,local)=>{
  const errors=[...(local.skippedRows||[]),...(Array.isArray(result.errors)?result.errors:[])].sort((a,b)=>a.row-b.row);
  const skipped=Number(result.skipped||0)+(local.skippedRows||[]).length;
  if(result.created===undefined)return{text:`${Number(result.imported||0).toLocaleString('ko-KR')}건 반영(같은 거래번호는 중복 생성 안 함)`,errors:local.skippedRows||[]};
  const lines=[`신규 ${Number(result.created||0).toLocaleString('ko-KR')}건 반영`,`이미 있던 거래 ${Number(result.duplicates||0).toLocaleString('ko-KR')}건(중복 생성 안 함)`,`제외 ${skipped.toLocaleString('ko-KR')}건`];
  if(local.overLimit)lines.push(`500건 초과 ${local.overLimit.toLocaleString('ko-KR')}행은 다음 파일로 나눠 주세요`);
  return{text:lines.join(' · '),errors};
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
    if(options.query)for(const [key,value] of Object.entries(options.query))if(value!==''&&value!=null)url.searchParams.set(key,String(value));
    const {query,raw,...fetchOptions}=options;
    const response=await fetch(url,{...fetchOptions,headers:{...h,...(options.headers||{})},cache:'no-store'});
    if(raw&&response.ok)return response;
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||`Finance Banking ${response.status}`),{status:response.status,data});
    return data;
  };
  const accountName=(item,map)=>map.get(item.bankConnectionId)||'계좌';
  let lastNotice=null;
  let activeTab=initialTab();
  const notice=(text,kind='')=>{
    lastNotice={text,kind};
    let node=root.querySelector('[data-banking-message]');
    if(!node){node=document.createElement('p');node.dataset.bankingMessage='1';node.className='trade-flash';root.prepend(node);}
    node.className=`trade-flash ${kind}`;node.textContent=text;
  };
  const render=async()=>{
    state('통장 · 이체 확인 중');
    const data=await request('/overview');
    const accounts=Array.isArray(data.accounts)?data.accounts:[];
    const transfers=Array.isArray(data.transfers)?data.transfers:[];
    const transactions=Array.isArray(data.transactions)?data.transactions:[];
    const caps=data.capabilities||{},ready=data.readiness||{};
    const accountMap=new Map(accounts.map(a=>[a.id,`${a.institutionName||a.provider||'금융기관'} · ${a.accountAlias}${a.accountLast4?` ****${a.accountLast4}`:''}`]));
    summaryRoot.innerHTML=[
      ['연결계좌',String(data.summary?.accounts||0),`활성 ${data.summary?.activeAccounts||0}`],
      ['현재잔액',krw(data.summary?.currentBalance||0),'연결계좌 합계'],
      ['이번 달 순증감','…','수입 · 지출 집계 중','month'],
      ['이체',ready.executorConnected&&ready.transferExecutionEnabled?'사용 가능':'안전 잠금',`승인 대기 ${data.summary?.pendingTransfers||0}건`]
    ].map(([label,value,small,key])=>`<article class="card"${key?` data-bank-kpi="${key}"`:''}><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(small)}</small></article>`).join('');

    const accountRows=accounts.length?accounts.map(a=>`<tr>
      <td><strong>${esc(a.accountAlias)}</strong><br><small>${esc(a.institutionName||a.provider||'')}</small></td>
      <td>${a.accountLast4?`****${esc(a.accountLast4)}`:'참조값만 저장'}</td>
      <td class="right"><strong>${esc(krw(a.currentBalance))}</strong><br><small>${esc(dateText(a.balanceAsOf))}</small></td>
      <td><span class="tag ${a.connectionStatus==='disconnected'?'':a.connectionStatus==='error'?'warn':'live'}">${esc(accountStatusLabel(a))}</span></td>
      <td>${esc(accessLabel(a))}</td>
      <td><div class="actions">${caps.manage&&ready.readerConnected&&!isManual(a)?`<button type="button" data-bank-sync="${esc(a.id)}">동기화</button>`:''}${caps.manage&&isManual(a)?`<button type="button" data-bank-edit="${esc(a.id)}">수정</button>${a.connectionStatus==='disconnected'?`<button type="button" data-bank-active="${esc(a.id)}" data-active="1">다시 사용</button>`:`<button type="button" data-bank-active="${esc(a.id)}" data-active="0">사용 중지</button>`}`:''}</div></td>
    </tr>`).join(''):`<tr><td colspan="6" class="empty">등록된 운영계좌가 없습니다. 아래에서 파일연동 계좌를 먼저 등록하세요.</td></tr>`;

    const transferRows=transfers.length?transfers.map(t=>{
      const approve=caps.approve&&t.status==='requested'? `<button type="button" data-transfer-approve="${esc(t.id)}">승인</button><button type="button" data-transfer-reject="${esc(t.id)}">반려</button>`:'';
      const execute=caps.execute&&t.status==='approved'&&ready.executorConnected&&ready.transferExecutionEnabled?
        `<button class="button primary" type="button" data-transfer-execute="${esc(t.id)}">실제 이체</button>`:
        (t.status==='approved'?'<small>실이체 연결 대기</small>':'');
      return `<tr><td>${esc(dateText(t.requestedAt))}</td><td><strong>${esc(t.recipientName)}</strong><br><small>${esc(t.recipientBankName||'')} ${t.recipientAccountLast4?`****${esc(t.recipientAccountLast4)}`:''}</small></td>
      <td class="right"><strong>${esc(krw(t.amount))}</strong></td><td>${tag(t.status)}</td><td>${esc(t.requesterEmail||'')}</td><td><div class="actions">${approve}${execute}</div></td></tr>`;
    }).join(''):`<tr><td colspan="6" class="empty">이체 요청이 없습니다.</td></tr>`;

    const accountCreateForm=caps.manage?`<form id="bankManualAccountForm" class="trade-form">
      <h3>승인 전 파일연동 계좌 등록</h3>
      <p class="empty">금융결제원 승인 전에도 사이트별 수입·지출 장부를 운영할 수 있습니다. 전체 계좌번호 대신 끝 4자리만 저장하며 조회·이체 권한은 생성되지 않습니다.</p>
      <div class="trade-grid">
        <label>금융기관명<input name="institutionName" maxlength="120" placeholder="예: 토스뱅크" required></label>
        <label>계좌 별칭<input name="accountAlias" maxlength="120" placeholder="예: 운영비 통장" required></label>
        <label>계좌 끝 4자리<input name="accountLast4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="1234"></label>
        <label>현재잔액<input name="currentBalance" type="number" step="1" inputmode="numeric" placeholder="0"></label>
      </div><div class="actions"><button class="button primary" type="submit">파일연동 계좌 등록</button></div>
    </form>`:'';

    const activeAccounts=accounts.filter(a=>a.connectionStatus!=='disconnected');
    const editForm=caps.manage?`<form id="bankAccountEditForm" class="trade-form" hidden>
      <h3>계좌 정보 수정</h3>
      <p class="empty">삭제 대신 사용 중지로 관리합니다. 변경 내용은 감사기록에 남고 언제든 다시 사용할 수 있습니다.</p>
      <input type="hidden" name="id">
      <div class="trade-grid">
        <label>금융기관명<input name="institutionName" maxlength="120"></label>
        <label>계좌 별칭<input name="accountAlias" maxlength="120" required></label>
        <label>계좌 끝 4자리<input name="accountLast4" inputmode="numeric" pattern="[0-9]{4}" maxlength="4"></label>
      </div><div class="actions"><button class="button primary" type="submit">수정 저장</button><button class="button" type="button" data-bank-edit-cancel>취소</button></div>
    </form>`:'';

    const importForm=caps.manage&&activeAccounts.length?`<form id="bankCsvImportForm" class="trade-form">
      <h3>거래내역 파일 불러오기</h3>
      <p class="empty">금융기관에서 내려받은 CSV를 선택하세요. 거래일·금액은 필수이며, 구분·적요·잔액·거래처·거래번호 열을 함께 읽습니다. 한 번에 최대 500건을 처리합니다.</p>
      <div class="trade-grid">
        <label>대상계좌<select name="bankConnectionId" required>${activeAccounts.map(a=>`<option value="${esc(a.id)}">${esc(accountMap.get(a.id)||a.accountAlias)}</option>`).join('')}</select></label>
        <label>CSV 파일<input name="csvFile" type="file" accept=".csv,text/csv" required></label>
      </div><div class="actions"><button class="button primary" type="submit">거래내역 불러오기</button><a class="button" href="${esc(csvTemplateHref)}" download="ekodi-bank-transactions-template.csv">표준 CSV 양식 다운로드</a></div>
      <div data-bank-import-result></div>
    </form>`:caps.manage?'<p class="empty">파일을 연결할 사용 중인 계좌가 없습니다. 위에서 파일연동 계좌를 등록하거나 사용 중지된 계좌를 다시 사용으로 바꿔 주세요.</p>':'';

    const ledgerSection=`<section data-bank-ledger>
      <form id="bankTxnFilterForm" class="trade-form">
        <div class="trade-grid">
          <label>시작일<input name="from" type="date"></label>
          <label>종료일<input name="to" type="date"></label>
          <label>계좌<select name="accountId"><option value="">전체 계좌</option>${accounts.map(a=>`<option value="${esc(a.id)}">${esc(accountMap.get(a.id)||a.accountAlias)}</option>`).join('')}</select></label>
          <label>구분<select name="direction"><option value="">입금·출금</option><option value="in">입금(수입)</option><option value="out">출금(지출)</option></select></label>
          <label>분류<select name="category" data-bank-category><option value="">전체 분류</option><option value="__none__">미분류</option></select></label>
          <label>검색<input name="q" maxlength="80" placeholder="적요·거래처"></label>
        </div>
        <div class="actions"><button class="button primary" type="submit">조회</button><button class="button" type="button" data-bank-filter-reset>초기화</button><button class="button" type="button" data-bank-export>CSV 내보내기</button></div>
      </form>
      <p class="empty" data-bank-legacy-note hidden></p>
      <div class="cards" data-bank-totals style="grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))"></div>
      <h3>거래 목록</h3>
      <div class="table-wrap"><table><thead><tr><th>일시</th><th>계좌</th><th>내용</th><th>구분</th><th>금액</th><th>잔액</th></tr></thead><tbody data-bank-transactions><tr><td colspan="6" class="empty">불러오는 중…</td></tr></tbody></table></div>
      <div class="actions"><button class="button" type="button" data-bank-more hidden>더 보기</button></div>
    </section>`;

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

    const live=ready.executorConnected&&ready.transferExecutionEnabled;
    const fileMode=!ready.readerConnected;
    const tabCount={accounts:accounts.length,transfers:transfers.filter(t=>['requested','approved','executing'].includes(t.status)).length};
    const tabNav=`<div role="tablist" aria-label="재무 세부 메뉴" data-bank-tabs style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 14px">${FINANCE_TABS.map(([key,label])=>`<button type="button" role="tab" class="button" data-bank-tab="${key}" aria-selected="false">${esc(label)}${tabCount[key]?` (${esc(tabCount[key])})`:''}</button>`).join('')}</div>`;
    const panel=(key,body)=>`<section role="tabpanel" data-bank-panel="${key}" hidden>${body}</section>`;
    const overviewPanel=`<div class="actions" style="margin-bottom:12px">${caps.manage?`<button class="button primary" type="button" data-bank-go="${activeAccounts.length?'import':'accounts'}">${activeAccounts.length?'거래 파일 불러오기':'파일연동 계좌 등록'}</button>`:''}<button class="button" type="button" data-bank-go="ledger">거래내역 조회</button></div>
      <h3>월별 수입 · 지출</h3>
      <div class="table-wrap"><table><thead><tr><th>월</th><th>건수</th><th>수입</th><th>지출</th><th>순증감</th></tr></thead><tbody data-bank-months><tr><td colspan="5" class="empty">불러오는 중…</td></tr></tbody></table></div>
      <h3>최근 거래</h3>
      <div class="table-wrap"><table><thead><tr><th>일시</th><th>계좌</th><th>내용</th><th>구분</th><th>금액</th><th>잔액</th></tr></thead><tbody data-bank-recent><tr><td colspan="6" class="empty">불러오는 중…</td></tr></tbody></table></div>`;
    const accountsPanel=`<div class="table-wrap"><table><thead><tr><th>계좌</th><th>표시번호</th><th>잔액</th><th>상태</th><th>권한</th><th>관리</th></tr></thead><tbody>${accountRows}</tbody></table></div>${editForm}${accountCreateForm}`;
    const transfersPanel=`<h3>이체 요청 · 승인</h3><div class="table-wrap"><table><thead><tr><th>요청일</th><th>수취인</th><th>금액</th><th>상태</th><th>요청자</th><th>처리</th></tr></thead><tbody>${transferRows}</tbody></table></div>
      ${transferForm}`;
    root.innerHTML=`<div data-banking-message class="trade-flash"></div>
      <div class="panel-head"><h2>${mode==='church'?'교회 통장 · 장부':'통장 · 장부'}</h2>
        <div class="actions"><span class="tag ${fileMode?'':'live'}">${fileMode?'파일연동 운영':'조회 전용 연결'}</span><span class="tag ${live?'live':'warn'}">${live?'실이체 연결':'실이체 잠금'}</span></div></div>
      ${tabNav}
      ${panel('overview',overviewPanel)}
      ${panel('ledger',ledgerSection)}
      ${panel('accounts',accountsPanel)}
      ${panel('import',importForm||'<p class="empty">파일을 불러올 권한이 없습니다.</p>')}
      ${panel('transfers',transfersPanel)}
      <details class="bank-help" style="margin-top:18px"><summary>안내 · 보안 원칙</summary>
        <p class="empty">조회·요청·승인을 분리합니다. 전체 계좌번호·인터넷뱅킹 비밀번호·인증서는 EKODI 데이터베이스에 저장하지 않습니다.</p>
        <p class="empty">오픈뱅킹은 금융결제원 승인과 조직별 계좌동의 후 조회 전용부터 연결합니다. 승인 전에는 CSV 파일 연동을 사용합니다. <a href="/privacy">개인정보처리방침</a> · <a href="/terms">이용약관</a></p>
      </details>`;
    if(lastNotice){const keep=lastNotice;notice(keep.text,keep.kind);}
    root.querySelector('#bankManualAccountForm')?.addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget;
      const payload=Object.fromEntries(new FormData(form));
      if(payload.currentBalance==='')delete payload.currentBalance;else payload.currentBalance=Number(payload.currentBalance);
      try{
        notice('파일연동 계좌 등록 중…');
        await request('/accounts',{method:'POST',body:JSON.stringify(payload)});
        form.reset();notice('파일연동 계좌를 등록했습니다. 이제 CSV 거래내역을 불러올 수 있습니다.','good');await render();
      }catch(error){notice(`계좌 등록 실패: ${error.message}`,'error');}
    });
    const ledger={offset:0,filters:{}};
    const filterForm=root.querySelector('#bankTxnFilterForm');
    const readFilters=()=>Object.fromEntries([...new FormData(filterForm)].filter(([,value])=>String(value).trim()!==''));
    const txnRow=t=>`<tr>
      <td>${esc(dateText(t.bookedAt))}</td><td>${esc(accountName(t,accountMap))}</td>
      <td><strong>${esc(t.counterpartyName||t.description||'—')}</strong><br><small>${esc([t.description&&t.counterpartyName?t.description:'',t.category||'미분류'].filter(Boolean).join(' · '))}</small></td>
      <td>${esc(dirLabel(t.direction))}</td><td class="right"><strong>${esc(krw(t.amount))}</strong></td>
      <td class="right">${t.balanceAfter==null?'—':esc(krw(t.balanceAfter))}</td>
    </tr>`;
    // Legacy fallback: before the Finance API promotion only /overview (latest 50 rows) exists.
    const legacy={on:false,rows:transactions};
    const monthRowsHtml=list=>list.map(m=>`<tr><td>${esc(m.month)}</td><td class="right">${esc(Number(m.count||0).toLocaleString('ko-KR'))}</td><td class="right">${esc(krw(m.income))}</td><td class="right">${esc(krw(m.expense))}</td><td class="right"><strong>${esc(signedKrw(m.net))}</strong></td></tr>`).join('');
    const fetchLedger=async(filters,offset)=>{
      if(!legacy.on){
        try{const list=await request('/transactions',{query:{...filters,limit:TXN_PAGE,offset}});if(list.totals)return list;legacy.on=true;}
        catch(error){if(!isLegacyApi(error))throw error;legacy.on=true;}
      }
      const rows=localFilter(legacy.rows,filters);
      const income=rows.filter(t=>t.direction==='in').reduce((n,t)=>n+(Number(t.amount)||0),0),expense=rows.filter(t=>t.direction==='out').reduce((n,t)=>n+(Number(t.amount)||0),0);
      return{transactions:offset?[]:rows,totals:{count:rows.length,income,expense,net:income-expense},categories:[...new Set(legacy.rows.map(t=>t.category).filter(Boolean))].sort()};
    };
    const fetchMonths=async()=>{
      if(!legacy.on){try{return(await request('/transactions/summary')).months||[];}catch(error){if(!isLegacyApi(error))throw error;legacy.on=true;}}
      return localMonths(legacy.rows);
    };
    const legacyNote=()=>{const node=root.querySelector('[data-bank-legacy-note]');if(node){node.hidden=!legacy.on;node.textContent='금융 API 업데이트 반영 전이라 최근 50건 기준으로 표시합니다.';}};
    const loadOverview=async()=>{
      const months=await fetchMonths();
      const monthsNode=root.querySelector('[data-bank-months]');
      if(monthsNode)monthsNode.innerHTML=monthRowsHtml(months)||'<tr><td colspan="5" class="empty">합계를 낼 거래가 없습니다.</td></tr>';
      const recent=legacy.on?legacy.rows.slice(0,10):((await fetchLedger({},0)).transactions||[]).slice(0,10);
      const recentNode=root.querySelector('[data-bank-recent]');
      if(recentNode)recentNode.innerHTML=recent.map(txnRow).join('')||'<tr><td colspan="6" class="empty">아직 거래가 없습니다. 계좌를 등록하고 거래 파일을 불러오세요.</td></tr>';
      const current=new Date();const key=`${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}`;
      const m=months.find(item=>item.month===key)||{income:0,expense:0,net:0};
      const kpi=summaryRoot.querySelector('[data-bank-kpi="month"]');
      if(kpi)kpi.innerHTML=`<span>이번 달 순증감</span><strong>${esc(signedKrw(m.net))}</strong><small>수입 ${esc(krw(m.income))} · 지출 ${esc(krw(m.expense))}${legacy.on?' · 최근 50건 기준':''}</small>`;
    };
    const loadLedger=async(append=false)=>{
      const tbody=root.querySelector('[data-bank-transactions]'),totals=root.querySelector('[data-bank-totals]'),more=root.querySelector('[data-bank-more]');
      if(!append){ledger.offset=0;ledger.filters=readFilters();}
      const list=await fetchLedger(ledger.filters,ledger.offset);
      const items=Array.isArray(list.transactions)?list.transactions:[];
      const rowsHtml=items.map(txnRow).join('');
      if(append)tbody.insertAdjacentHTML('beforeend',rowsHtml);
      else tbody.innerHTML=rowsHtml||'<tr><td colspan="6" class="empty">조건에 맞는 거래내역이 없습니다.</td></tr>';
      ledger.offset+=items.length;
      const total=list.totals||{};
      more.hidden=ledger.offset>=Number(total.count||0);
      legacyNote();
      if(!append){
        totals.innerHTML=[['조회 건수',`${Number(total.count||0).toLocaleString('ko-KR')}건`],['수입',krw(total.income)],['지출',krw(total.expense)],['순증감',signedKrw(total.net)]]
          .map(([label,value])=>`<article class="card"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('');
        const select=root.querySelector('[data-bank-category]');const chosen=ledger.filters.category||'';
        select.innerHTML=`<option value="">전체 분류</option><option value="__none__">미분류</option>${(list.categories||[]).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}`;
        select.value=chosen;
      }
    };
    const ledgerError=error=>notice(`거래내역 조회 실패: ${error.message}`,'error');
    filterForm?.addEventListener('submit',event=>{event.preventDefault();loadLedger().catch(ledgerError);});
    root.querySelector('[data-bank-filter-reset]')?.addEventListener('click',()=>{filterForm.reset();loadLedger().catch(ledgerError);});
    root.querySelector('[data-bank-more]')?.addEventListener('click',()=>loadLedger(true).catch(ledgerError));
    root.querySelector('[data-bank-export]')?.addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;
      try{
        notice('CSV 파일을 만들고 있습니다.');
        let response=null;
        if(!legacy.on){try{response=await request('/transactions/export',{query:readFilters(),raw:true});}catch(error){if(!isLegacyApi(error))throw error;legacy.on=true;}}
        if(!response){
          const rows=localFilter(legacy.rows,readFilters()).slice().reverse();
          const lines=[['거래일시','계좌','구분','금액','잔액','적요','거래처','분류'].join(','),...rows.map(t=>[t.bookedAt,accountMap.get(t.bankConnectionId)||'',dirLabel(t.direction),t.amount,t.balanceAfter??'',t.description,t.counterpartyName,t.category].map(csvCellLocal).join(','))];
          response=new Response('\uFEFF'+lines.join('\r\n')+'\r\n',{headers:{'content-type':'text/csv; charset=utf-8','x-ekodi-export-rows':String(rows.length),'x-ekodi-export-truncated':'false',
            'content-disposition':`attachment; filename="ekodi-transactions-${scope||'site'}-recent50.csv"`}});
        }
        const blob=await response.blob();
        const name=(response.headers.get('content-disposition')||'').match(/filename="([^"]+)"/)?.[1]||'ekodi-transactions.csv';
        const href=URL.createObjectURL(blob);const link=document.createElement('a');link.href=href;link.download=name;document.body.append(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(href),1000);
        const truncated=response.headers.get('x-ekodi-export-truncated')==='true';
        notice(`${Number(response.headers.get('x-ekodi-export-rows')||0).toLocaleString('ko-KR')}건을 CSV로 내보냈습니다.${truncated?' 최대 5,000건까지 포함되었으니 기간을 나눠 내보내 주세요.':''}`,'good');
      }catch(error){notice(`CSV 내보내기 실패: ${error.message}`,'error');}
      finally{button.disabled=false;}
    });
    const editFormNode=root.querySelector('#bankAccountEditForm');
    root.querySelectorAll('[data-bank-edit]').forEach(button=>button.onclick=()=>{
      const account=accounts.find(a=>a.id===button.dataset.bankEdit);if(!account||!editFormNode)return;
      editFormNode.elements.id.value=account.id;editFormNode.elements.institutionName.value=account.institutionName||'';
      editFormNode.elements.accountAlias.value=account.accountAlias||'';editFormNode.elements.accountLast4.value=account.accountLast4||'';
      editFormNode.hidden=false;editFormNode.scrollIntoView({block:'nearest'});editFormNode.elements.accountAlias.focus();
    });
    root.querySelector('[data-bank-edit-cancel]')?.addEventListener('click',()=>{editFormNode.hidden=true;});
    editFormNode?.addEventListener('submit',async event=>{
      event.preventDefault();const {id,...payload}=Object.fromEntries(new FormData(editFormNode));
      try{notice('계좌 정보 저장 중…');await request(`/accounts/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(payload)});notice('계좌 정보를 수정했습니다.','good');await render();}
      catch(error){notice(`계좌 수정 실패: ${isLegacyApi(error)?'금융 API 업데이트 반영 후 사용할 수 있습니다.':error.message}`,'error');}
    });
    root.querySelectorAll('[data-bank-active]').forEach(button=>button.onclick=async()=>{
      const active=button.dataset.active==='1';
      if(!active&&!window.confirm('이 계좌를 사용 중지합니다. 기존 거래내역은 그대로 보존되며 새 파일 불러오기만 막힙니다. 계속하시겠습니까?'))return;
      button.disabled=true;
      try{await request(`/accounts/${encodeURIComponent(button.dataset.bankActive)}`,{method:'PATCH',body:JSON.stringify({active})});notice(active?'계좌를 다시 사용합니다.':'계좌를 사용 중지했습니다. 거래내역은 보존됩니다.','good');await render();}
      catch(error){notice(`처리 실패: ${isLegacyApi(error)?'금융 API 업데이트 반영 후 사용할 수 있습니다.':error.message}`,'error');button.disabled=false;}
    });
    const showTab=(key,push=true)=>{
      if(!FINANCE_TABS.some(([k])=>k===key))key='overview';
      activeTab=key;
      root.querySelectorAll('[data-bank-tab]').forEach(b=>{const on=b.dataset.bankTab===key;b.setAttribute('aria-selected',String(on));b.classList.toggle('primary',on);});
      root.querySelectorAll('[data-bank-panel]').forEach(p=>{p.hidden=p.dataset.bankPanel!==key;});
      if(push){try{const url=new URL(location.href);if(key==='overview')url.searchParams.delete('tab');else url.searchParams.set('tab',key);history.replaceState(history.state,'',url);}catch{}}
      if(key==='ledger'&&!ledger.loaded){ledger.loaded=true;loadLedger().catch(ledgerError);}
    };
    root.querySelectorAll('[data-bank-tab]').forEach(b=>b.onclick=()=>showTab(b.dataset.bankTab));
    root.querySelectorAll('[data-bank-go]').forEach(b=>b.onclick=()=>showTab(b.dataset.bankGo));
    showTab(activeTab,false);
    loadOverview().catch(error=>notice(`요약 조회 실패: ${error.message}`,'error'));
    root.querySelectorAll('[data-bank-sync]').forEach(button=>button.onclick=async()=>{
      button.disabled=true;try{notice('계좌 동기화 중…');await request(`/accounts/${encodeURIComponent(button.dataset.bankSync)}/sync`,{method:'POST',body:'{}'});notice('계좌 거래내역을 동기화했습니다.','good');await render();}catch(error){notice(`동기화 실패: ${error.message}`,'error');button.disabled=false;}
    });
    root.querySelector('#bankCsvImportForm')?.addEventListener('submit',async event=>{
      event.preventDefault();const form=event.currentTarget;const file=form.elements.csvFile.files?.[0];
      if(!file)return notice('CSV 파일을 선택해 주세요.','error');
      try{
        notice('CSV 거래내역을 확인하고 있습니다.');
        const transactions=csvTransactions(await file.text());
        if(!transactions.length)throw new Error(`불러올 수 있는 거래 행이 없습니다.${transactions.skippedRows.length?` 거래일·금액이 비어 있는 행 ${transactions.skippedRows.length}건을 확인해 주세요.`:''}`);
        if(!window.confirm(`${transactions.length.toLocaleString('ko-KR')}건을 선택한 계좌에 반영하시겠습니까?`))return notice('파일 불러오기를 취소했습니다.');
        const result=await request('/transactions/import',{method:'POST',body:JSON.stringify({bankConnectionId:form.elements.bankConnectionId.value,transactions})});
        const report=importSummary(result,transactions);
        await render();
        notice(`파일 불러오기 완료: ${report.text}`,'good');
        const box=root.querySelector('[data-bank-import-result]');
        if(box&&report.errors.length)box.innerHTML=`<p class="empty">제외된 행(최대 50건 표시) — 파일을 고친 뒤 다시 불러오면 이미 반영된 거래는 중복 생성되지 않습니다.</p><div class="table-wrap"><table><thead><tr><th>행 번호</th><th>사유</th></tr></thead><tbody>${report.errors.slice(0,50).map(e=>`<tr><td>${esc(e.row)}</td><td>${esc(IMPORT_REASON[e.reason]||e.reason)}</td></tr>`).join('')}</tbody></table></div>`;
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
