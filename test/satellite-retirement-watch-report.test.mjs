import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSatelliteRetirementWatchReport, renderSatelliteRetirementWatchMarkdown } from '../scripts/build-satellite-retirement-watch-report.mjs';

const repositories = [
  'topmaster-joseph/ekodi-site',
  'topmaster-joseph/ekodi-mall',
  'topmaster-joseph/ekodi-church',
  'topmaster-joseph/jadam-maru',
  'topmaster-joseph/cheonggye-market',
  'topmaster-joseph/cheonggye-merchants-site'
];
const canonical = 'topmaster-joseph/ekodi-platform';
const SHA = 'a'.repeat(40);
function fixture() {
  const retirement = {
    policyId:'SOURCE-REPO-RETIREMENT-001',mode:'read-only-retirement-gate',canonicalRepository:canonical,
    deletionCompleted:false,deletionExecutableByThisTool:false,errors:[],registeredSatelliteRepositories:6,
    repositories:repositories.map(repository=>({repository,stage:'ownership-investigation',readiness:'retain',
      missingEvidence:['complete-repository-history-mirror-or-bundle-offsite'],
      performedDeletion:false,deleteRequested:false,needsManualDeletionAction:false}))
  };
  const markers = {
    contract:'ekodi.satellite-live-source-marker-audit.v1',mode:'public-read-only',canonicalRepository:canonical,
    checkedAt:'2026-11-07T00:00:00.000Z',readyForRepositoryDeletion:false,errors:['church:unverified-or-legacy-production-marker'],
    services:[
      {service:'church',retiredRepository:repositories[2],sourceMarkerVerified:false,
        blocker:'unverified-or-legacy-production-marker',observations:[{sourceSha:SHA}],
        repositoryDeletionAuthorized:false,cloudflareDeploymentBindingVerified:false,
        independentRollbackVerified:false,immutableOffsiteRestoreVerified:false},
      {service:'lab',retiredRepository:repositories[0],sourceMarkerVerified:true,
        blocker:null,observations:[{sourceSha:SHA},{sourceSha:SHA}],
        repositoryDeletionAuthorized:false,cloudflareDeploymentBindingVerified:false,
        independentRollbackVerified:false,immutableOffsiteRestoreVerified:false}
    ]
  };
  return {retirement,markers};
}

test('six existing satellites reported without deletion authority',()=>{
  const result=buildSatelliteRetirementWatchReport(...Object.values(fixture()));
  assert.equal(result.totalRegisteredSatellites,6);
  assert.equal(result.publicCanonicalMarkerVerified,1);
  assert.equal(result.publicLegacyOrUnverified,1);
  assert.equal(result.noPublicMarkerObservation,4);
  assert.equal(result.rows.find(x=>x.repository===repositories[0]).observedPublicSourceSha,SHA);
  assert.equal(result.rows.find(x=>x.repository===repositories[2]).observedPublicSourceSha,null);
  assert.equal(result.repositoryDeletionReady,false);
  assert.equal(result.anyRepositoryDeleted,false);
  assert.ok(result.rows.every(x=>x.deletionReadiness==='retain'&&!x.deletionAuthorized&&!x.deletionExecuted));
  assert.match(renderSatelliteRetirementWatchMarkdown(result),/No repository deletion authorized or executed/);
});

test('missing or corrupt retirement policy cannot be treated as pass',()=>{
  const {retirement,markers}=fixture(); retirement.errors=['schema drift'];
  assert.throws(()=>buildSatelliteRetirementWatchReport(retirement,markers),/retirement-audit-errors/);
});

test('registry count mismatch rejected',()=>{
  const {retirement,markers}=fixture(); retirement.registeredSatelliteRepositories=7;
  assert.throws(()=>buildSatelliteRetirementWatchReport(retirement,markers),/registry-count-mismatch/);
});

test('unregistered source marker refused',()=>{
  const {retirement,markers}=fixture();markers.services[0].retiredRepository='external/example';
  assert.throws(()=>buildSatelliteRetirementWatchReport(retirement,markers),/unregistered-source-marker/);
});

test('duplicate or canonical repository cannot enter retirement list',()=>{
  const {retirement,markers}=fixture();retirement.repositories[0].repository=canonical;
  assert.throws(()=>buildSatelliteRetirementWatchReport(retirement,markers),/retired-repository-id/);
  const second=fixture();second.retirement.repositories[1].repository=second.retirement.repositories[0].repository;
  assert.throws(()=>buildSatelliteRetirementWatchReport(second.retirement,second.markers),/duplicate-retirement-repository/);
});

test('public marker cannot self-certify offsite backup or deletion',()=>{
  const {retirement,markers}=fixture(); markers.services[1].immutableOffsiteRestoreVerified=true;
  assert.throws(()=>buildSatelliteRetirementWatchReport(retirement,markers),/marker-claims-unsupported-authority/);
});

test('source-side deletion or review-stage fake evidence rejected',()=>{
  const {retirement,markers}=fixture();retirement.repositories[0].performedDeletion=true;
  assert.throws(()=>buildSatelliteRetirementWatchReport(retirement,markers),/retirement-not-in-readonly-review-state/);
});

test('public marker contradicting its own blocker rejected',()=>{
  const {retirement,markers}=fixture();markers.services[1].blocker='source-mismatch';
  assert.throws(()=>buildSatelliteRetirementWatchReport(retirement,markers),/contradictory-marker-status/);
});

test('non-read-only marker provenance rejected',()=>{
  const {retirement,markers}=fixture();markers.mode='mutation';
  assert.throws(()=>buildSatelliteRetirementWatchReport(retirement,markers),/marker-contract-or-mode/);
});

test('future human-gated deletion-review candidate is reported, not auto-approved',()=>{
  const {retirement,markers}=fixture();
  retirement.repositories[1].stage='deletion-review';
  retirement.repositories[1].readiness='external-owner-review-required';
  retirement.repositories[1].deleteRequested=true;
  retirement.repositories[1].needsManualDeletionAction=true;
  const result=buildSatelliteRetirementWatchReport(retirement,markers);
  assert.equal(result.ownerReviewCandidatesPendingHumanGate,1);
  assert.equal(result.rows[1].deletionReadiness,'external-owner-review-required');
  assert.equal(result.rows[1].deletionAuthorized,false);
  assert.equal(result.repositoryDeletionReady,false);
});

test('inconsistent public marker error receipt is rejected',()=>{
  const {retirement,markers}=fixture();markers.errors=[];
  assert.throws(()=>buildSatelliteRetirementWatchReport(retirement,markers),/marker-errors-drift/);
});
