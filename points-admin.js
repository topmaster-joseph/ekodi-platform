// EKODI super-admin points governance: read-only, server-authorized.
(() => {
  'use strict';
  if(document.getElementById('ekodiPointsAdmin'))return;
  const host=document.querySelector('#app .content');
  if(!host)return;
  const root=document.createElement('section');
  root.id='ekodiPointsAdmin';
  root.className='section hidden-panel ekodi-points-admin';
  root.dataset.panel='points';
  root.dataset.section='points';
  root.hidden=true;
  root.innerHTML=`
  <style>
    .ekodi-points-admin{max-width:100%;min-width:0;color:#20382a}
    .ekodi-points-admin .point-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
    .ekodi-points-admin .point-head h2{margin:4px 0;font-size:25px}
    .ekodi-points-admin .point-head p,.ekodi-points-admin .point-help{color:#60766b;font-size:13px;line-height:1.6}
    .ekodi-points-admin button,.ekodi-points-admin a.point-link{border:1px solid #c9d9cf;border-radius:9px;padding:9px 12px;color:#164830;background:white;text-decoration:none;cursor:pointer;font-weight:700}
    .ekodi-points-admin .point-tools{display:flex;gap:9px}
    .ekodi-points-admin .point-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin:20px 0}
    .ekodi-points-admin .point-stats article{border:1px solid #dfebe1;border-radius:12px;padding:14px;background:#f5faf5}
    .ekodi-points-admin .point-stats strong{display:block;font-size:25px;font-variant-numeric:tabular-nums}
    .ekodi-points-admin .point-stats small{color:#63796c}
    .ekodi-points-admin .point-box{border:1px solid #dce7df;background:white;border-radius:12px;padding:14px;margin-top:14px}
    .ekodi-points-admin .point-box h3{font-size:16px;margin:0 0 10px}
    .ekodi-points-admin .point-scroll{overflow-x:auto}
    .ekodi-points-admin table{border-collapse:collapse;width:100%;min-width:520px;font-size:12px}
    .ekodi-points-admin th,.ekodi-points-admin td{border-bottom:1px solid #edf1ee;padding:9px;text-align:left;white-space:nowrap}
    .ekodi-points-admin th{background:#f8faf8}
    .ekodi-points-admin .point-on{color:#197039;font-weight:700}
    .ekodi-points-admin .point-off{color:#806c41}
    .ekodi-points-admin [data-point-status]{font-size:13px;color:#52685c;line-height:1.6}
    .ekodi-points-admin [data-point-status][data-error="true"]{color:#a42226}
  </style>
  <div class="point-head"><div><p>EKODI · 최고관리자 · 공통 서비스</p><h2>사이트별 활동포인트</h2><p>사이트별 적립 한도·적립 조건·전환 정책·기부 캠페인을 확인합니다.</p></div>
  <div class="point-tools"><button type="button" data-point-refresh>새로 확인</button><a class="point-link" href="/my/points/">내 포인트</a></div></div>
  <p role="status" aria-live="polite" data-point-status>서버에서 최고관리자 권한을 확인합니다.</p>
  <div class="point-stats"><article><strong data-point-kpi="sites">—</strong><small>등록 사이트</small></article>
  <article><strong data-point-kpi="active">—</strong><small>활성 사이트</small></article>
  <article><strong data-point-kpi="rules">—</strong><small>활성 적립 규칙</small></article>
  <article><strong data-point-kpi="transfers">—</strong><small>활성 전환 정책</small></article>
  <article><strong data-point-kpi="campaigns">—</strong><small>활성 기부 캠페인</small></article></div>
  <section class="point-box"><h3>사이트별 일일 적립 한도</h3><div class="point-scroll"><table data-point-table="sites"></table></div></section>
  <section class="point-box"><h3>활동별 적립 규칙</h3><div class="point-scroll"><table data-point-table="rules"></table></div></section>
  <section class="point-box"><h3>사이트 간 전환 정책</h3><div class="point-scroll"><table data-point-table="transfers"></table></div></section>
  <section class="point-box"><h3>포인트 기부 캠페인</h3><div class="point-scroll"><table data-point-table="campaigns"></table></div></section>
  <p class="point-help">조회 전용 화면입니다. 사이트·적립 규칙은 기본적으로 비활성화되며 운영 정책과 보안·회계 검증 후에만 활성화합니다. 포인트 기부는 현금 기부나 세제상 기부금과 다릅니다.</p>`;
  host.append(root);
  const $=selector=>root.querySelector(selector);
  const status=(message,error=false)=>{const el=$('[data-point-status]');el.textContent=message;el.dataset.error=String(error);};
  const columns={
    sites:[['site_id','사이트'],['display_name','명칭'],['daily_cap','일일 상한'],['enabled','운영']],
    rules:[['site_id','사이트'],['rule_id','조건'],['points','적립 P'],['daily_cap','일일 상한'],['daily_events','횟수'],['enabled','운영']],
    transfers:[['from_site','출발'],['to_site','도착'],['numerator','분자'],['denominator','분모'],['daily_cap','상한'],['enabled','운영']],
    campaigns:[['site_id','사이트'],['title','캠페인'],['recipient_name','수혜 대상'],['enabled','운영']],
  };
  function renderTable(name,rows){
    const table=$('[data-point-table="'+name+'"]');table.replaceChildren();
    const head=document.createElement('thead'),tr=document.createElement('tr');
    for(const [,label] of columns[name]){const cell=document.createElement('th');cell.textContent=label;tr.append(cell);}
    head.append(tr);table.append(head);
    const body=document.createElement('tbody');
    if(!rows.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=columns[name].length;cell.textContent='등록된 정책이 없습니다.';row.append(cell);body.append(row);}
    for(const item of rows){
      const row=document.createElement('tr');
      for(const [key] of columns[name]){
        const td=document.createElement('td'),value=item[key];
        td.textContent=key==='enabled'?(value===true?'활성':'비활성'):
          typeof value==='number'?value.toLocaleString('ko-KR'):String(value??'—');
        if(key==='enabled')td.className=value===true?'point-on':'point-off';
        row.append(td);
      }
      body.append(row);
    }
    table.append(body);
  }
  function clear(){for(const key of Object.keys(columns))renderTable(key,[]);for(const key of ['sites','active','rules','transfers','campaigns'])$('[data-point-kpi="'+key+'"]').textContent='—';}
  let busy=false;
  async function refresh(){
    if(busy)return;
    const token=sessionStorage.getItem('ekodi-auth-token')||'';
    if(!token){clear();status('관리자 로그인 후 조회할 수 있습니다.',true);return;}
    busy=true;const button=$('[data-point-refresh]');button.disabled=true;
    status('포인트 정책을 조회하고 있습니다.');
    try{
      const response=await fetch('/api/control/points/overview',{
        method:'GET',cache:'no-store',
        headers:{Authorization:'Bearer '+token},
        credentials:'same-origin',
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok){
        clear();status(response.status===403?'최고관리자 권한이 확인되지 않았습니다.':
          response.status===401?'관리자 로그인을 다시 확인해 주세요.':'포인트 데이터베이스 또는 조회 API 준비 상태를 확인해 주세요.',true);
        return;
      }
      if(body.read_only!==true)throw new Error('READ_ONLY_CONTRACT_REQUIRED');
      const lists={};
      for(const name of Object.keys(columns))lists[name]=Array.isArray(body[name])?body[name]:[];
      for(const name of Object.keys(columns))renderTable(name,lists[name]);
      const value=(name,count)=>$('[data-point-kpi="'+name+'"]').textContent=String(count);
      value('sites',lists.sites.length);
      value('active',lists.sites.filter(row=>row.enabled===true).length);
      value('rules',lists.rules.filter(row=>row.enabled===true).length);
      value('transfers',lists.transfers.filter(row=>row.enabled===true).length);
      value('campaigns',lists.campaigns.filter(row=>row.enabled===true).length);
      status('서버 검증된 조회 전용 운영 현황입니다.');
    }catch{clear();status('조회가 완료되지 않았습니다. API와 인증 상태를 확인해 주세요.',true);}
    finally{busy=false;button.disabled=false;}
  }
  $('[data-point-refresh]').addEventListener('click',refresh);
  clear();void refresh();
})();
