import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const policy = JSON.parse(await readFile(new URL('../config/service-workspace-policy.json', import.meta.url), 'utf8'));
const communityAdmin = await readFile(new URL('../community-admin.js', import.meta.url), 'utf8');

test('external EKODI services use service/site admin surfaces as the operational source of truth', () => {
  assert.equal(policy.schemaVersion >= 5, true);
  assert.equal(policy.serviceAdministrationPolicy.externalServiceAndSite.operationalSourceOfTruth, 'service-or-site-admin-surface');
  assert.equal(policy.serviceAdministrationPolicy.externalServiceAndSite.defaultOperationalOwner, 'service-or-site-administrator');
  assert.equal(policy.serviceAdministrationPolicy.platformSuperAdministrator.implicitServiceLocalRole, false);
  assert.equal(policy.serviceAdministrationPolicy.platformSuperAdministrator.implicitWorkspaceLocalRole, false);
});

test('Reading & Dialogue is externally provided by EKODI Community', () => {
  const reading = policy.publicServiceOperators.readingDialogue;
  assert.equal(reading.providerKey, 'community');
  assert.equal(reading.providerName, 'EKODI Community');
  assert.equal(reading.publicServiceName, '함께읽기');
  assert.equal(reading.canonicalPath, 'https://ekodi.kr/community/reading');
  assert.equal(reading.operationalAdminOwner, 'community-service-admin');
  assert.equal(reading.groupAndParticipationOwner, 'community');
  assert.equal(reading.workspaceLocalAdministration, true);
  assert.equal(reading.newSubdomain, false);
});

test('Community admin projects the registered reading provider and preserves platform/local authority separation', () => {
  assert.match(communityAdmin, /EKODI Community/);
  assert.match(communityAdmin, /함께읽기/);
  assert.match(communityAdmin, /\/community\/reading/);
  assert.match(communityAdmin, /서비스 로컬 권한을 자동 승계하지 않음/);
});
