import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describeVoice, summarize } from '../scripts/ekodi-voice/audit-r2-devotion-speakers.mjs';
const sample=voice=>Buffer.from('synthetic-'+voice);
const make=(gender,scope=true)=>{
 const bytes=sample(gender);
 return {
   bytes,
   record:{
     gender, speaker:'speaker-'+gender,
     key:`_voice/ekodi-narrator/${gender}/sample-2026-11-02T11-00-00.wav`,
     sha256:createHash('sha256').update(bytes).digest('hex'),
     consent:'self-recorded-for-ekodi-audiobooks',
     devotionConsent:scope?'self-recorded-for-ekodi-public-devotion':'none',
     devotionConsentAt:scope?'2026-11-02T11:00:00Z':null
   }
 };
};
test('private inventory reports safe statuses and never upgrades legacy audiobook-only voice',()=>{
 const male=make('m',false);
 const female=make('f',true);
 assert.equal(describeVoice(null,'m'), 'not_found_or_inaccessible');
 assert.equal(describeVoice(male.record,'m',male.bytes),'audiobook_only');
 assert.equal(describeVoice(female.record,'f',null),'public_scope_unverified');
 assert.equal(describeVoice(female.record,'f',female.bytes),'verified');
 assert.equal(describeVoice(female.record,'f',Buffer.from('wrong sample')),'integrity_failure');
 assert.equal(describeVoice({...female.record,consent:'operator-approved'},'f',female.bytes),'not_authorized');
 assert.equal(describeVoice({...female.record,sha256:'bad'},'f',female.bytes),'invalid_metadata');
 assert.deepEqual(summarize(male.record,female.record,male.bytes,female.bytes),{male:'audiobook_only',female:'verified',verified_pair:false});
});
test('two independent consented source records and distinct audio are necessary for pair readiness',()=>{
 const m=make('m'),f=make('f');
 assert.deepEqual(summarize(m.record,f.record,m.bytes,f.bytes),{male:'verified',female:'verified',verified_pair:true});
 assert.equal(summarize(m.record,{...f.record,speaker:m.record.speaker},m.bytes,f.bytes).verified_pair,false);
});
test('workflow can only read private inventory and cannot send recordings to artifacts or publish them',()=>{
 const work=readFileSync(new URL('../.github/workflows/audit-ekodi-devotion-voice-inventory.yml',import.meta.url),'utf8');
 assert.match(work,/workflow_dispatch/);
 assert.match(work,/contents: read/);
 assert.match(work,/audit-r2-devotion-speakers\.mjs/);
 assert.doesNotMatch(work,/actions\/upload-artifact|r2 object put|wrangler .*deploy|gh release create/i);
});
