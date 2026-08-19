import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Admin production workflow publishes a durable verification checkpoint', async () => {
  const workflow = await read('.github/workflows/deploy-admin-ai-ops.yml');
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /id: production_verify/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /VERIFY_OUTCOME: \$\{\{ steps\.production_verify\.outcome \}\}/);
  assert.match(workflow, /gh issue comment 333/);
  assert.match(workflow, /PRODUCTION VERIFIED/);
  assert.match(workflow, /PRODUCTION NOT VERIFIED/);
  assert.match(workflow, /flat AI Ops · internal specialist routing · action-first Chief AI/);
});
