(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const prefix=location.pathname.startsWith('/ekodibiz/')?'/ekodibiz':'';
  const apiBase=prefix+'/api/agency/admin';
  let selected=null;
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
    $('detail').hidden=false;
    $('selectedTitle').textContent='신청 검토 · '+item.id;
    $('selectedBody').textContent=(item.customer||'')+' · '+(item.organization||'개인')+' · '+item.email+' · '+item.provider+' / '+item.service+' · '+item.months+'개월';
    $('quoteForm').elements.feeAmount.value=item.feeAmount??'';
    $('quoteForm').elements.supplierAmount.value=item.supplierAmount??0;
    $('quoteForm').elements.guidance.value=item.guidance||'';
    $('quoteBtn').disabled=!['awaiting_quote','quoted'].includes(item.status);
    $('activateBtn').hidden=item.status!=='paid_pending_fulfillment';
    $('detail').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function load() {
    try {
      const {items}=await call('/list');
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
  $('quoteForm').addEventListener('submit',async(event)=>{
    event.preventDefault();
    if(!selected) return;
    const form=$('quoteForm').elements;
    const feeAmount=Number(form.feeAmount.value), supplierAmount=Number(form.supplierAmount.value);
    if(!Number.isSafeInteger(feeAmount)||!Number.isSafeInteger(supplierAmount)) {message('원 단위 정수 금액을 입력하세요.',true);return;}
    if(!confirm(selected.id+'의 위탁료 '+feeAmount+'원, 공급사 수납 '+supplierAmount+'원을 견적 확정하시겠습니까?')) return;
    $('quoteBtn').disabled=true;
    try {await call('/quote',{id:selected.id,feeAmount,supplierAmount,guidance:form.guidance.value});await load();message('견적을 확정했습니다. 고객이 조회코드로 확인 후 동의할 수 있습니다.');}
    catch(e){message(e.message,true);$('quoteBtn').disabled=false;}
  });
  $('activateBtn').addEventListener('click',async()=>{
    if(!selected||selected.status!=='paid_pending_fulfillment') return;
    if(!confirm('실제 공급사 계정·이용권의 개시가 확인되었습니까? 확인하면 지금부터 1개월 또는 3개월 관리기간을 계산합니다.')) return;
    try {await call('/activate',{id:selected.id,confirmed:true});$('detail').hidden=true;await load();message('공급사 이용 개시일과 관리기간이 기록되었습니다.');}
    catch(e){message(e.message,true);}
  });
})();