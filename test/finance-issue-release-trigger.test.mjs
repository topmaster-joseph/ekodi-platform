import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-finance.yml', import.meta.url), 'utf8');

test('Finance production supports an audited owner issue trigger without bypassing guarded release', () => {
  assert.match(workflow, /issues:\s*\n\s*types: \[labeled\]/);
  assert.match(workflow, /github\.event\.issue\.user\.login == 'topmaster-joseph'/);
  assert.match(workflow, /github\.event\.label\.name == 'finance-release'/);
  assert.match(workflow, /\[EKODI RELEASE\] Finance production/);
  assert.match(workflow, /service: finance-api/);
  assert.match(workflow, /confirmation: PROMOTE_EKODI_FINANCE_PRODUCTION/);
  assert.match(workflow, /target_sha: \$RELEASE_SHA/);
  assert.match(workflow, /needs: \[validate, staging\]/);
  assert.match(workflow, /guarded-worker-release\.mjs --manifest deploy\/manifests\/finance-api\.worker\.json/);
});
