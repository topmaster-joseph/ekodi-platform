import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSatelliteRepositoryRetirement, MANDATORY_PRE_DELETION_EVIDENCE } from '../scripts/inspect-satellite-repository-retirement.mjs';

const fixture=()=>({
  registry:{canonicalPlatformRepository:'topmaster-joseph/ekodi-platform',repositories:[
    {name:'topmaster-joseph/ekodi-platform',role:'canonical-platform'},
    {name:'topmaster-joseph/ekodi-church',role:'active-satellite'},
    {name:'topmaster-joseph/ekodi-site',role:'unclassified-satellite'}
  ]},
  policy:{
    schemaVersion:1,policyId:'SOURCE-REPO-RETIREMENT-001',mode:'read-only-retirement-gate',
    automaticRepositoryDeletionAllowed:false,directWorkerRepositoryDeletionAllowed:false,defaultDecision:'retain',
    separateReleaseUnitPreserved:true,canonicalRepository:'topmaster-joseph/ekodi-platform',
    requiredPreDeletionEvidence:[...MANDATORY_PRE_DELETION_EVIDENCE],
    postDeletionEvidence:[
      'legacy-repository-absence-confirmed','canonical-production-and-administrator-screens-reverified',
      'no-legacy-deploy-credentials-or-live-provider-binding','recovery-archive-and-restoration-path-observable'
    ],
    registeredSatellites:[
      {repository:'topmaster-joseph/ekodi-church',classification:'active-satellite',stage:'active-source',deleteRequested:false},
      {repository:'topmaster-joseph/ekodi-site',classification:'unclassified-satellite',stage:'ownership-investigation',deleteRequested:false}
    ]
  }
});

test('default is retain; no automatic deletion path exists',()=>{
  const {policy,registry}=fixture();
  const result=inspectSatelliteRepositoryRetirement(policy,registry);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.deletionExecutableByThisTool,false);
  assert.equal(result.deletionCompleted,false);
  assert.equal(result.repositories.length,2);
  assert.ok(result.repositories.every(x=>x.readiness==='retain'&&x.performedDeletion===false));
});

test('review stage and scoped owner permission require independent complete evidence',()=>{
  const {policy,registry}=fixture();
  policy.registeredSatellites[0].stage='deletion-review';
  policy.registeredSatellites[0].deleteRequested=true;
  const pending=inspectSatelliteRepositoryRetirement(policy,registry);
  assert.equal(pending.repositories[0].readiness,'retain');
  assert.deepEqual(pending.repositories[0].missingEvidence,MANDATORY_PRE_DELETION_EVIDENCE);
  const evidence=Object.fromEntries(MANDATORY_PRE_DELETION_EVIDENCE.map(key=>[key,{reference:'verified://receipt/'+key,verifiedBy:'independent-owner-review'}]));
  const result=inspectSatelliteRepositoryRetirement(policy,registry,{'topmaster-joseph/ekodi-church':evidence});
  assert.deepEqual(result.errors,[]);
  assert.equal(result.repositories[0].readiness,'external-owner-review-required');
  assert.equal(result.repositories[0].performedDeletion,false);
  assert.equal(result.deletionExecutableByThisTool,false);
});

test('unclassified repository can never pass deletion review based only on supplied proof',()=>{
  const {policy,registry}=fixture();
  policy.registeredSatellites[1].deleteRequested=true;
  policy.registeredSatellites[1].stage='deletion-review';
  const evidence=Object.fromEntries(MANDATORY_PRE_DELETION_EVIDENCE.map(key=>[key,{reference:'s',verifiedBy:'owner'}]));
  const result=inspectSatelliteRepositoryRetirement(policy,registry,{'topmaster-joseph/ekodi-site':evidence});
  assert.ok(result.errors.some(x=>x.includes('unclassified satellite')));
  assert.equal(result.repositories[1].readiness,'retain');
});

test('missing satellite record or false declaration of deleted blocks the gate',()=>{
  const {policy,registry}=fixture();
  policy.registeredSatellites.pop();
  assert.ok(inspectSatelliteRepositoryRetirement(policy,registry).errors.some(x=>x.includes('missing satellite retirement entry')));
  const again=fixture();
  again.policy.registeredSatellites[0].stage='deleted-verified';
  assert.ok(inspectSatelliteRepositoryRetirement(again.policy,again.registry).errors.some(x=>x.includes('deleted status requires')));
});

test('guard set cannot be shortened, and mismatched source role is rejected',()=>{
  const {policy,registry}=fixture();
  policy.requiredPreDeletionEvidence.pop();
  policy.registeredSatellites[0].classification='canonical-platform';
  const result=inspectSatelliteRepositoryRetirement(policy,registry);
  assert.ok(result.errors.some(x=>x.includes('mandatory pre-deletion guard missing')));
  assert.ok(result.errors.some(x=>x.includes('source-of-truth role drift')));
});
