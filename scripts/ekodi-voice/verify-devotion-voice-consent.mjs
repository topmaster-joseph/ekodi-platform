// Guard public devotional voice rendering using the actual private R2 sample metadata.
// Only called on trusted offline runners. Never print speaker names, keys or audio bodies.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const ALLOWED = 'self-recorded-for-ekodi-public-devotion';
export function verifyDevotionVoiceRecord(record, bytes, gender) {
  if (!['m','f'].includes(gender) || !record || record.gender !== gender) return false;
  if (record.consent !== 'self-recorded-for-ekodi-audiobooks' ||
      record.devotionConsent !== ALLOWED ||
      !record.devotionConsentAt || !Number.isFinite(Date.parse(record.devotionConsentAt)) ||
      !record.speaker || typeof record.speaker !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(String(record.sha256||'')) ||
      !new RegExp('^_voice/ekodi-narrator/'+gender+'/sample-[\\w-]+\\.(?:webm|wav|m4a|mp3)$').test(record.key||'')) return false;
  const digest=createHash('sha256').update(bytes).digest('hex');
  return digest.toLowerCase()===record.sha256.toLowerCase();
}
export function verifyDevotionPair(male, maleBytes, female, femaleBytes) {
  return verifyDevotionVoiceRecord(male,maleBytes,'m') &&
         verifyDevotionVoiceRecord(female,femaleBytes,'f') &&
         male.key !== female.key &&
         male.sha256 !== female.sha256 &&
         male.speaker.trim().toLocaleLowerCase('ko') !== female.speaker.trim().toLocaleLowerCase('ko');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files=process.argv.slice(2);
  if(files.length!==4){process.stderr.write('usage: verify-devotion-voice-consent MALE_META MALE_SAMPLE FEMALE_META FEMALE_SAMPLE\n');process.exit(2);}
  try{
    const [m,mBytes,f,fBytes]=[JSON.parse(readFileSync(files[0],'utf8')),readFileSync(files[1]),JSON.parse(readFileSync(files[2],'utf8')),readFileSync(files[3])];
    if(!verifyDevotionPair(m,mBytes,f,fBytes))throw new Error('consent_or_sample_integrity_failed');
    process.stdout.write('EKODI devotional narrator consent and sample integrity verified for both speakers.\n');
  }catch{process.stderr.write('EKODI devotional narrator authorization or audio integrity check failed.\n');process.exitCode=1;}
}
