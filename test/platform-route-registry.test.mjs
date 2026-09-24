import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_EXECUTION_SURFACES,
  PLATFORM_LEGACY_HOST_PATHS,
  canonicalPathForLegacyHost,
  isReservedPlatformRoot,
  platformExecutionSurfaceForPath,
} from '../platform-route-registry.js';

test('canonical execution surfaces resolve from the shared platform registry',()=>{
  assert.equal(platformExecutionSurfaceForPath('/management')?.binding,'MANAGEMENT');
  assert.equal(platformExecutionSurfaceForPath('/books/catalog')?.binding,'BOOKS');
  assert.equal(platformExecutionSurfaceForPath('/marketing-publish-api/jobs')?.binding,'MARKETING_PUBLISHING');
  assert.equal(platformExecutionSurfaceForPath('/not-a-platform-route'),null);
});

test('execution surface roots cannot fall through to generic workspace routing',()=>{
  for(const spec of PLATFORM_EXECUTION_SURFACES){
    const root=spec.prefix.split('/').filter(Boolean)[0];
    assert.equal(isReservedPlatformRoot(root),true,`${spec.id} root must be reserved: ${root}`);
  }
});

test('apex-only execution registry contains no EKODI-owned child-host compatibility layer',()=>{
  assert.deepEqual(Object.keys(PLATFORM_LEGACY_HOST_PATHS),[]);
  assert.equal(canonicalPathForLegacyHost('management.ekodi.kr'),'');
  for(const spec of PLATFORM_EXECUTION_SURFACES){
    for(const host of [spec.virtualHost,spec.legacyHost,spec.canonicalHost].filter(Boolean)){
      assert.equal(host.endsWith('.ekodi.kr'),false,`${spec.id} must not depend on ${host}`);
    }
  }
});
