import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { EKODI_LIFE_JOURNEY } from '../my/life-journey.js';
import { EKODI_SERVICE_MANIFEST } from '../ekodi-service-manifest.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const service=id=>EKODI_SERVICE_MANIFEST.services.find(row=>row.id===id);

test('Life journey is person-centered and not foreigner-only',()=>{
  assert.equal(EKODI_LIFE_JOURNEY.scope,'all-people');
  assert.equal(EKODI_LIFE_JOURNEY.orchestrator,'my');
  assert.equal(EKODI_LIFE_JOURNEY.identityModel,'person-space-role');
  assert.equal(EKODI_LIFE_JOURNEY.safeguards.foreignerOnly,false);
  assert.equal(EKODI_LIFE_JOURNEY.safeguards.stageIsOptional,true);
  assert.equal(EKODI_LIFE_JOURNEY.safeguards.noForcedLinearJourney,true);
  assert.equal(EKODI_LIFE_JOURNEY.safeguards.noAutomaticSensitiveInference,true);
});

test('Admission and Study are distinct education journeys while active stages reuse existing platforms',()=>{
  const ids=EKODI_LIFE_JOURNEY.stages.map(stage=>stage.id);
  assert.deepEqual(ids,['admission','study','career','startup','settlement']);
  const admission=EKODI_LIFE_JOURNEY.stages.find(stage=>stage.id==='admission');
  const study=EKODI_LIFE_JOURNEY.stages.find(stage=>stage.id==='study');
  assert.equal(admission.ownerService,'edu');
  assert.equal(study.ownerService,'edu');
  assert.equal(admission.state,'planned');
  assert.equal(study.state,'planned');
  assert.notEqual(admission.futureRoute,study.futureRoute);
  assert.match(admission.futureRoute,/\/admission$/);
  assert.match(study.futureRoute,/\/study$/);
  for(const [stageId,owner] of [['career','work'],['startup','business'],['settlement','community']]){
    const stage=EKODI_LIFE_JOURNEY.stages.find(row=>row.id===stageId);
    assert.equal(stage.state,'active');
    assert.equal(stage.ownerService,owner);
    const platform=service(owner);
    assert.ok(platform,`${owner} must already exist in the canonical service manifest`);
    assert.notEqual(platform.state,'planned',`${owner} must be an active existing platform`);
    assert.equal(new URL(stage.route).origin,new URL(platform.url).origin);
  }
  assert.equal(service('edu')?.state,'planned');
});

test('Every cross-stage handoff is advisory and requires user consent',()=>{
  const ids=new Set(EKODI_LIFE_JOURNEY.stages.map(stage=>stage.id));
  for(const handoff of EKODI_LIFE_JOURNEY.handoffs){
    assert.ok(ids.has(handoff.from));
    assert.ok(ids.has(handoff.to));
    assert.equal(handoff.mode,'suggest');
    assert.equal(handoff.consent,'required');
  }
  assert.equal(EKODI_LIFE_JOURNEY.safeguards.crossServicePrivateData,'explicit-contract-and-user-authorization');
  assert.equal(EKODI_LIFE_JOURNEY.safeguards.humanDecision,'required-for-submission-and-high-impact-actions');
});

test('My EKODI journey surface stays inside My and does not query specialist private tables',async()=>{
  const [page,app]=await Promise.all([read('my/journey/index.html'),read('my/journey/app.js')]);
  assert.match(page,/MY JOURNEY · PERSON FIRST/);
  assert.match(page,/외국인만을 위한 경로가 아니라/);
  assert.match(app,/current_site_access/);
  assert.match(app,/auth\.ekodi\.kr/);
  assert.doesNotMatch(app,/from\(['"]work_/);
  assert.doesNotMatch(app,/from\(['"]community_/);
  assert.doesNotMatch(app,/from\(['"]business_/);
  execFileSync(process.execPath,['--check',new URL('../my/journey/app.js',import.meta.url).pathname],{stdio:'pipe'});
});
