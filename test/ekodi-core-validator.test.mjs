import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('EKODI Core contract validator passes', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-ekodi-core-contract.mjs'], {
    encoding: 'utf8'
  });

  assert.equal(
    result.status,
    0,
    [result.stdout, result.stderr].filter(Boolean).join('\n')
  );
  assert.match(result.stdout, /EKODI Core contract validation passed/);
});
