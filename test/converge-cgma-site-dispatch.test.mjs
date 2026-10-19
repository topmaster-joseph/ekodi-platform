import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const block = (script, name) => script.slice(script.indexOf(`const ${name}`), script.indexOf('\n);', script.indexOf(`const ${name}`)));

test('token-mediated merges of CGMA workspace pages dispatch the guarded Site Core deploy', async () => {
  const script = await read('scripts/converge-orchestrated-pr-merge.mjs');
  const site = block(script, 'sharedSiteTouched');
  for (const file of ['cgma-ai-education-route.js', 'cgma-motor-festival-route.js']) {
    assert.ok(site.includes(`'${file}'`), `${file} must trigger Site Core dispatch after convergent merge`);
  }
  assert.ok(site.includes("file.startsWith('prototypes/cgma-')"), 'CGMA prototype pages must trigger Site Core dispatch');
});

test('token-mediated merges of the motor festival API dispatch the guarded Control API deploy', async () => {
  const [script, workflow] = await Promise.all([
    read('scripts/converge-orchestrated-pr-merge.mjs'),
    read('.github/workflows/deploy-control-api.yml'),
  ]);
  assert.ok(block(script, 'controlApiTouched').includes("'motor-festival-registration-api.js'"));
  assert.ok(workflow.includes("- 'motor-festival-registration-api.js'"), 'Control API push path filter must stay aligned');
});
