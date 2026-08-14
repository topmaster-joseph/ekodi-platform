const KEY='ekodi-insurance-staging-v2';
const LEGACY_KEY='ekodi-insurance-staging-v1';
const state=loadState();
const views=[...document.querySelectorAll('.view')];

function blankState(){return{policies:[],claims:[],consultations:[],diagnosis:null};}
function loadState(){
  try{
    const current=localStorage.getItem(KEY);
    if(current)return{...blankState(),...JSON.parse(current)};
    const legacy=localStorage.getItem(LEGACY_KEY);
    if(legacy){const migrated={...blankState(),...JSON.parse(legacy)};localStorage.setItem(KEY,JSON.stringify(migrated));localStorage.removeItem(LEGACY_KEY);return migrated;}
    return blankState();
  }catch{return blankState();}
}
function saveState(){localStorage.setItem(KEY,JSON.stringify(state));renderDashboard();renderPolicies();renderClaimPolicies();renderPrivacy();}
function money(v){return new Intl.NumberFormat('ko-KR').format(Number(v||0))+'원';}
function uid(){return crypto?.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2);}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function show(view){const exists=views.some(v=>v.id===view);const target=exists?view:'home';views.forEach(v=>v.classList.toggle('active',v.id===target));history.replaceState(null,'',target==='home'?'#home':'#'+target);window.scrollTo({top:0,behavior:'smooth'});}
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.append(el);setTimeout(()=>el.remove(),2400);}

document.addEventListener('click',e=>{const target=e.target.closest('[data-view]');if(target)show(target.dataset.view);});
document.getElementById('memberBtn').addEventListener('click',()=>toast('통합회원 연결은 민감정보 저장구조와 권한 검증 후 활성화합니다.'));

function diagnosisPriority(data){
  let flags=0;
  const policies=Number(data.policyCount||0),premium=Number(data.premium||0);
  if(policies===0)flags+=2;
  if(data.family==='자녀 있음'||data.family==='부모 부양')flags+=1;
  if(data.concern==='소득중단'||data.concern==='가족의 경제적 위험')flags+=1;
  if(premium>350000)flags+=1;
  if(policies>=5)flags+=1;
  if(flags>=3)return{level:'우선 점검',tone:'red',copy:'여러 관리 항목이 함께 보여 기존 계약의 보장내용과 유지부담을 차례로 확인하는 편이 좋습니다.'};
  if(flags>=1)return{level:'추가 확인',tone:'yellow',copy:'몇 가지 확인할 항목이 있습니다. 기존 약관과 현재 생활조건을 함께 살펴보세요.'};
  return{level:'기초 정리',tone:'green',copy:'현재 입력만으로 긴급 신호를 판단하지 않습니다. 보험목록과 갱신일을 정리해 두면 다음 점검이 쉬워집니다.'};
}
function diagnosisSignals(data){
  const signals=[];
  const policies=Number(data.policyCount||0),premium=Number(data.premium||0);
  if(policies===0)signals.push(['red','기존 계약 확인 필요','등록된 보험이 없어 현재 보장구조를 판단할 근거가 부족합니다. 먼저 실제 가입내역을 확인해 주세요.']);
  else signals.push(['green','기존 계약부터 검토',`${policies}개의 보험이 있다고 입력했습니다. 상품을 새로 찾기 전에 기존 계약의 주요 보장과 갱신조건부터 확인하세요.`]);
  if(data.family==='자녀 있음'||data.family==='부모 부양')signals.push(['yellow','가족 상황 반영','부양가족이 있으므로 생활비·소득중단 등 가족의 경제적 위험을 상담 시 함께 확인할 수 있습니다.']);
  if(premium>350000)signals.push(['yellow','유지부담 확인',`월 보험료가 ${money(premium)}로 입력되었습니다. 금액만으로 적정성을 판단하지 말고 소득 대비 유지 가능성과 중복 보장을 확인하세요.`]);
  else signals.push(['green','보험료는 내용과 함께 확인',`월 보험료는 ${money(premium)}로 입력되었습니다. 보험료 크기만으로 충분·부족을 판단하지 않습니다.`]);
  signals.push(['yellow','관심 위험 확인',`${data.concern}에 대한 실제 보장 여부는 보험증권·약관 또는 적법한 상담을 통해 확인해야 합니다.`]);
  return signals.slice(0,4);
}
function analysisRules(){return['보험 개수','월 보험료 구간','부양가족 여부','사용자가 선택한 관심 위험'];}

document.getElementById('diagnosisForm').addEventListener('submit',e=>{
  e.preventDefault();
  const data=Object.fromEntries(new FormData(e.currentTarget));
  data.priority=diagnosisPriority(data);data.createdAt=new Date().toISOString();state.diagnosis=data;saveState();
  const box=document.getElementById('diagnosisResult');
  const signals=diagnosisSignals(data).map(([c,t,d])=>`<div class="signal ${c}"><strong>${esc(t)}</strong><span>${esc(d)}</span></div>`).join('');
  const rules=analysisRules().map(x=>`<li>${esc(x)}</li>`).join('');
  box.innerHTML=`<div class="panel-head"><div><p class="eyebrow">MY COVERAGE CHECK</p><h3>점검 우선도 · ${esc(data.priority.level)}</h3></div><span class="pill ${esc(data.priority.tone)}">상품추천 아님</span></div><p class="muted">${esc(data.priority.copy)}</p><div class="result-grid">${signals}</div><details class="logic-details"><summary>AI 점검 기준 보기</summary><p>현재 MVP는 다음 입력을 단순 규칙으로 조합해 확인 순서를 제시합니다. 특정 상품의 적합성이나 가입 필요성을 계산하지 않습니다.</p><ul>${rules}</ul></details><button class="secondary" data-view="advisor">상담 준비 메모로 이동</button><div class="disclaimer">이 결과는 자기점검용 정보입니다. 특정 보험상품의 비교·추천, 적합성 판단, 가입 승인 또는 보험금 지급 가능성을 의미하지 않습니다.</div>`;
  box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'start'});
});

document.getElementById('policyForm').addEventListener('submit',e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));state.policies.unshift({...data,id:uid(),createdAt:new Date().toISOString()});saveState();e.currentTarget.reset();toast('내 보험 목록에 추가했습니다.');
});
function renderPolicies(){
  const list=document.getElementById('policyList'),total=document.getElementById('policyTotal');total.textContent=`${state.policies.length}건`;
  if(!state.policies.length){list.className='list-empty';list.textContent='아직 등록된 보험이 없습니다.';return;}
  list.className='';list.innerHTML=state.policies.map(p=>`<article class="policy-item"><div><strong>${esc(p.product)}</strong><small>${esc(p.company)} · ${esc(p.purpose)} · 월 ${money(p.premium)}${p.reviewDate?' · 점검 '+esc(p.reviewDate):''}</small></div><div class="policy-actions"><button class="danger-link" data-delete-policy="${esc(p.id)}">삭제</button></div></article>`).join('');
}
document.getElementById('policyList').addEventListener('click',e=>{const b=e.target.closest('[data-delete-policy]');if(!b)return;state.policies=state.policies.filter(p=>p.id!==b.dataset.deletePolicy);saveState();toast('보험 기록을 삭제했습니다.');});
function renderClaimPolicies(){const select=document.getElementById('claimPolicy');select.innerHTML='<option value="">선택 안 함</option>'+state.policies.map(p=>`<option value="${esc(p.id)}">${esc(p.company)} · ${esc(p.product)}</option>`).join('');}

function claimDocs(type){
  const common=['진료비 영수증 또는 사고 관련 비용 증빙','보험사 공식 청구채널에서 요구하는 본인확인 정보'];
  const map={통원진료:['진료비 세부내역서','필요한 경우 처방전 또는 진료확인 서류'],입원:['입퇴원확인서 또는 보험사가 요구하는 진단 관련 서류','진료비 세부내역서'],수술:['수술확인 관련 서류','진료비 세부내역서'], '사고·상해':['사고경위 확인자료','보험사가 요구하는 치료확인 자료'],기타:['보험사가 요청하는 사고·진료 관련 증빙']};
  return [...common,...(map[type]||map.기타)];
}
document.getElementById('claimForm').addEventListener('submit',e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));data.id=uid();data.createdAt=new Date().toISOString();state.claims.unshift(data);saveState();
  const selected=state.policies.find(p=>p.id===data.policy);const docs=claimDocs(data.type).map(x=>`<li>${esc(x)}</li>`).join('');
  const box=document.getElementById('claimResult');box.innerHTML=`<div class="panel-head"><div><p class="eyebrow">CLAIM PREP</p><h3>청구 준비 체크</h3></div><span class="pill neutral">${money(data.amount)}</span></div><p>${selected?`선택한 보험 <strong>${esc(selected.company)} · ${esc(selected.product)}</strong>을 참고하여`: '등록 보험을 지정하지 않은 상태에서'} 일반적인 준비사항을 정리했습니다.</p><ul class="check-list dark-list">${docs}</ul><div class="signal yellow"><strong>다음 단계</strong><span>실제 필요서류와 접수방법은 해당 보험사의 공식 청구채널에서 다시 확인하세요. 현재 EKODI는 보험금 지급 가능성을 판정하지 않습니다.</span></div><div class="disclaimer">필요서류와 보험금 지급 여부는 계약 약관, 사고 내용, 보험사 심사에 따라 달라질 수 있습니다.</div>`;box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'start'});
});

document.getElementById('advisorForm').addEventListener('submit',e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));state.consultations.unshift({...data,id:uid(),createdAt:new Date().toISOString(),status:'staging-local'});saveState();e.currentTarget.reset();toast('상담 메모를 이 브라우저에 임시 저장했습니다.');
});

function renderDashboard(){
  document.getElementById('homePolicyCount').textContent=`${state.policies.length}건`;
  document.getElementById('homeClaimCount').textContent=`${state.claims.length}건`;
  const review=state.policies.filter(p=>p.reviewDate&&new Date(p.reviewDate)<=new Date(Date.now()+1000*60*60*24*120)).length;
  document.getElementById('homeReviewCount').textContent=`${review}건`;
  const priority=state.diagnosis?.priority||null;
  document.getElementById('homePriority').textContent=priority?.level||'아직 점검 전';
  document.getElementById('homePriorityCopy').textContent=priority?.copy||'AI 점검을 시작하면 우선 확인할 항목을 보여드립니다.';
}
function renderPrivacy(){
  document.getElementById('privacyPolicyCount').textContent=`${state.policies.length}건`;
  document.getElementById('privacyClaimCount').textContent=`${state.claims.length}건`;
  document.getElementById('privacyConsultCount').textContent=`${state.consultations.length}건`;
  document.getElementById('privacyDiagnosis').textContent=state.diagnosis?'있음':'없음';
}

const deleteBox=document.getElementById('deleteConfirm');
document.getElementById('deleteAllDataBtn').addEventListener('click',()=>deleteBox.classList.remove('hidden'));
document.getElementById('cancelDeleteBtn').addEventListener('click',()=>deleteBox.classList.add('hidden'));
document.getElementById('confirmDeleteBtn').addEventListener('click',()=>{
  localStorage.removeItem(KEY);localStorage.removeItem(LEGACY_KEY);
  state.policies=[];state.claims=[];state.consultations=[];state.diagnosis=null;
  document.getElementById('diagnosisResult').classList.add('hidden');document.getElementById('diagnosisResult').replaceChildren();
  document.getElementById('claimResult').classList.add('hidden');document.getElementById('claimResult').replaceChildren();
  deleteBox.classList.add('hidden');renderDashboard();renderPolicies();renderClaimPolicies();renderPrivacy();toast('EKODI Insurance 로컬 데이터를 모두 삭제했습니다.');
});

renderDashboard();renderPolicies();renderClaimPolicies();renderPrivacy();show((location.hash||'#home').slice(1));
