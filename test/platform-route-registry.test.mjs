import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_EXECUTION_SURFACES,
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

test('execution surfaces contain no EKODI child-host compatibility fields',()=>{
  for(const spec of PLATFORM_EXECUTION_SURFACES){
    assert.equal(Boolean(spec.virtualHost||spec.legacyHost||spec.canonicalHost),false,`${spec.id} must not carry retired host fields`);
    if(spec.host)assert.equal(String(spec.host).endsWith('.ekodi.kr'),false,`${spec.id} external host must not be an EKODI child host`);
  }
});
