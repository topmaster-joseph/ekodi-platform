import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const wrangler = readFileSync(new URL('../wrangler.site.toml', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');

test('canonical auth root and subtree are Worker-first', () => {
  assert.match(wrangler, /run_worker_first\s*=\s*\[[\s\S]*"\/auth"/);
  assert.match(wrangler, /run_worker_first\s*=\s*\[[\s\S]*"\/auth\/\*"/);
});

test('production link audit verifies canonical auth with and without trailing slash', () => {
  assert.match(workflow, /'https:\/\/ekodi\.kr\/auth',/);
  assert.match(workflow, /'https:\/\/ekodi\.kr\/auth\/',/);
});
