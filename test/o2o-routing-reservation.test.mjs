import test from 'node:test';
import assert from 'node:assert/strict';
import { isReservedPlatformRoot, platformRouteRegistrySnapshot } from '../platform-route-registry.js';
import { isPublicWorkspacePath, workspaceRouteFromPublicPath } from '../workspace-route-policy.js';
import { readFileSync } from 'node:fs';

test('EKODI O2O canonical root is not intercepted by generic workspace routes', () => {
  assert.equal(isReservedPlatformRoot('o2o'), true);
  assert.equal(isPublicWorkspacePath('/o2o'), false);
  assert.equal(isPublicWorkspacePath('/o2o/'), false);
  assert.equal(isPublicWorkspacePath('/o2o/activity'), false);
  assert.equal(workspaceRouteFromPublicPath('/o2o'), null);
  assert.equal(platformRouteRegistrySnapshot().reserved.includes('o2o'), true);
});
test('nonreserved tenant workspaces remain accessible', () => {
  assert.equal(isPublicWorkspacePath('/example-nonreserved-workspace'), true);
  assert.equal(workspaceRouteFromPublicPath('/example-nonreserved-workspace')?.slug, 'example-nonreserved-workspace');
});
test('router routes anonymous workspace before site-core fallback; O2O must stay reserved', () => {
  const source = readFileSync(new URL('../platform-router-entry-worker.js', import.meta.url), 'utf8');
  // Only test existing root-routing ownership; the Shared Site route is delivered separately.
  assert.match(source, /isPublicWorkspacePath\(url\.pathname\)[\s\S]*routePublicWorkspace\(request,env\)/);
});
