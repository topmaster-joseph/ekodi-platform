import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {verifyDevotionVoiceRecord, verifyDevotionPair} from '../scripts/ekodi-voice/verify-devotion-voice-consent.mjs';
const voice=(gender,speaker,content)=>{
  const bytes=Buffer.from(content);
  return {bytes,meta:{
    key:`_voice/ekodi-narrator/${gender}/sample-2026-11-02T09-40-00.wav`,
    consent:'self-recorded-for-ekodi-audiobooks',
    devotionConsent:'self-recorded-for-ekodi-public-devotion',
    devotionConsentAt:'2026-11-02T09:40:00Z',
    gender,speaker,sha256:createHash('sha256').update(bytes).digest('hex')
  }};
};
test('speaker-specific daily devotion usage needs separate scope and authentic matching bytes',()=>{
 const male=voice('m','male narrator','independent male sound content');
 const female=voice('f','female narrator','independent female sound content');
 assert.equal(verifyDevotionPair(male.meta,male.bytes,female.meta,female.bytes),true);
 assert.equal(verifyDevotionVoiceRecord({...male.meta,devotionConsent:'none'},male.bytes,'m'),false);
 assert.equal(verifyDevotionVoiceRecord({...male.meta,consent:'self-recorded-for-ekodi-public-devotion'},male.bytes,'m'),false);
 assert.equal(verifyDevotionVoiceRecord({...male.meta,devotionConsentAt:null},male.bytes,'m'),false);
 assert.equal(verifyDevotionVoiceRecord(male.meta,Buffer.from('different sound'),'m'),false);
 assert.equal(verifyDevotionVoiceRecord({...male.meta,key:'../../books/private.mp3'},male.bytes,'m'),false);
 assert.equal(verifyDevotionPair(male.meta,male.bytes,{...female.meta,speaker:'Male Narrator'},female.bytes),false);
 assert.equal(verifyDevotionPair(male.meta,male.bytes,{...female.meta,gender:'m'},female.bytes),false);
});
test('voice studio persists separate opt-in and never silently upgrades old audiobook samples',()=>{
 const server=readFileSync(new URL('../books-commerce.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../books/buy/voice-studio.js',import.meta.url),'utf8');
 assert.match(server,/x-ekodi-voice-devotion-consent/);
 assert.match(server,/devotionConsent: devotionConsented \? 'self-recorded-for-ekodi-public-devotion' : 'none'/);
 assert.match(studio,/id: 'voicePublicDevotionConsent'/);
 assert.match(studio,/매일묵상 공개 낭독 동의 미확인/);
 assert.match(studio,/기존 오디오북 전용 녹음은 자동으로 소급 승인되지 않습니다/);
 const entry=readFileSync(new URL('../scripts/ekodi-voice/render-consented-devotion.mjs',import.meta.url),'utf8');
 assert.match(entry,/verifyDevotionPair/);
 assert.match(entry,/process\.exit\(1\)/);
});
