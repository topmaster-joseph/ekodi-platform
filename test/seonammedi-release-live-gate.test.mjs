import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shared-site production gate verifies SeonamMedi live release convergence',async()=>{
  const [script,workflow]=await Promise.all([
    readFile(new URL('../scripts/verify-seonammedi-release-live.mjs',import.meta.url),'utf8'),
    readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8'),
  ]);
  assert.match(script,/\.well-known\/ekodi-release\.json/);
  assert.match(script,/release_mismatch/);
  assert.match(script,/\['root',root\],\['admin',admin\],\['finance',finance\],\['notices',notices\]/);
  assert.match(script,/name\+'_html_release_mismatch'/);
  assert.match(script,/finance_surface_contract_missing/);
  assert.match(script,/notices_surface_contract_missing/);
  assert.match(script,/max-age=31536000/);
  assert.match(script,/immutable/);
  assert.match(script,/manifest_cache_policy/);
  assert.match(workflow,/Verify SeonamMedi live release convergence/);
  assert.match(workflow,/verify-seonammedi-release-live\.mjs --expected=dist\/seonammedi\/\.well-known\/ekodi-release\.json/);
});
