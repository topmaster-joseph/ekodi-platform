function clientMain(){
  const root=document.documentElement;
  const path=location.pathname.replace(/\/+$/,'');
  if(root.dataset.ekodiRegionSurface!=='admin'||path!=='/cheonggye/admin')return;
  const host=document.querySelector('[data-region-operations-ledger]');
  if(!host)return;
  const token=()=>sessionStorage.getItem('ekodi-auth-token')||(()=>{try{return JSON.parse(sessionStorage.getItem('ekodi-region-admin-session')||'null')?.accessToken||''}catch{return''}})();

  const eventLabels={
    assigned:'운영권 등록',
    co_operator_added:'공동운영 추가',
    role_changed:'역할 변경',
    transfer_started:'운영권 이양 시작',
    transfer_completed:'운영권 이양 완료',
    suspended:'운영 중지',
    reactivated:'운영 재개',
    revoked:'운영권 회수',
  };
  const roleLabels={lead_operator:'주 운영단체',co_operator:'공동 운영단체',reviewer:'검수',publisher:'게시',viewer:'조회'};
  const statusLabels={active:'운영중',handover:'이양중',suspended:'중지',revoked:'회수'};
  const date=value=>{if(!value)return'-';const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString('ko-KR',{dateStyle:'medium',timeStyle:'short'})};

  function td(textValue){
    const node=document.createElement('td');
    node.textContent=String(textValue??'');
    return node;
  }

  function render(data){
    host.replaceChildren();

    const summary=document.createElement('div');
    summary.className='ledger-summary';
    const summaryItems=[
      ['활성 운영단체',data.summary?.activeOperators??0],
      ['서비스',data.summary?.moduleCount??0],
      ['주 운영권',data.summary?.leadAssignmentCount??0],
      ['이양 진행',data.summary?.handoverCount??0],
    ];
    for(const [label,value] of summaryItems){
      const item=document.createElement('div');
      item.className='ledger-kpi';
      const small=document.createElement('span');small.textContent=label;
      const strong=document.createElement('strong');strong.textContent=String(value);
      item.append(small,strong);summary.append(item);
    }
    host.append(summary);

    const currentTitle=document.createElement('h3');currentTitle.textContent='현재 운영권';currentTitle.className='ledger-title';host.append(currentTitle);
    const table=document.createElement('table');table.className='operator-table';
    table.innerHTML='<thead><tr><th>서비스</th><th>운영단체</th><th>역할</th><th>상태</th><th>적용일</th></tr></thead>';
    const body=document.createElement('tbody');
    for(const item of data.assignments||[]){
      const row=document.createElement('tr');
      row.append(
        td(item.moduleLabel||item.moduleId),
        td(item.operatorName||item.operatorId),
        td(roleLabels[item.role]||item.role),
        td(statusLabels[item.status]||item.status),
        td(date(item.effectiveFrom))
      );
      body.append(row);
    }
    if(!body.children.length){
      const row=document.createElement('tr');
      const cell=td('등록된 운영권이 없습니다.');cell.colSpan=5;row.append(cell);body.append(row);
    }
    table.append(body);host.append(table);

    const historyTitle=document.createElement('h3');historyTitle.textContent='최근 운영권 이력';historyTitle.className='ledger-title';host.append(historyTitle);
    const list=document.createElement('div');list.className='ledger-events';
    for(const event of data.history||[]){
      const item=document.createElement('div');item.className='ledger-event';
      const top=document.createElement('div');top.className='ledger-event__top';
      const strong=document.createElement('strong');strong.textContent=eventLabels[event.eventType]||event.eventType;
      const when=document.createElement('span');when.textContent=date(event.eventAt);
      top.append(strong,when);
      const detail=document.createElement('p');
      detail.textContent=[event.moduleLabel,event.operatorName,event.reason].filter(Boolean).join(' · ');
      item.append(top,detail);list.append(item);
    }
    if(!list.children.length){
      const empty=document.createElement('p');empty.className='muted';empty.textContent='기록된 운영권 변경이 없습니다.';list.append(empty);
    }
    host.append(list);

    const meta=document.createElement('p');meta.className='ledger-meta';
    const delegated=data.access?.delegatedOperator?.name?(' · 위임 운영: '+data.access.delegatedOperator.name):'';
    meta.textContent='운영 데이터는 지역플랫폼에 유지되며 변경 이력은 보존됩니다'+delegated+'.';
    host.append(meta);
  }

  async function load(){
    const auth=token();
    const headers={};if(auth)headers.authorization='Bearer '+auth;
    const response=await fetch('/api/local-operations/cheonggye',{headers,cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||data.code||('http_'+response.status));
    render(data);
  }

  function ready(event){
    const access=event?.detail||root.__EKODI_REGION_ACCESS__;
    const capabilities=new Set(access?.capabilities||[]);
    if(!(access?.platform||capabilities.has('*')||capabilities.has('tenant.operations.manage'))){
      host.hidden=true;
      return;
    }
    host.hidden=false;
    load().catch(error=>{
      host.replaceChildren();
      const p=document.createElement('p');p.className='muted';p.textContent='운영권 이력을 불러오지 못했습니다: '+error.message;host.append(p);
    });
  }

  document.addEventListener('ekodi:region-access-ready',ready,{once:true});
  if(root.__EKODI_REGION_ACCESS__)ready({detail:root.__EKODI_REGION_ACCESS__});
}

export function localRegionOperationsAdminScript(){
  return new Response('('+clientMain.toString()+')();',{headers:{
    'content-type':'text/javascript; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
  }});
}
