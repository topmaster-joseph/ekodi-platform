import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectRawCommit, isGithubPrMergeCommit, isPrMergeMessage } from '../scripts/lib/ekodi-pr-merge-evidence.mjs';

const githubMerge = [
  'tree 1111111111111111111111111111111111111111',
  'parent 2222222222222222222222222222222222222222',
  'parent 3333333333333333333333333333333333333333',
  'author Example <example@example.com> 1788960000 +0900',
  'committer GitHub <noreply@github.com> 1788960001 +0900',
  '',
  'chore(ai): lock origin-preserving orchestration policy (#1359)',
].join('\n');

test('recognizes GitHub default and customized PR merge messages', () => {
  assert.equal(isPrMergeMessage('Merge pull request #1359 from ai/openai/task'), true);
  assert.equal(isPrMergeMessage('chore(ai): policy lock (#1359)'), true);
  assert.equal(isPrMergeMessage('ordinary direct commit'), false);
});

test('accepts only a GitHub-authored two-parent PR merge commit', () => {
  assert.equal(isGithubPrMergeCommit({
    message: 'chore(ai): lock origin-preserving orchestration policy (#1359)',
    rawCommit: githubMerge,
  }), true);

  const evidence = inspectRawCommit(githubMerge);
  assert.equal(evidence.parentCount, 2);
  assert.equal(evidence.committerName, 'GitHub');
  assert.equal(evidence.committerEmail, 'noreply@github.com');
});

test('rejects direct pushes even when the message contains a PR-looking suffix', () => {
  const direct = githubMerge.replace('parent 3333333333333333333333333333333333333333\n', '');
  assert.equal(isGithubPrMergeCommit({ message: 'manual change (#1359)', rawCommit: direct }), false);
});

test('rejects forged merge commits not committed by GitHub', () => {
  const forged = githubMerge.replace('committer GitHub <noreply@github.com>', 'committer Human <human@example.com>');
  assert.equal(isGithubPrMergeCommit({ message: 'manual merge (#1359)', rawCommit: forged }), false);
});
