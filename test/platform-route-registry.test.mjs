import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_EXECUTION_SURFACES,
  PLATFORM_LEGACY_HOST_PATHS,
  canonicalPathForLegacyHost,
  platformHost,
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

test('legacy execution hosts project onto apex canonical paths',()=>{
  assert.equal(canonicalPathForLegacyHost(platformHost('management')),'/management');
  assert.equal(canonicalPathForLegacyHost(platformHost('books')),'/books');
  assert.equal(canonicalPathForLegacyHost(platformHost('cgma.ai').toUpperCase()),'/cgma/marketing');
  assert.equal(PLATFORM_LEGACY_HOST_PATHS[platformHost('mail')],'/mail');
});
