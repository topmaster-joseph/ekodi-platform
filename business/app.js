const cfg=window.EKODI_BUSINESS_CONFIG||{};
const sample={sales:1284000,salesDelta:8.4,customers:86,newCustomers:19,repeatRate:41,targetRepeatRate:45,openActions:7,pendingApprovals:2,marketing:{unansweredReviews:3,inactiveCustomers:47,campaignReady:true},operations:{overdueTasks:2,staffingGap:false},finance:{costPressure:'medium'},energy:{available:true}};

const $=(id)=>document.getElementById(id);
const money=(n)=>new Intl.NumberFormat('ko-KR',{style:'currency',currency:'KRW',maximumFractionDigits:0}).format(n);

function applyConfig(){
  if(cfg.authUrl&&$('authLink'))$('authLink').href=cfg.authUrl;
  const readiness=Number.isFinite(Number(cfg.readiness))?Math.min(100,Math.max(0,Number(cfg.readiness))):62;
  $('readinessScore').textContent=`${readiness}%`;
  $('readinessBar').style.width=`${readiness}%`;
}

function renderSample(){
  $('salesValue').textContent=money(sample.sales);
  $('salesDelta').textContent=`지난주 같은 요일 대비 ${sample.salesDelta>=0?'+':''}${sample.salesDelta}%`;
  $('customerValue').textContent=String(sample.customers);
  $('repeatValue').textContent=`${sample.repeatRate}%`;
  $('actionValue').textContent=String(sample.openActions);
}

function fallbackBrief(){
  return[
    {title:'재방문 고객을 먼저 깨우세요.',body:`30일 이상 미방문 샘플 고객 ${sample.marketing.inactiveCustomers}명이 있습니다. 일괄 발송보다 고객군을 나누고 메시지 초안을 승인받는 순서가 안전합니다.`},
    {title:'리뷰 응답 지연을 오늘 닫으세요.',body:`미응답 리뷰 ${sample.marketing.unansweredReviews}건을 우선 처리하면 고객 경험의 빈틈을 줄일 수 있습니다. AI는 답변 초안까지만 준비합니다.`},
    {title:'매출 상승을 비용 증가와 함께 보세요.',body:`샘플 매출은 전주 대비 ${sample.salesDelta}% 상승했습니다. 광고비·원가·할인비가 함께 늘었는지 확인한 뒤 캠페인 확대를 결정하세요.`}
  ];
}

function renderBrief(items,meta='local fallback'){
  const list=$('briefList');
  list.innerHTML='';
  items.slice(0,4).forEach((item,index)=>{
    const li=document.createElement('li');
    const n=document.createElement('span');
    n.textContent=String(index+1).padStart(2,'0');
    const body=document.createElement('div');
    const strong=document.createElement('strong');
    strong.textContent=item.title;
    const p=document.createElement('p');
    p.textContent=item.body;
    body.append(strong,p);li.append(n,body);list.append(li);
  });
  $('briefMeta').textContent=`분석 모드: ${meta} · 샘플 데이터 · ${new Date().toLocaleString('ko-KR')}`;
}

async function refreshBrief(){
  const button=$('refreshBrief');
  button.disabled=true;button.textContent='분석 중';
  try{
    const response=await fetch('/api/brief',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({metrics:sample})});
    if(!response.ok)throw new Error(`brief_${response.status}`);
    const data=await response.json();
    renderBrief(data.priorities||fallbackBrief(),data.mode||'rules');
  }catch{
    renderBrief(fallbackBrief(),'browser fallback');
  }finally{button.disabled=false;button.textContent='다시 분석'}
}

function resultText(data){
  if(data.decision==='blocked')return`자동 실행 불가 · ${data.message||data.reason}`;
  if(data.decision==='human_review')return`사람 승인 필요 · ${data.message||data.reason}`;
  if(data.decision==='draft_only')return`AI 초안 허용 · ${data.message||data.reason}`;
  return`${data.decision||'확인'} · ${data.message||data.reason||''}`;
}

async function checkAction(){
  const result=$('actionResult');
  const action=$('actionSelect').value;
  result.className='action-result';result.textContent='정책을 확인하고 있습니다.';
  try{
    const response=await fetch('/api/action-check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,tenant:'sample',requestedBy:'human'})});
    const data=await response.json();
    const cls=data.decision==='blocked'?'blocked':data.decision==='human_review'?'review':'allowed';
    result.className=`action-result ${cls}`;
    result.textContent=resultText(data);
  }catch{
    result.className='action-result blocked';
    result.textContent='정책 확인 API에 연결하지 못했습니다. 실행은 보류합니다.';
  }
}

applyConfig();
renderSample();
renderBrief(fallbackBrief(),'initial sample');
$('refreshBrief').addEventListener('click',refreshBrief);
$('checkAction').addEventListener('click',checkAction);
refreshBrief();
