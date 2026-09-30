const KEY='ekodi-insurance-staging-v3';
const LEGACY_KEYS=['ekodi-insurance-staging-v2','ekodi-insurance-staging-v1'];
const state=loadState();
const views=[...document.querySelectorAll('.view')];

function blankState(){return{policies:[],claims:[],consultations:[],diagnosis:null,advisorChat:{messages:[]}};}
function loadState(){
  try{
    const current=localStorage.getItem(KEY);
    if(current)return normalizeState(JSON.parse(current));
    for(const legacyKey of LEGACY_KEYS){
      const legacy=localStorage.getItem(legacyKey);
      if(!legacy)continue;
      const migrated=normalizeState(JSON.parse(legacy));
      localStorage.setItem(KEY,JSON.stringify(migrated));
      LEGACY_KEYS.forEach(k=>localStorage.removeItem(k));
      return migrated;
    }
    return blankState();
  }catch{return blankState();}
}
function normalizeState(value){const base=blankState();const merged={...base,...(value||{})};merged.advisorChat={...base.advisorChat,...(value?.advisorChat||{})};if(!Array.isArray(merged.advisorChat.messages))merged.advisorChat.messages=[];if(!Array.isArray(merged.consultations))merged.consultations=[];return merged;}
function saveState(){localStorage.setItem(KEY,JSON.stringify(state));renderDashboard();renderPolicies();renderClaimPolicies();renderPrivacy();renderAdvisorChat();}
function money(v){return new Intl.NumberFormat('ko-KR').format(Number(v||0))+'원';}
function uid(){return crypto?.randomUUID?.()||String(Date.now())+Math.random().toString(16).slice(2);}
function esc(v=''){return String(v).replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));}
function show(view){const exists=views.some(v=>v.id===view);const target=exists?view:'home';views.forEach(v=>v.classList.toggle('active',v.id===target));history.replaceState(null,'',target==='home'?'#home':'#'+target);window.scrollTo({top:0,behavior:'smooth'});if(target==='advisor')queueMicrotask(()=>document.getElementById('aiChatInput')?.focus());}
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.append(el);setTimeout(()=>el.remove(),2400);}
function ensureChatStyles(){if(document.querySelector('link[href="/chat.css"]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='/chat.css';document.head.append(link);}

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
  box.innerHTML=`<div class="panel-head"><div><p class="eyebrow">MY COVERAGE CHECK</p><h3>점검 우선도 · ${esc(data.priority.level)}</h3></div><span class="pill ${esc(data.priority.tone)}">상품추천 아님</span></div><p class="muted">${esc(data.priority.copy)}</p><div class="result-grid">${signals}</div><details class="logic-details"><summary>AI 점검 기준 보기</summary><p>현재 MVP는 다음 입력을 단순 규칙으로 조합해 확인 순서를 제시합니다. 특정 상품의 적합성이나 가입 필요성을 계산하지 않습니다.</p><ul>${rules}</ul></details><button class="secondary" data-view="advisor">AI와 이어서 상담하기</button><div class="disclaimer">이 결과는 자기점검용 정보입니다. 특정 보험상품의 비교·추천, 적합성 판단, 가입 승인 또는 보험금 지급 가능성을 의미하지 않습니다.</div>`;
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
  const box=document.getElementById('claimResult');box.innerHTML=`<div class="panel-head"><div><p class="eyebrow">CLAIM PREP</p><h3>청구 준비 체크</h3></div><span class="pill neutral">${money(data.amount)}</span></div><p>${selected?`선택한 보험 <strong>${esc(selected.company)} · ${esc(selected.product)}</strong>을 참고하여`: '등록 보험을 지정하지 않은 상태에서'} 일반적인 준비사항을 정리했습니다.</p><ul class="check-list dark-list">${docs}</ul><div class="signal yellow"><strong>다음 단계</strong><span>실제 필요서류와 접수방법은 해당 보험사의 공식 청구채널에서 다시 확인하세요. 현재 EKODI는 보험금 지급 가능성을 판정하지 않습니다.</span></div><button class="secondary" data-view="advisor">AI에게 청구 관련 질문하기</button><div class="disclaimer">필요서류와 보험금 지급 여부는 계약 약관, 사고 내용, 보험사 심사에 따라 달라질 수 있습니다.</div>`;box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'start'});
});

function setupAdvisorChat(){
  ensureChatStyles();
  document.querySelectorAll('[data-view="advisor"]').forEach(button=>{const strong=button.querySelector('strong');const small=button.querySelector('small');if(strong)strong.textContent='AI 상담';else if(button.closest('.nav'))button.textContent='AI 상담';if(small)small.textContent='AI 채팅 후 필요할 때 설계사 전화 연결';});
  const section=document.getElementById('advisor');
  section.innerHTML=`<div class="section-head"><div><p class="eyebrow">AI INSURANCE CONCIERGE</p><h2>AI 보험상담</h2></div><button class="text-button" data-view="home">홈으로</button></div>
    <div class="boundary-banner"><strong>AI가 먼저 충분히 상담합니다.</strong><span>기존 보험 이해, 보장 점검, 청구 준비를 돕습니다. 특정 상품의 가입을 확정적으로 권유하거나 보험금 지급을 보장하지 않습니다. 꼭 필요하고 사용자가 요청할 때만 실제 설계사 전화상담으로 연결합니다.</span></div>
    <div class="chat-layout">
      <div class="panel chat-panel">
        <div class="chat-head"><div><span class="ai-dot"></span><strong>EKODI Insurance AI</strong><small>STAGING · 외부 AI 전송 없음</small></div><button id="resetChatBtn" class="text-button" type="button">대화 지우기</button></div>
        <div id="chatMessages" class="chat-messages" aria-live="polite"></div>
        <div class="quick-prompts" aria-label="빠른 질문"><button type="button" data-chat-prompt="내 보험을 어떻게 점검하면 좋을까요?">내 보험 점검</button><button type="button" data-chat-prompt="병원비를 냈는데 보험청구는 무엇부터 확인해야 하나요?">보험청구</button><button type="button" data-chat-prompt="보험료가 부담되는데 무엇을 먼저 확인해야 하나요?">보험료</button></div>
        <form id="aiChatForm" class="chat-compose"><textarea id="aiChatInput" rows="2" maxlength="1200" required placeholder="보험에 대해 편하게 물어보세요. 주민번호, 상세 병명 등 불필요한 민감정보는 입력하지 마세요."></textarea><button class="primary" type="submit">보내기</button></form>
        <p class="notice">현재 스테이징에서는 대화가 이 브라우저에만 저장됩니다. 실제 생성형 AI 모델에는 전송하지 않고 상담 흐름과 안전경계를 검증합니다.</p>
      </div>
      <aside class="panel handoff-panel">
        <span class="pill">HUMAN HANDOFF</span><h3>실제 설계사가 꼭 필요할 때</h3><p>AI 상담으로 해결되지 않거나 실제 상품 설명·가입 절차가 필요하면 사용자가 직접 전화상담을 요청할 수 있습니다.</p>
        <button id="requestHumanBtn" class="secondary" type="button">설계사 전화상담 요청</button>
        <form id="humanRequestForm" class="stack hidden">
          <label>이름<input name="name" required maxlength="60" /></label>
          <label>연락처<input name="contact" required maxlength="80" placeholder="전화번호 또는 연락 가능한 번호" /></label>
          <label>연락 희망시간<select name="preferredTime"><option>시간 관계없음</option><option>오전</option><option>오후</option><option>저녁</option></select></label>
          <div class="consent-box"><input id="humanConsent" type="checkbox" required /><label for="humanConsent"><strong>설계사 연락 요청</strong><span>AI 상담내용의 요약과 연락처를 상담 담당자가 확인하는 것에 동의합니다. 스테이징에서는 같은 브라우저의 관리자 화면에만 저장됩니다.</span></label></div>
          <button class="primary" type="submit">상담요청 등록</button>
        </form>
        <div class="handoff-note"><strong>관리자 관리항목</strong><span>고객명 · 연락처 · AI 상담요약 · 대화내용 · 요청시각 · 처리상태</span></div>
        <a class="admin-preview-link" href="/admin" target="_blank" rel="noopener">스테이징 상담관리 보기 →</a>
      </aside>
    </div>`;
  section.querySelector('#aiChatForm').addEventListener('submit',handleChatSubmit);
  section.querySelectorAll('[data-chat-prompt]').forEach(button=>button.addEventListener('click',()=>sendUserMessage(button.dataset.chatPrompt)));
  section.querySelector('#requestHumanBtn').addEventListener('click',()=>showHumanRequest(true));
  section.querySelector('#humanRequestForm').addEventListener('submit',handleHumanRequest);
  section.querySelector('#resetChatBtn').addEventListener('click',resetAdvisorChat);
  if(!state.advisorChat.messages.length)addChatMessage('assistant','안녕하세요. EKODI Insurance AI입니다. 가입을 권유하기보다 현재 보험을 이해하고 정리하는 것부터 도와드릴게요. 기존 보험, 보험료, 보장 점검, 보험금 청구 중 무엇이 가장 궁금하신가요?',false);
  renderAdvisorChat();
}
function addChatMessage(role,text,save=true){state.advisorChat.messages.push({id:uid(),role,text:String(text).slice(0,2400),createdAt:new Date().toISOString()});if(state.advisorChat.messages.length>60)state.advisorChat.messages=state.advisorChat.messages.slice(-60);if(save)saveState();}
function renderAdvisorChat(){const host=document.getElementById('chatMessages');if(!host)return;host.innerHTML=state.advisorChat.messages.map(m=>`<article class="chat-message ${m.role==='user'?'user':'assistant'}"><span>${m.role==='user'?'나':'AI'}</span><p>${esc(m.text)}</p></article>`).join('');host.scrollTop=host.scrollHeight;}
function needsHuman(text){return /(설계사|전화|연락|상담원|사람과|사람 상담|가입 상담|직접 상담|콜백)/i.test(text);}
function aiReply(text){
  const q=text.trim();
  if(needsHuman(q))return '네. 실제 설계사의 설명이나 전화상담이 꼭 필요하시면 연결 요청을 남길 수 있습니다. 오른쪽의 “설계사 전화상담 요청”에서 연락처를 입력해 주세요. AI 상담내용은 요약과 함께 상담 담당자에게 전달하도록 설계합니다.';
  if(/(청구|병원|진료|입원|수술|실손|사고)/i.test(q))return '보험청구는 먼저 ① 어떤 보험에 가입했는지 ② 어떤 진료·사고였는지 ③ 보험사에서 요구하는 기본 증빙이 무엇인지 순서로 확인하면 좋습니다. 제가 지급 가능성을 확정할 수는 없지만 준비서류와 확인순서는 정리해 드릴 수 있습니다. “청구도움” 화면에 상황과 금액을 간단히 입력하면 기본 체크리스트를 볼 수 있어요.';
  if(/(추천|어떤 보험|뭐가 좋|가입할|상품|보험사)/i.test(q))return '특정 보험사나 상품을 바로 골라 권하는 방식으로는 답하지 않겠습니다. 먼저 현재 가입내역, 월 보험료, 가족상황, 가장 걱정되는 위험을 정리한 뒤 부족하거나 겹칠 수 있는 부분을 확인하는 것이 순서입니다. 실제 상품 설명이나 가입 절차가 필요하면 그때 설계사 전화상담을 요청할 수 있습니다.';
  if(/(보험료|비싸|부담|줄이|해지)/i.test(q))return `보험료는 금액만 보고 줄이거나 해지하면 위험합니다. 현재 등록된 보험은 ${state.policies.length}건이고${state.policies.length?` 월 보험료 합계는 ${money(state.policies.reduce((a,p)=>a+Number(p.premium||0),0))}입니다.`:' 아직 세부 보험료를 등록하지 않았습니다.'} 보장 중복, 갱신 여부, 유지기간, 해지 시 불이익을 순서대로 확인한 뒤 판단하는 편이 안전합니다.`;
  if(/(보장|부족|중복|점검|정리)/i.test(q)){
    const priority=state.diagnosis?.priority?.level;
    return `현재 등록 보험은 ${state.policies.length}건입니다.${priority?` 최근 AI 점검은 “${priority}” 상태로 정리되어 있습니다.`:' 아직 AI 보험점검 결과는 없습니다.'} 새 상품을 찾기 전에 각 계약의 주요 보장, 갱신조건, 월 보험료, 가족상황과 맞지 않는 부분부터 하나씩 확인해 보세요. 원하시면 어떤 항목부터 볼지 질문을 이어가겠습니다.`;
  }
  if(/(안녕|처음|무엇을|뭘 물어)/i.test(q))return '저는 기존 보험 정리, 보험료 점검, 보장 확인 순서, 보험금 청구 준비를 도와드릴 수 있습니다. 특정 상품을 확정적으로 추천하거나 보험금 지급을 보장하지는 않습니다. 궁금한 상황을 한 문장으로 적어 주세요.';
  return '말씀하신 내용을 기준으로 먼저 사실관계를 정리하는 것이 좋겠습니다. 현재 가입한 보험이 무엇인지, 월 보험료가 어느 정도인지, 그리고 가장 걱정되는 위험이나 해결하고 싶은 문제가 무엇인지 알려주시면 확인 순서를 함께 정리해 드릴게요. 상세 병명이나 주민번호 같은 민감정보는 적지 않으셔도 됩니다.';
}
function sendUserMessage(text){const clean=String(text||'').trim();if(!clean)return;addChatMessage('user',clean,false);addChatMessage('assistant',aiReply(clean),false);localStorage.setItem(KEY,JSON.stringify(state));renderAdvisorChat();renderDashboard();renderPrivacy();if(needsHuman(clean))showHumanRequest(true);}
function handleChatSubmit(e){e.preventDefault();const input=e.currentTarget.querySelector('#aiChatInput');sendUserMessage(input.value);input.value='';input.focus();}
function showHumanRequest(on=true){const form=document.getElementById('humanRequestForm');if(!form)return;form.classList.toggle('hidden',!on);if(on)form.querySelector('input')?.focus();}
function summarizeConversation(messages){const userMessages=messages.filter(m=>m.role==='user').slice(-5).map(m=>m.text.trim()).filter(Boolean);if(!userMessages.length)return 'AI 상담 후 설계사 전화연락 요청';const text=userMessages.join(' / ');return text.length>260?text.slice(0,257)+'...':text;}
function handleHumanRequest(e){
  e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));const transcript=state.advisorChat.messages.slice(-30).map(m=>({role:m.role,text:m.text,createdAt:m.createdAt}));
  const item={id:uid(),name:data.name.trim(),contact:data.contact.trim(),preferredTime:data.preferredTime,summary:summarizeConversation(transcript),transcript,createdAt:new Date().toISOString(),status:'신규',source:'AI_CHAT_HANDOFF',sharedScope:'conversation_summary_and_contact'};
  state.consultations.unshift(item);addChatMessage('assistant','설계사 전화상담 요청이 등록되었습니다. 실제 운영에서는 담당자가 상담요약과 연락처를 확인한 뒤 연락드리도록 연결합니다. 현재 스테이징에서는 같은 브라우저의 관리자 화면에만 저장됩니다.',false);saveState();e.currentTarget.reset();showHumanRequest(false);toast('설계사 상담요청을 등록했습니다.');
}
function resetAdvisorChat(){if(!confirm('AI 상담 대화를 이 브라우저에서 삭제할까요? 상담요청으로 이미 저장한 대화 사본은 별도로 남아 있습니다.'))return;state.advisorChat.messages=[];addChatMessage('assistant','새 상담을 시작합니다. 현재 보험, 보험료, 보장 점검, 보험금 청구 중 무엇이 궁금하신가요?',false);saveState();}

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
  localStorage.removeItem(KEY);LEGACY_KEYS.forEach(k=>localStorage.removeItem(k));
  const empty=blankState();state.policies=empty.policies;state.claims=empty.claims;state.consultations=empty.consultations;state.diagnosis=null;state.advisorChat=empty.advisorChat;
  document.getElementById('diagnosisResult').classList.add('hidden');document.getElementById('diagnosisResult').replaceChildren();
  document.getElementById('claimResult').classList.add('hidden');document.getElementById('claimResult').replaceChildren();
  deleteBox.classList.add('hidden');
  addChatMessage('assistant','새 상담을 시작합니다. 현재 보험, 보험료, 보장 점검, 보험금 청구 중 무엇이 궁금하신가요?',false);
  localStorage.setItem(KEY,JSON.stringify(state));renderDashboard();renderPolicies();renderClaimPolicies();renderPrivacy();renderAdvisorChat();toast('EKODI Insurance 로컬 데이터를 모두 삭제했습니다.');
});

setupAdvisorChat();renderDashboard();renderPolicies();renderClaimPolicies();renderPrivacy();show((location.hash||'#home').slice(1));
