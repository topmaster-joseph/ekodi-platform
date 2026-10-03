import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODI_UI_SURFACE_POLICY } from '../config/ui-surface-policy.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('PUBLIC-SURFACE-ADMIN-001 has a shared Shell runtime',async()=>{
  const [runtime,worker,css,manifestText,themeText]=await Promise.all([
    read('shell/public-surface-admin.js'),
    read('ekodi-shell-worker.js'),
    read('shell/user-ui-shell.css'),
    read('ekodi-service-manifest.js'),
    read('shell/theme.json'),
  ]);
  assert.equal(EKODI_UI_SURFACE_POLICY.operationalAdministration.policyId,'PUBLIC-SURFACE-ADMIN-001');
  assert.equal(EKODI_UI_SURFACE_POLICY.operationalAdministration.status,'enforced');
  assert.match(runtime,/window\.EKODIPublicSurfaceAdmin/);
  assert.match(runtime,/cross_origin_admin_target_forbidden/);
  assert.match(runtime,/headers\.set\('authorization','Bearer '\+bearer\)/);
  assert.match(runtime,/credentials:'same-origin'/);
  assert.match(runtime,/cache:'no-store'/);
  assert.match(runtime,/permissions\[key\]===true/);
  assert.doesNotMatch(runtime,/localStorage\.setItem|sessionStorage\.setItem/);
  assert.match(worker,/publicSurfaceAdminUrl\.pathname='\/public-surface-admin\.js'/);
  assert.match(worker,/x-ekodi-public-surface-admin/);
  assert.match(worker,/publicSurfaceAdminVersion:1/);
  assert.match(css,/\.ekodi-public-admin-inline/);
  assert.match(css,/\.ekodi-public-admin-drawer/);
  const shellVersion=Number(manifestText.match(/shellVersion:\s*(\d+)/)?.[1]||0);
  assert.ok(shellVersion>=7);
  assert.equal(JSON.parse(themeText).version,shellVersion);
});

test('shared public admin runtime never infers privilege from visible UI',async()=>{
  const runtime=await read('shell/public-surface-admin.js');
  assert.match(runtime,/capabilityMap\(data,permissionSelector\)/);
  assert.match(runtime,/if\(!permission\|\|!panel\|\|!has\(permission\)\)return null/);
  assert.match(runtime,/if\(!Object\.values\(nextPermissions\)\.some\(Boolean\)\)return null/);
  assert.doesNotMatch(runtime,/dataset\.[A-Za-z]*Admin.*===.*true.*permissions|classList\.contains\([^)]*admin[^)]*\).*permissions/i);
});

test('dedicated admin remains limited to system-control exceptions',()=>{
  const policy=EKODI_UI_SURFACE_POLICY.operationalAdministration;
  for(const area of ['system-configuration','security','identity-and-access','authority-and-role-management','audit','integration-control','data-recovery','cross-site-platform-operations']){
    assert.ok(policy.dedicatedAdminAllowedFor.includes(area));
  }
  assert.equal(policy.rollout.pilot,'seonammedi');
});
