import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');

test('Mall supplier admin renderer is an explicit Shared Site Core production deploy input',()=>{
  const workflow=read('../.github/workflows/deploy-site-core.yml');
  assert.match(workflow,/name: Deploy EKODI Shared Site Core/);
  assert.match(workflow,/branches: \[main\]/);
  assert.match(workflow,/      - 'workspace-admin-page\.js'\s*\n      - 'mall-supplier-admin-view\.js'/);
  assert.match(workflow,/      - '\.github\/workflows\/deploy-site-core\.yml'/);
  assert.match(workflow,/guarded-worker-release\.mjs/);
});

test('canonical Mall administration uses worker-first generated runtime, not a second stale static asset',()=>{
  const page=read('../workspace-admin-page.js');
  const render=read('../mall-supplier-admin-view.js');
  const worker=read('../site-worker.js');
  const router=read('../platform-router-entry-worker.js');
  assert.match(page,/import \{ renderMallSupplierAdmin \} from '\.\/mall-supplier-admin-view\.js'/);
  assert.match(page,/const renderMallSupplierAdmin=\$\{renderMallSupplierAdmin\.toString\(\)\}/);
  assert.match(page,/if\(section==='suppliers'\)return mallSuppliers\(\)/);
  assert.match(render,/privateData\.scope !== 'operator-read-only'/);
  assert.match(worker,/url\.pathname === '\/workspace-admin\.js'\) return workspaceAdminScript\(\)/);
  assert.match(router,/url\.pathname==='\/workspace-admin\.js'\)return workspaceAdminScript\(\)/);
});

test('release contract does not change buyer PII, supplier forwarding or checkout gates',()=>{
  const workflow=read('../.github/workflows/deploy-site-core.yml');
  const allowedDiffInput=workflow.match(/      - 'workspace-admin-page\.js'\s*\n      - 'mall-supplier-admin-view\.js'/);
  assert.ok(allowedDiffInput);
  const view=read('../mall-supplier-admin-view.js');
  assert.doesNotMatch(view,/setOrder\(|method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.match(view,/api\/api\/internal\/products\/by-provider/);
});
