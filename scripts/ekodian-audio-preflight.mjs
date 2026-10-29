#!/usr/bin/env node
// EKODIAN-AUDIO-RENDER-PREFLIGHT-001
// Input is a PRIVATE, locally stored segment manifest; never commit source text.
// This tool does not call any paid speech API, upload input, or create audio.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const MAX_SEGMENTS = 30000;
const KNOWN_ROLES = new Set(['narration', 'dialogue', 'internal_monologue', 'quotation']);
const allowedEmotion = new Set(['restrained','warm','reflective','tense','sad','neutral','resolute','uncertain']);
const sha = s => createHash('sha256').update(s).digest('hex');
export const sentenceFingerprint = (s) => sha(String(s ?? '').normalize('NFC'));

export function inspectNarrationManifest(source, { editionApproved = false, licensedCast = {}, finalizedScripts = false } = {}) {
  const issues = [];
  const tracks = [];
  if (!Array.isArray(source?.books) || source.books.length === 0) {
    return { ready: false, tracks: [], issues: [{ code: 'NO_BOOKS', book: 0, track: 0, segment: 0 }] };
  }
  let globalCount = 0;
  for (const book of source.books) {
    const bookNo = Number(book.volume);
    if (!Number.isInteger(bookNo) || bookNo < 1 || bookNo > 5) issues.push({ code: 'INVALID_BOOK', book: bookNo, track: 0, segment: 0 });
    const seen = new Set();
    for (const chapter of book.chapters || []) {
      const number = Number(chapter.track);
      const base = { book: bookNo, track: number };
      if (!Number.isInteger(number) || number < 1 || number > 100 || seen.has(number)) {
        issues.push({ ...base, segment: 0, code: 'INVALID_TRACK' }); continue;
      }
      seen.add(number);
      if (!Array.isArray(chapter.segments) || chapter.segments.length === 0) {
        issues.push({ ...base, segment: 0, code: 'EMPTY_TRACK' }); continue;
      }
      let textLength = 0;
      for (const [index, seg] of chapter.segments.entries()) {
        globalCount++;
        const meta = { ...base, segment: index + 1 };
        if (globalCount > MAX_SEGMENTS) { issues.push({ ...meta, code: 'SEGMENT_LIMIT' }); break; }
        const value = String(seg.text ?? '').trim();
        if (!value || value.length > 6000) issues.push({ ...meta, code: 'BAD_TEXT' });
        if (seg.review_required === true || seg.voice_id === 'DIALOGUE_UNASSIGNED' || seg.role === 'dialogue_candidate') {
          issues.push({ ...meta, code: 'SPEAKER_REVIEW' });
        }
        if (!KNOWN_ROLES.has(seg.role)) issues.push({ ...meta, code: 'UNRESOLVED_ROLE' });
        const voice = String(seg.voice_id || '');
        if (seg.role === 'dialogue' && (!voice || voice === 'NARRATOR')) issues.push({ ...meta, code: 'DIALOGUE_CAST_MISSING' });
        if (voice && !licensedCast[voice]?.commercialLicenseVerified) {
          issues.push({ ...meta, code: 'VOICE_LICENSE_NOT_VERIFIED' });
        }
        if (seg.assignment_note === 'provisional_editorial_cast_not_author_approved') {
          issues.push({ ...meta, code: 'PROVISIONAL_CAST' });
        }
        if (!allowedEmotion.has(seg.emotion || 'neutral')) issues.push({ ...meta, code: 'UNKNOWN_EMOTION' });
        const pace = Number(seg.pace);
        if (!Number.isFinite(pace) || pace < .80 || pace > 1.20) issues.push({ ...meta, code: 'PACE_OUT_OF_RANGE' });
        const pause = Number(seg.pause_after_ms);
        if (!Number.isInteger(pause) || pause < 0 || pause > 3000) issues.push({ ...meta, code: 'PAUSE_OUT_OF_RANGE' });
        textLength += value.length;
      }
      tracks.push({ book: bookNo, number, title: String(chapter.title || ''), segments: chapter.segments.length,
        characters: textLength, fingerprint: sha(chapter.segments.map(x => String(x.text || '')).join('\n')) });
    }
  }
  if (!editionApproved) issues.push({ code: 'EDITION_NOT_APPROVED', book: 0, track: 0, segment: 0 });
  if (!finalizedScripts) issues.push({ code: 'SCRIPT_NOT_FINALIZED', book: 0, track: 0, segment: 0 });
  const counts = {};
  for (const issue of issues) counts[issue.code] = (counts[issue.code] || 0) + 1;
  return { ready: issues.length === 0, trackCount: tracks.length, segmentCount: globalCount, tracks, issueCounts: counts, issues };
}

function main() {
  const args = process.argv.slice(2);
  const file = args[0], castFile = args[1], output = args[2];
  if (!file || !castFile || !output) {
    process.stderr.write('Usage: node scripts/ekodian-audio-preflight.mjs PRIVATE_SEGMENTS.json PRIVATE_CAST.json PRIVATE_REPORT.json\n');
    process.exitCode = 2; return;
  }
  const source = JSON.parse(readFileSync(file, 'utf8'));
  const approval = JSON.parse(readFileSync(castFile, 'utf8'));
  const result = inspectNarrationManifest(source, approval);
  // Report contains indexes, fingerprints and issue codes, never the private novel text or personal voice credentials.
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify({ ready: result.ready, trackCount: result.trackCount,
    segmentCount: result.segmentCount, issueCounts: result.issueCounts }) + '\n');
  if (!result.ready) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
