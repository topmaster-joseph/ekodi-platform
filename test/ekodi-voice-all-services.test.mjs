import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {hasDevotionalSpeakerRights,verifyDevotionVoiceRecord,verifyDevotionPair} from '../scripts/ekodi-voice/verify-devotion-voice-consent.mjs';
import {describeVoice,summarize} from '../scripts/ekodi-voice/audit-r2-devotion-speakers.mjs';

const POLICY=new URL('../config/ekodi-voice-reuse-policy.json',import.meta.url);
const scope='self-recorded-for-ekodi-all-services';
const make=(gender,speaker,grant=true)=>{
 const bytes=Buffer.from('private test example '+gender);
 return {bytes,record:{
  key:`_voice/ekodi-narrator/${gender}/sample-2026-11-02T22-15-00.wav`,
  sha256:createHash('sha256').update(bytes).digest('hex'),
  recordedAt:'2026-11-02T22:15:00Z',gender,speaker,
  consent:'self-recorded-for-ekodi-audiobooks',
  devotionConsent:'none',devotionConsentAt:null,
  allServicesConsent:grant?scope:'none',
  allServicesConsentAt:grant?'2026-11-02T22:15:00Z':null
 }};
};
test('owner authorized platform-wide voice reuse without pretending unrelated speakers consented',()=>{
 const p=JSON.parse(readFileSync(POLICY,'utf8'));
 assert.equal(p.authorization.confirmedDate,'2026-11-02');
 assert.equal(p.scope.services,'all-ekodi-services');
 assert.equal(p.rightsGuardrails.speakerSpecificPermissionRequired,true);
 assert.equal(p.rightsGuardrails.legacyAudiobookOnlyNotRetroactivelyUpgraded,true);
 assert.equal(p.rightsGuardrails.publicReleaseRequiresHumanAudioReview,true);
});
test('a verified one-time all-service speaker grant authorizes shared Church, Mission, Bible renderer',()=>{
 const male=make('m','separate A');
 const female=make('f','separate B');
 assert.equal(hasDevotionalSpeakerRights(male.record),true);
 assert.equal(verifyDevotionVoiceRecord(male.record,male.bytes,'m'),true);
 assert.equal(verifyDevotionPair(male.record,male.bytes,female.record,female.bytes),true);
 assert.deepEqual(summarize(male.record,female.record,male.bytes,female.bytes),{male:'verified',female:'verified',verified_pair:true});
 assert.equal(describeVoice(male.record,'m',null),'public_scope_unverified');
});
test('owner blanket grant cannot silently make old or invalid speaker recordings public',()=>{
 const record=make('m','speaker',false);
 assert.equal(hasDevotionalSpeakerRights(record.record),false);
 assert.equal(describeVoice(record.record,'m',record.bytes),'audiobook_only');
 assert.equal(verifyDevotionVoiceRecord(record.record,record.bytes,'m'),false);
 const withWrong={...record.record,allServicesConsent:'operator-only-grant',allServicesConsentAt:'2026-11-02T22:15:00Z'};
 assert.equal(hasDevotionalSpeakerRights(withWrong),false);
 assert.equal(verifyDevotionVoiceRecord({...record.record,allServicesConsent:scope,allServicesConsentAt:'invalid'},record.bytes,'m'),false);
 assert.equal(verifyDevotionVoiceRecord({...record.record,allServicesConsent:scope,allServicesConsentAt:'2026-11-02T22:15:00Z'},Buffer.from('different sample'),'m'),false);
});
test('all-service grant is one-time per speaker, not site-by-site reconsent and not a public file endpoint',()=>{
 const server=readFileSync(new URL('../books-commerce.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../books/buy/voice-studio.js',import.meta.url),'utf8');
 assert.match(server,/x-ekodi-voice-all-services-consent/);
 assert.match(server,/allServicesConsentAt: allServicesConsented \? at : null/);
 assert.match(studio,/id: 'voicePublicDevotionConsent'/);
 assert.match(studio,/self-recorded-for-ekodi-all-services/);
 assert.match(studio,/서비스마다 중복 동의하지 않습니다/);
 assert.doesNotMatch(server,/public\/voice\/raw-download/);
});
