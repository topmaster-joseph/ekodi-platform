import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

// Observed 2026-10-22: channel-automation-subject.js (senior_pastor channel write)
// merged via a token merge, which never fires push workflows, and a plain dispatch
// failed the release gate because the lane accepted no orchestrator inputs.
test('token-mediated merges of channel automation dispatch the guarded Marketing Publishing deploy with release provenance', async () => {
  const [script, workflowText] = await Promise.all([
    read('scripts/converge-orchestrated-pr-merge.mjs'),
    read('.github/workflows/deploy-marketing-publishing.yml'),
  ]);
  const start = script.indexOf('const marketingPublishingTouched');
  const block = script.slice(start, script.indexOf('\n);', start));
  assert.ok(start >= 0, 'convergence must detect Marketing Publishing changes');
  const pushSection = workflowText.slice(workflowText.indexOf('\n  push:'), workflowText.indexOf('\nenv:'));
  const pushPaths = [...pushSection.matchAll(/^\s+- '([^']+)'$/gm)].map(match => match[1]);
  assert.ok(pushPaths.length > 5, 'push path filter must be readable');
  // Every deployable push path of the lane must also trigger the token-merge dispatch.
  for (const path of pushPaths) {
    if (path.startsWith('test/') || path === 'platform-boundaries.json' || path === 'wrangler.marketing-publishing.staging.toml') continue;
    const covered = path === 'channel-*.js' ? block.includes('/^channel-[^/]+\\.js$/') : block.includes(`'${path}'`);
    assert.ok(covered, `${path} must trigger the Marketing Publishing dispatch after a convergent merge`);
  }
  assert.match(script, /if\(marketingPublishingTouched\)\{\s*const dispatch=await api\('\/actions\/workflows\/deploy-marketing-publishing\.yml\/dispatches',\{\s*method:'POST',\s*body:JSON\.stringify\(\{ref:'main',inputs:\{release_branch_ref:branch,release_task_id:taskId\}\}\)/);
  // The lane accepts and forwards the orchestrator receipt to its release gate.
  const dispatchSection = workflowText.slice(workflowText.indexOf('  workflow_dispatch:'), workflowText.indexOf('\n  pull_request:'));
  assert.match(dispatchSection, /release_branch_ref:/);
  assert.match(dispatchSection, /release_task_id:/);
  assert.match(workflowText, /\n  EKODI_RELEASE_BRANCH_REF: \$\{\{ inputs\.release_branch_ref \|\| '' \}\}\n/);
  assert.match(workflowText, /\n  EKODI_RELEASE_TASK_ID: \$\{\{ inputs\.release_task_id \|\| '' \}\}\n/);
  const production = workflowText.slice(workflowText.indexOf('\n  production:'));
  assert.ok(production.indexOf('EKODI AI Orchestration Gate') > 0 && production.indexOf('EKODI AI Orchestration Gate') < production.indexOf('Bootstrap or guarded production release'));
});
