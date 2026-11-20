/**
 * EKODIBIZ Sales OS Phase A — isolated deterministic contracts.
 * No API access, storage, authentication, email, payment, or contract execution.
 * The caller MUST enforce authenticated EKODI workspace membership, trusted
 * audit receipts, source verification, and consent on its server boundary.
 */
export const SALES_STAGES=Object.freeze([
  'inquiry','consultation','proposal_draft','proposal_approved',
  'proposal_sent','negotiating','contracted','delivery','renewal','lost'
]);
const NEXT=Object.freeze({
  inquiry:['consultation','lost'],consultation:['proposal_draft','lost'],
  proposal_draft:['proposal_approved','lost'],
  proposal_approved:['proposal_sent','proposal_draft','lost'],
  proposal_sent:['negotiating','contracted','lost'],
  negotiating:['contracted','proposal_draft','lost'],
  contracted:['delivery'],delivery:['renewal'],renewal:['delivery'],lost:[]
});
const REVIEW_STAGES=new Set(['proposal_approved','proposal_sent','contracted']);
const MARKET_EVENTS=Object.freeze({
  inquiry:'inquiry',consultation:'consultation',proposal_sent:'proposal',
  negotiating:'follow_up',contracted:'contract',delivery:'active',renewal:'renewal'
});
const PORTFOLIO_STATES=new Set(['idea','experiment','validate','scale','hold','retire']);
const SCHEMA='ekodi.ekodibiz.sales-opportunity.v1';
function opaque(value,label){
  const text=String(value??'').trim();
  if(!text||text.length>120||!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(text)){
    throw new TypeError(label+' must be an opaque identifier');
  }
  return text;
}
function minor(value,label){
  if(!Number.isSafeInteger(value)||value<0)throw new TypeError(label+' must be a nonnegative safe integer');
  return value;
}
function validateScope(value,scope,label){
  if(value!==scope)throw new Error('CROSS_WORKSPACE_'+label+'_DENIED');
}
function preventUnverifiedClaims(input){
  for(const key of ['customerName','customerEmail','phoneNumber','confirmedRevenue',
    'approvalStatus','sentAt','contractSignedAt','sourceVerification']){
    if(Object.hasOwn(input,key))throw new TypeError('unverified field forbidden: '+key);
  }
}
function assertOpportunity(row,scope){
  if(!row||row.schema!==SCHEMA)throw new TypeError('invalid sales opportunity');
  if(scope)validateScope(row.workspaceId,scope,'OPPORTUNITY');
  if(!SALES_STAGES.includes(row.stage))throw new TypeError('unknown sales stage');
  return row;
}
export function createSalesOpportunity(input={}){
  preventUnverifiedClaims(input);
  return Object.freeze({
    schema:SCHEMA,opportunityId:opaque(input.opportunityId,'opportunityId'),
    workspaceId:opaque(input.workspaceId,'workspaceId'),
    businessLineId:opaque(input.businessLineId,'businessLineId'),
    productId:input.productId?opaque(input.productId,'productId'):null,
    stage:'inquiry',commercialSubject:'ekodibiz',
    estimatedContractMinor:input.estimatedContractMinor==null?null:minor(input.estimatedContractMinor,'estimatedContractMinor'),
    actualRevenueMinor:null,currency:'KRW',approvalReceipt:null
  });
}
export function planSalesTransition(current,nextStage,{evidenceRef}={}){
  assertOpportunity(current);
  if(!SALES_STAGES.includes(nextStage))throw new TypeError('unknown sales stage');
  if(!NEXT[current.stage].includes(nextStage))throw new RangeError('invalid stage transition');
  return Object.freeze({
    workspaceId:current.workspaceId,opportunityId:current.opportunityId,
    from:current.stage,to:nextStage,
    evidenceRef:evidenceRef?opaque(evidenceRef,'evidenceRef'):null,
    humanGate:REVIEW_STAGES.has(nextStage),
    readyForServerVerification:Boolean(evidenceRef),
    canCommit:false,canSendExternally:false,
    reason:'EKODI Core must verify membership, evidence, approval and append-only audit'
  });
}
export function prepareSalesProposalDraft(input={}){
  preventUnverifiedClaims(input);
  const version=String(input.productVersion??'').trim();
  if(!version||version.length>70)throw new TypeError('productVersion is required');
  return Object.freeze({
    schema:'ekodi.ekodibiz.sales-proposal-ref.v1',
    proposalId:opaque(input.proposalId,'proposalId'),
    opportunityId:opaque(input.opportunityId,'opportunityId'),
    workspaceId:opaque(input.workspaceId,'workspaceId'),
    productId:opaque(input.productId,'productId'),productVersion:version,
    proposalStudioDraftRef:input.proposalStudioDraftRef?opaque(input.proposalStudioDraftRef,'proposalStudioDraftRef'):null,
    amountMinor:input.amountMinor==null?null:minor(input.amountMinor,'amountMinor'),
    currency:'KRW',status:'working_draft',sourceVerification:'unverified',
    approved:false,sent:false,contractCommitted:false
  });
}
export function planMarketingLedgerEvent(transition){
  if(!transition||transition.canCommit!==false)throw new TypeError('untrusted transition');
  const eventType=MARKET_EVENTS[transition.to];
  if(!eventType)return null;
  return Object.freeze({
    workspaceId:opaque(transition.workspaceId,'workspaceId'),
    opportunityId:opaque(transition.opportunityId,'opportunityId'),
    eventType,status:'planned_only',executable:false,
    // Final idempotent external_ref MUST include a server-verified event ID.
    externalRef:null
  });
}
export function summarizeBusinessLinePipeline({workspaceId,businessLines,opportunities}={}){
  const scope=opaque(workspaceId,'workspaceId');
  if(!Array.isArray(businessLines)||!Array.isArray(opportunities))throw new TypeError('scoped arrays required');
  const map=new Map(),seen=new Set();
  for(const line of businessLines){
    validateScope(line?.workspaceId,scope,'BUSINESS_LINE');
    const id=opaque(line.id,'businessLineId');
    if(map.has(id))throw new Error('DUPLICATE_BUSINESS_LINE');
    if(!PORTFOLIO_STATES.has(line.status))throw new TypeError('invalid business status');
    const name=String(line.name??'').trim();
    if(!name||name.length>120)throw new TypeError('invalid business name');
    map.set(id,{id,name,status:line.status,opportunityCount:0,contractedOrActiveCount:0,
      estimatedPipelineMinor:0,realizedRevenueMinor:null});
  }
  for(const row of opportunities){
    assertOpportunity(row,scope);
    const id=opaque(row.opportunityId,'opportunityId');
    if(seen.has(id))throw new Error('DUPLICATE_OPPORTUNITY');
    seen.add(id);
    const group=map.get(row.businessLineId);
    if(!group)throw new Error('UNKNOWN_BUSINESS_LINE');
    group.opportunityCount++;
    if(['contracted','delivery','renewal'].includes(row.stage))group.contractedOrActiveCount++;
    if(!['lost','contracted','delivery','renewal'].includes(row.stage)&&row.estimatedContractMinor!=null){
      group.estimatedPipelineMinor+=minor(row.estimatedContractMinor,'estimatedContractMinor');
      if(!Number.isSafeInteger(group.estimatedPipelineMinor))throw new RangeError('pipeline amount overflow');
    }
  }
  return Object.freeze({workspaceId:scope,businessLines:Object.freeze(
    [...map.values()].map(v=>Object.freeze(v))),
    pipelineEstimatesAreNotRevenue:true,revenueAttributionRequiresVerifiedContractLink:true});
}
/**
 * Trusted-server-only projection from existing D1 realized_revenue_events rows.
 * tenant_key is NOT workspace_id: the real API must verify the mapping BEFORE
 * calling this pure function. No external identity, metadata or PII is emitted.
 */
export function projectNativeRevenueLedgerRows({workspaceId,tenantKey,rows}={}){
  const workspace=opaque(workspaceId,'workspaceId'),tenant=opaque(tenantKey,'tenantKey');
  if(!Array.isArray(rows))throw new TypeError('scoped revenue rows required');
  const seen=new Set();
  return Object.freeze(rows.map(row=>{
    if(row?.tenant_key!==tenant)throw new Error('CROSS_TENANT_REVENUE_DENIED');
    const key=String(row.event_key??'').trim();
    if(!key||key.length>220||/[\u0000-\u001f]/.test(key))throw new TypeError('invalid event_key');
    if(seen.has(key))throw new Error('DUPLICATE_REVENUE_EVENT');
    seen.add(key);
    if(row.currency!=='KRW')throw new TypeError('currency mismatch');
    if(!['pending','confirmed','reversed'].includes(row.status))throw new TypeError('invalid revenue status');
    if(row.status==='confirmed'&&(!row.confirmed_at||row.reversed_at)){
      throw new Error('REVENUE_CONFIRMATION_EVIDENCE_REQUIRED');
    }
    return Object.freeze({workspaceId:workspace,eventKey:key,currency:'KRW',
      status:row.status,netMinor:minor(row.net,'net')});
  }));
}
export function summarizeSalesPerformance({workspaceId,opportunities,revenueEvents}={}){
  const scope=opaque(workspaceId,'workspaceId');
  if(!Array.isArray(opportunities))throw new TypeError('opportunities must be scoped');
  const ids=new Set(),counts=Object.fromEntries(SALES_STAGES.map(stage=>[stage,0]));
  for(const row of opportunities){
    assertOpportunity(row,scope);
    const id=opaque(row.opportunityId,'opportunityId');
    if(ids.has(id))throw new Error('DUPLICATE_OPPORTUNITY');
    ids.add(id);counts[row.stage]++;
  }
  const contracted=['contracted','delivery','renewal'].reduce((n,k)=>n+counts[k],0);
  let realizedRevenueMinor=null,realizedRevenueEventCount=null;
  if(revenueEvents!==undefined){
    if(!Array.isArray(revenueEvents))throw new TypeError('revenueEvents must be scoped');
    const seen=new Set();realizedRevenueMinor=0;realizedRevenueEventCount=0;
    for(const row of revenueEvents){
      validateScope(row?.workspaceId,scope,'REVENUE');
      if(row.currency!=='KRW')throw new TypeError('currency mismatch');
      const key=String(row.eventKey??'').trim();
      if(!key||seen.has(key))throw new Error('DUPLICATE_OR_INVALID_REVENUE_EVENT');
      seen.add(key);
      if(row.status==='confirmed'){
        realizedRevenueMinor+=minor(row.netMinor,'netMinor');
        if(!Number.isSafeInteger(realizedRevenueMinor))throw new RangeError('revenue overflow');
        realizedRevenueEventCount++;
      }else if(!['pending','reversed'].includes(row.status))throw new TypeError('invalid revenue status');
    }
  }
  return Object.freeze({workspaceId:scope,opportunityCount:ids.size,
    stageCounts:Object.freeze(counts),contractedOrActiveCount:contracted,
    conversionRatePercent:ids.size?Number((contracted/ids.size*100).toFixed(1)):null,
    realizedRevenueMinor,realizedRevenueEventCount,
    currency:'KRW',revenueSource:revenueEvents===undefined?'not_connected':'caller_must_verify_provider_ledger',
    estimatedContractValuesAreNotRevenue:true});
}
