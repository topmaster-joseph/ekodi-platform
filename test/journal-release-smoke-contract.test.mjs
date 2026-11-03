import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('journal staging and production verify the same canonical administrator redirect', () => {
  const workflow = read('.github/workflows/deploy-journal.yml');
  const worker = read('journal-worker.js');
  const expected = "grep -Fiq 'location: https://ekodi.kr/admin/journal'";
  assert.equal(workflow.split(expected).length - 1, 2, 'staging and production must verify canonical admin location');
  assert.doesNotMatch(workflow, /location: https:\/\/admin\.ekodi\.kr\/journal/);
  assert.match(worker, /Response\.redirect\('https:\/\/ekodi\.kr\/admin\/journal', 307\)/);
  assert.match(workflow, /\[\[ "\$admin_code" =~ \^30\[1278\]\$ \]\]/);
  assert.match(workflow, /needs: deploy-staging/);
});
