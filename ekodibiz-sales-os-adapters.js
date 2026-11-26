/**
 * EKODIBIZ Sales OS source adapters — Phase A2.
 *
 * These are offline, side-effect-free transformations of verified upstream
 * data. They deliberately do NOT authenticate, access a server, send proposals,
 * publish campaigns, execute contracts, verify supplier pricing, or store PII.
 *
 * Runtime integration MUST be preceded by server-verifiable EKODI workspace
 * membership, source entitlement, tenant mapping, and audit evidence.
 */
import {createProposalDraft,reviewProposalDraft} from './proposal/core.js';
import {prepareSalesProposalDraft} from './ekodibiz-sales-os-core.js';

const stageNames=Object.freeze(['inquiry','consultation','proposal','contract','onboarding','active','renewal','churn','follow_up']);
const businessDomains=new Set(['business','education','technology','public','general','nonprofit']);
function bound(value,label,max=120){
  const v=String(value??'').trim();
  if(!v||v.length>max)throw new TypeError(label+' required or too long');
  return v;
}
function count(value,label){
  if(!Number.isSafeInteger(value)||value<0)throw new TypeError(label+' invalid');
  return value;
}

/**
 * A real connection to the EXISTING Proposal Studio draft factory, not another
 * proprietary document generator. The workbench is never an approved offer.
 */
export function createEkodibizProposalWorkbench({
  opportunity,proposalId,product,workingTitle,idea='',domain='business',sourceNames=[]
}={}){
  if(!opportunity||opportunity.schema!=='ekodi.ekodibiz.sales-opportunity.v1')throw new TypeError('Sales OS opportunity required');
  if(opportunity.commercialSubject!=='ekodibiz')throw new Error('COMMERCIAL_SUBJECT_MISMATCH');
  if(!product||typeof product!=='object')throw new TypeError('versioned product reference required');
  if(opportunity.productId&&opportunity.productId!==product.id)throw new Error('PRODUCT_REFERENCE_MISMATCH');
  if(!businessDomains.has(domain))throw new TypeError('unsupported commercial proposal domain');
  if(!Array.isArray(sourceNames)||sourceNames.length>20||sourceNames.some(x=>typeof x!=='string'||x.length>1200))
    throw new TypeError('sourceNames must be bounded strings');
  const title=bound(workingTitle??product.title,'workingTitle',160);
  const content=String(idea??'').trim();
  if(content.length>20000)throw new TypeError('idea too long');
  const proposalReference=prepareSalesProposalDraft({
    proposalId,opportunityId:opportunity.opportunityId,
    workspaceId:opportunity.workspaceId,productId:product.id,
    productVersion:product.version
  });
  const studioDraft=createProposalDraft({
    title,idea:content,domain,goal:'proposal',sourceNames
  });
  const review=reviewProposalDraft(studioDraft);
  return Object.freeze({
    workspaceId:opportunity.workspaceId,opportunityId:opportunity.opportunityId,
    proposalReference,
    studioDraft,
    review,
    creation:'existing-proposal-studio',
    persistence:'not_connected',
    approval:'not_requested',
    externallySendable:false,
    sourceAttestation:'not_verified',
    // A title, source URL or user text is NOT authorization or verification.
    commercialAmountMinor:null,
    contractStatus:'not_signed'
  });
}

/**
 * Projects only one authenticated Marketing Ledger /api/marketing/ledger/overview
 * response for EKODIBIZ's service_b2b template. No raw customer identifier or
 * identifiable event is returned. This adapter does NOT infer individual deal
 * conversion, associate data to a business line, or make revenue claims.
 */
export function projectEkodibizB2bCrmOverview({workspaceId,overview}={}){
  const scope=bound(workspaceId,'workspaceId');
  if(!overview||typeof overview!=='object')throw new TypeError('authenticated CRM overview required');
  if(overview.workspace?.type!=='tenant'||overview.workspace?.key!=='ekodibiz')
    throw new Error('CROSS_TENANT_MARKETING_DATA_DENIED');
  if(overview.template?.key!=='service_b2b')throw new Error('B2B_MARKETING_TEMPLATE_REQUIRED');
  const safety=overview.safety;
  if(safety?.customerPiiIncluded!==false||safety?.customerKeysExposed!==false)
    throw new Error('CRM_PRIVACY_BOUNDARY_UNVERIFIED');
  const crm=overview.crm;
  if(!crm||typeof crm!=='object')throw new TypeError('CRM aggregate missing');
  const customers=count(crm.customers,'customers');
  const events=count(crm.events,'events');
  const anonymousEvents=count(crm.anonymousEvents,'anonymousEvents');
  if(anonymousEvents>events)throw new RangeError('anonymousEvents exceeds events');
  const values=Object.create(null);
  if(!crm.segments||typeof crm.segments!=='object'||Array.isArray(crm.segments))
    throw new TypeError('CRM segments missing');
  let represented=0;
  for(const name of stageNames){
    const value=count(crm.segments[name]??0,name);
    values[name]=value;
    // Ledger can track "follow_up" as a stage, but it is not an
    // autonomous conversion to contract or a financial confirmation.
    represented+=value;
  }
  if(Object.hasOwn(crm.segments,'other'))represented+=count(crm.segments.other,'other');
  if(represented!==customers)throw new RangeError('CRM stage sum mismatch');
  const totalEventValueKrw=count(crm.totalValueKrw,'totalValueKrw');
  return Object.freeze({
    workspaceId:scope,workspaceKey:'ekodibiz',source:'marketing-ledger-service-b2b',
    relationshipCount:customers,sampledEventCount:events,anonymousEventCount:anonymousEvents,
    latestLifecycleCounts:Object.freeze({...values}),
    lastEventAt:typeof crm.lastEventAt==='string'?crm.lastEventAt:null,
    // Marketing Ledger events may contain a value field; it is NOT the
    // provider-confirmed payment ledger and must not be shown as revenue.
    eventValueSignalKrw:totalEventValueKrw,
    realizedRevenueMinor:null,
    coverage:'recent-up-to-3000-events',
    monetaryEvidence:'not-provider-confirmed',
    customerPiiExposed:false,proposalCountsAreNotContracts:true
  });
}