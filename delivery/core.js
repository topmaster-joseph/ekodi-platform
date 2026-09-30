export const DELIVERY_PRIORITIES=Object.freeze(['balanced','cost','speed']);

const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const round=(value,digits=0)=>{const p=10**digits;return Math.round((Number(value)+Number.EPSILON)*p)/p;};

export function normalizeProvider(provider={},index=0){
  return {
    id:String(provider.id||`provider-${index+1}`).trim().slice(0,64),
    name:String(provider.name||`대행 ${index+1}`).trim().slice(0,80),
    fee:Math.max(0,num(provider.fee,0)),
    etaMinutes:Math.max(1,num(provider.etaMinutes,60)),
    reliability:clamp(num(provider.reliability,0.9),0,1),
    available:provider.available!==false,
  };
}

function normalized(value,min,max){return max<=min?0:(value-min)/(max-min);}
function weights(priority){
  if(priority==='cost')return{cost:.65,time:.2,reliability:.15};
  if(priority==='speed')return{cost:.2,time:.6,reliability:.2};
  return{cost:.4,time:.35,reliability:.25};
}

export function recommendDelivery(input={}){
  const order=input.order||{};
  const priority=DELIVERY_PRIORITIES.includes(order.priority)?order.priority:'balanced';
  const providers=(Array.isArray(input.providers)?input.providers:[]).map(normalizeProvider).filter(provider=>provider.available);
  if(!providers.length)return{ok:false,reason:'no_available_provider',priority,ranked:[]};

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
  const rationale=[];
  if(recommended.id===fastest.id)rationale.push('현재 입력 기준 가장 빠른 선택지입니다.');
  if(recommended.id===cheapest.id)rationale.push('현재 입력 기준 배달비가 가장 낮습니다.');
  if(costSavingVsFastest>0)rationale.push(`최단시간 선택보다 ${Math.round(costSavingVsFastest).toLocaleString('ko-KR')}원 절감할 수 있습니다.`);
  if(etaTradeoffVsFastest>0)rationale.push(`최단시간 선택보다 약 ${Math.round(etaTradeoffVsFastest)}분 더 걸립니다.`);
  if(recommended.reliability<0.8)rationale.push('신뢰도 입력값이 낮아 실제 배차 전 확인이 필요합니다.');
  if(!rationale.length)rationale.push('비용·시간·신뢰도 균형 점수가 가장 좋습니다.');

  return{
    ok:true,
    mode:'decision-support-only',
    priority,
    recommendedProviderId:recommended.id,
    recommended,
    ranked,
    comparison:{fastestProviderId:fastest.id,cheapestProviderId:cheapest.id,costSavingVsFastest,etaTradeoffVsFastest,feeRate},
    rationale,
    dispatchExecuted:false,
    humanConfirmationRequired:true,
  };
}

export function calculateSettlement(orders=[]){
  const rows=Array.isArray(orders)?orders:[];
  const totals=rows.reduce((sum,row)=>{
    const orderAmount=Math.max(0,num(row.orderAmount,0));
    const deliveryFee=Math.max(0,num(row.deliveryFee,0));
    const subsidy=Math.min(deliveryFee,Math.max(0,num(row.subsidy,0)));
    const customerShare=Math.min(deliveryFee-subsidy,Math.max(0,num(row.customerShare,0)));
    const merchantShare=Math.max(0,deliveryFee-subsidy-customerShare);
    sum.orderAmount+=orderAmount;
    sum.deliveryFee+=deliveryFee;
    sum.subsidy+=subsidy;
    sum.customerShare+=customerShare;
    sum.merchantShare+=merchantShare;
    sum.providerPayout+=deliveryFee;
    return sum;
  },{orderAmount:0,deliveryFee:0,subsidy:0,customerShare:0,merchantShare:0,providerPayout:0});
  for(const key of Object.keys(totals))totals[key]=round(totals[key],0);
  return{count:rows.length,totals,settlementExecuted:false,mode:'preview'};
}

export function buildOperationsBrief(orders=[]){
  const rows=Array.isArray(orders)?orders:[];
  const active=rows.filter(row=>!['done','cancelled'].includes(String(row.status||'')));
  const delayed=active.filter(row=>String(row.status||'')==='delayed'||num(row.etaMinutes,0)>num(row.targetMinutes,45));
  const fees=rows.map(row=>Math.max(0,num(row.deliveryFee,0))).filter(Boolean);
  const avgFee=fees.length?Math.round(fees.reduce((a,b)=>a+b,0)/fees.length):0;
  const messages=[];
  if(delayed.length)messages.push(`${delayed.length}건은 지연 위험 확인이 필요합니다.`);
  if(avgFee)messages.push(`등록 주문의 평균 배달비는 ${avgFee.toLocaleString('ko-KR')}원입니다.`);
  if(!messages.length)messages.push('현재 등록된 운영 데이터에서 즉시 확인할 위험 신호가 없습니다.');
  return{count:rows.length,active:active.length,delayed:delayed.length,averageDeliveryFee:avgFee,messages,generatedBy:'local-rule-engine'};
}
