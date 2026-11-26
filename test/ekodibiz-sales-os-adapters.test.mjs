import test from 'node:test';
import assert from 'node:assert/strict';
import {createSalesOpportunity} from '../ekodibiz-sales-os-core.js';
import {createEkodibizProposalWorkbench,projectEkodibizB2bCrmOverview}
  from '../ekodibiz-sales-os-adapters.js';
import {reviewProposalDraft} from '../proposal/core.js';

const opportunity=createSalesOpportunity({
  workspaceId:'workspace-ekodibiz',opportunityId:'opp-123',
  businessLineId:'education',productId:'education-ai'
});
const product={id:'education-ai',version:'1.1',title:'기관 AI 실무교육'};

test('Sales OS uses the existing Proposal Studio draft schema and flags missing truth',()=>{
  const result=createEkodibizProposalWorkbench({
    opportunity,proposalId:'prop-123',product,idea:'기관의 실무형 AI 교육 제안',
    domain:'education',sourceNames:['https://example.org/verified-later']
  });
  assert.equal(result.creation,'existing-proposal-studio');
  assert.equal(result.studioDraft.schema,'ekodi.proposal.draft.v1');
  assert.equal(result.studioDraft.domain,'education');
  assert.equal(result.studioDraft.sections.some(x=>x.id==='curriculum'),true);
  assert.equal(result.studioDraft.sources[0].verification,'not_verified');
  assert.equal(result.proposalReference.workspaceId,'workspace-ekodibiz');
  assert.equal(result.proposalReference.productVersion,'1.1');
  assert.equal(reviewProposalDraft(result.studioDraft).submissionReady,false);
  assert.equal(result.review.submissionReady,false);
  assert.equal(result.externallySendable,false);
  assert.equal(result.commercialAmountMinor,null);
  assert.equal(result.persistence,'not_connected');
});
test('product scope and document source cannot silently override commercial reference',()=>{
  assert.throws(()=>createEkodibizProposalWorkbench({
    opportunity,proposalId:'prop-x',product:{...product,id:'another-product'}
  }),/PRODUCT_REFERENCE_MISMATCH/);
  assert.throws(()=>createEkodibizProposalWorkbench({
    opportunity,proposalId:'prop-x',product,domain:'bogus'
  }),/unsupported/);
  assert.throws(()=>createEkodibizProposalWorkbench({
    opportunity,proposalId:'prop-x',product,sourceNames:[new Object()]
  }),/bounded/);
});
const overview={
  workspace:{type:'tenant',key:'ekodibiz'},
  template:{key:'service_b2b'},
  crm:{customers:3,events:5,anonymousEvents:1,totalValueKrw:27000,
    lastEventAt:'2026-11-20T12:00:00Z',segments:{
      inquiry:1,consultation:1,proposal:1,contract:0,onboarding:0,active:0,renewal:0,other:0
    }},
  safety:{customerPiiIncluded:false,customerKeysExposed:false,externalExecution:false}
};
test('authenticated B2B CRM aggregate preserves stage evidence without counting revenue',()=>{
  const result=projectEkodibizB2bCrmOverview({workspaceId:'workspace-ekodibiz',overview});
  assert.equal(result.source,'marketing-ledger-service-b2b');
  assert.equal(result.relationshipCount,3);
  assert.equal(result.sampledEventCount,5);
  assert.equal(result.latestLifecycleCounts.proposal,1);
  assert.equal(result.eventValueSignalKrw,27000);
  assert.equal(result.realizedRevenueMinor,null);
  assert.equal(result.monetaryEvidence,'not-provider-confirmed');
  assert.equal('customer_key' in result,false);
  assert.equal('recentEvents' in result,false);
});
test('cross-tenant, missing privacy evidence and unbalanced stages fail closed',()=>{
  assert.throws(()=>projectEkodibizB2bCrmOverview({
    workspaceId:'workspace-ekodibiz',overview:{...overview,workspace:{type:'store',key:'another'}}
  }),/CROSS_TENANT/);
  assert.throws(()=>projectEkodibizB2bCrmOverview({
    workspaceId:'workspace-ekodibiz',overview:{...overview,safety:{customerPiiIncluded:false,customerKeysExposed:true}}
  }),/CRM_PRIVACY_BOUNDARY_UNVERIFIED/);
  assert.throws(()=>projectEkodibizB2bCrmOverview({
    workspaceId:'workspace-ekodibiz',overview:{...overview,crm:{...overview.crm,customers:2}}
  }),/stage sum mismatch/);
  assert.throws(()=>projectEkodibizB2bCrmOverview({
    workspaceId:'workspace-ekodibiz',overview:{...overview,template:{key:'food_b2c'}}
  }),/B2B_MARKETING_TEMPLATE_REQUIRED/);
});
test('empty authenticated CRM is zero but cannot be mistaken for unconnected revenue',()=>{
  const result=projectEkodibizB2bCrmOverview({
    workspaceId:'workspace-ekodibiz',
    overview:{...overview,crm:{customers:0,events:0,anonymousEvents:0,totalValueKrw:0,segments:{}}}
  });
  assert.equal(result.relationshipCount,0);
  assert.equal(result.realizedRevenueMinor,null);
  assert.equal(result.coverage,'recent-up-to-3000-events');
});
