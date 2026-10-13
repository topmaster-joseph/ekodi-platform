import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/source-integrity-audit.yml',import.meta.url),'utf8');
const source=await readFile(new URL('../scripts/source-integrity-audit.mjs',import.meta.url),'utf8');

test('source integrity audit advances from the previous completed run, not the previous success',()=>{
  assert.match(workflow,/source-integrity-audit\.yml\/runs\?branch=main&per_page=20/);
  assert.doesNotMatch(workflow,/status=success/);
  assert.match(workflow,/run\.get\('status'\) or ''\) != 'completed'/);
  assert.match(workflow,/GITHUB_RUN_ID/);
  assert.doesNotMatch(workflow,/sha and sha != head/);
});

test('same-head repeat becomes no-change and hidden report remains durable evidence',()=>{
  assert.match(source,/if \(!changedFiles\.length\)/);
  assert.match(source,/name: 'incremental-diff'/);
  assert.match(workflow,/include-hidden-files: true/);
  assert.match(workflow,/\.source-integrity-report\.json/);
});

test('source integrity failures print exact structured evidence before exiting',()=>{
  assert.match(source,/\[EKODI\]\[SOURCE-INTEGRITY\]/);
  assert.match(source,/for \(const error of report\.errors\)/);
  assert.match(source,/writeFile\(REPORT_PATH/);
});


test('source integrity audit materializes generated runtime files only as an ephemeral test precondition',()=>{
  assert.match(source,/generate:user-services/);
  assert.match(source,/generated-runtime-precondition/);
  assert.match(source,/if \(!generate\.ok\)/);
  assert.match(source,/'generated\/user-services\.js'/);
  assert.match(source,/historical\/generated artifact must remain in Git history/);
});

test('legacy domain debt blocks only when the current audit window modifies the stale reference',()=>{
  assert.match(source,/const changedFileSet = new Set\(changedFiles\)/);
  assert.match(source,/if \(changedFileSet\.has\(file\)\) blocking\.push\(ref\)/);
  assert.match(source,/else inherited\.push\(ref\)/);
  assert.match(source,/type: 'legacy-domain-debt'/);
  assert.match(source,/non-blocking inherited debt; any new or modified reference remains blocking/);
  assert.match(source,/type: 'stale-domain-reference'/);
});


test('audit infrastructure changes self-validate on PR without production probes',()=>{
  assert.match(workflow,/pull_request:\s*\n\s*paths:/);
  for(const path of [
    '.github/workflows/source-integrity-audit.yml',
    'scripts/source-integrity-audit.mjs',
    'test/source-integrity-audit.test.mjs',
    'release/**',
  ]) assert.ok(workflow.includes(`- '${path}'`));
  assert.match(workflow,/github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.sha \|\| github\.sha/);
  assert.match(workflow,/GITHUB_EVENT_NAME.*pull_request/);
  assert.match(workflow,/echo "live=0"/);
  assert.match(workflow,/source-integrity-\$\{\{ github\.event_name \}\}-\$\{\{ github\.event\.pull_request\.number \|\| 'main' \}\}/);
});
