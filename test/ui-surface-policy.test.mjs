import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EKODI_UI_SURFACE_POLICY, resolveEkodiUiSurface, isAdminUi, isGeneralUserUi } from '../config/ui-surface-policy.js';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('EKODI uses one Core with six explicit governed UI surfaces',()=>{
  assert.deepEqual(Object.keys(EKODI_UI_SURFACE_POLICY.surfaces),['platform-public','user-public','member-workspace','tenant-admin','platform-admin','service-admin']);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.oneCoreManySurfaces,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.platformAndGeneralUserUiSeparated,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.adminAuthoritySeparated,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.universalConstructionStandard,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.communicationFirst,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.personalizationWithinAuthority,true);
  assert.deepEqual(EKODI_UI_SURFACE_POLICY.constructionStandard.dimensions,['ease','locality','readability','originality','intuitiveness']);
  assert.deepEqual(EKODI_UI_SURFACE_POLICY.constructionStandard.modes,['communication-first','personalization']);
  assert.equal(EKODI_UI_SURFACE_POLICY.constructionStandard.inheritance,'mandatory');
});

test('PUBLIC-SURFACE-ADMIN-001 makes the user surface the default operational surface',()=>{
  const policy=EKODI_UI_SURFACE_POLICY.operationalAdministration;
  assert.equal(policy.policyId,'PUBLIC-SURFACE-ADMIN-001');
  assert.equal(policy.status,'enforced');
  assert.equal(policy.defaultMode,'public-surface-first');
  assert.equal(policy.authorityModel,'same-surface-role-scoped-capabilities');
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.userSurfaceIsPrimaryOperationalSurface,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.authenticatedAdminOperatesInPlace,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.duplicateContentAdminUiForbidden,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.dedicatedAdminRestrictedToSystemControl,true);
  assert.equal(policy.rollout.pilot,'seonammedi');
  assert.match(policy.rollout.migrationRule,/before-removing-redundant-admin-ui/);
});

test('platform, general user, member and administrator surfaces resolve separately',()=>{
  assert.equal(resolveEkodiUiSurface({serviceId:'ekodi',shellSurface:'public'}),'platform-public');
  assert.equal(resolveEkodiUiSurface({serviceId:'church',shellSurface:'public'}),'user-public');
  assert.equal(resolveEkodiUiSurface({serviceId:'my',shellSurface:'workspace'}),'member-workspace');
  assert.equal(resolveEkodiUiSurface({shellSurface:'admin',authorityScope:'tenant'}),'tenant-admin');
  assert.equal(resolveEkodiUiSurface({shellSurface:'admin',authorityScope:'service'}),'service-admin');
  assert.equal(resolveEkodiUiSurface({shellSurface:'admin'}),'platform-admin');
  assert.equal(isGeneralUserUi('user-public'),true);assert.equal(isAdminUi('platform-admin'),true);
});

test('shared runtime projects surface identity and keeps admin workspace as scroll owner',async()=>{
  const [injector,worker,governor]=await Promise.all([read('ekodi-shell-injector.js'),read('ekodi-shell-worker.js'),read('shell/ui-surface-governor.js')]);
  assert.match(injector,/x-ekodi-ui-surface/);assert.match(injector,/data-ekodi-ui-surface/);assert.match(injector,/resolveEkodiUiSurface/);
  assert.match(worker,/ui-surface-governor\.js/);assert.match(worker,/x-ekodi-ui-surface-governor/);
  assert.match(governor,/tenant-admin/);assert.match(governor,/platform-admin/);assert.match(governor,/service-admin/);
  assert.match(governor,/ekodiScrollOwner='workspace'/);assert.match(governor,/overflow-y','auto/);assert.match(governor,/overflow-y','hidden/);
});

test('seonammedi proves shared authenticated in-place administration before ecosystem rollout',async()=>{
  const [app,css,control,siteTests,shared]=await Promise.all([
    read('sites/seonammedi/public/app.js'),
    read('sites/seonammedi/public/app.css'),
    read('seonammedi-admin-control.js'),
    read('test/seonammedi-site.test.mjs'),
    read('shell/public-surface-admin.js'),
  ]);
  assert.match(app,/initPublicAdminControls/);
  assert.match(app,/window\.EKODIPublicSurfaceAdmin/);
  assert.match(app,/authEndpoint:'\/api\/seonammedi\/admin\/me'/);
  assert.match(app,/await admin\.authorize\(\)/);
  assert.match(app,/admin\.attach/);
  assert.doesNotMatch(app,/function ensurePublicAdminDrawer|function openPublicAdmin|function attachPublicAdminButton/);
  assert.doesNotMatch(css,/\.public-admin-drawer|\.public-admin-inline/);
  assert.match(css,/\.ekodi-public-admin-inline/);
  assert.match(shared,/window\.EKODIPublicSurfaceAdmin/);
  assert.match(control,/canManage/);
  assert.match(siteTests,/uses shared authenticated inline admin without exposing local duplicate controls/);
});
