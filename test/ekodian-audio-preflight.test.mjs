import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectNarrationManifest, sentenceFingerprint } from '../scripts/ekodian-audio-preflight.mjs';

const sample = () => ({
  books: [{ volume: 2, chapters: [{ track: 1, title: '프롤로그', segments: [
    { role: 'narration', voice_id: 'NARRATOR', text: '낯선 기록을 다시 펼쳤다.', pace: 1, pause_after_ms: 360, emotion: 'reflective', review_required: false },
    { role: 'dialogue', voice_id: 'HAEIN', text: '당신은 지금 무엇을 원하세요?', pace: .95, pause_after_ms: 240, emotion: 'restrained', review_required: false },
  ] }] }]
});
const fullApproval = {
  editionApproved: true, finalizedScripts: true,
  licensedCast: { NARRATOR: { commercialLicenseVerified: true }, HAEIN: { commercialLicenseVerified: true } },
};
test('all four approvals are mandatory even for a short sample', () => {
  const result = inspectNarrationManifest(sample());
  assert.equal(result.ready, false);
  assert.equal(result.issueCounts.VOICE_LICENSE_NOT_VERIFIED, 2);
  assert.equal(result.issueCounts.EDITION_NOT_APPROVED, 1);
  assert.equal(result.issueCounts.SCRIPT_NOT_FINALIZED, 1);
});
test('only verified, explicitly assigned speakers can enter production', () => {
  assert.equal(inspectNarrationManifest(sample(), fullApproval).ready, true);
  const draft = sample();
  draft.books[0].chapters[0].segments[1].role = 'dialogue_candidate';
  draft.books[0].chapters[0].segments[1].voice_id = 'DIALOGUE_UNASSIGNED';
  draft.books[0].chapters[0].segments[1].review_required = true;
  const result = inspectNarrationManifest(draft, fullApproval);
  assert.equal(result.ready, false);
  assert.equal(result.issueCounts.SPEAKER_REVIEW, 1);
  assert.equal(result.issueCounts.UNRESOLVED_ROLE, 1);
});
test('provisional editorial casting is not evidence of author approval', () => {
  const draft = sample();
  draft.books[0].chapters[0].segments[1].assignment_note = 'provisional_editorial_cast_not_author_approved';
  assert.equal(inspectNarrationManifest(draft, fullApproval).issueCounts.PROVISIONAL_CAST, 1);
});
test('reports include fingerprint and issue indexes, not narration text', () => {
  const report = inspectNarrationManifest(sample(), fullApproval);
  assert.equal(report.trackCount, 1);
  assert.equal(report.segmentCount, 2);
  assert.match(report.tracks[0].fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(report).includes('낯선 기록'));
  assert.equal(sentenceFingerprint('가'), sentenceFingerprint('가'));
});
test('malformed content is blocked without submitting jobs', () => {
  const draft = sample(); const s = draft.books[0].chapters[0].segments[0];
  s.pace = 4; s.pause_after_ms = -2; s.emotion = 'scream';
  const result = inspectNarrationManifest(draft, fullApproval);
  assert.equal(result.ready, false);
  assert.equal(result.issueCounts.PACE_OUT_OF_RANGE, 1);
  assert.equal(result.issueCounts.PAUSE_OUT_OF_RANGE, 1);
  assert.equal(result.issueCounts.UNKNOWN_EMOTION, 1);
});
