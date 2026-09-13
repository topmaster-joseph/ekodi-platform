import test from 'node:test';
import assert from 'node:assert/strict';
import { EKODI_UI_SURFACE_POLICY, resolveEkodiUiSurface, isAdminUi, isGeneralUserUi } from '../config/ui-surface-policy.js';

test('EKODI uses one Core with six explicit governed UI surfaces',()=>{
  assert.deepEqual(Object.keys(EKODI_UI_SURFACE_POLICY.surfaces),[
    'platform-public','user-public','member-workspace','tenant-admin','platform-admin','service-admin'
  ]);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.oneCoreManySurfaces,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.platformAndGeneralUserUiSeparated,true);
  assert.equal(EKODI_UI_SURFACE_POLICY.principles.adminAuthoritySeparated,true);
});

test('platform public and general user UI resolve separately',()=>{
  assert.equal(resolveEkodiUiSurface({serviceId:'ekodi',shellSurface:'public'}),'platform-public');
  assert.equal(resolveEkodiUiSurface({serviceId:'church',shellSurface:'public'}),'user-public');
  assert.equal(resolveEkodiUiSurface({serviceId:'ekodi',shellSurface:'workspace'}),'user-public');
  assert.equal(resolveEkodiUiSurface({serviceId:'my',shellSurface:'workspace'}),'member-workspace');
  assert.equal(isGeneralUserUi('user-public'),true);
});

test('platform, tenant and service administrators share grammar but not authority surfaces',()=>{
  assert.equal(resolveEkodiUiSurface({shellSurface:'admin'}),'platform-admin');
  assert.equal(resolveEkodiUiSurface({shellSurface:'admin',authorityScope:'tenant'}),'tenant-admin');
  assert.equal(resolveEkodiUiSurface({shellSurface:'admin',authorityScope:'service'}),'service-admin');
  assert.equal(isAdminUi('platform-admin'),true);
  assert.equal(isAdminUi('tenant-admin'),true);
});
