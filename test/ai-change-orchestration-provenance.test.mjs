import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validator = path.join(root, 'scripts', 'validate-ekodi-ai-change-orchestration.mjs');
const sha = '1111111111111111111111111111111111111111';

function run(provenance) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-ai-provenance-'));
  const eventPath = path.join(temp, 'event.json');
  const provenancePath = path.join(temp, 'pulls.json');
  fs.writeFileSync(eventPath, JSON.stringify({ head_commit: { message: 'squashed change' } }));
  fs.writeFileSync(provenancePath, typeof provenance === 'string' ? provenance : JSON.stringify(provenance));
  const result = spawnSync(process.execPath, [validator, '--release'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_NAME: 'main',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_REPOSITORY: 'topmaster-joseph/ekodi-platform',
      GITHUB_RUN_ID: 'provenance-test',
      GITHUB_SHA: sha,
      GITHUB_ACTOR: 'topmaster-joseph',
      EKODI_GITHUB_PR_PROVENANCE: provenancePath,
    },
  });
  fs.rmSync(temp, { recursive: true, force: true });
  return result;
}

function validPr(overrides = {}) {
  return {
    number: 9999,
    state: 'closed',
    merged_at: '2026-09-09T00:00:00Z',
    merge_commit_sha: sha,
    base: { ref: 'main' },
    head: { ref: 'ai/gpt-5-6-sol/provenance-test' },
    ...overrides,
  };
}

test('accepts a verified squash merge from an EKODI AI branch', () => {
  const result = run([validPr()]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /source=protected-main-pr-merge/);
});

test('rejects a direct main push with no associated PR', () => {
  const result = run([]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /direct push to main is forbidden/);
});

test('rejects provenance from an unmerged PR', () => {
  const result = run([validPr({ state: 'open', merged_at: null })]);
  assert.notEqual(result.status, 0);
});

test('rejects provenance targeting a non-main base', () => {
  const result = run([validPr({ base: { ref: 'development' } })]);
  assert.notEqual(result.status, 0);
});

test('rejects provenance whose merge SHA does not match the pushed SHA', () => {
  const result = run([validPr({ merge_commit_sha: '2222222222222222222222222222222222222222' })]);
  assert.notEqual(result.status, 0);
});

test('rejects a merged PR that did not originate in the EKODI AI namespace', () => {
  const result = run([validPr({ head: { ref: 'feature/unrouted-change' } })]);
  assert.notEqual(result.status, 0);
});

test('fails closed on malformed provenance JSON', () => {
  const result = run('{not-json');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /malformed JSON/);
});

test('live provenance verification refreshes PR detail and tolerates GitHub merge-state lag', () => {
  const source = fs.readFileSync(validator, 'utf8');
  assert.match(source, /const attempts = provenancePath \? 1 : 7/);
  assert.match(source, /loadPullRequest\(pr\?\.number\)/);
  assert.match(source, /Math\.min\(1000 \* 2 \*\* attempt, 5000\)/);
  assert.match(source, /\/pulls\/\$\{encodeURIComponent\(number\)\}/);
});
