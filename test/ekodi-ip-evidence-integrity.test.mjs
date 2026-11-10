import test from 'node:test';
import assert from 'node:assert/strict';
import {checkEkodiIpRegistry,validateEkodiIpRegistry} from '../scripts/check-ekodi-ip-registry.mjs';

const clone=v=>JSON.parse(JSON.stringify(v));

test('EKODI legal/IP inventory is an honest pre-filing evidence chain',async()=>{
  const {registry,errors}=await checkEkodiIpRegistry();
  assert.deepEqual(errors,[]);
  assert.equal(registry.proof.searchEvidence.markSpecificSearchCompleted,false);
  assert.equal(registry.proof.searchEvidence.verifiedAt,null);
  assert.ok(registry.proof.evidenceEntries.some(x=>x.availability==='candidate-pr-not-merged'&&x.sourceRef.endsWith('/9183')));
  assert.ok(registry.proof.evidenceEntries.some(x=>x.availability==='verified-on-main'));
});
test('registered status without official application and grant records is rejected',async()=>{
  const {registry}=await checkEkodiIpRegistry();
  const r=clone(registry);r.marks[0].status='registered';
  const errors=validateEkodiIpRegistry(r);
  assert.ok(errors.some(e=>e.includes('Official filing evidence missing')),errors.join('; '));
  assert.ok(errors.some(e=>e.includes('Registration evidence missing')),errors.join('; '));
  assert.ok(errors.some(e=>e.includes('verified legal applicant')),errors.join('; '));
});
test('unmerged draft assets cannot masquerade as verified main sources',async()=>{
  const {registry}=await checkEkodiIpRegistry();const r=clone(registry);
  r.proof.evidenceEntries[0].availability='verified-on-main';
  assert.ok(validateEkodiIpRegistry(r).some(e=>e.includes('draft PR')));
  r.proof.evidenceEntries[0].sourceRef='';
});
test('third-party franchise marks and registered symbol cannot be claimed in EKODI master inventory',async()=>{
  const {registry}=await checkEkodiIpRegistry();const r=clone(registry);
  r.marks[0].display='BBQ® 제너시스BBQ';
  const errors=validateEkodiIpRegistry(r);
  assert.ok(errors.some(e=>e.includes('Third-party franchise mark')));
  assert.ok(errors.some(e=>e.includes('registration symbol')));
});
test('filing asserted without authentic official proof and human authority is rejected',async()=>{
  const {registry}=await checkEkodiIpRegistry();const r=clone(registry);
  r.marks[1].status='filed';r.marks[1].holder='';r.marks[1].application={number:'fake',filedAt:'2026-11-10',receiptUrl:'https://example.com/receipt'};
  assert.ok(validateEkodiIpRegistry(r).some(e=>e.includes('Official filing evidence missing')));
  r.governance.noAutomaticLegalFilingOrPayment=false;
  assert.ok(validateEkodiIpRegistry(r).some(e=>e.includes('No-autonomous-filing')));
});
