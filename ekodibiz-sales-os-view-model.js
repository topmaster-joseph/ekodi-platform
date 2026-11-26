/**
 * EKODIBIZ Sales OS read-only operator projection.
 * Presentation contract only; no admin menu/route and no backend/auth changes.
 * Source integrations must supply authorized same-workspace facts.
 */
import {summarizeBusinessLinePipeline,summarizeSalesPerformance}
  from './ekodibiz-sales-os-core.js';
import {projectEkodibizB2bCrmOverview}
  from './ekodibiz-sales-os-adapters.js';

const TABS=Object.freeze([
  {id:'portfolio',label:'사업관리'},
  {id:'products',label:'상품·서비스'},
  {id:'sales',label:'영업·고객'},
  {id:'proposals',label:'제안서·견적'},
  {id:'delivery',label:'계약·수행'},
  {id:'performance',label:'성과·분석'}
]);
const UNKNOWN=Object.freeze({status:'not_connected',value:null});
const BOUNDED=2000;
const integer=(x,name)=>{
  if(!Number.isSafeInteger(x)||x<0)throw new TypeError(name+' invalid');
  return x;
};
function scoped(source,name){
  if(source===undefined)return undefined;
  if(!Array.isArray(source)||source.length>BOUNDED)throw new TypeError(name+' must be a bounded array');
  return source;
}
function finiteKrw(value,label){
  if(value===null||value===undefined)return null;
  return integer(value,label);
}
/** Stable, display-oriented model; actual UI must be mounted behind site-admin auth. */
export function buildEkodibizSalesDashboard({
  workspaceId,businessLines,opportunities,marketingOverview,revenueEvents,proposals,
  observedAt=null
}={}){
  const portfolioRows=scoped(businessLines,'businessLines');
  const opportunityRows=scoped(opportunities,'opportunities');
  const revenueRows=scoped(revenueEvents,'revenueEvents');
  const proposalRows=scoped(proposals,'proposals');
  // Do NOT assume that omitted upstream data source means an empty ledger.
  // All opportunities and portfolio entries must be supplied together.
  if((portfolioRows===undefined)!==(opportunityRows===undefined))
    throw new TypeError('portfolio and opportunity sources must be paired');
  const pipeline=portfolioRows===undefined?null:summarizeBusinessLinePipeline({
    workspaceId,businessLines:portfolioRows,opportunities:opportunityRows
  });
  const sales=opportunityRows===undefined?null:summarizeSalesPerformance({
    workspaceId,opportunities:opportunityRows,revenueEvents:revenueRows
  });
  if(opportunityRows===undefined&&revenueRows!==undefined)
    throw new TypeError('cannot display revenue without an authorized opportunity scope');
  const marketing=marketingOverview===undefined?null:projectEkodibizB2bCrmOverview({
    workspaceId,overview:marketingOverview
  });
  let proposalsSummary=null;
  if(proposalRows!==undefined){
    const ids=new Set();
    let review=0,approved=0;
    for(const item of proposalRows){
      if(item?.workspaceId!==workspaceId)throw new Error('CROSS_WORKSPACE_PROPOSAL_DENIED');
      if(item.schema!=='ekodi.ekodibiz.sales-proposal-ref.v1')
        throw new TypeError('unknown proposal reference');
      const id=String(item.proposalId||'');
      if(!id||ids.has(id))throw new Error('DUPLICATE_OR_INVALID_PROPOSAL');
      ids.add(id);
      // A local draft is never approved. Server-approved states require
      // a separate audited write contract not present in Phase A.
      if(item.status!=='working_draft'||item.approved!==false||item.sent!==false)
        throw new Error('PROPOSAL_APPROVAL_UNVERIFIED');
      review++;
    }
    proposalsSummary=Object.freeze({drafts:review,approved:approved,externalSendEnabled:false});
  }
  let asOf=null;
  if(observedAt!==null){
    const time=new Date(observedAt);
    if(Number.isNaN(time.getTime()))throw new TypeError('observedAt invalid');
    asOf=time.toISOString();
  }
  const businessLineCount=pipeline?.businessLines.length??null;
  const values=Object.freeze({
    businessLineCount,
    opportunityCount:sales?.opportunityCount??null,
    proposalDraftCount:proposalsSummary?.drafts??null,
    contractedOrActiveCount:sales?.contractedOrActiveCount??null,
    relationshipCount:marketing?.relationshipCount??null,
    estimatedPipelineMinor: pipeline
      ? pipeline.businessLines.reduce((total,line)=>{
          const next=total+finiteKrw(line.estimatedPipelineMinor,'estimatedPipelineMinor');
          if(!Number.isSafeInteger(next))throw new RangeError('pipeline overflow');
          return next;
        },0) : null,
    confirmedRevenueMinor:sales?.realizedRevenueMinor??null,
    currency:'KRW'
  });
  const connections=Object.freeze({
    portfolio:pipeline?'connected':'not_connected',
    sales:sales?'connected':'not_connected',
    proposals:proposalsSummary?'connected':'not_connected',
    marketing:marketing?'connected':'not_connected',
    revenue:revenueRows!==undefined?'connected':'not_connected'
  });
  return Object.freeze({
    schema:'ekodi.ekodibiz.sales-dashboard.v1',
    workspaceId,observedAt:asOf,
    tabs:TABS,
    sourceConnections:connections,
    figures:values,
    businessLines:pipeline?.businessLines??null,
    marketingSnapshot:marketing,
    revenueSource:sales?.revenueSource??'not_connected',
    warning:'미연결 데이터는 0으로 표시하지 않습니다. 매출은 제공자 확정 원장만 사용합니다.',
    financialDecisionsAllowed:false,
    maySendOrApproveProposals:false,
    auditReceipt:null
  });
}