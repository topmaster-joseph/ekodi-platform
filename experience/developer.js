(()=>{
'use strict';
const $=selector=>document.querySelector(selector);
const input=$('#manifestInput');
const result=$('#validationResult');
const version=$('#contractVersion');
let contract=null;
const get=(value,path)=>path.split('.').reduce((current,key)=>current?.[key],value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const patchFor=(path,value)=>path.split('.').reverse().reduce((current,key)=>({[key]:current}),value);
const render=(title,items=[],pass=false)=>{
  result.className=`result ${pass?'pass':'fail'}`;
  result.innerHTML=`<strong>${esc(title)}</strong>${items.length?`<ul>${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`:'<p>검사할 항목이 없습니다.</p>'}`;
};
const correction=(failure)=>{
  const guide=contract?.remediation?.guidance?.[failure.path]||{};
  const expected=failure.expected;
  const suggested=failure.kind==='missing'
    ? {[failure.path]:contract?.sampleManifest?.[failure.path]??{}}
    : patchFor(failure.path,expected);
  return {
    code:guide.code||(failure.kind==='missing'?'CONTRACT-MISSING':'CONTRACT-INVARIANT'),
    path:failure.path,
    actual:failure.actual===undefined?'없음':JSON.stringify(failure.actual),
    expected:failure.kind==='missing'?'필수 항목':JSON.stringify(expected),
    why:guide.why||'EKODI Integration Contract의 필수 조건과 일치해야 합니다.',
    fix:guide.fix||(failure.kind==='missing'?`${failure.path} 항목을 Manifest에 추가하세요.`:`${failure.path} 값을 ${JSON.stringify(expected)}로 수정하세요.`),
    suggested,
  };
};
const renderFailures=failures=>{
  const cards=failures.map(correction);
  result.className='result fail';
  result.innerHTML=`<strong>FAIL · ${cards.length}개 항목</strong><p>아래 수정안을 적용한 뒤 다시 검사하세요. 최종 판정은 EKODI CI가 수행합니다.</p><ol>${cards.map(card=>`<li><b>${esc(card.code)} · ${esc(card.path)}</b><div><small>현재</small> ${esc(card.actual)} · <small>기대</small> ${esc(card.expected)}</div><p><b>왜 필요한가</b> ${esc(card.why)}</p><p><b>수정 방법</b> ${esc(card.fix)}</p><pre><code>${esc(JSON.stringify(card.suggested,null,2))}</code></pre></li>`).join('')}</ol>`;
};
async function loadContract(){
  const response=await fetch('/api/contract',{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`contract_${response.status}`);
  contract=await response.json();
  version.textContent=contract.standard||contract.id||'Public Contract';
}
function validateManifest(value){
  const failures=[];
  for(const key of contract.required||[])if(value?.[key]===undefined)failures.push({kind:'missing',path:key,actual:undefined,expected:contract?.sampleManifest?.[key]});
  for(const [path,expected] of Object.entries(contract.invariants||{})){
    const actual=get(value,path);
    if(!equal(actual,expected))failures.push({kind:'invariant',path,actual,expected});
  }
  return failures;
}
$('#sampleBtn')?.addEventListener('click',async()=>{
  try{
    if(!contract)await loadContract();
    input.value=JSON.stringify(contract.sampleManifest||{},null,2);
    render('샘플 준비 완료',['필요한 값을 확인한 뒤 Conformance 검사를 실행하세요.'],true);
  }catch{render('샘플을 불러올 수 없습니다',['공개 Contract 연결 상태를 확인하세요.'],false);}
});
$('#validateBtn')?.addEventListener('click',async()=>{
  try{
    if(!contract)await loadContract();
    const value=JSON.parse(input.value||'{}');
    const failures=validateManifest(value);
    if(failures.length)return renderFailures(failures);
    render('EKODI CONFORMANT · PUBLIC PREFLIGHT',[contract.finalCertification||'최종 EKODI CI 및 staging 인증이 필요합니다.'],true);
  }catch(error){
    render('검사할 수 없습니다',[error instanceof SyntaxError?'JSON 문법을 확인하세요.':'공개 Contract를 불러오지 못했습니다.'],false);
  }
});
loadContract().catch(()=>{version.textContent='Public Contract unavailable';});
})();
