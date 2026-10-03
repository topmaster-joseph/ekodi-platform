import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../.github/workflows/', import.meta.url);

test('required GitHub status check names have one PR workflow owner', async () => {
  const names = await readdir(root);
  const workflows = await Promise.all(names.filter((name) => name.endsWith('.yml')).map(async (name) => ({
    name,
    text: await readFile(new URL(name, root), 'utf8'),
  })));
  const orchestrationOwners = workflows.filter(({ text }) => /^    name: EKODI AI Orchestration Gate\s*$/m.test(text));
  assert.deepEqual(orchestrationOwners.map(({ name }) => name), ['ekodi-ai-orchestration-gate.yml']);
  const implicitTestOwners = workflows.filter(({ text }) => /^  test:\s*\r?\n(?!    name:)/m.test(text));
  assert.deepEqual(implicitTestOwners.map(({ name }) => name), ['ci.yml']);
});

test('required legacy statuses cover both PR head and strict merge commit', async () => {
  const ci = await readFile(new URL('ci.yml', root), 'utf8');
  const orchestration = await readFile(new URL('ekodi-ai-orchestration-gate.yml', root), 'utf8');
  for (const workflow of [ci, orchestration]) {
    assert.match(workflow, /STATUS_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
    assert.match(workflow, /STATUS_MERGE_SHA: \$\{\{ github\.event\.pull_request\.merge_commit_sha \|\| '' \}\}/);
    assert.match(workflow, /for sha in "\$STATUS_HEAD_SHA" "\$STATUS_MERGE_SHA"/);
    assert.match(workflow, /statuses\/\$\{sha\}/);
  }
});
