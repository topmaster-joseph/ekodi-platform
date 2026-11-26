import test from 'node:test';
import assert from 'node:assert/strict';
import {createSalesOpportunity,prepareSalesProposalDraft,projectNativeRevenueLedgerRows}
  from '../ekodibiz-sales-os-core.js';
import {buildEkodibizSalesDashboard} from '../ekodibiz-sales-os-view-model.js';

const workspaceId='ws-ekodibiz';
const o=createSalesOpportunity({
  workspaceId,opportunityId:'opp-2',businessLineId:'software',
  productId:'web-monthly',estimatedContractMinor:9900
});
const businessLines=[{workspaceId,id:'software',name:'웹구독',status:'validate'}];
const proposal=prepareSalesProposalDraft({
  workspaceId,opportunityId:o.opportunityId,productId:'web-monthly',
  proposalId:'prop-2',productVersion:'1.0'
});
test('dashboard never fabricates missing source counts or revenue',()=>{
  const view=buildEkodibizSalesDashboard({workspaceId});
  assert.equal(view.figures.opportunityCount,null);
  assert.equal(view.figures.confirmedRevenueMinor,null);
  assert.equal(view.figures.businessLineCount,null);
  assert.equal(view.sourceConnections.revenue,'not_connected');
  assert.equal(view.financialDecisionsAllowed,false);
  assert.equal(view.tabs.length,6);
});
test('connected empty sources differ from unavailable sources',()=>{
  const view=buildEkodibizSalesDashboard({
    workspaceId,businessLines:[],opportunities:[],proposals:[],revenueEvents:[]
  });
  assert.equal(view.figures.opportunityCount,0);
  assert.equal(view.figures.confirmedRevenueMinor,0);
  assert.equal(view.figures.proposalDraftCount,0);
  assert.equal(view.figures.businessLineCount,0);
});
test('estimated subscription is pipeline, not provider revenue',()=>{
  const view=buildEkodibizSalesDashboard({
    workspaceId,businessLines,opportunities:[o],proposals:[proposal]
  });
  assert.equal(view.figures.estimatedPipelineMinor,9900);
  assert.equal(view.figures.confirmedRevenueMinor,null);
  assert.equal(view.figures.proposalDraftCount,1);
  assert.equal(view.maySendOrApproveProposals,false);
});
test('D1 projected provider confirmation is the only evidence for realized revenue',()=>{
  const rows=projectNativeRevenueLedgerRows({
    workspaceId,tenantKey:'ekodibiz',
    rows:[{event_key:'payment:1',tenant_key:'ekodibiz',currency:'KRW',
      status:'confirmed',net:8000,confirmed_at:'2026-11-22T00:00:00Z',reversed_at:null}]
  });
  const view=buildEkodibizSalesDashboard({
    workspaceId,businessLines,opportunities:[o],revenueEvents:rows
  });
  assert.equal(view.figures.confirmedRevenueMinor,8000);
  assert.equal(view.revenueSource,'caller_must_verify_provider_ledger');
});
test('a forged approved proposal and wrong scope fail closed',()=>{
  assert.throws(()=>buildEkodibizSalesDashboard({
    workspaceId,businessLines,opportunities:[o],
    proposals:[{...proposal,approved:true}]
  }),/PROPOSAL_APPROVAL_UNVERIFIED/);
  assert.throws(()=>buildEkodibizSalesDashboard({
    workspaceId,businessLines,opportunities:[o],
    proposals:[{...proposal,workspaceId:'other'}]
  }),/CROSS_WORKSPACE_PROPOSAL_DENIED/);
  assert.throws(()=>buildEkodibizSalesDashboard({
    workspaceId,businessLines,opportunities:[{...o,workspaceId:'other'}]
  }),/CROSS_WORKSPACE_OPPORTUNITY_DENIED/);
  assert.throws(()=>buildEkodibizSalesDashboard({
    workspaceId,businessLines,opportunities:[o],
    revenueEvents:[{workspaceId:'other',eventKey:'pay:1',status:'confirmed',currency:'KRW',netMinor:1000}]
  }),/CROSS_WORKSPACE_REVENUE_DENIED/);
});
test('partial operator data sources do not produce misleading totals',()=>{
  assert.throws(()=>buildEkodibizSalesDashboard({
    workspaceId,businessLines,opportunities:undefined
  }),/paired/);
  assert.throws(()=>buildEkodibizSalesDashboard({
    workspaceId,opportunities:[o],businessLines:undefined
  }),/paired/);
  assert.throws(()=>buildEkodibizSalesDashboard({
    workspaceId,revenueEvents:[]
  }),/cannot display revenue/);
});
