import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const block = (script, name) => script.slice(script.indexOf(`const ${name}`), script.indexOf('\n);', script.indexOf(`const ${name}`)));

test('token-mediated merges of the resident-council page dispatch the guarded Site Core deploy', async () => {
  const [script, workflow] = await Promise.all([
    read('scripts/converge-orchestrated-pr-merge.mjs'),
    read('.github/workflows/deploy-site-core.yml'),
  ]);
  assert.ok(block(script, 'sharedSiteTouched').includes("file==='cgmurrc.html'"), 'cgmurrc.html must trigger Site Core dispatch after convergent merge');
  assert.ok(workflow.includes("- 'cgmurrc.html'"), 'Site Core push path filter must stay aligned');
});
