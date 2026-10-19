import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('token-mediated merges of customer/site access APIs dispatch the guarded Control API deploy', async () => {
  const [script, workflow] = await Promise.all([
    read('scripts/converge-orchestrated-pr-merge.mjs'),
    read('.github/workflows/deploy-control-api.yml'),
  ]);
  const block = script.slice(script.indexOf('const controlApiTouched'), script.indexOf(');', script.indexOf('const controlApiTouched')));
  for (const file of ['customer-entry-worker.js', 'customer-google-prereg.js', 'customer-member-directory.js', 'tenant-access-authority.js']) {
    assert.ok(block.includes(`'${file}'`), `${file} must trigger Control API dispatch after convergent merge`);
    assert.ok(workflow.includes(`- '${file}'`), `${file} must stay in the Control API push path filter`);
  }
});
