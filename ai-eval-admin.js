(() => {
  'use strict';
  const SOURCE='/api/control/ai/eval/summary';
  const $=selector=>document.querySelector(selector);
  const token=()=>{try{return localStorage.getItem('ekodi-auth-token')||''}catch{return''}};
  const add=(parent,tag,text,className)=>{const element=document.createElement(tag);if(className)element.className=className;element.textContent=text;parent.append(element);return element};
  const pct=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1?`${(100*v).toFixed(1)}%`:'확인필요';
  const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?`₩${Math.round(v).toLocaleString('ko-KR')}`:'확인필요';
  const date=v=>typeof v==='string'&&!Number.isNaN(Date.parse(v))?new Date(v).toLocaleString('ko-KR'):'확인필요';
  const measures=[['goal','목표달성'],['tools','도구정확도'],['efficiency','단계효율'],['cost','비용기준'],['latency','지연기준'],['safety','안전']];
  function render(message,data){
    const host=$('#aiEvalLabContent');if(!host)return;host.replaceChildren();
    if(!data){add(host,'p',message,'ai-eval-empty');return}
    add(host,'p',`검증시각 ${date(data.verifiedAt)} · 기준선 ${data.baselineVersion||'확인필요'} · ${data.sampleCount}문항 · 문항당 ${data.repeatCount}회`,'ai-eval-meta');
    const scroll=add(host,'div','','ai-eval-scroll'), table=document.createElement('table');scroll.append(table);
    const head=document.createElement('thead'),header=document.createElement('tr');head.append(header);table.append(head);
    ['AI / 버전',...measures.map(x=>x[1]),'평균비용','평균시간','회귀'].forEach(x=>add(header,'th',x));
    const tbody=document.createElement('tbody');table.append(tbody);
    data.rows.forEach(row=>{
      const tr=document.createElement('tr');tbody.append(tr);
      add(tr,'th',`${row.agentId} / ${row.version}`);
      for(const [key] of measures){const m=row.metrics?.[key];add(tr,'td',m&&m.estimate!=null?`${pct(m.estimate)} (${pct(m.lower)}–${pct(m.upper)})`:'확인필요')}
      add(tr,'td',amount(row.averageCostKrw));add(tr,'td',typeof row.averageLatencyMs==='number'?`${Math.round(row.averageLatencyMs)}ms`:'확인필요');add(tr,'td',typeof row.regressionCount==='number'?`${row.regressionCount}건`:'확인필요');
    });
  }
  function valid(data){return data?.status==='verified' && data?.provenance?.releaseReceipt && data?.provenance?.independentVerifier && typeof data.verifiedAt==='string' && Number.isInteger(data.sampleCount) && data.sampleCount>=50 && Number.isInteger(data.repeatCount) && data.repeatCount>=3 && data.repeatCount<=5 && typeof data.baselineVersion==='string' && Array.isArray(data.rows) && data.rows.length>0;}
  async function load(){
    render('검증된 성적표를 조회하는 중입니다.');
    const t=token();if(!t){render('관리자 인증이 필요합니다. 로그인 후 새로고침해 주세요.');return}
    try{const response=await fetch(SOURCE,{method:'GET',cache:'no-store',credentials:'same-origin',headers:{authorization:`Bearer ${t}`}});
      if(!response.ok){render(`확인필요 · 성적표 API ${response.status}. 실제 기준선과 관리자 전용 집계 API 연결을 확인해 주세요.`);return}
      const data=await response.json();if(!valid(data)){render('확인필요 · 검증 영수증, 독립검증자 또는 50문항×3회 이상 실측 증거가 없습니다. 예시 수치는 표시하지 않습니다.');return}
      render('',data);
    }catch{render('확인필요 · 성적표 조회에 실패했습니다. 운영 상태를 확인해 주세요.')}
  }
  function mount(){
    const section=$('#aiOpsPanel');if(!section||section.dataset.evalMounted==='true')return Boolean(section);
    const host=$('#aiOpsStageNav'),main=section.querySelector('.ai-ops-main');if(!host||!main)return false;
    const tab=host.querySelector('[data-aiops-stage-tab="eval"]');if(!tab)return false;
    const view=document.createElement('section');view.className='ai-ops-block ai-eval-lab-view';view.id='aiEvalLabPanel';view.setAttribute('aria-label','AI 성적표');
    const heading=document.createElement('div');heading.className='ai-eval-heading';view.append(heading);add(heading,'h3','EKODI Eval Lab · AI 성적표');
    const refresh=add(heading,'button','새로고침');refresh.type='button';refresh.addEventListener('click',load);
    const content=add(view,'div','검증된 평가 데이터 연결 대기','ai-eval-content');content.id='aiEvalLabContent';main.prepend(view);
    tab.addEventListener('click',load);section.dataset.evalMounted='true';return true;
  }
  const start=()=>{if(mount())return;const observer=new MutationObserver(()=>{if(mount())observer.disconnect()});observer.observe(document.body,{childList:true,subtree:true})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
