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
  const actionLabels={
    add_co_operator:'공동운영 추가',
    start_transfer:'운영권 이양 시작',
    complete_transfer:'운영권 이양 완료',
    suspend_assignment:'운영 중지',
    reactivate_assignment:'운영 재개',
    revoke_assignment:'운영권 회수',
  };
  const date=value=>{if(!value)return'-';const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString('ko-KR',{dateStyle:'medium',timeStyle:'short'})};

  function td(textValue){
    const node=document.createElement('td');
    node.textContent=String(textValue??'');
    return node;
  }
  function el(tag,className,textValue){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(textValue!==undefined)node.textContent=String(textValue);
    return node;
  }
  function option(value,label){
    const node=document.createElement('option');
    node.value=value;node.textContent=label;return node;
  }
  async function api(pathname,options={}){
    const auth=token();
    const headers={...(options.headers||{})};
    if(auth)headers.authorization='Bearer '+auth;
    if(options.body&&!headers['content-type'])headers['content-type']='application/json';
    const response=await fetch(pathname,{...options,headers,cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||data.code||('http_'+response.status));
    return data;
  }

  function renderManagement(data){
    if(!data.access?.canManageOperatingRights)return null;
    const panel=el('section','ledger-manage');
    const title=el('h3','ledger-title','운영권 변경');
    const note=el('p','muted','운영단체 등록과 공동운영·이양·중지·회수를 처리합니다. 위임 운영자에게는 이 변경 권한이 자동 부여되지 않습니다.');
    panel.append(title,note);

    const forms=el('div','ledger-manage-grid');

    const register=el('form','ledger-manage-card');
    register.append(el('strong','','운영단체 등록'));
    const tenantLabel=el('label','','운영공간 ID');
    const tenantInput=document.createElement('input');tenantInput.name='tenantSlug';tenantInput.required=true;tenantInput.maxLength=64;tenantInput.placeholder='예: cheonggye-office';
    tenantLabel.append(tenantInput);
    const nameLabel=el('label','','표시 이름');
    const nameInput=document.createElement('input');nameInput.name='name';nameInput.maxLength=120;nameInput.placeholder='예: 청계면 ○○협동조합';
    nameLabel.append(nameInput);
    const kindLabel=el('label','','유형');
    const kind=document.createElement('select');kind.name='kind';
    for(const [value,label] of [['organization','기관·단체'],['merchant-association','상인회'],['public-agency','공공기관'],['school','학교'],['cooperative','협동조합'],['project','프로젝트']])kind.append(option(value,label));
    kindLabel.append(kind);
    const registerResult=el('span','access-result','');
    const registerButton=el('button','button','운영단체 등록');registerButton.type='submit';
    register.append(tenantLabel,nameLabel,kindLabel,registerButton,registerResult);
    register.addEventListener('submit',async event=>{
      event.preventDefault();registerButton.disabled=true;registerResult.textContent='등록 중…';
      try{
        await api('/api/local-operations/cheonggye/actions',{method:'POST',body:JSON.stringify({action:'register_operator',tenantSlug:tenantInput.value,name:nameInput.value,kind:kind.value})});
        registerResult.textContent='등록되었습니다.';
        await load();
      }catch(error){registerResult.textContent=error.message}
      finally{registerButton.disabled=false}
    });

    const govern=el('form','ledger-manage-card');
    govern.append(el('strong','','서비스 운영권'));
    const moduleLabel=el('label','','지역서비스');
    const moduleSelect=document.createElement('select');moduleSelect.name='moduleId';
    for(const item of data.modules||[])moduleSelect.append(option(item.id,item.label));
    moduleLabel.append(moduleSelect);
    const operatorLabel=el('label','','운영단체');
    const operatorSelect=document.createElement('select');operatorSelect.name='operatorId';
    for(const item of data.operators||[])if(item.status==='active')operatorSelect.append(option(item.operatorId,item.name+' · '+item.tenantSlug));
    operatorLabel.append(operatorSelect);
    const actionLabel=el('label','','작업');
    const actionSelect=document.createElement('select');actionSelect.name='action';
    for(const key of Object.keys(actionLabels))actionSelect.append(option(key,actionLabels[key]));
    actionLabel.append(actionSelect);
    const reasonLabel=el('label','','사유·메모');
    const reason=document.createElement('input');reason.name='reason';reason.maxLength=500;reason.placeholder='변경 사유를 기록해 주세요.';
    reasonLabel.append(reason);
    const warning=el('p','ledger-warning','이양 완료 후 기존 주 운영단체는 공동 운영단체로 유지됩니다. 주 운영단체는 이양 완료 전 직접 중지·회수할 수 없습니다.');
    const governResult=el('span','access-result','');
    const governButton=el('button','button','변경 적용');governButton.type='submit';
    govern.append(moduleLabel,operatorLabel,actionLabel,reasonLabel,warning,governButton,governResult);
    govern.addEventListener('submit',async event=>{
      event.preventDefault();
      const label=actionLabels[actionSelect.value]||actionSelect.value;
      if((actionSelect.value==='complete_transfer'||actionSelect.value==='revoke_assignment')&&!confirm(label+'을(를) 진행하시겠습니까?'))return;
      governButton.disabled=true;governResult.textContent='처리 중…';
      try{
        await api('/api/local-operations/cheonggye/actions',{method:'POST',body:JSON.stringify({action:actionSelect.value,moduleId:moduleSelect.value,operatorId:operatorSelect.value,reason:reason.value})});
        governResult.textContent='적용되었습니다.';
        reason.value='';
        await load();
      }catch(error){governResult.textContent=error.message}
      finally{governButton.disabled=false}
    });

    forms.append(register,govern);panel.append(forms);
    return panel;
  }

  function render(data){
    host.replaceChildren();

    const summary=el('div','ledger-summary');
    const summaryItems=[
      ['활성 운영단체',data.summary?.activeOperators??0],
      ['서비스',data.summary?.moduleCount??0],
      ['주 운영권',data.summary?.leadAssignmentCount??0],
      ['이양 진행',data.summary?.handoverCount??0],
    ];
    for(const [label,value] of summaryItems){
      const item=el('div','ledger-kpi');
      item.append(el('span','',label),el('strong','',value));summary.append(item);
    }
    host.append(summary);

    const management=renderManagement(data);
    if(management)host.append(management);

    host.append(el('h3','ledger-title','현재 운영권'));
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

    host.append(el('h3','ledger-title','최근 운영권 이력'));
    const list=el('div','ledger-events');
    for(const event of data.history||[]){
      const item=el('div','ledger-event');
      const top=el('div','ledger-event__top');
      top.append(el('strong','',eventLabels[event.eventType]||event.eventType),el('span','',date(event.eventAt)));
      const detail=el('p','',[event.moduleLabel,event.operatorName,event.reason].filter(Boolean).join(' · '));
      item.append(top,detail);list.append(item);
    }
    if(!list.children.length)list.append(el('p','muted','기록된 운영권 변경이 없습니다.'));
    host.append(list);

    const delegated=data.access?.delegatedOperator?.name?(' · 위임 운영: '+data.access.delegatedOperator.name):'';
    host.append(el('p','ledger-meta','운영 데이터는 지역플랫폼에 유지되며 변경 이력은 보존됩니다'+delegated+'.'));
  }

  async function load(){
    const data=await api('/api/local-operations/cheonggye');
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
      host.append(el('p','muted','운영권 이력을 불러오지 못했습니다: '+error.message));
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
