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
