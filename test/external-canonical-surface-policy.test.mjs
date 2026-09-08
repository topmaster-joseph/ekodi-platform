import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').replace(/^\uFEFF/, '');
const json = relative => JSON.parse(read(relative));
const expected = {
  personalHome:'/my', administration:'/admin', authentication:'/auth', api:'/api',
  mcp:'/mcp', webhooks:'/webhooks', status:'/status', developer:'/dev', experience:'/exp'
};

test('EKODI-owned external canonical surface is path-based on ekodi.kr', () => {
  const constitution = json('governance/constitution/constitution.json');
  const policy = constitution.externalCanonicalSurfacePolicy;
  assert.equal(constitution.version, '1.8.4');
  assert.equal(policy.host, 'ekodi.kr');
  assert.equal(policy.pathBased, true);
  assert.deepEqual(policy.paths, expected);
  assert.equal(policy.internalBoundaryVisibility, 'not_canonical_external');
  assert.equal(policy.runtimeMigrationMode, 'compatibility_first_no_breaking_cutover');
});

test('deployment boundaries remain internal implementation boundaries', () => {
  const boundaries = json('platform-boundaries.json');
  assert.equal(boundaries.externalCanonicalSurfacePolicy.host, 'ekodi.kr');
  assert.deepEqual(boundaries.externalCanonicalSurfacePolicy.canonicalSystemPaths, expected);
  assert.equal(boundaries.externalCanonicalSurfacePolicy.internalDomainsAreImplementationBoundaries, true);
  assert.equal(boundaries.externalCanonicalSurfacePolicy.internalDomainsDoNotDefineCanonicalExternalUrls, true);
  assert.ok(boundaries.platforms['control-api'].domains.includes('api.ekodi.kr'));
  assert.equal(boundaries.platforms['control-api'].externalCanonicalPath, 'https://ekodi.kr/api');
  assert.equal(boundaries.platforms.my.externalCanonicalPath, 'https://ekodi.kr/my');
  assert.equal(boundaries.platforms['admin-auth'].externalCanonicalPaths.administration, 'https://ekodi.kr/admin');
});

test('service policy preserves internal runtime hosts without making them canonical', () => {
  const policy = json('config/service-workspace-policy.json');
  assert.equal(policy.externalCanonicalSurface.host, 'ekodi.kr');
  assert.deepEqual(policy.externalCanonicalSurface.paths, expected);
  assert.equal(policy.externalCanonicalSurface.internalRuntimeHostsAreCanonical, false);
  assert.equal(policy.subdomainExceptionsRole, 'internal_runtime_or_compatibility_only');
  assert.equal(policy.subdomainExceptions.api, 'api.ekodi.kr');
  assert.equal(policy.commonServiceOperatorAccessRule.canonicalSurface, 'https://ekodi.kr/admin');
  assert.equal(policy.commonServiceOperatorAccessRule.runtimeHostsAreCanonicalExternalUrls, false);
});

test('legacy EKODI-owned aliases converge only to ekodi.kr canonical URLs', () => {
  const constitution = json('governance/constitution/constitution.json');
  for (const [domain, target] of Object.entries(constitution.legacyDomainTargets)) {
    assert.match(target, /^https:\/\/ekodi\.kr(?:\/|$)/, `${domain} -> ${target}`);
  }
  assert.equal(constitution.publicPortalPolicy.developerPortal, 'https://ekodi.kr/dev');
  assert.equal(constitution.publicPortalPolicy.experiencePortal, 'https://ekodi.kr/exp');
  assert.equal(constitution.userSurfaceEngineSeparation.engineBoundariesExternallyCanonical, false);
});
