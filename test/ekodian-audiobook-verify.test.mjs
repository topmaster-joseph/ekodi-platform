import test from 'node:test';
import assert from 'node:assert/strict';
import { releasePreflight, validateProbe } from '../scripts/ekodian-audiobook-verify.mjs';

const plan=()=>({bookId:'BOOK-EKODI-000001',edition:'ko-v1',approvals:{
  editionApproved:true,authorApproved:true,commercialVoiceRightsVerified:true,
  speakerReviewComplete:true,audioQaApproved:true,purchaseBonusPolicyConfirmed:true
},tracks:[{number:1,title:'서문',scriptFingerprint:'abc'}]});
const good={ready:true,sha256:'f'.repeat(64),sourceSha256:'f'.repeat(64),scriptFingerprint:'abc'};
test('good compressed audio with valid chapter rights is only a release candidate',()=>{
  const result=releasePreflight(plan(),new Map([[1,good]]));
  assert.deepEqual(result,{ready:true,issues:[]});
});
test('missing any independent approval blocks release',()=>{
  const p=plan();p.approvals.authorApproved=false;
  assert.equal(releasePreflight(p,new Map([[1,good]])).issues.includes('APPROVAL_MISSING_authorApproved'),true);
  p.approvals.authorApproved=true;p.approvals.commercialVoiceRightsVerified=false;
  assert.equal(releasePreflight(p,new Map([[1,good]])).ready,false);
});
test('missing file, edition mismatch, bad file and surplus tracks block publication',()=>{
  assert.ok(releasePreflight(plan(),new Map()).issues.includes('MISSING_MP3_1'));
  assert.ok(releasePreflight(plan(),new Map([[1,{...good,scriptFingerprint:'other'}]])).issues.includes('SCRIPT_EDITION_MISMATCH_1'));
  assert.ok(releasePreflight(plan(),new Map([[1,{...good,ready:false}]])).issues.includes('UNUSABLE_MP3_1'));
  assert.ok(releasePreflight(plan(),new Map([[1,{...good,sourceSha256:'c'.repeat(64)}]])).issues.includes('AUDIO_PROVENANCE_MISMATCH_1'));
  assert.ok(releasePreflight(plan(),new Map([[1,good],[2,good]])).issues.includes('UNEXPECTED_MP3_2'));
});
test('ffprobe enforces MP3 bitrate, valid duration and sample rate',()=>{
  const output={format:{duration:'120.0',bit_rate:'256000'},streams:[{
    codec_type:'audio',codec_name:'mp3',bit_rate:'256000',sample_rate:'48000',channels:2
  }]};
  assert.equal(validateProbe(output).ready,true);
  output.streams[0].bit_rate='64000';
  assert.ok(validateProbe(output).issues.includes('BITRATE_TOO_LOW'));
  output.streams[0].codec_name='aac';
  assert.ok(validateProbe(output).issues.includes('CODEC_NOT_MP3'));
});
