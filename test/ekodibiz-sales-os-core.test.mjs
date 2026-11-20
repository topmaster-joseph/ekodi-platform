import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSalesOpportunity, planSalesTransition, prepareSalesProposalDraft,
  planMarketingLedgerEvent, summarizeBusinessLinePipeline,
  projectNativeRevenueLedgerRows, summarizeSalesPerformance
} from '../ekodibiz-sales-os-core.js';

const base={opportunityId:'opp-01',workspaceId:'ws-01',businessLineId:'education',productId:'edu-ai'};
const opportunity=(overrides={})=>createSalesOpportunity({...base,...overrides});

test('opportunity cannot invent signed orders, revenue or customer identifiers',()=>{
  const o=opportunity();
  assert.equal(o.commercialSubject,'ekodibiz');
  assert.equal(o.actualRevenueMinor,null);
  assert.equal(o.estimatedContractMinor,null);
  assert.equal(o.stage,'inquiry');
  assert.throws(()=>opportunity({customerEmail:'a@example.com'}),/forbidden/);
  assert.throws(()=>opportunity({workspaceId:'../other'}),/opaque/);
});

test('stage transitions are only plans with no executable side effects',()=>{
  const o=opportunity();
  assert.throws(()=>planSalesTransition(o,'contracted'),/invalid stage transition/);
  const t=planSalesTransition(o,'consultation',{evidenceRef:'ev-01'});
  assert.equal(t.canCommit,false);
  assert.equal(t.readyForServerVerification,true);
  assert.equal(planMarketingLedgerEvent(t).eventType,'consultation');
  assert.equal(planMarketingLedgerEvent(t).executable,false);
  const approved=planSalesTransition({...o,stage:'proposal_draft'},'proposal_approved',{evidenceRef:'approval-01'});
  assert.equal(approved.humanGate,true);
  assert.equal(approved.canSendExternally,false);
  assert.equal(planMarketingLedgerEvent(approved),null);
});

test('proposal is unapproved working draft, even with estimated amount',()=>{
  const p=prepareSalesProposalDraft({proposalId:'p-1',opportunityId:'opp-01',
    workspaceId:'ws-01',productId:'edu-ai',productVersion:'v3',amountMinor:1500000});
  assert.equal(p.status,'working_draft');
  assert.equal(p.sourceVerification,'unverified');
  assert.equal(p.approved,false);
  assert.equal(p.sent,false);
  assert.equal(p.contractCommitted,false);
  assert.throws(()=>prepareSalesProposalDraft({...p,sourceVerification:'verified'}),/forbidden/);
  assert.throws(()=>prepareSalesProposalDraft({...p,approvalStatus:'approved'}),/forbidden/);
});

test('pipeline groups registered business lines and excludes contracted estimate',()=>{
  const lines=[
    {id:'education',workspaceId:'ws-01',name:'AI교육',status:'validate'},
    {id:'web',workspaceId:'ws-01',name:'웹구독',status:'experiment'}
  ];
  const a=opportunity({estimatedContractMinor:1300000});
  const b={...opportunity({opportunityId:'opp-02',businessLineId:'web',estimatedContractMinor:9900}),stage:'contracted'};
  const result=summarizeBusinessLinePipeline({workspaceId:'ws-01',businessLines:lines,opportunities:[a,b]});
  assert.equal(result.businessLines[0].estimatedPipelineMinor,1300000);
  assert.equal(result.businessLines[1].estimatedPipelineMinor,0);
  assert.equal(result.businessLines[1].contractedOrActiveCount,1);
  assert.equal(result.businessLines[1].realizedRevenueMinor,null);
  assert.equal(result.revenueAttributionRequiresVerifiedContractLink,true);
  assert.throws(()=>summarizeBusinessLinePipeline({workspaceId:'ws-01',
    businessLines:[{...lines[0],workspaceId:'ws-02'}],opportunities:[]}),/CROSS_WORKSPACE/);
  assert.throws(()=>summarizeBusinessLinePipeline({workspaceId:'ws-01',
    businessLines:lines,opportunities:[{...a,businessLineId:'other'}]}),/UNKNOWN_BUSINESS_LINE/);
});

test('native confirmed revenue is mapped only after tenant checks',()=>{
  const row={event_key:'provider:ref/with-slash',tenant_key:'ekodibiz',
    currency:'KRW',status:'confirmed',net:6000,confirmed_at:'2026-11-20T12:00:00Z',
    reversed_at:null,metadata_json:'{"email":"should-never-leak"}'};
  const projected=projectNativeRevenueLedgerRows({workspaceId:'ws-01',tenantKey:'ekodibiz',rows:[row]});
  assert.equal(projected[0].netMinor,6000);
  assert.equal('metadata_json' in projected[0],false);
  assert.equal(summarizeSalesPerformance({workspaceId:'ws-01',opportunities:[],revenueEvents:projected}).realizedRevenueMinor,6000);
  assert.throws(()=>projectNativeRevenueLedgerRows({workspaceId:'ws-01',tenantKey:'ekodibiz',
    rows:[{...row,tenant_key:'other'}]}),/CROSS_TENANT/);
  assert.throws(()=>projectNativeRevenueLedgerRows({workspaceId:'ws-01',tenantKey:'ekodibiz',
    rows:[{...row,confirmed_at:null}]}),/EVIDENCE_REQUIRED/);
  assert.throws(()=>projectNativeRevenueLedgerRows({workspaceId:'ws-01',tenantKey:'ekodibiz',
    rows:[row,row]}),/DUPLICATE_REVENUE/);
});

test('confirmed, pending, reversed revenue cannot be double counted',()=>{
  const data=[
    {eventKey:'r1',workspaceId:'ws-01',currency:'KRW',status:'confirmed',netMinor:1000},
    {eventKey:'r2',workspaceId:'ws-01',currency:'KRW',status:'pending',netMinor:4000},
    {eventKey:'r3',workspaceId:'ws-01',currency:'KRW',status:'reversed',netMinor:3000}
  ];
  const result=summarizeSalesPerformance({workspaceId:'ws-01',opportunities:[opportunity()],revenueEvents:data});
  assert.equal(result.realizedRevenueMinor,1000);
  assert.equal(result.realizedRevenueEventCount,1);
  assert.equal(result.opportunityCount,1);
  assert.throws(()=>summarizeSalesPerformance({workspaceId:'ws-01',opportunities:[],
    revenueEvents:[data[0],data[0]]}),/DUPLICATE/);
  assert.throws(()=>summarizeSalesPerformance({workspaceId:'ws-01',opportunities:[],
    revenueEvents:[{...data[0],workspaceId:'ws-02'}]}),/CROSS_WORKSPACE/);
});

test('not connected revenue remains unknown, empty connected ledger is zero',()=>{
  const unknown=summarizeSalesPerformance({workspaceId:'ws-01',opportunities:[]});
  const known=summarizeSalesPerformance({workspaceId:'ws-01',opportunities:[],revenueEvents:[]});
  assert.equal(unknown.realizedRevenueMinor,null);
  assert.equal(known.realizedRevenueMinor,0);
  assert.equal(unknown.conversionRatePercent,null);
});
