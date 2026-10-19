// Regression (PR #5370 -> #5371, 2026-10-19): when the provenance bot superseded
// a PR, CI still running for the closed PR threw in status recovery, and the
// "revoke" step rewrote the shared head commit's `test` status to failure,
// blocking the open orchestrator PR that owns the same commit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closedPrNoop, verifiedHeadPr } from '../scripts/recover-required-status-drift.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/recover-required-status-drift.mjs', import.meta.url));
const HEAD = 'a'.repeat(40), MERGE = 'c'.repeat(40);

test('closed PRs (superseded or merged) are a no-op; open/draft PRs are not', () => {
  assert.equal(closedPrNoop({ state: 'closed', merged: false }), true);
  assert.equal(closedPrNoop({ state: 'closed', merged: true }), true);
  assert.equal(closedPrNoop({ state: 'open' }), false);
  assert.equal(closedPrNoop({ state: 'open', draft: true }), false);
  assert.throws(() => verifiedHeadPr({ state: 'open', draft: true, base: { ref: 'main' }, head: { sha: HEAD } }, HEAD));
});

function run(prState) {
  const dir = mkdtempSync(join(tmpdir(), 'recover-'));
  const log = join(dir, 'calls.jsonl'), mock = join(dir, 'mock.mjs');
  writeFileSync(log, '');
  writeFileSync(mock, `
import { appendFileSync } from 'node:fs';
const json = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = (init.method || 'GET').toUpperCase();
  appendFileSync(${JSON.stringify(log)}, JSON.stringify({ method, path: url.pathname }) + '\\n');
  const p = url.pathname.replace(/^\\/repos\\/[^/]+\\/[^/]+/, '');
  if (method === 'GET' && p === '/pulls/9') return json(200, ${JSON.stringify(
    prState === 'open'
      ? { state: 'open', draft: false, base: { ref: 'main' }, head: { sha: HEAD }, merge_commit_sha: MERGE }
      : { state: 'closed', merged: false, base: { ref: 'main' }, head: { sha: HEAD }, merge_commit_sha: MERGE })});
  if (method === 'GET' && /\\/commits\\/[a-f0-9]{40}\\/status$/.test(p))
    return json(200, { statuses: ['test', 'EKODI AI Orchestration Gate'].map(context => ({ context, state: 'success', target_url: 'https://x' })) });
  if (method === 'POST' && p.startsWith('/statuses/')) return json(201, {});
  return json(404, { message: 'unmocked' });
};`);
  const r = spawnSync(process.execPath, ['--import', mock, SCRIPT], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, GITHUB_REPOSITORY: 'topmaster-joseph/ekodi-platform', GH_TOKEN: 'x', PR_NUMBER: '9', HEAD_SHA: HEAD },
  });
  const calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { code: r.status, out: r.stdout + r.stderr, calls };
}

test('superseded (closed) PR: exits 0 and writes no statuses, so the revoke step never fires', () => {
  const { code, out, calls } = run('closed');
  assert.equal(code, 0, out);
  assert.match(out, /closed \(superseded or abandoned\); no merge commit to reconcile/);
  assert.equal(calls.filter(c => c.method === 'POST').length, 0);
});

test('open PR: still reconciles required statuses onto the merge commit', () => {
  const { code, out, calls } = run('open');
  assert.equal(code, 0, out);
  const posts = calls.filter(c => c.method === 'POST');
  assert.equal(posts.length, 2);
  assert.ok(posts.every(c => c.path.endsWith('/statuses/' + MERGE)));
});
