#!/usr/bin/env node
// EKODIAN-AUDIOBOOK-RELEASE-001 — offline private asset validation before protected release.
// This tool NEVER changes catalog flags, uploads to R2 or bills a speech provider.
import { readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ID=/^[A-Z0-9-]{3,40}$/;
const EDITION=/^[a-z0-9_-]{1,32}$/i;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

export function validateProbe(probe, { minBitrate = 192000, minSampleRate = 44100 } = {}) {
  const issues=[];
  const stream=(probe?.streams||[]).find(s=>s.codec_type==='audio');
  const seconds=Number(probe?.format?.duration);
  const bitrate=Number(stream?.bit_rate || probe?.format?.bit_rate);
  const sampleRate=Number(stream?.sample_rate);
  if (!stream || stream.codec_name!=='mp3') issues.push('CODEC_NOT_MP3');
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 10800) issues.push('INVALID_DURATION');
  if (!Number.isFinite(bitrate) || bitrate < minBitrate) issues.push('BITRATE_TOO_LOW');
  if (!Number.isFinite(sampleRate) || sampleRate < minSampleRate) issues.push('SAMPLE_RATE_TOO_LOW');
  if (![1,2].includes(Number(stream?.channels))) issues.push('INVALID_CHANNELS');
  return { ready: issues.length===0, issues,
    durationSec: Number.isFinite(seconds)?seconds:null, bitrate:Number.isFinite(bitrate)?bitrate:null,
    sampleRate:Number.isFinite(sampleRate)?sampleRate:null };
}

export function releasePreflight(plan, examined) {
  const issues=[];
  if (!ID.test(plan?.bookId||'')) issues.push('INVALID_BOOK');
  if (!EDITION.test(plan?.edition||'')) issues.push('INVALID_EDITION');
  const approvals=['editionApproved','authorApproved','commercialVoiceRightsVerified',
    'speakerReviewComplete','audioQaApproved','purchaseBonusPolicyConfirmed'];
  for (const key of approvals) if (plan?.approvals?.[key]!==true) issues.push('APPROVAL_MISSING_'+key);
  const tracks=Array.isArray(plan?.tracks)?plan.tracks:[];
  if (tracks.length<1 || tracks.length>100) issues.push('INVALID_TRACK_COUNT');
  const seen=new Set();
  for (const track of tracks) {
    const number=Number(track?.number);
    if (!Number.isInteger(number) || number<1 || number>100 || seen.has(number)) issues.push('INVALID_TRACK_NUMBER');
    seen.add(number);
    if (!String(track?.title||'').trim()) issues.push('EMPTY_TRACK_TITLE');
    const file=examined.get(number);
    if (!file) issues.push('MISSING_MP3_'+number);
    else if (!file.ready) issues.push('UNUSABLE_MP3_'+number);
    if (!track?.scriptFingerprint || !file?.scriptFingerprint || file.scriptFingerprint !== track.scriptFingerprint) issues.push('SCRIPT_EDITION_MISMATCH_'+number);
    if (!file?.sha256 || file.sourceSha256 !== file.sha256) issues.push('AUDIO_PROVENANCE_MISMATCH_'+number);
  }
  for (const number of examined.keys()) if (!seen.has(number)) issues.push('UNEXPECTED_MP3_'+number);
  return { ready: issues.length===0, issues };
}

function safeAudioPath(root, filename) {
  // No arbitrary paths from a manifest. Accept only chapter-NNN.mp3 at the audio directory root.
  if (!/^chapter-[0-9]{3}\.mp3$/.test(filename||'')) throw new Error('Invalid audio filename');
  const base=resolve(root), file=resolve(base,filename);
  if (relative(base,file).startsWith('..'+sep)) throw new Error('Path escaped workdir');
  return file;
}

export function inspectLocalRelease(plan, audioDir, { ffprobe = execFileSync } = {}) {
  const examined=new Map();
  const entries=[];
  for (const track of plan.tracks || []) {
    const number=Number(track.number);
    if (!Number.isInteger(number)||number<1||number>100) continue;
    const filename='chapter-'+String(number).padStart(3,'0')+'.mp3';
    try {
      const path=safeAudioPath(audioDir,filename);
      const size=statSync(path).size;
      if (size<1024) throw new Error('MP3_TOO_SMALL');
      const bytes=readFileSync(path);
      const probe=JSON.parse(ffprobe('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path], {encoding:'utf8',timeout:20000}));
      const quality=validateProbe(probe);
      // A generated audio asset must have independent, renderer-produced provenance.
      // Never claim verified script continuity by copying the plan fingerprint.
      const receiptPath=safeAudioPath(audioDir,filename).replace(/\.mp3$/, '.provenance.json');
      const receipt=JSON.parse(readFileSync(receiptPath,'utf8'));
      const meta={number, filename, bytes:size, sha256:digest(bytes),
        sourceSha256:receipt.audioSha256||null,scriptFingerprint:receipt.scriptFingerprint||null,
        ...quality};
      examined.set(number,meta); entries.push(meta);
    } catch(error) {
      examined.set(number,{ready:false,issues:['MP3_NOT_VERIFIED']});
      entries.push({number,filename,ready:false,issues:['MP3_NOT_VERIFIED']});
    }
  }
  // Treat unexpected MP3 files as release blockers instead of silently ignoring them.
  for (const filename of readdirSync(audioDir)) {
    const match=/^chapter-([0-9]{3})\.mp3$/.exec(filename);
    if (match && !examined.has(Number(match[1]))) {
      examined.set(Number(match[1]),{ready:false,issues:['UNEXPECTED_FILE']});
      entries.push({number:Number(match[1]),filename,ready:false,issues:['UNEXPECTED_FILE']});
    }
  }
  return {examined, entries};
}
function main() {
  const [planFile, audioDir, output] = process.argv.slice(2);
  if(!planFile||!audioDir||!output) {
    process.stderr.write('Usage: node scripts/ekodian-audiobook-verify.mjs PRIVATE_RELEASE_PLAN.json AUDIO_DIR PRIVATE_QA_RESULT.json\n');
    process.exitCode=2;return;
  }
  const plan=JSON.parse(readFileSync(planFile,'utf8'));
  const {examined,entries}=inspectLocalRelease(plan,audioDir);
  const gate=releasePreflight(plan,examined);
  // No manuscript, PII, voice model tokens, provider keys or raw URLs enter the report.
  const result={bookId:plan.bookId,edition:plan.edition,ready:gate.ready,issues:gate.issues,entries,
    objectKeys:gate.ready?entries.map(e=>({
      number:e.number, key:plan.bookId+'/audiobook/'+plan.edition+'/'+e.filename,sha256:e.sha256
    })):[]};
  writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
  process.stdout.write(JSON.stringify({ready:result.ready,trackCount:entries.length,issues:result.issues})+'\n');
  if(!gate.ready)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main();
