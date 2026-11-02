// Mandatory entry point for offline devotional rendering with separately
// consented male/female recordings. Never writes approved/public assets.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { verifyDevotionPair } from './verify-devotion-voice-consent.mjs';

const [scriptFile,maleMeta,maleSample,femaleMeta,femaleSample,outDir,checkpoints='checkpoints_v2'] = process.argv.slice(2);
if (![scriptFile,maleMeta,maleSample,femaleMeta,femaleSample,outDir].every(Boolean)) {
  process.stderr.write('usage: render-consented-devotion SCRIPT MALE_META MALE_SAMPLE FEMALE_META FEMALE_SAMPLE DRAFT_DIR [CHECKPOINTS]\n');
  process.exit(2);
}
try {
  const male=JSON.parse(readFileSync(maleMeta,'utf8'));
  const female=JSON.parse(readFileSync(femaleMeta,'utf8'));
  if (!verifyDevotionPair(male,readFileSync(maleSample),female,readFileSync(femaleSample))) {
    throw new Error('scope_or_hash_missing');
  }
} catch {
  process.stderr.write('Both independent voice samples need public devotion consent and matching integrity metadata. Rendering refused.\n');
  process.exit(1);
}
const python = process.env.EKODI_PYTHON || 'python3';
const result=spawnSync(python,[
  'scripts/ekodi-voice/render_devotion.py',
  '--script',scriptFile,
  '--male-sample',maleSample,
  '--female-sample',femaleSample,
  '--checkpoints',checkpoints,
  '--out',outDir
],{stdio:'inherit'});
if (result.error) {
  process.stderr.write('Offline voice render engine is unavailable.\n');
  process.exit(1);
}
process.exit(result.status ?? 1);
