(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const prefix=location.pathname.startsWith('/ekodibiz/')?'/ekodibiz':'';
  const apiBase=prefix+'/api/agency/admin';
  let selected=null;
  let settlement=null;
  // Tab panels preserve the existing server-key financial/authorization boundary.
  const adminTabs=Array.from(document.querySelectorAll('[data-admin-tab]'));
  function showAdminTab(target, focus=false){
    for(const tab of adminTabs){
      const locked=!['list','readiness'].includes(tab.dataset.adminTab)&&!selected;
      tab.disabled=locked;
      tab.setAttribute('aria-disabled',locked?'true':'false');
    }
    if(!['list','readiness'].includes(target)&&!selected)return;
    for(const tab of adminTabs){
      const active=tab.dataset.adminTab===target;
      tab.setAttribute('aria-selected',active?'true':'false');
      tab.tabIndex=active?0:-1;
      if(active&&focus)tab.focus();
    }
    $('adminApplications').hidden=target!=='list';
    $('detail').hidden=target!=='review';
    $('opsDetail').hidden=target!=='settlement';
    $('approvalPanel').hidden=target!=='readiness';
    if(target==='settlement'&&selected)void showSettlement().catch(error=>message(error.message,true));
  }
  for(const tab of adminTabs){
    tab.addEventListener('click',()=>showAdminTab(tab.dataset.adminTab));
    tab.addEventListener('keydown',event=>{
      const available=adminTabs.filter(item=>!item.disabled);
      const index=available.indexOf(tab);
      if(index<0)return;
      let next=null;
      if(event.key==='ArrowRight')next=available[(index+1)%available.length];
      if(event.key==='ArrowLeft')next=available[(index+available.length-1)%available.length];
      if(event.key==='Home')next=available[0];
      if(event.key==='End')next=available[available.length-1];
      if(next){event.preventDefault();showAdminTab(next.dataset.adminTab,true);}
    });
  }
  showAdminTab('list');
  const statusMap={awaiting_quote:'견적대기',quoted:'견적제시',accepted:'계약동의',paid_pending_fulfillment:'결제확인·공급사 개시대기',active:'서비스 개시',expired:'기간만료'};
  function message(value, error=false) { $('message').textContent=value; $('message').style.color=error?'#9e3728':'#24593b'; }
  async function call(path, body={}) {
    const key=$('adminKey').value.trim();
    if(key.length<32) throw new Error('서버에 등록된 관리자 인증키를 입력해 주세요.');
    const response=await fetch(apiBase+path,{
      method:'POST',
      headers:{'content-type':'application/json','x-ekodibiz-agency-admin':key},
      body:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok || !data.ok) throw new Error(data.error || '요청 실패 ('+response.status+')');
    return data;
  }
  function cell(tr,value) {const td=document.createElement('td');td.textContent=value;tr.append(td);return td;}
  function pick(item) {
    selected=item;
    $('selectedTitle').textContent='신청 검토 · '+item.id;
    $('selectedBody').textContent=(item.customer||'')+' · '+(item.organization||'개인')+' · '+item.email+' · '+item.provider+' / '+item.service+' · '+item.months+'개월';
    $('quoteForm').elements.feeAmount.value=item.feeAmount??'';
    $('quoteForm').elements.supplierAmount.value=item.supplierAmount??0;
    $('quoteForm').elements.guidance.value=item.guidance||'';
    $('quoteBtn').disabled=!['awaiting_quote','quoted'].includes(item.status);
    $('activateBtn').hidden=item.status!=='paid_pending_fulfillment';
    showAdminTab('review');
    $('detail').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function load() {
    try {
      const {items}=await call('/list');
      if(selected&&!items.some(item=>item.id===selected.id)){
        selected=null;
        settlement=null;
        showAdminTab('list');
      }
      const tbody=$('rows'); tbody.replaceChildren();
      if(!items.length){ const tr=document.createElement('tr');cell(tr,'아직 신청 내역이 없습니다.');tbody.append(tr);}
      for(const item of items) {
        const tr=document.createElement('tr');
        cell(tr,item.id+'\n'+(statusMap[item.status]||item.status));
        cell(tr,(item.customer||'')+'\n'+(item.organization||'')+'\n'+(item.email||''));
        cell(tr,(item.provider||'')+' / '+(item.service||'')+'\n'+item.months+'개월');
        cell(tr,item.totalAmount===null?'견적 미정':new Intl.NumberFormat('ko-KR').format(item.totalAmount)+'원');
        const action=cell(tr,'');
        const btn=document.createElement('button');btn.type='button';btn.className='secondary';btn.textContent='검토';btn.addEventListener('click',()=>pick(item));action.append(btn);
        tbody.append(tr);
      }
      message(items.length+'건의 신청내역을 조회했습니다.');
    } catch(e) { message(e.message,true); }
  }
  $('load').addEventListener('click',load);
  $('readinessBtn').addEventListener('click',async()=>{
    const btn=$('readinessBtn');
    btn.disabled=true;
    const target=$('readinessResults');
    target.textContent='결제 설정 확인 중입니다.';
    try {
      const {readiness:r}=await call('/readiness');
      const labels=[
        ['토스 결제 프로필 설정',r.paymentConfigured],
        ['PG 서비스 범위 등록',r.pgScopeEnabled],
        ['법적 승인증빙 참조번호',r.legalApprovalReferenceRecorded],
        ['PG 승인증빙 참조번호',r.pgApprovalReferenceRecorded],
        ['공급사 대리수납 승인',r.supplierCollectionScopeEnabled],
        ['공급사 승인증빙 참조번호',r.supplierApprovalReferenceRecorded],
        ['승인 공급사 허용목록',r.supplierAllowlistConfigured],
        ['원본 증빙 보관 검증',r.archiveVerified],
        ['PG 정산 활성상태 검증',r.settlementVerified],
        ['운영 결제 전환 스위치',r.liveSwitchEnabled]
      ];
      target.textContent='결제키 환경: '+(r.mode==='live'?'운영':r.mode==='test'?'시험':'미설정')+
        '\n위탁료 실결제: '+(r.serviceFeeLiveReady?'서버 설정 충족':'미활성/확인 필요')+
        '\n공급사 대리수납: '+(r.supplierCollectionLiveReady?'서버 설정 충족(계약별 공급사 재검증 필수)':'미활성/확인 필요')+
        '\n'+labels.map(([label,ready])=>(ready?'확인':'미등록/확인 필요')+' · '+label).join('\n');
    } catch(error) {
      target.textContent='서버 설정을 확인하지 못했습니다. '+error.message;
    } finally {btn.disabled=false;}
  });
  $('quoteForm').addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!selected) return;
    const form=$('quoteForm').elements;
    const feeAmount=Number(form.feeAmount.value), supplierAmount=Number(form.supplierAmount.value);
    if(!Number.isSafeInteger(feeAmount)||!Number.isSafeInteger(supplierAmount)) {message('원 단위 정수 금액을 입력하세요.',true);return;}
    if(!confirm(selected.id+'의 위탁료 '+feeAmount+'원, 공급사 수납 '+supplierAmount+'원을 견적 확정하시겠습니까?')) return;
    $('quoteBtn').disabled=true;
    try {await call('/quote',{id:selected.id,feeAmount,supplierAmount,guidance:form.guidance.value});selected=null;settlement=null;showAdminTab('list');await load();message('견적을 확정했습니다. 고객이 조회코드로 확인 후 동의할 수 있습니다.');}
    catch(e){message(e.message,true);$('quoteBtn').disabled=false;}
  });
  $('activateBtn').addEventListener('click',async()=>{
    if(!selected||selected.status!=='paid_pending_fulfillment') return;
    if(!confirm('실제 공급사 계정·이용권의 개시가 확인되었습니까? 확인하면 지금부터 '+selected.months+'개월의 관리기간을 계산합니다.')) return;
    try {await call('/activate',{id:selected.id,confirmed:true});selected=null;showAdminTab('list');await load();message('공급사 이용 개시일과 관리기간이 기록되었습니다.');}
    catch(e){message(e.message,true);}
  });
  function money(value){return Number.isSafeInteger(value)?new Intl.NumberFormat('ko-KR').format(value)+'원':'미확정';}
  async function showSettlement(){
    if(!selected)return;
    const result=await call('/settlement',{id:selected.id});
    settlement=result.settlement;
    const x=settlement;
    $('opsTitle').textContent=x.months+'개월 계약 결제·종료·정산';
    $('renewalTitle').textContent=x.months+'개월 계약 종료 확인';
    const cycles=x.cycles.map(c=>c.cycle+'개월차 · '+money(c.amount)+' · '+c.paidOn+' · '+c.receiptRef);
    $('settlementSummary').textContent=[
      '위탁번호: '+x.id,
      '계약상태: '+(statusMap[x.contractStatus]||x.contractStatus),
      '에코디비즈 위탁료: '+money(x.serviceFee),
      '공급사 구독료 예산: '+money(x.providerBudget),
      '수동 등록된 결제액: '+money(x.recordedSupplierSpending),
      '미배정 예산(환급 확정액 아님): '+money(x.unallocatedProviderBudget),
      '결제증빙: '+(cycles.length?cycles.join(' / '):'아직 등록된 영수증 없음'),
      '공급사 갱신중단 증빙: '+(x.renewalStopRecorded?'등록됨 · 개인 계정 유지 확인':'미등록'),
      '※ '+x.limitation
    ].join('\n');
    const mayRecord=['active','expired'].includes(x.contractStatus);
    const cycleSelect=$('cycleForm').elements.cycle;
    cycleSelect.replaceChildren();
    const recorded=new Set(x.cycles.map(item=>item.cycle));
    for(let i=1;i<=x.months;i++){
      if(recorded.has(i))continue;
      const option=document.createElement('option');
      option.value=String(i);option.textContent=i+'개월차';
      cycleSelect.append(option);
    }
    $('cycleForm').hidden=!mayRecord||x.providerBudget<=0||cycleSelect.options.length===0;
    $('renewalForm').hidden=!mayRecord||x.renewalStopRecorded;
    $('exportStatement').disabled=false;
  }
  $('cycleForm').elements.paidOn.value=new Date().toISOString().slice(0,10);
  $('cycleForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!selected||!settlement)return;
    const form=event.currentTarget;
    if(!form.reportValidity())return;
    const cycle=Number(form.elements.cycle.value);
    const amount=Number(form.elements.amount.value);
    if(!Number.isSafeInteger(amount)||amount<1){message('올바른 결제금액을 입력하세요.',true);return;}
    if(!confirm(cycle+'개월차의 실제 공급사 결제 영수증을 확인하셨습니까? 이 작업은 결제를 실행하지 않습니다.'))return;
    const button=$('recordCycleBtn');button.disabled=true;
    try{
      await call('/record-cycle',{id:selected.id,cycle,amount,
        paidOn:form.elements.paidOn.value,receiptRef:form.elements.receiptRef.value.trim(),confirmed:true});
      form.elements.receiptRef.value='';form.elements.amount.value='';
      await showSettlement();await load();
      message('공급사 결제증빙만 저장했습니다. 실제 결제는 실행하지 않았습니다.');
    }catch(e){message(e.message,true);}finally{button.disabled=false;}
  });
  $('renewalForm').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!selected||!settlement)return;
    const form=event.currentTarget;
    if(!form.reportValidity())return;
    if(!confirm('공급사의 갱신중단 확인번호를 직접 확인하셨습니까? 이 작업은 구독을 해지하지 않습니다.'))return;
    const button=$('stopRenewalBtn');button.disabled=true;
    try{
      await call('/stop-renewal',{id:selected.id,cancellationRef:form.elements.cancellationRef.value.trim(),
        personalAccountKept:form.elements.personalAccountKept.checked,confirmed:true});
      await showSettlement();await load();
      message('갱신중단 확인번호를 저장했습니다. 공급사에 해지 요청을 보내지는 않았습니다.');
    }catch(e){message(e.message,true);}finally{button.disabled=false;}
  });
  $('exportStatement').addEventListener('click',()=>{
    if(!selected||!settlement)return;
    const x=settlement;
    const rows=[
      ['에코디비즈','AI 구독료 결제위탁 정산요약'],
      ['신청번호',x.id],['계약기관·신청구분',x.organization||'개인'],
      ['위탁기간',x.months+'개월'],['계약상태',statusMap[x.contractStatus]||x.contractStatus],
      ['위탁료(원)',x.serviceFee],['공급사 구독료 예산(원)',x.providerBudget],
      ['결제증빙 등록 합계(원)',x.recordedSupplierSpending],
      ['미배정 금액(원)',x.unallocatedProviderBudget],
      ['갱신중단 확인번호',x.renewalStopReceipt?.receiptRef||'미등록'],
      ['중요 안내','미배정 금액은 환급 확정액이 아니며, 아래 기록은 수동 입력된 증빙입니다.'],
    ];
    for(const c of x.cycles)rows.push([c.cycle+'개월차 결제',c.paidOn+' / '+c.amount+'원 / '+c.receiptRef]);
    // Guard Excel/spreadsheet formula injection from organization/user-supplied text.
    const safeCell=value=>{
      const raw=String(value??'');
      const clean=/^[-=+@\t\r]/.test(raw)?"'"+raw:raw;
      return '"'+clean.replace(/"/g,'""')+'"';
    };
    const csv='\uFEFF'+rows.map(row=>row.map(safeCell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');
    link.href=url;link.download='EKODIBIZ-AI-정산-'+x.id+'.csv';
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });

})();