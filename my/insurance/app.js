(() => {
  const KEY='ekodi-my-insurance-v1';
  const empty=()=>({policies:[],claims:[],lastCheck:null});
  function load(){try{const value=JSON.parse(localStorage.getItem(KEY)||'null');return value&&typeof value==='object'?{...empty(),...value}:empty()}catch{return empty()}}
  let state=load();
  const $=selector=>document.querySelector(selector);
  function save(){localStorage.setItem(KEY,JSON.stringify(state));renderAll()}
  function money(value){const n=Number(value)||0;return n?n.toLocaleString('ko-KR')+'원':'보험료 미기록'}
  function safe(value,max=200){return String(value||'').trim().slice(0,max)}
  function itemId(prefix){return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`}
  function checkResult(data){
    const items=[];
    const count=Number(data.policyCount)||0,premium=Number(data.premium)||0;
    if(count===0)items.push('현재 가입 보험이 없다면 필요한 위험과 공적보장부터 확인하세요.');
    if(count>=4)items.push('보험 수가 많다면 보장 중복·공백과 계약별 갱신일을 함께 정리해 보세요.');
    if(premium>0)items.push('월 보험료 총액이 현재 소득·지출에 무리가 없는지 정기적으로 확인하세요.');
    if(data.focus==='보장 중복·공백')items.push('비슷한 보장명이라도 지급조건과 한도가 다를 수 있으므로 약관 기준으로 비교하세요.');
    if(data.focus==='보험료 부담')items.push('해지나 변경 전에는 보장 공백, 재가입 가능성, 면책·감액기간을 먼저 확인하세요.');
    if(data.focus==='갱신·만기')items.push('갱신형 여부, 다음 갱신일, 보장 만기와 납입기간을 계약별로 정리하세요.');
    if(data.focus==='청구 준비')items.push('지급 가능성을 단정하지 말고 해당 보험사의 공식 청구서류와 접수경로를 확인하세요.');
    if(!items.length)items.push('가입목적, 보장기간, 보험료, 갱신일, 주요 면책사항을 계약별로 한 번씩 확인하세요.');
    return items;
  }
  function renderCheck(){const host=$('#checkResult');if(!host)return;if(!state.lastCheck){host.hidden=true;return}host.hidden=false;host.innerHTML='<h3>지금 확인할 관리 항목</h3><ul></ul><small></small>';const ul=host.querySelector('ul');for(const text of state.lastCheck.items){const li=document.createElement('li');li.textContent=text;ul.append(li)}host.querySelector('small').textContent=`최근 점검 ${new Date(state.lastCheck.at).toLocaleString('ko-KR')} · 상품 추천이 아닌 관리 체크리스트입니다.`}
  function renderPolicies(){const host=$('#policyList'),count=$('#policyCount');if(!host||!count)return;count.textContent=`${state.policies.length}건`;host.replaceChildren();if(!state.policies.length){host.className='empty';host.textContent='아직 기록한 보험이 없습니다.';return}host.className='';for(const policy of state.policies){const row=document.createElement('div');row.className='record';const info=document.createElement('div');const strong=document.createElement('strong');strong.textContent=`${policy.company} · ${policy.product}`;const small=document.createElement('small');small.textContent=`${policy.category} · ${money(policy.premium)}${policy.reviewDate?` · 점검 ${policy.reviewDate}`:''}`;info.append(strong,small);const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.addEventListener('click',()=>{state.policies=state.policies.filter(x=>x.id!==policy.id);save()});row.append(info,remove);host.append(row)}}
  function renderClaims(){const host=$('#claimList'),count=$('#claimCount');if(!host||!count)return;count.textContent=`${state.claims.length}건`;host.replaceChildren();if(!state.claims.length){host.className='empty';host.textContent='아직 청구 준비기록이 없습니다.';return}host.className='';for(const claim of state.claims){const row=document.createElement('div');row.className='record';const info=document.createElement('div');const strong=document.createElement('strong');strong.textContent=`${claim.type} · ${claim.date}`;const small=document.createElement('small');small.textContent=claim.memo;info.append(strong,small);const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.addEventListener('click',()=>{state.claims=state.claims.filter(x=>x.id!==claim.id);save()});row.append(info,remove);host.append(row)}}
  function renderAll(){renderCheck();renderPolicies();renderClaims()}
  $('#checkForm')?.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));state.lastCheck={at:new Date().toISOString(),age:safe(data.age,30),policyCount:Number(data.policyCount)||0,premium:Number(data.premium)||0,focus:safe(data.focus,80),memo:safe(data.memo,500),items:checkResult(data)};save();$('#checkResult')?.scrollIntoView({behavior:'smooth',block:'nearest'})});
  $('#policyForm')?.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));state.policies.unshift({id:itemId('pol'),company:safe(data.company,80),product:safe(data.product,120),premium:Number(data.premium)||0,category:safe(data.category,50),reviewDate:safe(data.reviewDate,20),createdAt:new Date().toISOString()});event.currentTarget.reset();save()});
  $('#claimForm')?.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));state.claims.unshift({id:itemId('clm'),type:safe(data.type,40),date:safe(data.date,20),memo:safe(data.memo,500),createdAt:new Date().toISOString()});event.currentTarget.reset();save()});
  $('#deleteAll')?.addEventListener('click',()=>{if(!confirm('이 브라우저에 저장한 보험점검·보험목록·청구 준비기록을 모두 삭제할까요?'))return;localStorage.removeItem(KEY);state=empty();renderAll()});
  renderAll();
})();