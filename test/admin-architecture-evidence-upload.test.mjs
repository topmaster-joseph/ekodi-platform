import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [worker,workflow]=await Promise.all([
  read('scripts/admin-authenticated-e2e-menu-worker.mjs'),
  read('.github/workflows/verify-admin-authenticated-production-e2e.yml'),
]);

test('completed architecture proof persists only read-only geometry prior to unrelated tests',()=>{
  const first=worker.indexOf('ADMIN-ARCH-PROOF-ARTIFACT-001');
  const metrics=worker.indexOf("architecture-geometry.json",first);
  const record=worker.indexOf('const record=results.find(x=>x.id===menuId)',first);
  assert.ok(first>=0&&metrics>first&&record>metrics);
  assert.match(worker,/passed:true,\s*measurements,\s*screenshotCount:3/);
  assert.match(worker,/locator\('#structureLayers'\)\.screenshot/);
  assert.doesNotMatch(worker.slice(first,record),/token|email|sessionStorage|credential|password/i);
});

test('full admin suite remains authoritative while architecture evidence survives later failures',()=>{
  assert.match(workflow,/Preserve completed architecture proof from full Admin verification/);
  assert.match(workflow,/if: \$\{\{ always\(\) && inputs\.focus_menu == 'all' \}\}/);
  assert.match(workflow,/admin-architecture-proof-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow,/artifacts\/admin-authenticated-e2e\/architecture-geometry\.json/);
  assert.match(workflow,/artifacts\/admin-authenticated-e2e\/architecture-\*\.png/);
  assert.match(workflow,/if-no-files-found: warn/);
  assert.match(workflow,/retention-days: 7/);
  assert.match(workflow,/focus_menu == 'architecture'/);
  assert.match(workflow,/Click and render every authenticated admin menu/);
});
