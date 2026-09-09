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

function run(provenance, { message = 'squashed change', lookup = null } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-ai-provenance-'));
  const eventPath = path.join(temp, 'event.json');
  const provenancePath = path.join(temp, 'pulls.json');
  const lookupPath = path.join(temp, 'lookup.json');
  fs.writeFileSync(eventPath, JSON.stringify({ head_commit: { message } }));
  fs.writeFileSync(provenancePath, typeof provenance === 'string' ? provenance : JSON.stringify(provenance));
  if (lookup) fs.writeFileSync(lookupPath, JSON.stringify(lookup));
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
      ...(lookup ? { EKODI_GITHUB_PR_LOOKUP: lookupPath } : {}),
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

test('accepts SHA-bound commit association when GitHub omits merge_commit_sha', () => {
  const associated = validPr();
  delete associated.merge_commit_sha;
  const result = run([associated]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /source=protected-main-pr-merge/);
});

test('accepts authoritative PR lookup when commit association is not ready yet', () => {
  const pr = validPr({ number: 1325 });
  const result = run([], {
    message: 'fix(ai): verify squash-merge provenance at the main gate (#1325)',
    lookup: { 1325: pr },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /source=protected-main-pr-merge/);
});

test('uses only the squash merge subject when head_commit also contains a commit body', () => {
  const pr = validPr({ number: 1368 });
  const result = run([], {
    message: 'fix(admin): align internal routes with five work areas (#1368)\n\n* fix(admin): align internal routes\n\n* test(admin): preserve compatibility',
    lookup: { 1368: pr },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /source=protected-main-pr-merge/);
});
test('PR-looking commit text cannot bypass merge SHA verification', () => {
  const forged = validPr({ number: 1325, merge_commit_sha: '2222222222222222222222222222222222222222' });
  const result = run([], {
    message: 'feature that only looks merged (#1325)',
    lookup: { 1325: forged },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /direct push to main is forbidden/);
});

test('accepts classic Merge PR title only with authoritative matching provenance', () => {
  const pr = validPr({ number: 1374 });
  const result = run([], {
    message: 'Merge PR #1374: resilient connector sessions',
    lookup: { 1374: pr },
  });
  assert.equal(result.status, 0, result.stderr);
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
