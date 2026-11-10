// Measured on 2026-11-08: PR #8652 sat open with changedFiles=0 — 14 commits,
// 0 additions, 0 deletions — the empty recovery PR CLAUDE.md warns about, left
// behind after its content was consumed elsewhere. While it was open, every PR
// sharing its base commit failed overlap-guard with
//
//   PR #8652 file evidence is missing; refusing to infer independence.
//
// One tombstone blocked the whole base. The guard was right to refuse inferring
// independence without evidence; it was wrong to treat "zero files" as absence of
// evidence. Zero files is complete evidence that nothing can overlap.
//
// These tests pin the new distinction and, more importantly, that the guard stays
// exactly as strict wherever evidence is genuinely unavailable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const WORKFLOW = fs.readFileSync(new URL('../.github/workflows/ai-conflict-guard.yml', import.meta.url), 'utf8');

// Exercise the guard's real decision, lifted from the workflow, rather than a
// restatement of the rule in the test.
function decide({ changed, listed, files }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
  const otherFiles = path.join(dir, 'other.txt');
  fs.writeFileSync(otherFiles, files.length ? `${files.join('\n')}\n` : '');
  // The lifted fragment cleans up the guard's own temp files on refusal, so the
  // harness must provide them exactly as the surrounding workflow does.
  const script = `
    exec 2>&1
    set -uo pipefail
    changed=${changed}
    listed=${listed}
    other_pr=8652
    other_files=${JSON.stringify(otherFiles)}
    exact_overlap=$(mktemp)
    semantic_overlap=$(mktemp)
    ${extractDecision()}
    echo "CONTINUED"
  `;
  let status = 0;
  let out = '';
  try {
    out = execFileSync('bash', ['-c', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    status = error.status ?? 1;
    out = `${error.stdout || ''}${error.stderr || ''}`;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { status, out };
}

// The two consecutive guards, taken verbatim from the workflow so the test cannot
// drift from what CI runs.
function extractDecision() {
  const start = WORKFLOW.indexOf('            # "Zero files" is complete evidence of emptiness');
  assert.ok(start > 0, 'the zero-files guard must exist in the workflow');
  const end = WORKFLOW.indexOf('refusing to infer independence." >&2', start);
  assert.ok(end > start);
  // Extend past the closing `fi`: a fragment cut at `exit 1` leaves an
  // unterminated `if`, which bash refuses to parse at all.
  const exitAt = WORKFLOW.indexOf('exit 1', end);
  const fiAt = WORKFLOW.indexOf('fi', exitAt);
  const tail = WORKFLOW.indexOf('\n', fiAt);
  assert.ok(exitAt > 0 && fiAt > exitAt && tail > fiAt, 'the fragment must include its closing fi');
  return WORKFLOW.slice(start, tail)
    .split('\n')
    .map(line => line.replace(/^ {12}/, ''))
    .filter(line => !line.trim().startsWith('#'))
    .join('\n')
    .replace(/\bcontinue\b/, 'echo SKIPPED_EMPTY; exit 0');
}

test('a contentless PR no longer blocks the guard', () => {
  // #8652's exact shape.
  const { status, out } = decide({ changed: 0, listed: 0, files: [] });
  assert.equal(status, 0, 'an empty PR must not fail the guard');
  assert.match(out, /zero changed files; no overlap is possible/);
  assert.match(out, /SKIPPED_EMPTY/, 'it is skipped as a comparison candidate');
  assert.doesNotMatch(out, /file evidence is missing/);
});

test('missing evidence is still a hard failure', () => {
  // A PR that claims changed files but whose list could not be obtained. This is
  // the case the guard exists for, and it must not be softened by the change above.
  const { status, out } = decide({ changed: 7, listed: 0, files: [] });
  assert.equal(status, 1, 'unavailable evidence must still refuse');
  assert.match(out, /file evidence is missing; refusing to infer independence/);
  assert.doesNotMatch(out, /no overlap is possible/);
});

test('a half-empty claim is still treated as missing, not as empty', () => {
  // changed=0 with listed>0, or changed>0 with listed>0 but an empty file — both
  // are inconsistent evidence and must keep the strict path. Only the explicit
  // zero/zero pair is read as emptiness.
  for (const shape of [{ changed: 0, listed: 3, files: [] }, { changed: 2, listed: 2, files: [] }]) {
    const { status } = decide({ ...shape });
    assert.equal(status, 1, `inconsistent evidence must refuse: ${JSON.stringify(shape)}`);
  }
});

test('a PR with files proceeds to the overlap comparison as before', () => {
  const { status, out } = decide({ changed: 2, listed: 2, files: ['a.js', 'b.js'] });
  assert.equal(status, 0);
  assert.match(out, /CONTINUED/, 'it reaches the comparison rather than being skipped');
  assert.doesNotMatch(out, /SKIPPED_EMPTY/);
  assert.doesNotMatch(out, /file evidence is missing/);
});

test('the refusal message and the strict check are both still in the workflow', () => {
  // parallel-change-light-snapshot pins these strings; keep them intact.
  assert.match(WORKFLOW, /PR #\$\{other_pr\} file evidence is missing; refusing to infer independence/);
  assert.match(WORKFLOW, /Current PR file evidence is missing; refusing to infer independence/);
  // And the new branch is keyed on both counters being zero, never on just one.
  assert.match(WORKFLOW, /if \[\[ "\$changed" -eq 0 && "\$listed" -eq 0 \]\]; then/);
});
