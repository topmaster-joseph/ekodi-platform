import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../scripts/recover-release-provenance.mjs', import.meta.url), 'utf8');

test('every refusal goes through the async fail() that records a reason', () => {
  assert.match(src, /^async function fail\(message\)\{/m, 'fail must be async so it can write before exiting');
  // No refusal may skip the recording path.
  const unawaited = src
    .split('\n')
    .map((line, index) => [index + 1, line])
    .filter(([, line]) => /(^|[^A-Za-z0-9_.])fail\(/.test(line))
    .filter(([, line]) => !line.includes('await fail(') && !/^async function fail\(/.test(line));
  assert.deepEqual(unawaited, [], 'these call sites would exit before the reason is written');
});

test('the reason lands in the column that already existed for it', () => {
  assert.match(src, /UPDATE ekodi_orchestrator_tasks SET dead_letter_reason=\?/);
  assert.match(src, /INSERT INTO ekodi_orchestrator_task_events/);
  // The event seq is derived, so repeated refusals each get their own row
  // rather than one silently replacing another.
  assert.match(src, /IFNULL\(MAX\(seq\),0\)\+1/);
});

test('recording never recurses through the helper that can fail', () => {
  const body = src.slice(src.indexOf('async function recordDeadLetter'), src.indexOf('async function fail('));
  assert.ok(body.length > 0, 'recordDeadLetter must be defined before fail');
  assert.doesNotMatch(body, /\bd1\(/, 'recordDeadLetter must not call d1(): d1 calls fail(), which would recurse');
  assert.match(body, /catch\{return false\}/, 'a failed recording must not mask the original refusal');
});

test('a refused recovery stays retryable: state is never moved', () => {
  const body = src.slice(src.indexOf('async function recordDeadLetter'), src.indexOf('async function fail('));
  assert.doesNotMatch(body, /SET[^;]*\bstate\s*=/, 'moving state would deny the receipt on the next attempt');
  assert.match(src, /Deliberately NOT changed: the task's `state`/, 'the reason for that must stay stated');
});

test('recording is armed only once the task it would annotate exists', () => {
  const armIndex = src.indexOf('armDeadLetter(dbId,taskId)');
  assert.ok(armIndex > 0, 'arming must happen');
  assert.ok(src.indexOf('const taskId=') < armIndex, 'taskId must be known before arming');
  assert.ok(src.indexOf('const dbId=') < armIndex, 'dbId must be known before arming');
  // Before arming, recording is a no-op rather than a crash.
  assert.match(src, /if\(!deadLetter\?\.databaseId\|\|!deadLetter\?\.task\|\|!cfToken\|\|!accountId\)return false;/);
});

test('the reason is also surfaced as a step output for the run summary', () => {
  assert.match(src, /out\('dead_letter_reason'/);
  assert.match(src, /out\('dead_letter_recorded'/);
});

test('the recorder is reachable only through fail(), never on its own', () => {
  // recordDeadLetter is an implementation detail of refusal. If other code
  // started calling it, a reason could be written for a run that did not
  // actually refuse, and the column would stop meaning what it says.
  const calls = src.match(/recordDeadLetter\(/g) || [];
  assert.equal(calls.length, 2, 'exactly one definition and one call, from fail()');
  const failBody = src.slice(src.indexOf('async function fail('));
  assert.match(failBody, /const recorded=await recordDeadLetter\(message\);/);
});
