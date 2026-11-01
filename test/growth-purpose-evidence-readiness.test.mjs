import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessGrowthEvidenceReadiness,GROWTH_ASSESSMENT_POLICY} from '../growth-purpose-evidence-readiness.js';
import {GROWTH_DIMENSIONS} from '../growth-intelligence-core.js';
const at='2026-10-29T00:00:00Z';
const purpose=(workspaceId='church-1',profile='ministry')=>({workspaceId,profile,confirmed:true,statement:'공동체의 예배와 돌봄 및 지속가능한 사역',confirmedAt:'2026-10-28T00:00:00Z'});
const observation=(id='purpose',workspaceId='church-1',extras={})=>({
  workspaceId,authorization:'authorized_scoped_aggregate',status:'observed',
  source:GROWTH_DIMENSIONS.find(x=>x.id===id).source,
  observedAt:'2026-10-28T00:00:00Z',value:0,...extras,
});
test('no data is not zero growth; ministry and commerce have independent purposes',()=>{
  const church=assessGrowthEvidenceReadiness({workspaceId:'church-1',profile:'ministry',asOf:at});
  const shop=assessGrowthEvidenceReadiness({workspaceId:'shop-1',profile:'commerce',asOf:at});
  assert.equal(church.readiness,'purpose_unconfirmed');
  assert.equal(church.evidenceCoverage.missing,7);
  assert.equal(church.evidenceCoverage.observed,0);
  assert.equal(church.dimensions.every(d=>d.value===undefined),true);
  assert.notEqual(church.profile.label,shop.profile.label);
  assert.equal(church.recommendedActions[0].authority,'accountable_org_owner');
  assert.equal(GROWTH_ASSESSMENT_POLICY.autonomousAction,false);
});
test('confirmed purpose does not pretend missing aggregate evidence is success',()=>{
  const snap=assessGrowthEvidenceReadiness({workspaceId:'church-1',profile:'ministry',asOf:at,purposeConfirmation:purpose()});
  assert.equal(snap.purposeConfirmed,true);
  assert.equal(snap.readiness,'no_verified_evidence');
  assert.equal(snap.recommendedActions.length,7);
  assert.equal(snap.governance.requiresHumanDecision,true);
});
test('documented, fresh zero is accepted as observed zero and partial evidence',()=>{
  const snap=assessGrowthEvidenceReadiness({
    workspaceId:'church-1',profile:'ministry',asOf:at,
    purposeConfirmation:purpose(),
    observations:{people:observation('people')},
  });
  assert.equal(snap.evidenceCoverage.observed,1);
  assert.equal(snap.readiness,'partial_evidence');
  assert.equal(snap.dimensions.find(d=>d.id==='people').value,0);
  assert.equal(snap.dimensions.find(d=>d.id==='resources').state,'missing');
});
test('foreign workspace, unapproved source and future observation are rejected',()=>{
  const snap=assessGrowthEvidenceReadiness({
    workspaceId:'church-1',profile:'ministry',asOf:at,purposeConfirmation:purpose(),
    observations:{
      purpose:observation('purpose','shop-1',{value:12}),
      people:observation('people','church-1',{source:'untrusted_financial_raw'}),
      trust:observation('trust','church-1',{observedAt:'2026-11-01T00:00:00Z'}),
    },
  });
  assert.equal(snap.evidenceCoverage.unverified,3);
  assert.equal(snap.evidenceCoverage.observed,0);
  assert.equal(snap.dimensions.find(d=>d.id==='purpose').value,undefined);
  assert.equal(snap.recommendedActions.filter(a=>a.type==='resolve_evidence_provenance').length,3);
});
test('old evidence is stale; never counted as a current health observation',()=>{
  const snap=assessGrowthEvidenceReadiness({
    workspaceId:'church-1',profile:'ministry',asOf:at,purposeConfirmation:purpose(),
    maxAgeDays:30,
    observations:{operations:observation('operations','church-1',{observedAt:'2026-08-01T00:00:00Z',value:5})},
  });
  assert.equal(snap.evidenceCoverage.stale,1);
  assert.equal(snap.dimensions.find(d=>d.id==='operations').value,undefined);
  assert.ok(snap.recommendedActions.some(a=>a.type==='refresh_stale_evidence'));
});
test('documented issue must include traceable finding reference and require human review',()=>{
  const fail=assessGrowthEvidenceReadiness({
    workspaceId:'church-1',profile:'ministry',asOf:at,purposeConfirmation:purpose(),
    observations:{trust:observation('trust','church-1',{status:'issue',value:1})},
  });
  assert.equal(fail.evidenceCoverage.unverified,1);
  const pass=assessGrowthEvidenceReadiness({
    workspaceId:'church-1',profile:'ministry',asOf:at,purposeConfirmation:purpose(),
    observations:{trust:observation('trust','church-1',{status:'issue',value:1,findingRef:'ev:trace_1234'})},
  });
  assert.equal(pass.readiness,'review_required');
  assert.equal(pass.evidenceCoverage.issues,1);
  assert.ok(pass.recommendedActions.some(a=>a.type==='review_documented_issue'&&a.findingRef==='ev:trace_1234'));
  assert.equal(pass.governance.noSideEffects,true);
});
test('purpose requires confirmation from same immutable workspace and profile',()=>{
  const wrong=assessGrowthEvidenceReadiness({
    workspaceId:'church-1',profile:'ministry',asOf:at,purposeConfirmation:purpose('shop-1','commerce')
  });
  assert.equal(wrong.purposeConfirmed,false);
  assert.equal(wrong.readiness,'purpose_unconfirmed');
  assert.throws(()=>assessGrowthEvidenceReadiness({workspaceId:'../admin',asOf:at}),/workspaceId/);
  assert.throws(()=>assessGrowthEvidenceReadiness({workspaceId:'church-1',asOf:'nonsense'}),/asOf/);
  assert.throws(()=>assessGrowthEvidenceReadiness({workspaceId:'church-1',asOf:at,maxAgeDays:0}),/maxAgeDays/);
  assert.throws(()=>assessGrowthEvidenceReadiness({workspaceId:'church-1',profile:'not-a-profile',asOf:at}),/purpose profile/);
});
test('policy and implementation forbid API, mutation, cross-tenant aggregation and universal rankings',()=>{
  const source=readFileSync(new URL('../growth-purpose-evidence-readiness.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(|\.prepare\s*\(|\.run\s*\(|\.batch\s*\(/);
  const snap=assessGrowthEvidenceReadiness({workspaceId:'church-1',profile:'ministry',asOf:at});
  assert.equal(snap.governance.noCrossTenantJoin,true);
  assert.doesNotMatch(JSON.stringify(snap),/"(?:rank|overallScore|predictedRevenue|salesForecast|healthScore)":/);
});
