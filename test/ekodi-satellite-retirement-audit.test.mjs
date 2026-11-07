import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectCurrentRepositoryRetirements} from '../scripts/inspect-satellite-repository-retirement.mjs';
import {
  classifyEkodiSatelliteAudit,collectEkodiSatelliteAudit,
  runEkodiSatelliteAudit,renderEkodiSatelliteAuditSummary
} from '../scripts/run-ekodi-satellite-retirement-audit.mjs';

const sha='a'.repeat(40);
const base={
  service:'lab',retiredRepository:'topmaster-joseph/ekodi-site',
  sourceMarkerVerified:true,blocker:null,
  observations:[{sourceSha:sha},{sourceSha:sha}],
  cloudflareDeploymentBindingVerified:false,
  independentRollbackVerified:false,
  immutableOffsiteRestoreVerified:false,
  repositoryDeletionAuthorized:false
};
const church={
  ...base,service:'church',retiredRepository:'topmaster-joseph/ekodi-church',
  sourceMarkerVerified:false,blocker:'unverified-or-legacy-production-marker',
  observations:[{sourceSha:'b'.repeat(40)}]
};
const fixture=()=>({
  contract:'ekodi.satellite-live-source-marker-audit.v1',
  mode:'public-read-only',canonicalRepository:'topmaster-joseph/ekodi-platform',
  checkedAt:'2026-11-08T00:30:00.000Z',readyForRepositoryDeletion:false,
  services:[church,base],errors:['church:unverified-or-legacy-production-marker']
});

test('EKODI orchestrator owns six-repository daily observation and never grants deletion',async()=>{
  const audit=await collectEkodiSatelliteAudit({observe:async()=>fixture()});
  assert.equal(audit.summary.operator,'EKODI Orchestrator');
  assert.equal(audit.summary.scheduler,'EKODI Native Operations Watch');
  assert.equal(audit.summary.runMode,'daily');
  assert.equal(audit.summary.state,'review-required-public-marker-mismatch');
  assert.equal(audit.summary.fleet.registeredSatellites,6);
  assert.equal(audit.summary.fleet.publicCanonicalSourceMarkersVerified,1);
  assert.equal(audit.summary.fleet.legacyOrUnavailableMarkers,1);
  assert.equal(audit.summary.fleet.notCoveredByPublicMarkers,4);
  assert.equal(audit.summary.fleet.reportedRepositories.length,6);
  assert.ok(audit.summary.fleet.reportedRepositories.every(x=>x.deletionDecision==='retain'));
  for(const name of [
    'automaticRepositoryDeletionAuthorized','anyRepositoryDeleted',
    'releaseOrProductionMutationPerformed','repositoryScopedHumanGateSatisfied',
    'immutableOffsiteRestoreVerified','providerBindingsAndCredentialsReconciled'
  ]) assert.equal(audit.summary[name],false,name);
  assert.match(renderEkodiSatelliteAuditSummary(audit),/read-only workflow neither deploys nor authorizes/);
});

test('two matching source markers remain partial proof and can never certify backup or owner gates',async()=>{
  const markers=fixture();markers.services[0]={
    ...markers.services[0],sourceMarkerVerified:true,blocker:null,
    observations:[{sourceSha:sha}],repositoryDeletionAuthorized:false
  };
  markers.errors=[];
  const audit=await collectEkodiSatelliteAudit({observe:async()=>markers});
  assert.equal(audit.summary.state,'review-required-partial-public-observation');
  assert.equal(audit.summary.fleet.publicCanonicalSourceMarkersVerified,2);
  assert.equal(audit.summary.anyRepositoryDeleted,false);
  assert.equal(audit.report.repositoryDeletionReady,false);
});

test('network-observed Church failure warns but does not silence Lab evidence or grant approval',async()=>{
  const markers=fixture();markers.services[0].observations=[
    {url:'https://ekodi.kr/ekodichurch/church-release.json',verified:false,failure:'http-503'}
  ];
  const audit=await collectEkodiSatelliteAudit({observe:async()=>markers});
  assert.deepEqual(audit.summary.warningReasons,['church:unverified-or-legacy-production-marker']);
  assert.equal(audit.summary.fleet.reportedRepositories.length,6);
  assert.equal(audit.summary.finalDecision,'retain-all-satellites-requires-independent-owner-gates');
});

test('malformed independent registry evidence fails closed before writing any artifacts',async()=>{
  const registry=await inspectCurrentRepositoryRetirements();
  const broken={...registry,errors:['source-of-truth-drift']};
  await assert.rejects(
    collectEkodiSatelliteAudit({inspect:async()=>broken,observe:async()=>fixture()}),
    /retirement-audit-errors/
  );
});

test('forged public deletion proof and invalid operator run modes are rejected',async()=>{
  const markers=fixture();
  markers.services[1].repositoryDeletionAuthorized=true;
  await assert.rejects(
    collectEkodiSatelliteAudit({observe:async()=>markers}),
    /marker-claims-unsupported-authority/
  );
  assert.throws(()=>classifyEkodiSatelliteAudit({},fixture(),{runMode:'delete'}),/invalid-ekodi-satellite-audit-run-mode/);
});

test('manual EKODI fallback writes only bounded, public-source evidence and preserves status',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ekodi-native-audit-'));
  try {
    const audit=await runEkodiSatelliteAudit({
      outputDir:dir,runMode:'manual',observe:async()=>fixture()
    });
    const summary=JSON.parse(await readFile(join(dir,'report.json'),'utf8'));
    const markdown=await readFile(join(dir,'summary.md'),'utf8');
    assert.equal(summary.runMode,'manual');
    assert.equal(summary.operator,'EKODI Orchestrator');
    assert.equal(summary.anyRepositoryDeleted,false);
    assert.equal(summary.fleet.registeredSatellites,6);
    assert.match(markdown,/source and release audit/i);
    const full=JSON.parse(await readFile(join(dir,'full-audit.json'),'utf8'));
    assert.deepEqual(full,audit.report);
    const raw=JSON.parse(await readFile(join(dir,'live-markers.json'),'utf8'));
    assert.equal(raw.mode,'public-read-only');
    assert.equal((await readFile(join(dir,'retirement.json'),'utf8')).includes('SOURCE-REPO-RETIREMENT-001'),true);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});
