import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildCanonicalProfile, PROFILE_SOURCE_CLASSES, PROFILE_SOURCE_LABELS } from '../profile-evidence-runtime.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const row=(overrides={})=>({
  id:1,
  evidence_key:'evidence_1',
  field_path:'business.name',
  value_json:'"EKODI"',
  source_class:'official',
  source_name:'official registry',
  source_url:'https://example.go.kr/record',
  source_record_id:'record-1',
  observed_at:'2026-08-22T00:00:00.000Z',
  confidence:1,
  review_state:'unreviewed',
  is_current:1,
  ...overrides,
});

test('official evidence wins initial selection over unconfirmed user and AI values',()=>{
  const result=buildCanonicalProfile([
    row(),
    row({id:2,evidence_key:'evidence_2',value_json:'"User value"',source_class:'user',source_name:'EKODI User',source_url:'',source_record_id:''}),
    row({id:3,evidence_key:'evidence_3',value_json:'"AI guess"',source_class:'ai_inference',source_name:'AI',source_url:'',source_record_id:''}),
  ]);
  assert.equal(result.fields[0].value,'EKODI');
  assert.equal(result.fields[0].sourceClass,'official');
  assert.equal(result.fields[0].needsReview,false);
  assert.equal(result.readiness.officialFirstCoverage,1);
});

test('human-corrected value can override stale official evidence without deleting the original evidence',()=>{
  const result=buildCanonicalProfile([
    row(),
    row({id:2,evidence_key:'evidence_2',value_json:'"EKODI corrected"',source_class:'user',source_name:'EKODI User Correction',source_url:'',source_record_id:'',review_state:'corrected'}),
  ]);
  assert.equal(result.fields[0].value,'EKODI corrected');
  assert.equal(result.fields[0].sourceClass,'user');
  assert.equal(result.fields[0].humanConfirmed,true);
  assert.equal(result.fields[0].alternatives[0].sourceClass,'official');
  assert.equal(result.readiness.canFinalize,true);
});

test('conflicting official sources stay visible and require review until a human resolves them',()=>{
  const result=buildCanonicalProfile([
    row({source_name:'registry A',source_record_id:'a'}),
    row({id:2,evidence_key:'evidence_2',value_json:'"Different name"',source_name:'registry B',source_record_id:'b'}),
  ]);
  assert.equal(result.fields[0].conflict,true);
  assert.equal(result.fields[0].needsReview,true);
  assert.equal(result.readiness.canFinalize,false);
  assert.equal(result.nextQuestions[0].reason,'conflicting_evidence');
});

test('AI-only claims are explicitly inference and cannot silently become final facts',()=>{
  const result=buildCanonicalProfile([
    row({source_class:'ai_inference',source_name:'AI',source_url:'',source_record_id:'',confidence:.7}),
  ]);
  assert.equal(result.fields[0].sourceLabel,'AI INFERENCE');
  assert.equal(result.fields[0].needsReview,true);
  assert.equal(result.readiness.canFinalize,false);
});

test('source taxonomy is stable and user-facing labels remain explicit',()=>{
  assert.deepEqual(PROFILE_SOURCE_CLASSES,['official','verified','public','user','ai_inference','needs_check']);
  assert.equal(PROFILE_SOURCE_LABELS.official,'OFFICIAL');
  assert.equal(PROFILE_SOURCE_LABELS.ai_inference,'AI INFERENCE');
  assert.equal(PROFILE_SOURCE_LABELS.needs_check,'NEEDS CHECK');
});

test('profile migration is additive and preserves evidence, confirmations and discovery history',async()=>{
  const migration=await read('migrations/0032_official_data_profile_evidence.sql');
  for(const table of ['ekodi_profiles','ekodi_profile_evidence','ekodi_profile_confirmations','ekodi_profile_discovery_runs'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  for(const source of ['official','verified','public','user','ai_inference','needs_check'])assert.match(migration,new RegExp(source));
  assert.match(migration,/ON DELETE CASCADE/);
  assert.doesNotMatch(migration,/DROP TABLE|DROP COLUMN|password|resident_registration|social_security/i);
});

test('profile API enforces consent, source boundaries, evidence-first discovery and final confirmation',async()=>{
  const runtime=await read('profile-evidence-runtime.js');
  for(const route of ['/v1/profiles','/discover','/evidence','/confirm','/finalize','/analysis'])assert.ok(runtime.includes(route));
  assert.match(runtime,/PERSON_DISCOVERY_CONSENT_REQUIRED/);
  assert.match(runtime,/PERSON_PUBLIC_IDENTIFIER_NOT_ALLOWED/);
  assert.match(runtime,/DISCOVERY_SOURCES=new Set\(\['official','verified','public'\]\)/);
  assert.match(runtime,/OFFICIAL_DATA_PROVIDER_UNAVAILABLE/);
  assert.match(runtime,/doNotInferMissingFacts:true/);
  assert.match(runtime,/analysisNeverOverridesEvidence:true/);
  assert.match(runtime,/PROFILE_REVIEW_REQUIRED/);
  assert.match(runtime,/officialDataFirst:true/);
  assert.match(runtime,/humanConfirmationLast:true/);
});

test('workspace entry routes the shared profile layer before legacy investment and exposes readiness in health',async()=>{
  const entry=await read('workspace-platform-entry-worker.js');
  assert.match(entry,/handleProfileEvidenceApi/);
  assert.match(entry,/profileSchemaReady/);
  assert.match(entry,/\/v1\/profiles/);
  assert.match(entry,/profileEvidenceFoundation:'v1'/);
  assert.match(entry,/officialDataFirst:true/);
  assert.match(entry,/legacyWorkspaceWorker\.fetch/);
});
