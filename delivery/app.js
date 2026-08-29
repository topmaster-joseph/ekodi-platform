const workspace=document.getElementById('memberWorkspace');
const guide=document.getElementById('publicGuide');
const form=document.getElementById('recommendForm');
const result=document.getElementById('recommendResult');
const historyList=document.getElementById('historyList');
const brief=document.getElementById('operationsBrief');
const settlementPreview=document.getElementById('settlementPreview');
const tenantSelect=document.getElementById('tenantSelect');
const storeSelect=document.getElementById('storeSelect');
const roleBadge=document.getElementById('roleBadge');
const contextLabel=document.getElementById('workspaceContextLabel');
const syncStatus=document.getElementById('workspaceSyncStatus');
const policySelect=document.getElementById('policySelect');
const policyForm=document.getElementById('policyForm');
const policyPermission=document.getElementById('policyPermission');
const policyMessage=document.getElementById('policyMessage');
const providerForm=document.getElementById('providerForm');
const providerList=document.getElementById('providerList');
const refreshButton=document.getElementById('refreshWorkspace');
const saveSettlementButton=document.getElementById('saveSettlement');
const metricOrders=document.getElementById('metricOrders');
const metricFee=document.getElementById('metricFee');
const metricSubsidy=document.getElementById('metricSubsidy');
const metricAdapters=document.getElementById('metricAdapters');
const STORAGE_KEY='ekodi.delivery.local-decisions.v2';
const API_PREFIX='/delivery/api';
let signedIn=false;
let data={tenants:[],stores:[],tenantMemberships:[],storeMemberships:[],providers:[],policies:[],decisions:[],settlements:[]};
let selectedTenantId='';
let selectedStoreId='';
let capabilities=[];
let lastSettlement=null;

const money=value=>`${Math.round(Number(value)||0).toLocaleString('ko-KR')}원`;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
function readLocal(){try{const rows=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(rows)?rows.slice(0,30):[]}catch{return[]}}
function writeLocal(rows){localStorage.setItem(STORAGE_KEY,JSON.stringify(rows.slice(0,30)));}
async function post(path,payload){const response=await fetch(`${API_PREFIX}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||body.reason||`request_${response.status}`);return body;}
function currentTenant(){return data.tenants.find(item=>item.id===selectedTenantId)||null;}
function currentStore(){return data.stores.find(item=>item.id===selectedStoreId)||null;}
function roleRank(role){return({platform_admin:60,tenant_admin:50,store_owner:40,store_staff:30,member:20,customer:10}[role]||0);}
function currentRole(){
  const tenantRole=data.tenantMemberships.find(item=>item.tenant_id===selectedTenantId)?.role||'';
  const storeRole=selectedStoreId?data.storeMemberships.find(item=>item.store_id===selectedStoreId)?.role||'':'';
  return roleRank(tenantRole)>=roleRank(storeRole)?(tenantRole||storeRole||'member'):(storeRole||tenantRole||'member');
}
function can(capability){return capabilities.includes(capability);}
function applicablePolicies(){return data.policies.filter(item=>item.tenant_id===selectedTenantId&&(!item.store_id||item.store_id===selectedStoreId));}
function policyFromRow(row={}){return{id:row.id||'default',name:row.name||'기본 배달정책',priority:row.priority||'balanced',maxDeliveryFee:row.max_delivery_fee??null,approvalFeeThreshold:row.approval_fee_threshold??null,targetMinutes:row.target_minutes??45,minimumReliability:num(row.minimum_reliability,0),allowedProviderIds:row.allowed_provider_ids||[],subsidyType:row.subsidy_type||'none',subsidyValue:num(row.subsidy_value,0),subsidyCap:row.subsidy_cap??null,customerMinShare:num(row.customer_min_share,0),active:row.active!==false};}
function formPolicy(){if(!policyForm)return{};const fd=new FormData(policyForm);return{name:String(fd.get('name')||'공동배달 기본정책'),priority:'balanced',maxDeliveryFee:fd.get('maxDeliveryFee')?num(fd.get('maxDeliveryFee')):null,approvalFeeThreshold:fd.get('approvalFeeThreshold')?num(fd.get('approvalFeeThreshold')):null,targetMinutes:45,minimumReliability:num(fd.get('minimumReliability'))/100,subsidyType:String(fd.get('subsidyType')||'none'),subsidyValue:num(fd.get('subsidyValue')),subsidyCap:fd.get('subsidyCap')?num(fd.get('subsidyCap')):null,customerMinShare:num(fd.get('customerMinShare')),allowedProviderIds:[]};}
function selectedPolicy(){const id=policySelect?.value;const row=id?data.policies.find(item=>item.id===id):null;return row?policyFromRow(row):formPolicy();}
function scopeDecisions(){return data.decisions.filter(item=>item.tenant_id===selectedTenantId&&(!selectedStoreId||item.store_id===selectedStoreId));}
function providerScope(){return data.providers.filter(item=>item.tenant_id===selectedTenantId&&(!item.store_id||item.store_id===selectedStoreId));}

async function refreshCapabilities(){
  const role=currentRole();
  const model=await post('/workspace-model',{role,tenant:currentTenant(),stores:currentStore()?[currentStore()]:[]});
  capabilities=model.capabilities||[];
  roleBadge.textContent=role;
  policyPermission.textContent=can('delivery:configure')||can('delivery:configure-store')?'저장 가능':'조회 전용';
  if(policyForm)policyForm.querySelector('button[type="submit"]').disabled=!(can('delivery:configure')||can('delivery:configure-store'));
  if(providerForm)providerForm.querySelector('button[type="submit"]').disabled=!(can('delivery:configure')||can('delivery:configure-store'));
}
function renderContextOptions(){
  const remembered=localStorage.getItem('ekodi.delivery.tenant')||'';
  tenantSelect.innerHTML='<option value="">운영공간 선택</option>'+data.tenants.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  if(!selectedTenantId)selectedTenantId=data.tenants.some(item=>item.id===remembered)?remembered:(data.tenants[0]?.id||data.stores[0]?.tenant_id||'');
  tenantSelect.value=selectedTenantId;
  renderStoreOptions();
}
function renderStoreOptions(){
  const stores=data.stores.filter(item=>item.tenant_id===selectedTenantId);
  if(selectedStoreId&&!stores.some(item=>item.id===selectedStoreId))selectedStoreId='';
  storeSelect.innerHTML='<option value="">기관·단체 전체</option>'+stores.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
  storeSelect.value=selectedStoreId;
}
function renderPolicyOptions(){
  const policies=applicablePolicies();
  policySelect.innerHTML='<option value="">화면 입력 정책</option>'+policies.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}${item.store_id?' · 상가':''}</option>`).join('');
}
function renderProviders(){
  const providers=providerScope();
  metricAdapters.textContent=String(providers.filter(item=>item.adapter_status==='connected').length);
  providerList.innerHTML=providers.length?providers.map(item=>`<p><strong>${esc(item.name)}</strong> · ${esc(item.provider_type)} · ${item.adapter_status==='connected'?'공식 연결':'수동/준비'}</p>`).join(''):'<p>이 공간에 저장된 배달대행 연결이 없습니다.</p>';
}
function decisionRows(){
  const remote=scopeDecisions().map(item=>{
    const d=item.decision_snapshot||{};const request=item.request_snapshot||{};
    return{remote:true,id:item.id,createdAt:item.created_at,recommendedName:d.recommended?.name||'AI 추천',recommendedId:d.recommendedProviderId||'',deliveryFee:num(d.recommended?.fee),etaMinutes:num(d.recommended?.etaMinutes),subsidy:num(d.funding?.subsidy),priority:d.priority||request.order?.priority||'balanced',orderAmount:num(request.order?.amount),orderRef:request.order?.ref||'',approvalRequired:Boolean(item.approval_required)};
  });
  const local=readLocal().filter(item=>!selectedTenantId||item.tenantId===selectedTenantId).filter(item=>!selectedStoreId||item.storeId===selectedStoreId);
  return [...remote,...local].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,40);
}
async function renderOperations(){
  const rows=decisionRows();
  metricOrders.textContent=String(rows.length);
  if(!rows.length){historyList.innerHTML='<p class="empty-state">아직 판단기록이 없습니다.</p>';brief.innerHTML='<p>운영 데이터가 없습니다.</p>';settlementPreview.innerHTML='<p>최근 판단기록을 기반으로 정산 구조를 계산합니다.</p>';metricFee.textContent='0원';metricSubsidy.textContent='0원';lastSettlement=null;return;}
  historyList.innerHTML=rows.map(row=>`<article class="history-item"><div><strong>${esc(row.recommendedName)}</strong><span>${new Date(row.createdAt).toLocaleString('ko-KR')}${row.remote?' · 중앙기록':' · 임시기록'}</span></div><div><b>${money(row.deliveryFee)}</b><span>${esc(row.etaMinutes)}분${row.subsidy?` · 지원 ${money(row.subsidy)}`:''}${row.approvalRequired?' · 승인필요':''}</span></div></article>`).join('');
  const operationRows=rows.map(row=>({status:'planned',deliveryFee:row.deliveryFee,subsidy:row.subsidy,etaMinutes:row.etaMinutes,targetMinutes:row.priority==='speed'?25:45}));
  const [operations,settlement]=await Promise.all([
    post('/operations-brief',{orders:operationRows}),
    post('/settlement-preview',{policy:selectedPolicy(),orders:rows.map(row=>({orderRef:row.orderRef,orderAmount:row.orderAmount,deliveryFee:row.deliveryFee,subsidy:row.subsidy||undefined,customerShare:0}))}),
  ]);
  metricFee.textContent=money(operations.averageDeliveryFee);
  metricSubsidy.textContent=money(settlement.totals?.subsidy||0);
  brief.innerHTML=operations.messages.map(message=>`<p>${esc(message)}</p>`).join('');
  lastSettlement=settlement;
  settlementPreview.innerHTML=`<p>배달비 ${money(settlement.totals.deliveryFee)} = 공동지원 ${money(settlement.totals.subsidy)} + 고객 ${money(settlement.totals.customerShare)} + 상가 ${money(settlement.totals.merchantShare)}</p><p>정산 검산 <strong>${settlement.balanced?'일치':'확인 필요'}</strong> · 실제 송금/정산 실행 없음</p>`;
}
function renderRecommendation(value){
  const recommended=value.recommended;const comparison=value.comparison||{};
  result.innerHTML=`<div class="recommendation"><p class="eyebrow">정책 적용 추천</p><h4>${esc(recommended.name)}</h4><div class="recommend-stats"><span>배달비 <b>${money(recommended.fee)}</b></span><span>예상시간 <b>${esc(recommended.etaMinutes)}분</b></span><span>공동지원 <b>${money(value.funding?.subsidy||0)}</b></span></div><ul>${(value.rationale||[]).map(item=>`<li>${esc(item)}</li>`).join('')}</ul><p class="safety-note">${value.approvalRequired?'승인 기준을 넘어 담당자 확인이 필요합니다. ':''}외부 배차는 실행되지 않았습니다.</p>${comparison.feeRate!=null?`<small>주문금액 대비 예상 배달비 ${esc(comparison.feeRate)}%</small>`:''}</div>`;
}
async function refreshWorkspaceData(){
  if(!signedIn||!window.EKODIDeliveryData?.isReady())return;
  syncStatus.textContent='중앙 데이터 동기화 중';
  try{
    data=await window.EKODIDeliveryData.loadWorkspace();
    renderContextOptions();
    await refreshCapabilities();
    renderPolicyOptions();renderProviders();await renderOperations();
    const tenant=currentTenant();const store=currentStore();
    contextLabel.textContent=store?`${tenant?.name||'운영공간'} · ${store.name}`:(tenant?.name||'운영공간을 선택하세요');
    syncStatus.textContent=`RLS 보호 · ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 동기화`;
  }catch(error){
    console.warn('delivery workspace load failed',error);
    syncStatus.textContent=`중앙 데이터 확인 필요 · ${error.message}`;
    await refreshCapabilities().catch(()=>{});await renderOperations().catch(()=>{});
  }
}

if(tenantSelect)tenantSelect.addEventListener('change',async()=>{selectedTenantId=tenantSelect.value;selectedStoreId='';if(selectedTenantId)localStorage.setItem('ekodi.delivery.tenant',selectedTenantId);renderStoreOptions();await refreshCapabilities();renderPolicyOptions();renderProviders();await renderOperations();contextLabel.textContent=currentTenant()?.name||'운영공간을 선택하세요';});
if(storeSelect)storeSelect.addEventListener('change',async()=>{selectedStoreId=storeSelect.value;await refreshCapabilities();renderPolicyOptions();renderProviders();await renderOperations();contextLabel.textContent=currentStore()?`${currentTenant()?.name||''} · ${currentStore().name}`:(currentTenant()?.name||'운영공간');});
if(policySelect)policySelect.addEventListener('change',()=>renderOperations().catch(console.warn));

if(form)form.addEventListener('submit',async event=>{
  event.preventDefault();if(!signedIn)return;
  const fd=new FormData(form);const priority=String(fd.get('priority')||'balanced');
  const request={order:{amount:num(fd.get('orderAmount')),priority,ref:String(fd.get('orderRef')||'')},policy:selectedPolicy(),providers:[
    {id:'manual-a',name:'대행 A',fee:num(fd.get('aFee')),etaMinutes:num(fd.get('aEta'),1),reliability:.9},
    {id:'manual-b',name:'대행 B',fee:num(fd.get('bFee')),etaMinutes:num(fd.get('bEta'),1),reliability:.92},
    {id:'manual-local',name:'지역 대행',fee:num(fd.get('cFee')),etaMinutes:num(fd.get('cEta'),1),reliability:.86},
  ]};
  result.innerHTML='<p class="empty-state">운영정책·비용·시간·신뢰도를 함께 계산하는 중입니다.</p>';
  try{
    const decision=await post('/recommend',request);renderRecommendation(decision);
    let persisted=false;
    if(selectedTenantId&&window.EKODIDeliveryData?.isReady()){
      try{await window.EKODIDeliveryData.saveDecision({tenantId:selectedTenantId,storeId:selectedStoreId||null,policyId:policySelect.value||null,request,decision,approvalRequired:decision.approvalRequired});persisted=true;}catch(error){console.warn('central decision save unavailable',error);}
    }
    if(!persisted){const local=readLocal();local.unshift({tenantId:selectedTenantId,storeId:selectedStoreId,createdAt:new Date().toISOString(),recommendedName:decision.recommended.name,recommendedId:decision.recommendedProviderId,deliveryFee:decision.recommended.fee,etaMinutes:decision.recommended.etaMinutes,subsidy:decision.funding?.subsidy||0,priority,orderAmount:request.order.amount,orderRef:request.order.ref,approvalRequired:decision.approvalRequired});writeLocal(local);}
    if(persisted)await refreshWorkspaceData();else await renderOperations();
  }catch(error){result.innerHTML=`<p class="error-state">추천 계산에 실패했습니다. ${esc(error.message)}</p>`;}
});

if(policyForm)policyForm.addEventListener('submit',async event=>{
  event.preventDefault();if(!selectedTenantId)return policyMessage.textContent='먼저 기관·단체 운영공간을 선택하세요.';
  if(!(can('delivery:configure')||can('delivery:configure-store')))return policyMessage.textContent='현재 역할에는 정책 저장 권한이 없습니다.';
  try{await window.EKODIDeliveryData.savePolicy({tenantId:selectedTenantId,storeId:selectedStoreId||null,...formPolicy()});policyMessage.textContent='운영정책을 중앙 데이터에 저장했습니다.';await refreshWorkspaceData();}catch(error){policyMessage.textContent=`정책 저장 실패: ${error.message}`;}
});
if(providerForm)providerForm.addEventListener('submit',async event=>{
  event.preventDefault();if(!selectedTenantId)return;
  const fd=new FormData(providerForm);
  try{await window.EKODIDeliveryData.saveProvider({tenantId:selectedTenantId,storeId:selectedStoreId||null,name:fd.get('name'),providerKey:fd.get('providerKey'),providerType:fd.get('providerType'),note:fd.get('note')});providerForm.reset();await refreshWorkspaceData();}catch(error){providerList.innerHTML=`<p>연결 저장 실패: ${esc(error.message)}</p>`;}
});
if(saveSettlementButton)saveSettlementButton.addEventListener('click',async()=>{
  if(!lastSettlement||!selectedTenantId)return;
  try{await window.EKODIDeliveryData.saveSettlementDraft({tenantId:selectedTenantId,storeId:selectedStoreId||null,totals:lastSettlement.totals,rows:lastSettlement.rows,balanced:lastSettlement.balanced});settlementPreview.insertAdjacentHTML('beforeend','<p><strong>중앙 정산 초안으로 저장했습니다.</strong></p>');await refreshWorkspaceData();}catch(error){settlementPreview.insertAdjacentHTML('beforeend',`<p>초안 저장 실패: ${esc(error.message)}</p>`);}
});
if(refreshButton)refreshButton.addEventListener('click',refreshWorkspaceData);

async function applyAccountState(account={}){
  signedIn=Boolean(account.signedIn);document.documentElement.dataset.deliveryAuth=signedIn?'signed-in':'public';workspace.hidden=!signedIn;guide.hidden=signedIn;
  if(signedIn){await refreshWorkspaceData();workspace.scrollIntoView({block:'start'});}
}
window.addEventListener('ekodi:delivery-account',event=>{applyAccountState(event.detail||{});});
if(window.EKODI_DELIVERY_ACCOUNT_STATE)applyAccountState(window.EKODI_DELIVERY_ACCOUNT_STATE);
