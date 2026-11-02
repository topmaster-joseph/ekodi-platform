// Read-only, consent-safe Cloudflare R2 narrator inventory.
// Only aggregate status is printed; never emit private keys, speaker names,
// sample contents, model references, hashes or operational credentials.
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyDevotionVoiceRecord, verifyDevotionPair } from './verify-devotion-voice-consent.mjs';

export function describeVoice(record, gender, sample) {
  if (!record) return 'not_found_or_inaccessible';
  if (record?.consent !== 'self-recorded-for-ekodi-audiobooks') return 'not_authorized';
  if (record?.devotionConsent !== 'self-recorded-for-ekodi-public-devotion' || !record.devotionConsentAt)
    return 'audiobook_only';
  if (!record.key || record.gender !== gender || !record.speaker ||
    !/^([a-f0-9]{64})$/i.test(record.sha256 || '')) return 'invalid_metadata';
  if (sample == null) return 'public_scope_unverified';
  return verifyDevotionVoiceRecord(record, sample, gender) ? 'verified' : 'integrity_failure';
}
export function summarize(male, female, maleBytes, femaleBytes) {
  const m = describeVoice(male,'m',maleBytes);
  const f = describeVoice(female,'f',femaleBytes);
  const pairReady = m === 'verified' && f === 'verified' &&
    verifyDevotionPair(male,maleBytes,female,femaleBytes);
  return Object.freeze({male:m,female:f,verified_pair:pairReady});
}
function r2Get(bucket, key, outfile) {
  // Exact trusted key grammar only, even if metadata came from private R2.
  if (!/^_voice\/ekodi-narrator\/(?:latest-(?:m|f)\.json|latest\.json|[mf]\/sample-[\w-]+\.(?:wav|webm|m4a|mp3))$/.test(key))
    return false;
  const args=['--yes','wrangler@4.119.0','r2','object','get',bucket+'/'+key,'--remote','--file',outfile];
  const result=spawnSync('npx',args,{stdio:'ignore',timeout:60000,env:process.env});
  return !result.error && result.status===0 && existsSync(outfile);
}
function parsePrivateMeta(filepath) {
  try {
    if (!existsSync(filepath) || statSync(filepath).size>8192) return null;
    return JSON.parse(readFileSync(filepath,'utf8'));
  } catch {return null}
}
export function runInventory(bucket='ekodi-book-files') {
  if (!/^[a-z0-9-]{3,63}$/.test(bucket)) throw Error('invalid_bucket');
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
    throw Error('cloudflare_read_credentials_missing');
  const dir=mkdtempSync(join(tmpdir(),'ekodi-voice-audit-'));
  try {
    const meta={};const bytes={};
    for(const gender of ['m','f']){
      const latest=join(dir,'meta-'+gender+'.json');
      const has=r2Get(bucket,'_voice/ekodi-narrator/latest-'+gender+'.json',latest);
      if(!has && gender==='m')
        r2Get(bucket,'_voice/ekodi-narrator/latest.json',latest);
      meta[gender]=parsePrivateMeta(latest);
      if(describeVoice(meta[gender],gender,null)==='public_scope_unverified'){
        const target=join(dir,'sample-'+gender);
        if(r2Get(bucket,meta[gender].key,target) && statSync(target).size<=40*1024*1024)
          bytes[gender]=readFileSync(target);
      }
    }
    return summarize(meta.m,meta.f,bytes.m,bytes.f);
  } finally {
    rmSync(dir,{recursive:true,force:true,maxRetries:3});
  }
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  try{
    const result=runInventory(process.argv[2]||'ekodi-book-files');
    process.stdout.write(JSON.stringify(result)+'\n');
    // Inventory is read-only: return success even if voices are not ready.
    // A separate consent and human-audio QA gate controls publication.
  }catch{
    process.stderr.write('Private EKODI voice inventory could not be safely verified.\n');
    process.exitCode=1;
  }
}
