(()=>{
'use strict';
const $=selector=>document.querySelector(selector);
const input=$('#manifestInput');
const result=$('#validationResult');
const version=$('#contractVersion');
let contract=null;
const get=(value,path)=>path.split('.').reduce((current,key)=>current?.[key],value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const render=(title,items=[],pass=false)=>{
  result.className=`result ${pass?'pass':'fail'}`;
  result.innerHTML=`<strong>${title}</strong>${items.length?`<ul>${items.map(item=>`<li>${String(item).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</li>`).join('')}</ul>`:'<p>검사할 항목이 없습니다.</p>'}`;
};
async function loadContract(){
  const response=await fetch('/api/contract',{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error(`contract_${response.status}`);
  contract=await response.json();
  version.textContent=contract.standard||contract.id||'Public Contract';
}
function validateManifest(value){
  const failures=[];
  for(const key of contract.required||[])if(value?.[key]===undefined)failures.push(`CONTRACT-MISSING · ${key}`);
  for(const [path,expected] of Object.entries(contract.invariants||{})){
    const actual=get(value,path);
    if(!equal(actual,expected))failures.push(`CONTRACT-INVARIANT · ${path} = ${JSON.stringify(expected)} 필요`);
  }
  return failures;
}
function sample(){return {
  serviceId:'external-sample', responsibilityClass:'ekodi-responsible',
  serviceBoundary:{failureIsolation:true,extractable:true},
  identity:{serviceDoesNotOwnCanonicalIdentity:true,workspaceIdNeverDerivedFromUrl:true},
  dataBoundary:{crossServicePrivateDatabaseAccess:false}, capabilities:['sample-capability'],
  connections:{ekodiCrossServiceDefault:'api'},
  actionPolicy:{defaultMaximum:'L2',financialExecutionEnabled:false,irreversibleAutonomousExecution:false},
  projectionPolicy:{userMayRevoke:true}, lifecycle:{disconnectSafe:true,exportSupported:true,providerReplacementSupported:true},
  providerStrategy:{externalProviderPrivateDbAccess:false}, evidencePolicy:{insightRequiresEvidence:true}
};}
$('#sampleBtn')?.addEventListener('click',()=>{input.value=JSON.stringify(sample(),null,2);render('샘플 준비 완료',['필요한 값을 확인한 뒤 Conformance 검사를 실행하세요.'],true);});
$('#validateBtn')?.addEventListener('click',async()=>{
  try{
    if(!contract)await loadContract();
    const value=JSON.parse(input.value||'{}');
    const failures=validateManifest(value);
    if(failures.length)return render(`FAIL · ${failures.length}개 항목`,failures,false);
    render('EKODI CONFORMANT · PUBLIC PREFLIGHT',[contract.finalCertification||'최종 EKODI CI 및 staging 인증이 필요합니다.'],true);
  }catch(error){
    render('검사할 수 없습니다',[error instanceof SyntaxError?'JSON 문법을 확인하세요.':'공개 Contract를 불러오지 못했습니다.'],false);
  }
});
loadContract().catch(()=>{version.textContent='Public Contract unavailable';});
})();
