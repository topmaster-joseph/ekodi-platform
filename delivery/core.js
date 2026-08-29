export const DELIVERY_PRIORITIES=Object.freeze(['balanced','cost','speed']);
export const DELIVERY_ROLES=Object.freeze(['platform_admin','tenant_admin','store_owner','store_staff','member','customer']);
export const DELIVERY_CAPABILITIES=Object.freeze({
  platform_admin:['delivery:view','delivery:configure','delivery:recommend','delivery:settlement-preview','delivery:audit','delivery:dispatch-approve'],
  tenant_admin:['delivery:view','delivery:configure','delivery:recommend','delivery:settlement-preview','delivery:audit','delivery:dispatch-approve'],
  store_owner:['delivery:view','delivery:configure-store','delivery:recommend','delivery:settlement-preview','delivery:audit-store','delivery:dispatch-approve'],
  store_staff:['delivery:view','delivery:recommend','delivery:settlement-preview'],
  member:['delivery:view'],
  customer:[],
});

const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const round=(value,digits=0)=>{const p=10**digits;return Math.round((Number(value)+Number.EPSILON)*p)/p;};
const text=(value,fallback='')=>String(value??fallback).trim();

export function capabilitiesForRole(role='member'){
  const safe=DELIVERY_ROLES.includes(role)?role:'member';
  return [...(DELIVERY_CAPABILITIES[safe]||[])];
}

export function normalizePolicy(policy={}){
  const priority=DELIVERY_PRIORITIES.includes(policy.priority)?policy.priority:'balanced';
  const subsidyType=['none','fixed','percent'].includes(policy.subsidyType)?policy.subsidyType:'none';
  const allowedProviderIds=Array.isArray(policy.allowedProviderIds)?[...new Set(policy.allowedProviderIds.map(value=>text(value)).filter(Boolean))].slice(0,100):[];
  return{
    id:text(policy.id,'default'),
    name:text(policy.name,'기본 배달정책').slice(0,100),
    priority,
    maxDeliveryFee:policy.maxDeliveryFee==null?null:Math.max(0,num(policy.maxDeliveryFee,0)),
    approvalFeeThreshold:policy.approvalFeeThreshold==null?null:Math.max(0,num(policy.approvalFeeThreshold,0)),
    targetMinutes:Math.max(1,num(policy.targetMinutes,45)),
    minimumReliability:clamp(num(policy.minimumReliability,0),0,1),
    allowedProviderIds,
    subsidyType,
    subsidyValue:Math.max(0,num(policy.subsidyValue,0)),
    subsidyCap:policy.subsidyCap==null?null:Math.max(0,num(policy.subsidyCap,0)),
    customerMinShare:Math.max(0,num(policy.customerMinShare,0)),
    active:policy.active!==false,
  };
}

export function calculateSubsidy(deliveryFee,policy={}){
  const fee=Math.max(0,num(deliveryFee,0));
  const p=normalizePolicy(policy);
  if(!p.active||p.subsidyType==='none'||fee<=0)return 0;
  let value=p.subsidyType==='percent'?fee*clamp(p.subsidyValue,0,100)/100:p.subsidyValue;
  if(p.subsidyCap!=null)value=Math.min(value,p.subsidyCap);
  const maximum=Math.max(0,fee-p.customerMinShare);
  return round(Math.min(maximum,value),0);
}

export function normalizeProvider(provider={},index=0){
  return {
    id:text(provider.id,`provider-${index+1}`).slice(0,64),
    name:text(provider.name,`대행 ${index+1}`).slice(0,80),
    fee:Math.max(0,num(provider.fee,0)),
    etaMinutes:Math.max(1,num(provider.etaMinutes,60)),
    reliability:clamp(num(provider.reliability,0.9),0,1),
    available:provider.available!==false,
    adapterStatus:text(provider.adapterStatus,'manual'),
  };
}

function normalized(value,min,max){return max<=min?0:(value-min)/(max-min);}
function weights(priority){
  if(priority==='cost')return{cost:.65,time:.2,reliability:.15};
  if(priority==='speed')return{cost:.2,time:.6,reliability:.2};
  return{cost:.4,time:.35,reliability:.25};
}

export function evaluateProviderPolicy(provider,policy={}){
  const p=normalizePolicy(policy);
  const item=normalizeProvider(provider);
  const reasons=[];
  if(!p.active)reasons.push('policy_inactive');
  if(!item.available)reasons.push('provider_unavailable');
  if(p.allowedProviderIds.length&&!p.allowedProviderIds.includes(item.id))reasons.push('provider_not_allowed');
  if(p.maxDeliveryFee!=null&&item.fee>p.maxDeliveryFee)reasons.push('fee_over_limit');
  if(item.reliability<p.minimumReliability)reasons.push('reliability_below_minimum');
  return{eligible:reasons.length===0,reasons,policy:p,provider:item};
}

export function recommendDelivery(input={}){
  const order=input.order||{};
  const policy=normalizePolicy(input.policy||{});
  const priority=DELIVERY_PRIORITIES.includes(order.priority)?order.priority:policy.priority;
  const evaluated=(Array.isArray(input.providers)?input.providers:[]).map((provider,index)=>{
    const normalizedProvider=normalizeProvider(provider,index);
    return evaluateProviderPolicy(normalizedProvider,{...policy,priority});
  });
  const rejected=evaluated.filter(item=>!item.eligible).map(item=>({id:item.provider.id,name:item.provider.name,reasons:item.reasons}));
  const providers=evaluated.filter(item=>item.eligible).map(item=>item.provider);
  if(!providers.length)return{ok:false,reason:'policy_no_eligible_provider',priority,policy,rejected,ranked:[],dispatchExecuted:false,humanConfirmationRequired:true};

  const fees=providers.map(provider=>provider.fee);
  const etas=providers.map(provider=>provider.etaMinutes);
  const minFee=Math.min(...fees),maxFee=Math.max(...fees),minEta=Math.min(...etas),maxEta=Math.max(...etas);
  const w=weights(priority);
  const ranked=providers.map(provider=>{
    const costPenalty=normalized(provider.fee,minFee,maxFee);
    const timePenalty=normalized(provider.etaMinutes,minEta,maxEta);
    const reliabilityPenalty=1-provider.reliability;
    const score=(costPenalty*w.cost)+(timePenalty*w.time)+(reliabilityPenalty*w.reliability);
    return{...provider,score:round(score,4)};
  }).sort((a,b)=>a.score-b.score||a.etaMinutes-b.etaMinutes||a.fee-b.fee);

  const recommended=ranked[0];
  const fastest=[...providers].sort((a,b)=>a.etaMinutes-b.etaMinutes||a.fee-b.fee)[0];
  const cheapest=[...providers].sort((a,b)=>a.fee-b.fee||a.etaMinutes-b.etaMinutes)[0];
  const costSavingVsFastest=Math.max(0,fastest.fee-recommended.fee);
  const etaTradeoffVsFastest=Math.max(0,recommended.etaMinutes-fastest.etaMinutes);
  const orderAmount=Math.max(0,num(order.amount,0));
  const feeRate=orderAmount>0?round((recommended.fee/orderAmount)*100,1):null;
  const subsidy=calculateSubsidy(recommended.fee,policy);
  const approvalRequired=policy.approvalFeeThreshold!=null&&recommended.fee>policy.approvalFeeThreshold;
  const rationale=[];
  if(recommended.id===fastest.id)rationale.push('현재 정책 안에서 가장 빠른 선택지입니다.');
  if(recommended.id===cheapest.id)rationale.push('현재 정책 안에서 배달비가 가장 낮습니다.');
  if(costSavingVsFastest>0)rationale.push(`최단시간 선택보다 ${Math.round(costSavingVsFastest).toLocaleString('ko-KR')}원 절감할 수 있습니다.`);
  if(etaTradeoffVsFastest>0)rationale.push(`최단시간 선택보다 약 ${Math.round(etaTradeoffVsFastest)}분 더 걸립니다.`);
  if(subsidy>0)rationale.push(`공동지원금 정책 적용 시 ${subsidy.toLocaleString('ko-KR')}원 지원 가능합니다.`);
  if(approvalRequired)rationale.push('설정된 승인 기준을 넘어 담당자 확인이 필요합니다.');
  if(recommended.reliability<0.8)rationale.push('신뢰도 입력값이 낮아 실제 배차 전 확인이 필요합니다.');
  if(!rationale.length)rationale.push('비용·시간·신뢰도와 운영정책을 함께 반영한 균형 점수가 가장 좋습니다.');

  return{
    ok:true,
    mode:'policy-aware-decision-support-only',
    priority,
    policy,
    recommendedProviderId:recommended.id,
    recommended,
    ranked,
    rejected,
    comparison:{fastestProviderId:fastest.id,cheapestProviderId:cheapest.id,costSavingVsFastest,etaTradeoffVsFastest,feeRate},
    funding:{subsidy,remainingDeliveryFee:Math.max(0,recommended.fee-subsidy)},
    approvalRequired,
    rationale,
    dispatchExecuted:false,
    humanConfirmationRequired:true,
  };
}

export function calculateOrderSettlement(row={},policy={}){
  const orderAmount=Math.max(0,num(row.orderAmount,0));
  const deliveryFee=Math.max(0,num(row.deliveryFee,0));
  const appliedPolicy=normalizePolicy(row.policy||policy||{});
  const explicitSubsidy=row.subsidy==null?null:Math.max(0,num(row.subsidy,0));
  const subsidy=Math.min(deliveryFee,explicitSubsidy==null?calculateSubsidy(deliveryFee,appliedPolicy):explicitSubsidy);
  const customerShare=Math.min(deliveryFee-subsidy,Math.max(appliedPolicy.customerMinShare,num(row.customerShare,0)));
  const merchantShare=Math.max(0,deliveryFee-subsidy-customerShare);
  const channelCommission=Math.min(orderAmount,Math.max(0,num(row.channelCommission,0)));
  const paymentFee=Math.min(Math.max(0,orderAmount-channelCommission),Math.max(0,num(row.paymentFee,0)));
  const providerPayout=deliveryFee;
  const deliveryFunding=subsidy+customerShare+merchantShare;
  return{
    orderRef:text(row.orderRef||row.orderId||row.orderNo,''),
    orderAmount:round(orderAmount),deliveryFee:round(deliveryFee),subsidy:round(subsidy),customerShare:round(customerShare),merchantShare:round(merchantShare),providerPayout:round(providerPayout),channelCommission:round(channelCommission),paymentFee:round(paymentFee),
    merchantNet:round(Math.max(0,orderAmount-channelCommission-paymentFee-merchantShare)),
    fundingBalanced:round(deliveryFunding)===round(deliveryFee),
    deliveryFunding:round(deliveryFunding),
    policyId:appliedPolicy.id,
  };
}

export function calculateSettlement(orders=[],policy={}){
  const rows=(Array.isArray(orders)?orders:[]).map(row=>calculateOrderSettlement(row,policy));
  const totals=rows.reduce((sum,row)=>{
    for(const key of ['orderAmount','deliveryFee','subsidy','customerShare','merchantShare','providerPayout','channelCommission','paymentFee','merchantNet','deliveryFunding'])sum[key]+=row[key];
    return sum;
  },{orderAmount:0,deliveryFee:0,subsidy:0,customerShare:0,merchantShare:0,providerPayout:0,channelCommission:0,paymentFee:0,merchantNet:0,deliveryFunding:0});
  for(const key of Object.keys(totals))totals[key]=round(totals[key],0);
  return{count:rows.length,rows,totals,balanced:rows.every(row=>row.fundingBalanced),settlementExecuted:false,mode:'policy-aware-preview'};
}

export function buildOperationsBrief(orders=[]){
  const rows=Array.isArray(orders)?orders:[];
  const active=rows.filter(row=>!['done','completed','cancelled'].includes(String(row.status||'')));
  const delayed=active.filter(row=>String(row.status||'')==='delayed'||num(row.etaMinutes,0)>num(row.targetMinutes,45));
  const fees=rows.map(row=>Math.max(0,num(row.deliveryFee,0))).filter(Boolean);
  const subsidies=rows.map(row=>Math.max(0,num(row.subsidy,0))).filter(Boolean);
  const avgFee=fees.length?Math.round(fees.reduce((a,b)=>a+b,0)/fees.length):0;
  const subsidyTotal=subsidies.reduce((a,b)=>a+b,0);
  const messages=[];
  if(delayed.length)messages.push(`${delayed.length}건은 지연 위험 확인이 필요합니다.`);
  if(avgFee)messages.push(`등록 주문의 평균 배달비는 ${avgFee.toLocaleString('ko-KR')}원입니다.`);
  if(subsidyTotal)messages.push(`등록 데이터 기준 공동지원금은 ${Math.round(subsidyTotal).toLocaleString('ko-KR')}원입니다.`);
  if(!messages.length)messages.push('현재 등록된 운영 데이터에서 즉시 확인할 위험 신호가 없습니다.');
  return{count:rows.length,active:active.length,delayed:delayed.length,averageDeliveryFee:avgFee,subsidyTotal:round(subsidyTotal),messages,generatedBy:'local-policy-engine'};
}

export function buildWorkspaceModel({role='member',tenant=null,stores=[],providers=[],policies=[]}={}){
  const safeRole=DELIVERY_ROLES.includes(role)?role:'member';
  return{
    version:2,
    role:safeRole,
    capabilities:capabilitiesForRole(safeRole),
    tenant:tenant&&typeof tenant==='object'?tenant:null,
    stores:Array.isArray(stores)?stores:[],
    providers:Array.isArray(providers)?providers:[],
    policies:(Array.isArray(policies)?policies:[]).map(normalizePolicy),
    executionEnabled:false,
    officialAdapterRequired:true,
  };
}
