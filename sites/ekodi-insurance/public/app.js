const KEY='ekodi-insurance-staging-v1';
const state=loadState();
const views=[...document.querySelectorAll('.view')];

function loadState(){
  try{return JSON.parse(localStorage.getItem(KEY))||{policies:[],claims:[],consultations:[],diagnosis:null};}
  catch{return{policies:[],claims:[],consultations:[],diagnosis:null};}
}
function saveState(){localStorage.setItem(KEY,JSON.stringify(state));renderDashboard();renderPolicies();renderClaimPolicies();}
function money(v){return new Intl.NumberFormat('ko-KR').format(Number(v||0))+'원';}
function uid(){return crypto?.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2);}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function show(view){views.forEach(v=>v.classList.toggle('active',v.id===view));history.replaceState(null,'',view==='home'?'#home':'#'+view);window.scrollTo({top:0,behavior:'smooth'});}
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.append(el);setTimeout(()=>el.remove(),2200);}

document.addEventListener('click',e=>{const target=e.target.closest('[data-view]');if(target)show(target.dataset.view);});
document.getElementById('memberBtn').addEventListener('click',()=>toast('통합회원 인증은 별도 보안 검증 후 연결합니다.'));

function diagnosisScore(data){
  let score=55;
  const policies=Number(data.policyCount||0),premium=Number(data.premium||0);
  if(policies>0)score+=8;if(policies>=3)score+=6;if(data.family==='자녀 있음'||data.family==='부모 부양')score-=4;
  if(data.concern==='소득중단'||data.concern==='가족의 경제적 위험')score-=5;
  if(premium>350000)score-=7;if(premium>0&&premium<50000)score-=4;
  return Math.max(30,Math.min(88,score));
}
function diagnosisSignals(data){
  const signals=[];
  if(Number(data.policyCount||0)===0)signals.push(['red','보장기초 점검','등록된 보험이 없어 기본 의료·질병·사고 보장부터 확인이 필요합니다.']);
  else signals.push(['green','기존 보장 있음',`${data.policyCount}개의 기존 보험을 기준으로 중복과 공백을 확인해 보세요.`]);
  if(data.family==='자녀 있음'||data.family==='부모 부양')signals.push(['yellow','가족보장 확인','부양가족이 있어 소득중단·가족생활비 관련 위험을 함께 점검할 가치가 있습니다.']);
  if(Number(data.premium||0)>350000)signals.push(['yellow','보험료 부담 점검','월 보험료가 높게 입력되었습니다. 보장 대비 비용과 중복 여부를 확인해 보세요.']);
  else signals.push(['green','보험료 구조 확인',`현재 입력 보험료는 월 ${money(data.premium)}입니다. 금액 자체보다 보장 내용과 유지 가능성을 함께 보세요.`]);
  signals.push(['yellow','우선 관심영역',`${data.concern} 관련 보장이 실제 약관에서 어떻게 구성되어 있는지 확인해 보세요.`]);
  return signals.slice(0,4);
}

document.getElementById('diagnosisForm').addEventListener('submit',e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));data.score=diagnosisScore(data);data.createdAt=new Date().toISOString();state.diagnosis=data;saveState();
  const box=document.getElementById('diagnosisResult');
  const signals=diagnosisSignals(data).map(([c,t,d])=>`<div class="signal ${c}"><strong>${esc(t)}</strong><span>${esc(d)}</span></div>`).join('');
  box.innerHTML=`<div class="panel-head"><div><p class="eyebrow">MY COVERAGE MAP</p><h3>보험 건강도 ${data.score}점</h3></div><span class="pill">상담 준비용</span></div><div class="result-grid">${signals}</div><button class="secondary" data-view="advisor">설계사와 결과 확인</button><div class="disclaimer">이 결과는 입력 내용에 따른 일반적인 자기점검 가이드입니다. 특정 보험상품의 적합성, 가입 승인, 보험금 지급 가능성을 확정하지 않습니다.</div>`;
  box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'start'});
});

document.getElementById('policyForm').addEventListener('submit',e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));state.policies.unshift({...data,id:uid(),createdAt:new Date().toISOString()});saveState();e.currentTarget.reset();toast('내 보험에 추가했습니다.');
});
function renderPolicies(){
  const list=document.getElementById('policyList'),total=document.getElementById('policyTotal');total.textContent=`${state.policies.length}건`;
  if(!state.policies.length){list.className='list-empty';list.textContent='아직 등록된 보험이 없습니다.';return;}
  list.className='';list.innerHTML=state.policies.map(p=>`<article class="policy-item"><div><strong>${esc(p.product)}</strong><small>${esc(p.company)} · ${esc(p.purpose)} · 월 ${money(p.premium)}${p.reviewDate?' · 점검 '+esc(p.reviewDate):''}</small></div><div class="policy-actions"><button class="danger-link" data-delete-policy="${esc(p.id)}">삭제</button></div></article>`).join('');
}
document.getElementById('policyList').addEventListener('click',e=>{const b=e.target.closest('[data-delete-policy]');if(!b)return;state.policies=state.policies.filter(p=>p.id!==b.dataset.deletePolicy);saveState();toast('삭제했습니다.');});
function renderClaimPolicies(){const select=document.getElementById('claimPolicy');select.innerHTML='<option value="">선택 안 함</option>'+state.policies.map(p=>`<option value="${esc(p.id)}">${esc(p.company)} · ${esc(p.product)}</option>`).join('');}

function claimDocs(type){
  const common=['진료비 영수증 또는 사고 관련 비용 증빙','본인 확인 및 보험사에서 요구하는 청구정보'];
  const map={통원진료:['진료비 세부내역서','필요 시 처방전 또는 진단 관련 서류'],입원:['입퇴원확인서 또는 진단서','진료비 세부내역서'],수술:['수술확인서 또는 진단서','진료비 세부내역서'],'사고·상해':['사고경위 확인자료','진단서 또는 치료확인서'],기타:['보험사가 요청하는 사고·진료 관련 증빙']};
  return [...common,...(map[type]||map.기타)];
}
document.getElementById('claimForm').addEventListener('submit',e=>{
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));data.id=uid();data.createdAt=new Date().toISOString();state.claims.unshift(data);saveState();
  const selected=state.policies.find(p=>p.id===data.policy);const docs=claimDocs(data.type).map(x=>`<li>${esc(x)}</li>`).join('');
  const box=document.getElementById('claimResult');box.innerHTML=`<div class="panel-head"><div><p class="eyebrow">CLAIM PREP</p><h3>청구 준비 체크</h3></div><span class="pill neutral">${money(data.amount)}</span></div><p>${selected?`선택한 보험 <strong>${esc(selected.company)} · ${esc(selected.product)}</strong>을 기준으로`: '등록 보험을 지정하지 않은 상태에서'} 필요한 기본 준비사항을 정리했습니다.</p><ul class="check-list" style="color:var(--ink)">${docs}</ul><div class="signal yellow"><strong>다음 단계</strong><span>실제 청구는 해당 보험사 또는 공식 보험청구 채널에서 진행합니다. EKODI는 현재 청구서류와 절차를 정리해 주는 역할만 합니다.</span></div><div class="disclaimer">보험금 지급 여부와 필요서류는 계약 약관, 사고 내용, 보험사 심사에 따라 달라집니다. AI 안내는 지급 확정이 아닙니다.</div>`;box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'start'});
});

document.getElementById('advisorForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));state.consultations.unshift({...data,id:uid(),createdAt:new Date().toISOString(),status:'staging-local'});saveState();e.currentTarget.reset();toast('상담요청을 이 브라우저에 임시 저장했습니다.');});

function renderDashboard(){
  document.getElementById('homePolicyCount').textContent=`${state.policies.length}건`;
  document.getElementById('homeClaimCount').textContent=`${state.claims.length}건`;
  const review=state.policies.filter(p=>p.reviewDate&&new Date(p.reviewDate)<=new Date(Date.now()+1000*60*60*24*120)).length;
  document.getElementById('homeReviewCount').textContent=`${review}건`;
  document.getElementById('homeScore').textContent=state.diagnosis?.score??'--';
}

renderDashboard();renderPolicies();renderClaimPolicies();show((location.hash||'#home').slice(1));
