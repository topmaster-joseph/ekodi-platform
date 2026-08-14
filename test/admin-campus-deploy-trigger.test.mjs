import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/deploy-admin-site.yml', import.meta.url), 'utf8');

test('Admin release watches and verifies Campus action assets', () => {
  assert.match(workflow, /'campus-actions\.js'/);
  assert.match(workflow, /'campus-actions\.css'/);
  assert.match(workflow, /node --check campus-actions\.js/);
  assert.match(workflow, /grep -Fq 'normalizeServiceOpenLinks' campus-actions\.js/);
  assert.match(workflow, /verify_asset 'campus-actions\.js' 'normalizeServiceOpenLinks'/);
  assert.match(workflow, /verify_asset 'campus-actions\.css' '\.campus-row-actions'/);
});
