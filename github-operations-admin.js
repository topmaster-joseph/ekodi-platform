// EKODI GitHub operations — read-only panel inside the authenticated admin UI.
(() => {
  'use strict';
  let installed=false;
  function install() {
    if(installed)return;
    const host=document.querySelector('#aiOpsPanel');
    if(!host)return;
    const actions=host.querySelector('.ai-ops-head-actions')||host;
    const button=document.createElement('button');
    button.type='button';button.className='secondary';
    button.textContent='GitHub·AI 작업관리';
    const panel=document.createElement('section');
    panel.id='ekodiGithubOperationsPanel';
    panel.hidden=true;
    panel.style.cssText='margin:16px 0;padding:16px;border:1px solid var(--border,#8885);border-radius:12px';
    const title=document.createElement('h3');
    title.textContent='GitHub·AI 작업관리';
    const summary=document.createElement('p');
    summary.textContent='에코디 오케스트레이터의 승인된 GitHub 운영 증거를 확인합니다.';
    const rows=document.createElement('div');
    const refresh=document.createElement('button');
    refresh.type='button';refresh.textContent='다시 조회';
    panel.append(title,summary,rows,refresh);
    const load=async()=>{
      summary.textContent='작업 현황 확인 중…';
      rows.replaceChildren();
      try{
        const response=await fetch('/api/control/ai/v8/github?limit=20',{
          credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}
        });
        if(!response.ok)throw new Error('관리자 권한 또는 작업 DB를 확인하세요. HTTP '+response.status);
        const data=await response.json();
        const a=data.activation||{};
        const quota=data.apiQuota||{};
        summary.textContent='이벤트 관측 전용 · Webhook '+(a.ready?'서버 설정 확인':'서버 설정 미완료')+
          ' · 서명 이벤트 '+(a.receivingVerifiedEvents?'수신 확인':'수신 미확인')+
          ' · 공동 API 호출 차감 기능 미연결 · 자동 배포 권한 없음';
        const details=document.createElement('p');
        details.textContent='서명 이벤트 누적 '+Math.max(0,Number(a.verifiedEventCount)||0)+
          '건 · 마지막 수신 '+String(a.lastSignedEventAt||'없음')+
          ' · API 실측 '+String(quota.state||'미연결');
        rows.append(details);
        for(const job of data.jobs||[]){
          const line=document.createElement('p');
          line.textContent=[job.state,job.kind,job.operation_key?.slice(0,12),job.updated_at].join(' · ');
          rows.append(line);
        }
        if(!(data.jobs||[]).length)rows.textContent='수신 기록 없음 (Webhook 구성 여부 확인 필요)';
      }catch(error){summary.textContent=error?.message||'운영 현황을 조회하지 못했습니다.';}
    };
    button.addEventListener('click',()=>{panel.hidden=!panel.hidden;if(!panel.hidden)void load();});
    refresh.addEventListener('click',()=>void load());
    actions.append(button);
    host.append(panel);
    installed=true;
  }
  const observer=new MutationObserver(install);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  install();
})();
