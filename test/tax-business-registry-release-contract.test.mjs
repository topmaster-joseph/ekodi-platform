import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');

test('Tax registry UI changes enter the guarded shared-site release graph',()=>{
  assert.match(workflow,/\- 'tax-business-registry\.js'/);
  assert.match(workflow,/tax-portal-worker\.js tax-business-registry\.js tax-service-worker\.js/);
});
