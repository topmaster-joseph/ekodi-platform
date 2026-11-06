// Customer-side AI purchase-agency application. No payment amounts accepted from user input.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const prefix = location.pathname.startsWith('/ekodibiz/') ? '/ekodibiz' : '';
  const apiBase = prefix + '/api/agency';
  const receiptKey = 'ekodibiz.ai.agency.receipt.v1';
  let receipt = null;
  let current = null;
  let checkout = null;
  let widgets = null;
  let loadedKey = '';
  let campusReport = null;

  const won = (n) => Number.isSafeInteger(n) ? new Intl.NumberFormat('ko-KR').format(n) + '원' : '견적 대기';
  function message(text, isError) {
    const el = $('message');
    el.textContent = text;
    el.className = isError ? 'error' : 'ok';
  }
  const errorTexts = {
    application_incomplete:'필수 항목과 동의 내용을 확인해 주세요.',
    invalid_receipt:'조회번호를 확인해 주세요.',
    not_found:'신청정보 또는 보안코드가 일치하지 않습니다.',
    quote_not_ready:'견적이 확정되지 않았습니다.',
    contract_not_accepted:'위탁조건 동의가 필요합니다.',
    pg_or_supplier_scope_not_enabled:'현재 이 계약 유형은 실결제 연결 전입니다. 상담 및 견적확인은 가능합니다.',
    payment_mismatch:'결제 금액이나 주문번호가 일치하지 않습니다.',
    pg_confirmation_mismatch:'결제 승인 내역을 검증하지 못했습니다. 중복 결제하지 마시고 문의해 주세요.',
    store_unavailable:'서비스 저장소 연결을 확인하고 있습니다.'
  };
  async function api(path, body) {
    const options = { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) };
    const response = await fetch(apiBase + path, options);
    let data;
    try { data = await response.json(); } catch { throw new Error('서버 응답 형식이 올바르지 않습니다.'); }
    if (!response.ok || !data.ok) throw new Error(errorTexts[data.error] || '요청을 처리하지 못했습니다. (' + (data.error || response.status) + ')');
    return data;
  }
  function saveReceipt(item) {
    // A contract code change is a security boundary: never retain prior details.
    current = null;
    checkout = null;
    widgets = null;
    loadedKey = '';
    campusReport = null;
    $('campusPanel').hidden = true;
    $('result').hidden = true;
    $('tossPanel').hidden = true;
    receipt = item;
    try { sessionStorage.setItem(receiptKey, JSON.stringify(item)); } catch {}
    $('lookupId').value = item.id;
    $('lookupToken').value = item.receiptToken;
  }

  function renderCampus(report) {
    campusReport=report && report.months===3 ? report : null;
    const panel=$('campusPanel');
    panel.hidden=!campusReport;
    if(!campusReport)return;
    const x=campusReport;
    $('campusFee').textContent=won(x.feeAmount);
    $('campusBudget').textContent=won(x.supplierBudget);
    $('campusSpent').textContent=won(x.recordedSupplierSpending);
    $('campusRemaining').textContent=x.unallocatedSupplierBudget===null?'견적 대기':won(x.unallocatedSupplierBudget);
    $('campusCancellation').textContent=x.renewalStopEvidenceRecorded
      ?'관리자 증빙 등록됨 · 공급사 원본 확인 필요':'갱신중단 증빙 미등록';
    const list=$('campusPeriods');
    list.replaceChildren();
    for(const p of x.periods){
      const li=document.createElement('li');
      li.textContent=p.status==='operator_recorded'
        ?p.cycle+'개월차 · '+won(p.amount)+' · '+p.paidOn+' · 영수증 '+p.receiptRef
        :p.cycle+'개월차 · 공급사 결제증빙 미등록';
      list.append(li);
    }
    $('campusLimitation').textContent=x.limitation;
  }
  function campusCsvValue(value) {
    const raw=String(value??'');
    const safe=/^\s*[=+@-]/.test(raw)||/^[\t\r\n]/.test(raw)?"'"+raw:raw;
    return '"'+safe.replace(/"/g,'""')+'"';
  }
  $('campusExport').addEventListener('click',()=>{
    if(!campusReport||!receipt)return;
    const x=campusReport;
    const rows=[
      ['문서','에코디비즈 대학 AI 구독료 위탁 정산요약'],
      ['위탁번호',x.agreementId],['기관명',x.organization],
      ['계약기간','3개월'],['계약상태',x.agreementStatus],
      ['위탁료',x.feeAmount],['공급사 비용 예산',x.supplierBudget],
      ['공급사 결제기록 합계',x.recordedSupplierSpending],
      ['미배정 예산(환급 확정액 아님)',x.unallocatedSupplierBudget],
      ['갱신중단 증빙등록',x.renewalStopEvidenceRecorded?'예':'아니오'],
      ['안내',x.limitation]
    ];
    for(const p of x.periods)rows.push([
      p.cycle+'개월차',p.status==='operator_recorded'?'수동기록':'미등록',
      p.amount??'',p.paidOn??'',p.receiptRef??''
    ]);
    const csv='\uFEFF'+rows.map(row=>row.map(campusCsvValue).join(',')).join('\r\n');
    const temp=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=temp;
    a.download='EKODIBIZ-기관정산-'+x.agreementId+'.csv';
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(temp),1000);
  });
  function paint(record) {
    current = record;
    $('result').hidden = false;
    $('receiptId').textContent = record.id;
    $('receiptType').textContent = record.type === 'institution' ? '대학·기관 · 3개월' : '개인 · 1개월';
    const states = { awaiting_quote:'견적 검토중', quoted:'견적 확정 · 동의 대기',
      accepted:'위탁조건 동의 완료 · 결제 준비', paid_pending_fulfillment:'결제 확인 · 공급사 이용신청 준비',
      active:'서비스 이용 진행중', expired:'계약기간 종료' };
    $('receiptStatus').textContent = states[record.status] || record.status;
    $('receiptFee').textContent = won(record.feeAmount);
    $('receiptSupplier').textContent = won(record.supplierAmount);
    $('receiptTotal').textContent = won(record.totalAmount);
    $('receiptEnd').textContent = record.expiresAt ? new Date(record.expiresAt).toLocaleDateString('ko-KR', {timeZone:'Asia/Seoul'}) : '결제 이후 확정';
    $('receiptGuide').textContent = record.guidance || '개별 계약과 승인 범위를 확인한 뒤 진행합니다.';
    $('acceptBtn').hidden = record.status !== 'quoted';
    $('paymentBtn').hidden = record.status !== 'accepted';
    if (record.status !== 'accepted') $('tossPanel').hidden = true;
    $('result').scrollIntoView({behavior:'smooth', block:'nearest'});
  }
  async function refresh() {
    if (!receipt) { message('신청 조회번호와 보안코드를 입력해 주세요.', true); return; }
    const queried = {id:receipt.id,receiptToken:receipt.receiptToken};
    try {
      const data = await api('/status', queried);
      // An older pending response must not paint a different university.
      if(!receipt||receipt.id!==queried.id||receipt.receiptToken!==queried.receiptToken)return;
      paint(data.record);
      renderCampus(data.campus);
      message('최신 신청 상태를 확인했습니다.', false);
    } catch (error) {
      if(!receipt||receipt.id!==queried.id||receipt.receiptToken!==queried.receiptToken)return;
      current=null;campusReport=null;checkout=null;widgets=null;loadedKey='';
      $('result').hidden=true;$('campusPanel').hidden=true;$('tossPanel').hidden=true;
      message(error.message, true);
    }
  }
  const form = $('agencyForm');
  form.querySelectorAll('[name="type"]').forEach((input) => input.addEventListener('change', () => {
    const institution = form.elements.type.value === 'institution';
    $('organizationGroup').hidden = !institution;
    form.elements.organization.required = institution;
  }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = $('submitBtn');
    button.disabled = true;
    try {
      const data = await api('/apply', {
        type:form.elements.type.value, customer:form.elements.customer.value,
        email:form.elements.email.value, organization:form.elements.organization.value,
        provider:form.elements.provider.value, service:form.elements.service.value,
        description:form.elements.description.value,
        consent:form.elements.consent.checked, terms:form.elements.terms.checked
      });
      saveReceipt({id:data.id,receiptToken:data.receiptToken});
      message('신청서가 접수되었습니다. 보안코드를 복사해 보관해 주세요.', false);
      await refresh();
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });
  $('lookupBtn').addEventListener('click', async () => {
    const id = $('lookupId').value.trim(), token = $('lookupToken').value.trim();
    if (!id || !token) { message('신청번호와 보안코드를 모두 입력해 주세요.', true); return; }
    saveReceipt({ id, receiptToken:token });
    await refresh();
  });
  $('refreshBtn').addEventListener('click', refresh);
  $('copyBtn').addEventListener('click', async () => {
    if (!receipt) return;
    const value = '에코디비즈 위탁신청\n신청번호: ' + receipt.id + '\n조회 보안코드: ' + receipt.receiptToken;
    try { await navigator.clipboard.writeText(value); message('조회정보가 복사되었습니다. 안전한 곳에 보관하세요.', false); }
    catch { message('복사할 수 없습니다. 신청번호와 보안코드를 직접 보관해 주세요.', true); }
  });
  $('acceptBtn').addEventListener('click', async () => {
    if (!receipt || !current || current.status !== 'quoted') return;
    if (!confirm('표시된 위탁 범위, 계약기간, 확정 금액 및 환불정책을 확인했으며, 이 견적의 유상 계약 진행에 동의하십니까?')) return;
    try {
      const data = await api('/accept', {...receipt, accepted:true});
      paint(data.record);
      message('계약조건 동의가 기록되었습니다. 결제 승인 상태를 확인해 주세요.', false);
    } catch (error) { message(error.message, true); }
  });
  function loadToss() {
    if (window.TossPayments) return Promise.resolve();
    return new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.tosspayments.com/v2/standard';
      script.onload = resolve;
      script.onerror = () => reject(new Error('토스페이먼츠 결제 모듈을 불러올 수 없습니다.'));
      document.head.appendChild(script);
    });
  }
  $('paymentBtn').addEventListener('click', async () => {
    if (!receipt || !current || current.status !== 'accepted') return;
    const button = $('paymentBtn');
    button.disabled = true;
    try {
      checkout = await api('/checkout', receipt);
      if (!checkout.clientKey || !checkout.amount) throw new Error('결제정보가 준비되지 않았습니다.');
      await loadToss();
      if (loadedKey !== checkout.clientKey) {
        widgets = window.TossPayments(checkout.clientKey).widgets({customerKey:'ANONYMOUS'});
        await widgets.setAmount({currency:'KRW',value:checkout.amount});
        await widgets.renderPaymentMethods({selector:'#tossMethods',variantKey:'DEFAULT'});
        await widgets.renderAgreement({selector:'#tossAgreement',variantKey:'AGREEMENT'});
        loadedKey = checkout.clientKey;
      }
      $('tossPanel').hidden = false;
      message((checkout.mode === 'test' ? '시험결제' : '승인된 실결제') + ' 금액: ' + won(checkout.amount), false);
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });
  $('tossPayBtn').addEventListener('click', async () => {
    if (!receipt || !checkout || !widgets || checkout.orderId !== receipt.id) return;
    const path = location.pathname.replace(/\/$/, '');
    try {
      await widgets.requestPayment({
        orderId:checkout.orderId, orderName:checkout.orderName,
        successUrl:location.origin + path + '?result=success',
        failUrl:location.origin + path + '?result=failure'
      });
    } catch (error) { message('결제 요청이 완료되지 않았습니다. 결제내역을 확인해 주세요.', true); }
  });
  async function fromRedirect() {
    const params = new URLSearchParams(location.search);
    if (!params.get('result')) return;
    history.replaceState(null,'',location.pathname + location.hash);
    if (params.get('result') === 'failure') {
      message('결제 요청이 취소되거나 실패했습니다. 결제내역을 확인하고 다시 시도해 주세요.', true);
      return;
    }
    if (!receipt) {
      message('결제 승인에 필요한 신청 조회정보가 없습니다. 고객센터에 문의해 주세요. 중복 결제하지 마세요.', true);
      return;
    }
    try {
      const data = await api('/confirm', { ...receipt,
        orderId:params.get('orderId'), paymentKey:params.get('paymentKey'), amount:Number(params.get('amount')) });
      paint(data.record);
      message('토스페이먼츠 서버 승인 결과를 확인했습니다. AI 서비스 이용 신청 진행상황을 확인해 주세요.', false);
    } catch (error) { message(error.message + ' 중복 결제하지 마세요.', true); }
  }
  try {
    const saved = sessionStorage.getItem(receiptKey);
    const data = saved ? JSON.parse(saved) : null;
    if (data && typeof data.id === 'string' && typeof data.receiptToken === 'string') saveReceipt(data);
  } catch {}
  (async () => { await fromRedirect(); if (receipt) await refresh(); })();
})();