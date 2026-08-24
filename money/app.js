import { buildFinancialCleanupBrief } from './core.js';

const demoAccounts = [
  {id:'a1',institution:'국민은행',alias:'생활계좌',balance:1324000,inactiveDays:2,autoDebits:[{name:'통신비',amount:62000},{name:'보험료',amount:89000}],primary:true},
  {id:'a2',institution:'농협',alias:'예전 생활비',balance:67300,inactiveDays:482,autoDebits:[]},
  {id:'a3',institution:'신한은행',alias:'모임통장',balance:120120,inactiveDays:395,autoDebits:[{name:'정기후원',amount:10000}]},
  {id:'a4',institution:'우리은행',alias:'예전 급여계좌',balance:0,inactiveDays:228,autoDebits:[],linkedCard:true},
  {id:'a5',institution:'하나은행',alias:'대출연결계좌',balance:24000,inactiveDays:560,autoDebits:[],linkedLoan:true}
];

const money = value => `${Number(value||0).toLocaleString('ko-KR')}원`;
const labels = {keep:'유지',review:'검토',cleanup:'정리 추천',attention:'확인 필요'};

function render(accounts=demoAccounts){
  const brief=buildFinancialCleanupBrief(accounts,'a1');
  const s=brief.summary;
  document.querySelector('#summary').innerHTML = `
    <article class="metric"><span>연결 계좌</span><strong>${s.accounts}</strong><small>예시 분석</small></article>
    <article class="metric"><span>정리·확인 후보</span><strong>${s.actionable}</strong><small>AI 판단 후보</small></article>
    <article class="metric"><span>자동이체 연결</span><strong>${s.autoDebits}</strong><small>해지 전 우선 확인</small></article>
    <article class="metric"><span>표시 잔액</span><strong>${money(s.balance)}</strong><small>예시 데이터 기준</small></article>`;

  document.querySelector('#findings').innerHTML = brief.plan.findings.map(({status,reason,account})=>`
    <div class="finding ${status}">
      <div class="finding-top"><span class="badge">${labels[status]}</span><strong>${account.institution} · ${account.alias}</strong></div>
      <p>${reason}</p>
      <div class="meta"><span>미사용 ${account.inactiveDays.toLocaleString('ko-KR')}일</span><span>잔액 ${money(account.balance)}</span><span>자동이체 ${account.autoDebits.length}건</span></div>
    </div>`).join('');

  const steps=brief.plan.steps;
  document.querySelector('#plan').innerHTML = steps.length ? steps.map((step,index)=>`
    <div class="step">
      <span class="step-index">${index+1}</span>
      <div><strong>${step.label}</strong><p>${step.reason}</p><span class="gate">본인 승인 필요</span></div>
    </div>`).join('') : '<p class="empty">현재 예시에서는 추가 정리 단계가 없습니다.</p>';
}

function announce(){
  render();
  const target=document.querySelector('#summary');
  target.scrollIntoView({behavior:'smooth',block:'start'});
}

document.querySelector('#analyze')?.addEventListener('click',announce);
document.querySelector('#load-demo')?.addEventListener('click',render);
render();
