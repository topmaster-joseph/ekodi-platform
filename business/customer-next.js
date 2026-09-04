const nextStepEl=(id)=>document.getElementById(id);

const NEXT_STEP_PROBLEMS={
  sales:{
    label:'매출을 늘리고 싶어요',icon:'↗',action:'prepare_sales_summary',
    title:'매출이 떨어진 이유부터 좁힙니다.',
    body:'신규 유입을 늘리기 전에 매출·재방문·마케팅 신호를 함께 보고 이번 주에 바꿀 한 가지를 정합니다.',
    value:'목표: 매출 회복 · 불필요한 광고비 방지',price:'기본 진단 무료 · 실제 실행부터 과금',
    links:{default:null,jadam:null}
  },
  repeat:{
    label:'단골을 늘리고 싶어요',icon:'↻',action:'segment_customers',
    title:'기존 고객이 다시 올 이유부터 만듭니다.',
    body:'동의된 고객 행동을 기준으로 재방문 대상과 메시지 초안을 준비하고, 사람의 확인 뒤 캠페인 실행으로 이어갑니다.',
    value:'목표: 재방문 증가 · 고객획득비용 절감',price:'대상 진단 무료 · 발송·운영 실행부터 과금',
    links:{default:'https://ekodi.kr/ekodibiz/marketing-ai',jadam:'https://ekodi.kr/jadam/marketing'}
  },
  marketing:{
    label:'홍보를 맡기고 싶어요',icon:'✦',action:'draft_campaign',
    title:'이번 주 홍보를 대신 준비합니다.',
    body:'무엇을 올릴지 고민하는 시간을 줄이고 콘텐츠·캠페인 초안을 만든 뒤 승인 가능한 실행 화면으로 연결합니다.',
    value:'목표: 홍보시간 절감 · 꾸준한 고객 접점',price:'아이디어·초안 무료 · 실행팩 또는 월 관리형 과금',
    links:{default:'https://ekodi.kr/ekodibiz/marketing-ai',jadam:'https://ekodi.kr/jadam/marketing'}
  },
  cost:{
    label:'비용을 줄이고 싶어요',icon:'↓',action:'suggest_energy_schedule',
    title:'어디서 돈이 새는지 먼저 찾습니다.',
    body:'전기료와 운영비를 무작정 줄이지 않고 기준선과 이상 증가를 찾아 절감 가능성이 큰 항목부터 확인합니다.',
    value:'목표: 비용 절감 · 손익 개선',price:'기본 진단 무료 · 정밀진단·절감 실행부터 과금',
    links:{default:null,jadam:'https://energy.ekodi.kr/jadam'}
  },
  people:{
    label:'사람이 필요해요',icon:'+',action:'submit_job_posting',
    title:'필요한 사람이나 업체를 연결합니다.',
    body:'직원·전문가·협력업체가 필요한 상황을 정리하고, 공개나 매칭은 사람의 확인을 거쳐 진행합니다.',
    value:'목표: 탐색시간 절감 · 적합한 연결',price:'필요조건 정리 무료 · 실제 연결·성사 시 과금',
    links:{default:'https://work.ekodi.kr',jadam:'https://work.ekodi.kr'}
  },
  unsure:{
    label:'잘 모르겠어요. 한번 봐주세요',icon:'?',action:'prepare_sales_summary',
    title:'전체 상태를 보고 이번 주 1순위를 정합니다.',
    body:'문제를 미리 정하지 않아도 됩니다. 연결된 데이터를 읽어 지금 가장 먼저 움직여야 할 한 가지를 찾습니다.',
    value:'목표: 우선순위 명확화 · 시행착오 감소',price:'기본 진단 무료 · 실행을 맡길 때 과금',
    links:{default:null,jadam:null}
  }
};

let activeProblem='unsure';

function currentNextWorkspace(){
  const path=location.pathname.replace(/^\/+|\/+$/g,'').toLowerCase();
  if(path==='jadam')return'jadam';
  const selector=nextStepEl('workspaceSelect');
  return selector?.value==='jadam'?'jadam':'ekodibiz';
}

function workspaceQuestion(){
  const jadam=currentNextWorkspace()==='jadam';
  const question=nextStepEl('businessQuestion');
  const intro=nextStepEl('problemIntro');
  if(question)question.textContent=jadam?'오늘 우리 매장에서 가장 해결하고 싶은 것은 무엇인가요?':'사업하면서 지금 가장 해결하고 싶은 것은 무엇인가요?';
  if(intro)intro.textContent=jadam?'자담치킨 목포대점의 문제를 고르면 매장 상황에 맞는 다음 행동을 보여드립니다.':'문제를 고르면 에코디가 지금 필요한 다음 행동과 실제 실행 방법을 연결합니다.';
}

function renderProblemButtons(){
  document.querySelectorAll('[data-next-problem]').forEach(button=>{
    const code=button.dataset.nextProblem;
    const item=NEXT_STEP_PROBLEMS[code];
    if(!item)return;
    const label=button.querySelector('[data-problem-label]');
    if(label)label.textContent=item.label;
    button.classList.toggle('active',code===activeProblem);
    button.setAttribute('aria-pressed',code===activeProblem?'true':'false');
  });
}

function renderNextStep(code=activeProblem){
  const item=NEXT_STEP_PROBLEMS[code]||NEXT_STEP_PROBLEMS.unsure;
  activeProblem=code in NEXT_STEP_PROBLEMS?code:'unsure';
  renderProblemButtons();
  workspaceQuestion();
  const jadam=currentNextWorkspace()==='jadam';
  nextStepEl('nextStepBadge').textContent=jadam?'자담치킨 · 이번 주 1순위':'이번 주 1순위';
  nextStepEl('nextStepTitle').textContent=item.title;
  nextStepEl('nextStepBody').textContent=item.body;
  nextStepEl('nextStepValue').textContent=item.value;
  nextStepEl('nextStepPrice').textContent=item.price;
  const link=nextStepEl('nextStepLink');
  const href=jadam?item.links.jadam:item.links.default;
  if(href){link.href=href;link.hidden=false;link.textContent=code==='cost'?'비용 진단 열기':code==='people'?'연결 준비 열기':'전문 실행 화면 열기'}
  else{link.hidden=true;link.removeAttribute('href')}
  const status=nextStepEl('nextStepStatus');
  status.textContent='먼저 안전하게 준비할 수 있는 범위를 확인합니다.';
  status.className='next-step-status';
}

async function requestDoItForMe(){
  const item=NEXT_STEP_PROBLEMS[activeProblem]||NEXT_STEP_PROBLEMS.unsure;
  const workspace=currentNextWorkspace();
  const button=nextStepEl('doItForMe');
  const status=nextStepEl('nextStepStatus');
  button.disabled=true;button.textContent='준비 범위 확인 중…';
  try{
    const response=await fetch('/api/action-check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:item.action,workspace,requestedBy:'human'})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||`http_${response.status}`);
    if(data.decision==='blocked'){
      status.textContent=`자동 실행하지 않습니다. ${data.message||'사람의 결정이 필요한 행동입니다.'}`;
      status.className='next-step-status blocked';
    }else if(data.decision==='human_review'){
      status.textContent=`사람의 확인 뒤 진행할 수 있습니다. ${data.message||''}`;
      status.className='next-step-status review';
    }else{
      status.textContent='에코디가 먼저 초안·진단·실행 준비를 만들 수 있습니다. 실제 외부 실행은 사람의 확인 뒤 진행합니다.';
      status.className='next-step-status ready';
    }
    const href=workspace==='jadam'?item.links.jadam:item.links.default;
    if(href){const link=nextStepEl('nextStepLink');link.href=href;link.hidden=false}
    else if(activeProblem==='unsure'||activeProblem==='sales')document.querySelector('.brief-panel')?.scrollIntoView({behavior:'smooth',block:'center'});
  }catch(error){
    console.error('Next step action check',error);
    status.textContent='실행 범위를 확인하지 못했습니다. 외부 실행은 시작하지 않았습니다.';
    status.className='next-step-status blocked';
  }finally{button.disabled=false;button.textContent='에코디가 해주세요'}
}

function installCustomerNextStep(){
  document.querySelectorAll('[data-next-problem]').forEach(button=>button.addEventListener('click',()=>renderNextStep(button.dataset.nextProblem)));
  nextStepEl('doItForMe')?.addEventListener('click',requestDoItForMe);
  nextStepEl('workspaceSelect')?.addEventListener('change',()=>setTimeout(()=>renderNextStep(activeProblem),0));
  window.addEventListener('popstate',()=>setTimeout(()=>renderNextStep(activeProblem),0));
  const name=nextStepEl('workspaceName');
  if(name)new MutationObserver(()=>renderNextStep(activeProblem)).observe(name,{childList:true,subtree:true,characterData:true});
  renderNextStep('unsure');
}

window.addEventListener('DOMContentLoaded',installCustomerNextStep);
