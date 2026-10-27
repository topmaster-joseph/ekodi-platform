(() => {
  'use strict';
  const SECTION='infra-costs';
  if(document.getElementById('ekodiInfraCosts'))return;
  const app=document.querySelector('#app'),content=document.querySelector('.content');
  if(!app||!content)return;
  const root=document.createElement('section');
  root.id='ekodiInfraCosts';
  root.className='section infra-costs hidden-panel';
  root.dataset.panel=SECTION;
  root.hidden=true;
  root.innerHTML= `
    <div class="section-head infra-page-heading"><div><p class="kicker">EKODI ORCHESTRATOR · FINANCE CONTROL</p>
      <h2>비용·인프라 관리</h2><p>클라우드 · 데이터베이스 · 개발 · 도메인 · AI · 업무 도구의 청구와 갱신 일정을 한곳에서 관리합니다.</p></div>
      <div class="infra-heading-actions"><button type="button" class="primary" data-infra-open-invoice>＋ 청구서 등록</button><button type="button" class="secondary" data-infra-refresh>↻ 최신 기록</button></div></div>
    <nav class="infra-jump-nav" aria-label="비용 관리 화면 빠른 이동">
      <button type="button" data-infra-jump="infra-overview">전체 요약</button>
      <button type="button" data-infra-jump="infra-billing">청구·납부</button>
      <button type="button" data-infra-jump="infra-services">공급자 현황</button>
      <button type="button" data-infra-jump="infra-budget">월간 예산</button>
      <button type="button" data-infra-jump="infra-renewals">갱신 일정</button>
    </nav>
    <p class="infra-note">청구액과 실사용 계측은 구분합니다. 자동 연동이 없는 업체는 청구번호와 납부 확인을 직접 등록합니다. 비밀번호, API 키, 카드번호는 입력하지 마세요.</p>
    <div class="infra-summary" id="infra-overview">
      <article><small>등록 청구액 · 통화별</small><strong data-infra-total>—</strong><span>환율을 추정해 합산하지 않습니다.</span></article>
      <article><small>결제 확인 전</small><strong data-infra-unverified>—</strong><span>청구서 존재 ≠ 미납 또는 결제완료</span></article>
      <article><small>연체 · 7일 이내</small><strong data-infra-due>—</strong><span>직접 확인한 미납 상태 기준</span></article>
      <article><small>30일 내 갱신</small><strong data-infra-renew>—</strong><span>도메인·계약·유료 서비스</span></article>
    </div>
    <div data-infra-error class="infra-message" role="status" aria-live="polite"></div>
    <div class="infra-section-head" id="infra-billing"><h3>청구·납부 원장</h3><small>상태 변경은 최고관리자 감사기록에 남습니다.</small></div>
    <div class="infra-invoice-toolbar" role="search" aria-label="청구서 목록 검색 및 필터">
      <label class="infra-search-field"><span>청구서 검색</span><input type="search" data-infra-invoice-search placeholder="공급자 · 청구번호 · 계정 검색" autocomplete="off"></label>
      <label class="infra-filter-field"><span>납부 확인 상태</span><select data-infra-invoice-filter><option value="all">전체 상태</option><option value="unverified">결제 여부 미확인</option><option value="due">미납 확인</option><option value="paid">납부 확인</option><option value="cancelled">취소</option></select></label>
      <button type="button" class="secondary" data-infra-filter-reset>초기화</button><span data-infra-filter-count role="status" aria-live="polite">전체 청구서</span>
    </div>
    <div class="infra-table-wrap" role="region" aria-label="청구서 목록, 좁은 화면에서는 가로로 스크롤"><table><thead><tr><th>공급자</th><th>청구번호</th><th>발행 / 납부기한</th><th>금액</th><th>확인 상태</th><th>관리</th></tr></thead><tbody data-infra-invoices></tbody></table></div>
    <details class="infra-editor" data-infra-invoice-editor><summary>＋ 청구서 직접 등록</summary>
      <form data-infra-invoice-form>
        <label>공급자<select name="provider" data-infra-provider-options required></select></label>
        <label>청구번호<input name="invoiceNumber" maxlength="100" required placeholder="IN-..."></label>
        <label>계정·사이트 구분<input name="accountLabel" maxlength="120" placeholder="EKODI / 서비스명"></label>
        <label>청구금액<input name="amount" type="number" min="0" step="0.01" required></label>
        <label>통화<select name="currency"><option>USD</option><option>KRW</option><option>EUR</option><option>JPY</option></select></label>
        <label>발행일<input name="issuedOn" type="date"></label>
        <label>납부기한<input name="dueOn" type="date"></label>
        <label>서비스 시작<input name="periodStart" type="date"></label>
        <label>서비스 종료<input name="periodEnd" type="date"></label>
        <label>증빙 참조<input name="evidenceRef" maxlength="500" placeholder="내부 보관 문서 ID 또는 안전한 참조주소"></label>
        <label class="wide">메모<input name="memo" maxlength="500" placeholder="요금제 · 과금 사유"></label>
        <button type="submit" class="primary">청구서 등록</button>
      </form>
    </details>
    <div class="infra-section-head" id="infra-services"><h3>공급자별 서비스 현황</h3><small data-infra-updated>조회 전</small></div>
    <div class="infra-providers" data-infra-providers></div>
    <div class="infra-section-head" id="infra-budget"><h3>공급자별 월간 예산</h3><small>예산의 80% 도달 시 화면에서 경고합니다.</small></div>
    <div data-infra-budget-alerts></div>
    <div class="infra-table-wrap"><table><thead><tr><th>공급자</th><th>설정 예산</th><th>당월 등록 청구액</th></tr></thead><tbody data-infra-budgets></tbody></table></div>
    <details class="infra-editor"><summary>＋ 월간 예산 설정</summary><form data-infra-budget-form>
      <label>공급자<select name="provider" data-infra-provider-options required></select></label>
      <label>예산<input name="amount" type="number" min="0" step="0.01" required></label>
      <label>통화<select name="currency"><option>USD</option><option>KRW</option><option>EUR</option><option>JPY</option></select></label>
      <button type="submit" class="primary">예산 저장</button>
    </form></details>
    <div class="infra-section-head" id="infra-renewals"><h3>도메인·서비스 갱신 일정</h3><small>갱신 현황 조회용 · 외부 자동 결제 없음</small></div>
    <div class="infra-table-wrap"><table><thead><tr><th>공급자</th><th>도메인/계약</th><th>갱신 예정일</th><th>예상 금액</th><th>자동갱신 설정</th></tr></thead><tbody data-infra-renewals></tbody></table></div>
    <details class="infra-editor"><summary>＋ 갱신 예정 등록·수정</summary><form data-infra-renewal-form>
      <label>공급자<select name="provider" data-infra-provider-options required></select></label>
      <label>도메인 또는 계약명<input name="assetName" maxlength="150" required placeholder="example.kr"></label>
      <label>갱신 예정일<input name="renewOn" type="date" required></label>
      <label>예상 금액<input name="amount" type="number" min="0" step="0.01" placeholder="모르면 비워두기"></label>
      <label>통화<select name="currency"><option>KRW</option><option>USD</option><option>EUR</option><option>JPY</option></select></label>
      <label class="infra-check"><input name="autoRenew" type="checkbox"> 공급자 자동갱신 설정됨 (기록용)</label>
      <label class="wide">메모<input name="memo" maxlength="500"></label>
      <button type="submit" class="primary">갱신 일정 저장</button>
    </form></details>
    <p class="infra-foot">API 토큰·결제수단은 원장에 저장하지 않습니다. 도메인/계약 자동 갱신 여부는 기록이며 공급자 설정을 직접 변경하지 않습니다. 청구서 PDF 파일은 EKODI의 비공개 문서 보관소에서 별도 관리하십시오.</p>`;
  content.append(root);
  const $=q=>root.querySelector(q);
  const token=()=>sessionStorage.getItem('ekodi-auth-token')||'';
  const asMoney=(minor,cur)=>new Intl.NumberFormat(cur==='KRW'?'ko-KR':'en-US',{style:'currency',currency:cur,maximumFractionDigits:2}).format((Number(minor)||0)/100);
  let current=null,loading=false;
  const setText=(q,val)=>{const n=$(q);if(n)n.textContent=String(val);};
  const notice=(msg,error=false)=>{const n=$('[data-infra-error]');n.textContent=msg;n.dataset.error=String(error);};
  async function api(path='',method='GET',data=null){
    const key=token();
    if(!key)throw new Error('최고관리자 로그인이 필요합니다.');
    const response=await fetch('/api/control/infra-costs'+path,{
      method,cache:'no-store',headers:{authorization:'Bearer '+key,...(data?{'content-type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{})
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error||'HTTP '+response.status);
    return body;
  }
  const td=(row,value)=>{const cell=document.createElement('td');if(value instanceof Node)cell.append(value);else cell.textContent=String(value??'—');row.append(cell);return cell;};
  const label=(str,className='')=>{const n=document.createElement('span');n.textContent=str;if(className)n.className=className;return n;};
  function renderProviders(data){
    const host=$('[data-infra-providers]');host.replaceChildren();
    for(const p of data.providers||[]){
      const relevant=(data.usage||[]).filter(u=>u.provider===p.id||p.id==='github'&&u.provider==='github-actions');
      const related=(data.invoices||[]).filter(x=>x.provider===p.id);
      const card=document.createElement('article');
      const header=document.createElement('div');header.className='infra-provider-head';
      const name=document.createElement('strong');name.textContent=p.name;header.append(name,label(p.category,'infra-chip'));card.append(header);
      const telemetry=label(relevant.length?'사용량 계측 있음':'사용량 연동 필요',relevant.length?'infra-link-state linked':'infra-link-state pending');
      card.append(telemetry);
      const lines=document.createElement('p');
      lines.textContent=related.length+'건 청구 · '+(relevant.length?'사용량 계측 '+relevant.length+'개':'자동 사용량 연동 필요');
      card.append(lines);
      if(relevant.length){
        const metrics=document.createElement('small');
        metrics.textContent=relevant.slice(0,2).map(x=>x.metric+' '+Number(x.observed_value).toLocaleString('ko-KR')+(x.free_limit!=null?' / '+Number(x.free_limit).toLocaleString('ko-KR'):'')).join(' · ');
        card.append(metrics);
      }
      if(p.consoleUrl){
        const a=document.createElement('a');a.href=p.consoleUrl;a.textContent='공급자 관리화면';a.target='_blank';a.rel='noopener noreferrer';card.append(a);
      }
      host.append(card);
    }
  }
  function renderInvoices(data){
    const host=$('[data-infra-invoices]');host.replaceChildren();
    const names=Object.fromEntries((data.providers||[]).map(p=>[p.id,p.name]));
    const search=($('[data-infra-invoice-search]')?.value||'').trim().toLocaleLowerCase('ko-KR');
    const statusFilter=$('[data-infra-invoice-filter]')?.value||'all';
    const all=data.invoices||[];
    const matched=all.filter(i=>(statusFilter==='all'||i.status===statusFilter)&&
      (!search||[names[i.provider],i.provider,i.invoice_number,i.account_label].some(v=>String(v||'').toLocaleLowerCase('ko-KR').includes(search))));
    setText('[data-infra-filter-count]',matched.length+' / '+all.length+'건 표시');
    for(const i of matched){
      const row=document.createElement('tr');
      td(row,names[i.provider]||i.provider);
      const inv=document.createElement('div');inv.append(label(i.invoice_number));if(i.source==='user-screenshot')inv.append(label(' 첨부 이미지 기준','infra-hint'));td(row,inv);
      td(row,(i.issued_on||'—')+' / '+(i.due_on||'—'));
      td(row,asMoney(i.amount_minor,i.currency));
      const status={unverified:'결제 여부 미확인',due:'미납 확인',paid:'납부 확인',cancelled:'취소'};
      td(row,label(status[i.status]||i.status,i.status==='due'?'infra-danger':'infra-status'));
      const select=document.createElement('select');
      select.setAttribute('aria-label',i.invoice_number+' 납부상태');
      for(const [key,text] of Object.entries(status)){
        const opt=document.createElement('option');opt.value=key;opt.textContent=text;opt.selected=key===i.status;select.append(opt);
      }
      const button=document.createElement('button');button.type='button';button.textContent='상태 저장';button.className='secondary compact';
      button.addEventListener('click',async()=>{
        if(select.value===i.status)return;
        if(!window.confirm('청구번호 '+i.invoice_number+'의 납부상태를 변경하고 감사기록에 남깁니다. 계속하시겠습니까?'))return;
        button.disabled=true;try{await api('/invoices/'+encodeURIComponent(i.id),'PATCH',{status:select.value});notice('납부상태를 기록했습니다.');await load(true);}
        catch(e){notice(e.message,true)}finally{button.disabled=false}
      });
      const controls=document.createElement('div');controls.className='infra-row-actions';controls.append(select,button);td(row,controls);
      host.append(row);
    }
    if(!host.children.length){const r=document.createElement('tr');const c=td(r,all.length?'검색 조건에 맞는 청구서가 없습니다.':'아직 등록된 청구서가 없습니다.');c.colSpan=6;host.append(r);}
  }
  function renderBudgets(data){
    const names=Object.fromEntries((data.providers||[]).map(p=>[p.id,p.name]));
    const host=$('[data-infra-budgets]');host.replaceChildren();
    const thisMonth=new Date().toISOString().slice(0,7);
    for(const b of data.budgets||[]){
      const amount=(data.invoices||[]).filter(x=>x.provider===b.provider&&x.currency===b.currency&&x.status!=='cancelled'&&x.issued_on?.startsWith(thisMonth)).reduce((n,x)=>n+Number(x.amount_minor),0);
      const r=document.createElement('tr');td(r,names[b.provider]||b.provider);td(r,asMoney(b.amount_minor,b.currency));td(r,asMoney(amount,b.currency));host.append(r);
    }
    if(!host.children.length){const r=document.createElement('tr');const c=td(r,'등록된 예산이 없습니다.');c.colSpan=3;host.append(r);}
    const warn=$('[data-infra-budget-alerts]');warn.replaceChildren();
    for(const x of data.overview?.budgetAlerts||[])warn.append(label('예산 주의: '+(names[x.provider]||x.provider)+' · '+asMoney(x.spentMinor,x.currency)+' / '+asMoney(x.budgetMinor,x.currency),'infra-alert'));
  }
  function renderRenewals(data){
    const names=Object.fromEntries((data.providers||[]).map(p=>[p.id,p.name]));
    const host=$('[data-infra-renewals]');host.replaceChildren();
    for(const x of data.renewals||[]){
      const r=document.createElement('tr');td(r,names[x.provider]||x.provider);td(r,x.asset_name);td(r,x.renew_on);
      td(r,x.amount_minor==null?'확인 필요':asMoney(x.amount_minor,x.currency));
      td(r,x.auto_renew?'설정됨':'미설정·미확인');host.append(r);
    }
    if(!host.children.length){const r=document.createElement('tr');const c=td(r,'등록된 갱신 일정이 없습니다.');c.colSpan=5;host.append(r);}
  }
  function render(data){
    current=data;
    const totals=Object.entries(data.overview?.totalsMinorByCurrency||{}).map(([cur,v])=>asMoney(v,cur));
    setText('[data-infra-total]',totals.join(' / ')||'—');
    setText('[data-infra-unverified]',data.overview?.unverified??0);
    setText('[data-infra-due]',(data.overview?.overdue??0)+' / '+(data.overview?.dueSoon??0));
    setText('[data-infra-renew]',data.overview?.renewSoon??0);
    setText('[data-infra-updated]',new Date(data.generatedAt).toLocaleString('ko-KR')+' 조회');
    root.querySelectorAll('[data-infra-provider-options]').forEach(select=>{
      const existing=select.value;select.replaceChildren();
      for(const p of data.providers||[]){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;select.append(o);}
      if(existing)select.value=existing;
    });
    renderProviders(data);renderInvoices(data);renderBudgets(data);renderRenewals(data);
  }
  async function load(force=false){
    if(loading||(!force&&current))return;
    if(app.hidden)return;
    loading=true;$('[data-infra-refresh]').disabled=true;
    try{render(await api());notice('청구·사용량 원장을 갱신했습니다.');}
    catch(e){notice('비용·인프라 정보를 불러오지 못했습니다. '+e.message,true);}
    finally{loading=false;$('[data-infra-refresh]').disabled=false;}
  }
  function formData(form){const entries=Object.fromEntries(new FormData(form).entries());for(const key of ['issuedOn','dueOn','periodStart','periodEnd','renewOn'])if(!entries[key])delete entries[key];return entries;}
  function saveForm(selector,path,transform=x=>x){
    $(selector).addEventListener('submit',async ev=>{
      ev.preventDefault();const form=ev.currentTarget,button=form.querySelector('button[type=submit]');button.disabled=true;
      try{await api(path,'POST',transform(formData(form),form));notice('등록·저장했습니다.');form.reset();await load(true);}
      catch(e){notice(e.message,true)}finally{button.disabled=false;}
    });
  }
  saveForm('[data-infra-invoice-form]','/invoices');
  saveForm('[data-infra-budget-form]','/budgets');
  saveForm('[data-infra-renewal-form]','/renewals',(x,form)=>({...x,autoRenew:form.elements.autoRenew.checked}));
  $('[data-infra-refresh]').addEventListener('click',()=>load(true));
  $('[data-infra-open-invoice]').addEventListener('click',()=>{
    const editor=$('[data-infra-invoice-editor]');editor.open=true;
    editor.scrollIntoView({behavior:'smooth',block:'start'});
    editor.querySelector('[name="provider"]')?.focus({preventScroll:true});
  });
  root.querySelectorAll('[data-infra-jump]').forEach(button=>button.addEventListener('click',()=>{
    const section=root.querySelector('#'+button.dataset.infraJump);
    section?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  $('[data-infra-invoice-search]').addEventListener('input',()=>{if(current)renderInvoices(current)});
  $('[data-infra-invoice-filter]').addEventListener('change',()=>{if(current)renderInvoices(current)});
  $('[data-infra-filter-reset]').addEventListener('click',()=>{
    $('[data-infra-invoice-search]').value='';
    $('[data-infra-invoice-filter]').value='all';
    if(current)renderInvoices(current);
    $('[data-infra-invoice-search]').focus();
  });
  const observer=new MutationObserver(()=>{if(!root.hidden&&!root.classList.contains('hidden-panel'))load()});
  observer.observe(root,{attributes:true,attributeFilter:['hidden','class']});
  if(location.pathname.endsWith('/'+SECTION)||location.hash==='#'+SECTION)queueMicrotask(()=>load());
  window.dispatchEvent(new CustomEvent('ekodi-feature-installed',{detail:{section:SECTION}}));
})();
