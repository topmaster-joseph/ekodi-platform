import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

for (const file of ['books-assets-control.js', 'books-assets-admin.js']) {
  test(`syntax check ${file}`, () => {
    const result = spawnSync(process.execPath, ['--check', `${root}${file}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
