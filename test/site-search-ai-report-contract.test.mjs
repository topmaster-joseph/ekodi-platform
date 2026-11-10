import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSiteAiReport,proposeCentralFollowUp} from '../site-search-ai-report-contract.js';
const authority={workspaceId:'ws-church-001',canonicalSiteUrl:'https://ekodi.kr/ekodichurch/',delegated:true,audited:true,canReport:true,actorId:'site-agent-1'};
const sample={workspaceId:'ws-church-001',siteUrl:'https://ekodi.kr/ekodichurch/',capability:'seo_technical',status:'needs_action',evidence:[{kind:'internal_receipt',receiptId:'r-1'}],completedCount:2,failedCount:1,runId:'run-a'};
test('site-local report must bind verified workspace and delegated authority',()=>{
  assert.throws(()=>normalizeSiteAiReport({...sample,workspaceId:'another-tenant'},authority),/WORKSPACE_MISMATCH/);
  assert.throws(()=>normalizeSiteAiReport({...sample,siteUrl:'https://ekodi.kr/ekodimall/'},authority),/SITE_MISMATCH/);
  assert.throws(()=>normalizeSiteAiReport(sample,{...authority,canReport:false}),/AUTHORITY/);
});
test('central projection is bounded and cannot assert provider truth without receipt',()=>{
  const r=normalizeSiteAiReport({...sample,providerVerified:true},authority,()=> '2026-11-10T00:00:00.000Z');
  assert.equal(r.providerVerified,false);assert.equal(r.evidence.length,1);
  assert.equal(r.observedAt,'2026-11-10T00:00:00.000Z');
  assert.equal(proposeCentralFollowUp(r).instructionState,'proposal_only');
  assert.equal(proposeCentralFollowUp(r).executionAuthorized,false);
});
test('private credentials and untrusted evidence links are rejected',()=>{
  assert.throws(()=>normalizeSiteAiReport({...sample,secret:'x'},authority),/SENSITIVE_FIELD/);
  assert.throws(()=>normalizeSiteAiReport({...sample,evidence:[{kind:'public_url',href:'http://example.com'}]},authority),/INVALID_EVIDENCE_URL/);
  assert.throws(()=>normalizeSiteAiReport({...sample,evidence:new Array(13).fill({kind:'internal_receipt'})},authority),/INVALID_EVIDENCE/);
});
test('follow-up cannot authorize irreversible action or bypass human gate',()=>{
  const r=normalizeSiteAiReport({...sample,status:'failed'},authority);
  const decision=proposeCentralFollowUp(r,{allowedActions:['repair_reversible'],humanApproved:true});
  assert.equal(decision.proposedAction,'repair_reversible');
  assert.equal(decision.executionAuthorized,false);
});
