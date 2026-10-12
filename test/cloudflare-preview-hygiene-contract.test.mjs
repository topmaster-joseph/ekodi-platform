import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = '.github/workflows/cloudflare-account-hygiene.yml';

test('production inventory identifies preview names independently of staging names', async () => {
  const workflow = await readFile(path, 'utf8');
  const production = workflow.slice(workflow.indexOf('\n  production:\n'));
  assert.ok(production.length > 300, 'production job must exist');
  assert.match(production, /d1_residue = \[n for n in d1_names if 'staging' in n\.lower\(\)\]/);
  assert.match(production, /preview_workers = \[n for n in worker_names if n\.endswith\('-preview'\) or '-preview-' in n\]/);
  assert.match(production, /preview_d1 = \[n for n in d1_names if 'preview' in n\.lower\(\)\]/);
  assert.match(production, /Preview-named D1 \(review\)/);
  assert.match(production, /Production preview D1 names require classification/);
  assert.match(production, /PRODUCTION_PREVIEW_REVIEW_REQUIRED=/);
});

test('preview observations remain read-only and never weaken staging failure gate', async () => {
  const workflow = await readFile(path, 'utf8');
  const production = workflow.slice(workflow.indexOf('\n  production:\n'));
  const failGate = production.slice(production.indexOf('if worker_residue or d1_residue:'), production.indexOf("print('PRODUCTION_STAGING_GUARD=PASS')"));
  assert.match(failGate, /sys\.exit\(1\)/);
  assert.doesNotMatch(failGate, /preview_workers|preview_d1/, 'preview-only names must be advisory');
  assert.doesNotMatch(production, /workers\/scripts\/.*DELETE|d1\/database\/.*DELETE/);
  assert.match(workflow, /PRODUCTION_STAGING_GUARD=PASS/);
});
