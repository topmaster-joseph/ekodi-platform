import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/verify-ai-gateway-production.yml', import.meta.url), 'utf8');

test('AI Gateway production verification ignores non-production upstream outcomes', () => {
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event\.workflow_run\.event != 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflows: \['Deploy EKODI Shared Site Core', 'Deploy Admin True Lazy Gate', 'Validate AI Gateway'\]/);
});

test('manual AI Gateway production verification remains available', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /Verify AI Gateway production contract/);
});
