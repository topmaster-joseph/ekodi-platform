import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const shared = await readFile(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');
const validator = await readFile(new URL('../.github/workflows/deploy-admin-true-lazy.yml', import.meta.url), 'utf8');

test('Mall AI sales admin assets trigger the canonical shared-site production owner', () => {
  assert.match(shared, /- 'marketing-funnel-admin\.js'/);
  assert.match(shared, /- 'marketing-funnel-admin\.css'/);
});

test('Admin lazy validator explicitly rejects production ownership and names shared-site owner', () => {
  assert.match(validator, /! grep -Fq 'CLOUDFLARE_API_TOKEN'/);
  assert.match(validator, /! grep -Fq 'guarded-worker-release\.mjs --manifest'/);
  assert.match(validator, /production ownership belongs to deploy-site-core\.yml/);
});