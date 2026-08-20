import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('independent platform source does not directly access EKODI Core protected tables', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-core-data-boundaries.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Core data boundaries OK/);
});
