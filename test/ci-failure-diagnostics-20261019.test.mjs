import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('CGMA apex edge release asserts the redesigned admin console shell, not removed copy', async () => {
  const workflow = await read('.github/workflows/deploy-cgma-apex-edge.yml');
  assert.doesNotMatch(workflow, /data-admin-tab="today"/);
  assert.match(workflow, /check_upstream 'https:\/\/cheonggye-market\.pages\.dev\/admin' 'id="adminApp"'/);
  assert.match(workflow, /check_cgma '\/cgma\/admin' 'id="adminApp"' 'cgma-root-gateway'/);
});

test('authenticated admin E2E exposes failure causes as GitHub annotations', async () => {
  const script = await read('scripts/admin-authenticated-e2e-retry.mjs');
  assert.match(script, /::\$\{level\} title=/);
  assert.match(script, /annotate\('error', 'Admin E2E failed'/);
  assert.match(script, /attemptFailures\.slice\(-6\)/);
  assert.match(script, /Admin E2E aborted before menu verification/);
});
