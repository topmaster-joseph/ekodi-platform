/* EKODI BIZ seasonal public demo: no network, account, storage, or server writes. */
(function(){
 'use strict';
 const el=id=>document.getElementById(id);
 const all=sel=>Array.from(document.querySelectorAll(sel));
 function progress(selector,output,label){
  const boxes=all(selector),result=el(output);
  if(!result)return;
  const update=()=>{const count=boxes.filter(box=>box.checked).length;result.textContent=label+' '+count+' / '+boxes.length+' · 참고용 자체 확인';};
  boxes.forEach(box=>box.addEventListener('change',update));update();
 }
 const demand=el('swp-demand-form');
 if(demand){
  const result=el('swp-demand-result');
  demand.addEventListener('submit',event=>{
   event.preventDefault();if(!demand.reportValidity())return;
   const workers=Number(el('demand-workers').value);
   const months=Number(el('demand-months').value);
   if(!Number.isSafeInteger(workers)||workers<1||workers>1000||
      !Number.isSafeInteger(months)||months<1||months>8)return;
   const items=['[수요조사 시연 · 공식 신청이 아닙니다]',
    '작목: '+el('demand-crop').value,
    '희망 인원: '+workers+'명',
    '희망 시작: '+el('demand-start').value,
    '희망 기간: '+months+'개월',
    '숙소 준비: '+el('demand-housing').value,
    '통역 지원: '+el('demand-translate').value,
    '예상 인력 수요: '+(workers*months)+'인·개월',
    '※ 입력값은 서버에 전송되거나 저장되지 않습니다. 실제 근로자 배정이나 허가를 의미하지 않습니다.'];
   result.hidden=false;result.style.display='block';result.style.whiteSpace='pre-line';
   result.textContent=items.join('\n');result.scrollIntoView({block:'nearest'});
  });
  demand.addEventListener('reset',()=>{result.hidden=true;result.textContent='';});
 }
 all('[data-mou-filter]').forEach(button=>button.addEventListener('click',()=>{
  const type=button.getAttribute('data-mou-filter');
  all('[data-mou-filter]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  all('[data-mou-row]').forEach(row=>{row.hidden=type!=='전체'&&row.getAttribute('data-kind')!==type;});
 }));
 all('[data-mou]').forEach(button=>button.addEventListener('click',()=>{
  const title=button.getAttribute('data-title');
  const heading=el('swp-mou-preview'),message=el('swp-mou-info');
  if(heading)heading.textContent=title;
  if(message)message.textContent='선택한 문서 유형: '+button.getAttribute('data-mou')+' · 표준 양식 구조 참고용(실제 협약서 아님)';
 }));
 progress('[data-check-progress]','swp-check-status','확인');
 progress('[data-housing-check]','swp-housing-status','확인');
 const metric=el('swp-metric-form');
 if(metric){
  metric.addEventListener('submit',event=>{
   event.preventDefault();if(!metric.reportValidity())return;
   const w=Number(el('swp-metric-workers').value),m=Number(el('swp-metric-months').value),result=el('swp-metric-result');
   if(!Number.isSafeInteger(w)||w<1||w>1000||!Number.isSafeInteger(m)||m<1||m>8)return;
   result.hidden=false;result.textContent='수요량 '+(w*m)+'인·개월 · 시연 결과이며 공식 운영 실적이 아닙니다.';
  });
 }
})();
