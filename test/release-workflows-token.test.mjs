// EKODI-RELEASE-WORKFLOWS-TOKEN-001 — the workflows-capable token stays least-privilege.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script=await readFile(new URL('../scripts/recover-release-provenance.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/recover-release-provenance.yml',import.meta.url),'utf8');

test('recovery reads the optional owner-issued workflows token from a secret only',()=>{
  assert.match(workflow,/GH_WORKFLOWS_TOKEN: \$\{\{ secrets\.EKODI_RELEASE_WORKFLOWS_TOKEN \}\}/);
  assert.match(workflow,/environment: production/,'secret is only exposed to the protected production job');
  assert.match(script,/const refToken=String\(process\.env\.GH_WORKFLOWS_TOKEN\|\|''\)\.trim\(\);/);
});

test('the workflows token is used for exactly one call: creating the exact-SHA orchestrator ref',()=>{
  const uses=[...script.matchAll(/token:refToken/g)];
  assert.equal(uses.length,1);
  const line=script.split('\n').find(l=>l.includes('token:refToken'));
  assert.match(line,/github\(refPath,\{method:'POST',token:refToken\|\|undefined/);
  assert.match(line,/ref:`refs\/heads\/\$\{branchRef\}`,sha:headSha/);
  assert.doesNotMatch(script,/console\.[a-z]+\([^)]*refToken/,'never logged');
  assert.doesNotMatch(script,/out\([^)]*refToken\)/,'never written to outputs');
});

test('without the secret the previous GITHUB_TOKEN behaviour is unchanged',()=>{
  assert.match(script,/authorization:`Bearer \$\{token\|\|ghToken\}`/);
});
