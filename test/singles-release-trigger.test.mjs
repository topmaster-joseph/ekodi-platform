import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const workflow=await readFile(new URL('../.github/workflows/deploy-site-core.yml',import.meta.url),'utf8');
test('Singles route, assets, function, migration and regression changes trigger guarded Site Core release',()=>{
 for(const path of [
  "singles-surface.js",
  "sites/ekodi-singles/public/**",
  "supabase/functions/singles-api/**",
  "supabase/migrations/*_singles_*.sql",
  "test/singles-*.test.mjs",
 ])assert.ok(workflow.includes("      - '"+path+"'"),path);
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/Candidate at 0%|staging_gate|staging-release/);
});
