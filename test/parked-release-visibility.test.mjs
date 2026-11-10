// PARKED-RELEASE-VISIBILITY-001
//
// Measured 2026-11-10 in production D1 (ekodi_orchestrator_tasks):
//
//   dead letters, total                                   133
//     stale base + missing workflows permission            46   2026-10-27 → today
//     quota exhaustion                                     41   2026-10-28 → 10-30 only
//
// The quota column stopped the day rateLimitDecision landed and has not recurred
// in eleven days. The stale-base column is still filling. Its refusal was already
// recorded twice — the dead letter and a PR comment — and acted on by nobody,
// because of HOW it was said:
//
//   #7993  six identical refusal comments between 14:31:52 and 14:45:25 on
//          2026-11-03, one per pushed head, then silence for eight days.
//   #8430  one comment on 2026-11-06, then silence for five days.
//   both   no label, so the 46 parked releases were not findable as a set.
//
// Loudest in the fourteen minutes nobody was watching; silent for the week that
// mattered. Both changes were superseded while they waited: #7993's navigation
// model was replaced on main with its summary behaviour reversed, and #8430's
// finance layout was redone with a stronger test (an accounting identity check).
// Re-issuing either one afterwards would have regressed production.
//
// These tests pin the two things that change: one notice that stays current, and
// a label that makes the set findable — and that neither may ever block the
// refusal path, since the dead letter is the durable record.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  staleBaseAnnouncement, staleBaseRemedy, staleWorkflowFiles,
  STALE_BASE_LABEL, STALE_BASE_MARKER,
} from '../scripts/lib/recovery-github-errors.mjs';

const SCRIPT = fs.readFileSync(new URL('../scripts/recover-release-provenance.mjs', import.meta.url), 'utf8');
const WORKFLOW = fs.readFileSync(new URL('../.github/workflows/recover-release-provenance.yml', import.meta.url), 'utf8');

const REMEDY = staleBaseRemedy({
  prNumber: 7993,
  headSha: '033357683e24aa11bb22cc33dd44ee55ff660011',
  files: ['.github/workflows/deploy-my.yml'],
});

test('the first refusal creates one notice naming the head', () => {
  const plan = staleBaseAnnouncement([], { headSha: '033357683e24', remedy: REMEDY });
  assert.equal(plan.action, 'create');
  assert.equal(plan.commentId, undefined);
  assert.ok(plan.body.startsWith(STALE_BASE_MARKER), 'the notice must carry its marker so it can be found again');
  assert.match(plan.body, /033357683e24/);
  assert.match(plan.body, /Re-issue the same change on current main/, 'the remedy must travel with the notice');
});

test('a later refusal updates that notice instead of adding another', () => {
  // #7993's exact failure: six refusals, six different heads, six comments.
  const heads = ['c8d51a91c3ea', '23a0238ce568', '7313ae52e82a', '6d1ed9108ee1', '3f801d96edec', '033357683e24'];
  const comments = [{ id: 11, body: 'unrelated review comment' }];
  let created = 0;
  let updated = 0;
  for (const headSha of heads) {
    const plan = staleBaseAnnouncement(comments, { headSha, remedy: REMEDY });
    if (plan.action === 'create') { created += 1; comments.push({ id: 42, body: plan.body }); }
    else { updated += 1; comments.find(row => row.id === plan.commentId).body = plan.body; }
  }
  assert.equal(created, 1, 'six refusals must leave one comment, not six');
  assert.equal(updated, heads.length - 1);
  const notices = comments.filter(row => String(row.body).includes(STALE_BASE_MARKER));
  assert.equal(notices.length, 1);
  assert.match(notices[0].body, /033357683e24/, 'and it must name the newest head, not the first');
  assert.doesNotMatch(notices[0].body, /c8d51a91c3ea/, 'the stale head must not linger in the notice');
});

test('deduplication keys on the condition, never on the head', () => {
  // Keying on the head sha is the obvious wrong fix: it would have collapsed
  // nothing at all, because those six comments were six different heads.
  const first = staleBaseAnnouncement([], { headSha: 'aaaaaaaaaaaa', remedy: REMEDY });
  const second = staleBaseAnnouncement([{ id: 7, body: first.body }], { headSha: 'bbbbbbbbbbbb', remedy: REMEDY });
  assert.equal(second.action, 'update', 'a different head is the same parked condition');
  assert.equal(second.commentId, 7);
});

test('an unrelated comment list is never mistaken for a prior notice', () => {
  const plan = staleBaseAnnouncement([
    { id: 1, body: 'EKODI automatic release-provenance recovery created #9267 on `ai/claude/orch_recovery_x`.' },
    { id: 2, body: 'LGTM' },
    { id: 3, body: null },
  ], { headSha: 'deadbeefdead', remedy: REMEDY });
  assert.equal(plan.action, 'create');
});

test('a malformed comment list cannot throw, since this runs inside a refusal path', () => {
  for (const comments of [undefined, null, 'not-a-list', [null], [{}], [{ id: 'x', body: STALE_BASE_MARKER }]]) {
    const plan = staleBaseAnnouncement(comments, { headSha: 'abc', remedy: REMEDY });
    assert.ok(plan.action === 'create' || plan.action === 'update');
    assert.ok(plan.body.includes(STALE_BASE_MARKER));
  }
  // A non-numeric id must not become an update to comment NaN.
  assert.equal(staleBaseAnnouncement([{ id: 'x', body: STALE_BASE_MARKER }], { headSha: 'abc', remedy: REMEDY }).action, 'create');
});

test('the recovery leaves a findable label and still records the refusal', () => {
  assert.match(SCRIPT, /await announceStaleBase\(remedy\);\n\s*await fail\(remedy\);/,
    'the notice must precede the dead-letter record, and the record must still happen');
  assert.match(SCRIPT, /issues\/\$\{prNumber\}\/labels`/, 'the parked PR must be labelled');
  assert.match(SCRIPT, /repos\/\$\{repo\}\/labels`/, 'the label must be created before it is attached');
  // Best effort, in every write: a failed notice or label may never turn a
  // legible refusal into a crash, and may never skip the dead letter.
  const announce = SCRIPT.slice(SCRIPT.indexOf('async function announceStaleBase'), SCRIPT.indexOf('// Check an existing exactly approved'));
  assert.equal((announce.match(/try\{/g) || []).length, 3, 'each of the three writes is independently guarded');
  assert.doesNotMatch(announce, /await github\(/, 'github() exits on quota; that would lose the remedy');
  assert.match(announce, /await githubOnce\(/);
});

test('the label name and marker are stable, because parked PRs are found by them', () => {
  assert.equal(STALE_BASE_LABEL, 'release-blocked-stale-base');
  assert.equal(STALE_BASE_MARKER, '<!-- EKODI-RELEASE-BLOCKED-STALE-BASE -->');
  assert.ok(STALE_BASE_MARKER.startsWith('<!--'), 'the marker must not render as visible text');
});

test('the recovery workflow can actually write the label it now applies', () => {
  // The same permissions block is why the refusal happens at all: no `workflows`
  // permission, so a ref at a commit whose .github/workflows differ is refused.
  const permissions = WORKFLOW.slice(WORKFLOW.indexOf('permissions:'), WORKFLOW.indexOf('concurrency:'));
  assert.match(permissions, /issues: write/, 'labelling and commenting need issues: write');
  assert.doesNotMatch(permissions, /workflows: write/,
    'this change must not widen the recovery token; the remedy is re-issuing on current main');
});

test('the stale-base diagnosis itself is unchanged', () => {
  // The guard still fires on exactly the measured condition and nothing else.
  assert.deepEqual(staleWorkflowFiles({ files: [{ filename: '.github/workflows/deploy-my.yml' }, { filename: 'app.js' }] }),
    ['.github/workflows/deploy-my.yml']);
  assert.deepEqual(staleWorkflowFiles({ files: [{ filename: 'app.js' }] }), []);
  assert.match(REMEDY, /no workflows permission/);
  assert.ok(REMEDY.length < 480, 'the remedy still fits the dead-letter column');
});
