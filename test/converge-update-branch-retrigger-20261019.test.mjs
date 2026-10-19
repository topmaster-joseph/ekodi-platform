// Regression (PR #5328, 2026-10-19): convergence update-branch runs with the
// Actions token. GitHub suppresses push events from GITHUB_TOKEN, so the new head
// got no checks and no convergence run and the PR parked. When main carried
// .github/workflows changes, update-branch was refused and the run spun on 405
// merges until timeout. These tests execute the real script against a mock API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/converge-orchestrated-pr-merge.mjs', import.meta.url));
const BRANCH = 'ai/claude/orch_recovery_0123456789abcdef0123';
const H1 = 'a'.repeat(40), H2 = 'b'.repeat(40), M = 'c'.repeat(40);

const MOCK = `
import { appendFileSync } from 'node:fs';
const log = process.env.MOCK_LOG, scenario = process.env.MOCK_SCENARIO;
let head = '${H1}';
const json = (status, body) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = (init.method || 'GET').toUpperCase();
  appendFileSync(log, JSON.stringify({ method, path: url.pathname + url.search, body: init.body || null }) + '\\n');
  if (url.hostname === 'ekodi.kr') return json(200, { authorized: true });
  const p = url.pathname.replace(/^\\/repos\\/[^/]+\\/[^/]+/, '');
  if (method === 'GET' && p === '/pulls') return json(200, [{ number: 7, draft: false, head: { sha: head } }]);
  if (method === 'GET' && p === '/pulls/7/files') return json(200, [{ filename: 'README.md' }]);
  if (method === 'GET' && p === '/pulls/7') return json(200, { number: 7, merged: false, draft: false, head: { sha: head }, merge_commit_sha: '${M}', title: 't' });
  if (method === 'GET' && /\\/commits\\/[a-f0-9]{40}\\/status$/.test(p)) return json(200, { statuses: ['test', 'EKODI AI Orchestration Gate'].map(context => ({ context, state: 'success', target_url: 'https://x' })) });
  if (method === 'GET' && /\\/check-runs$/.test(p)) return json(200, { check_runs: ['test', 'EKODI AI Orchestration Gate'].map(name => ({ name, app: { slug: 'github-actions' }, status: 'completed', conclusion: 'success' })) });
  if (method === 'PUT' && p === '/pulls/7/update-branch') {
    if (scenario === 'behind') { head = '${H2}'; return json(202, { message: 'Updating pull request branch.' }); }
    if (scenario.startsWith('workflow')) return json(422, { message: 'refusing to allow a GitHub App to create or update workflow \`.github/workflows/x.yml\` without \`workflows\` permission' });
    return json(422, { message: 'There are no new commits on the base branch.' });
  }
  if (method === 'POST' && /\\/actions\\/workflows\\/[^/]+\\/dispatches$/.test(p)) return json(204);
  if (method === 'GET' && p === '/issues/7/comments') return json(200, scenario === 'workflow-commented' ? [{ body: '<!-- ekodi-orch-workflow-sync-required -->\\nold' }] : []);
  if (method === 'POST' && p === '/issues/7/comments') return json(201, { id: 1 });
  if (method === 'POST' && p.startsWith('/statuses/')) return json(201, {});
  if (method === 'PUT' && p === '/pulls/7/merge') return json(200, { merged: true, sha: '${'d'.repeat(40)}' });
  return json(404, { message: 'unmocked ' + method + ' ' + p });
};
`;

function run(scenario) {
  const dir = mkdtempSync(join(tmpdir(), 'converge-'));
  const log = join(dir, 'calls.jsonl'), mock = join(dir, 'mock.mjs');
  writeFileSync(mock, MOCK); writeFileSync(log, '');
  const r = spawnSync(process.execPath, ['--import', mock, SCRIPT], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, GITHUB_REPOSITORY: 'topmaster-joseph/ekodi-platform', GH_TOKEN: 'x', GITHUB_REF_NAME: BRANCH, GITHUB_SHA: H1, MOCK_LOG: log, MOCK_SCENARIO: scenario },
  });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  return { code: r.status, out: r.stdout + r.stderr, calls };
}
const dispatches = calls => calls.filter(c => c.method === 'POST' && /\/actions\/workflows\/[^/]+\/dispatches$/.test(c.path));

test('behind: update-branch hands off by dispatching required checks and convergence on the new head', () => {
  const { code, out, calls } = run('behind');
  assert.equal(code, 0, out);
  const d = dispatches(calls);
  assert.deepEqual(d.map(c => c.path.split('/').at(-2)).sort(), ['ci.yml', 'converge-orchestrated-pr-merge.yml', 'ekodi-ai-orchestration-gate.yml']);
  for (const c of d) assert.equal(JSON.parse(c.body).ref, BRANCH);
  assert.match(out, /"action":"branch-updated"/);
  assert.match(out, new RegExp('"nextHead":"' + H2 + '"'));
  assert.ok(!calls.some(c => c.path.endsWith('/pulls/7/merge')), 'stale run must not merge');
});

test('workflow-file base: fails fast with a clear reason and one PR comment, never spins on merges', () => {
  const { code, out, calls } = run('workflow');
  assert.notEqual(code, 0);
  assert.match(out, /authored sync required/);
  assert.equal(calls.filter(c => c.method === 'POST' && c.path.endsWith('/issues/7/comments')).length, 1);
  assert.ok(!calls.some(c => c.path.endsWith('/pulls/7/merge')));
  assert.equal(dispatches(calls).length, 0);
});

test('workflow-file base: existing marker comment is not duplicated', () => {
  const { code, calls } = run('workflow-commented');
  assert.notEqual(code, 0);
  assert.equal(calls.filter(c => c.method === 'POST' && c.path.endsWith('/issues/7/comments')).length, 0);
});

test('up to date: unchanged path still merges the verified head', () => {
  const { code, out, calls } = run('uptodate');
  assert.equal(code, 0, out);
  const merge = calls.find(c => c.method === 'PUT' && c.path.endsWith('/pulls/7/merge'));
  assert.ok(merge, 'must merge');
  assert.equal(JSON.parse(merge.body).sha, H1);
  assert.equal(dispatches(calls).length, 0);
});

test('CI accepts workflow_dispatch so convergence can re-run the required test check', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /\n  workflow_dispatch:\n/);
  const gate = readFileSync(new URL('../.github/workflows/ekodi-ai-orchestration-gate.yml', import.meta.url), 'utf8');
  assert.match(gate, /\n  workflow_dispatch:\n/);
});
