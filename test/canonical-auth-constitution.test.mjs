import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const parse = path => JSON.parse(read(path));

test('constitutional apex authentication is inherited and non-overridable', () => {
  const constitution = parse('governance/constitution/constitution.json');
  const auth = constitution.canonicalAuthenticationEntryPolicy;
  assert.equal(constitution.version, '1.27.6');
  assert.equal(auth.id, 'CANONICAL-AUTH-ENTRY-001');
  assert.equal(auth.status, 'enforced');
  assert.equal(auth.mode, 'mandatory-inherited');
  assert.equal(auth.authenticationEntry, 'https://ekodi.kr/auth/');
  assert.equal(auth.platformAdminEntry, 'https://ekodi.kr/admin/');
  assert.equal(auth.appliesTo, 'all-existing-and-future-ekodi-sites-services-workspaces-user-and-admin-pages');
  for (const hostClass of ['auth-subdomain', 'admin-subdomain', 'all-first-party-subdomains']) assert.ok(auth.forbiddenBrowserHostClasses.includes(hostClass));
  for (const flag of ['allLoginEntriesCaptureExactTrustedInitiatingUrl','authenticatedUsersReuseCentralSessionWithoutRepeatedLogin','preserveFunctionalQueryAndAdminChildPath','apexOriginAloneNeverGrantsCrossTenantAccess','newLegacyHostReferenceBlocksCi','liveCanaryRequiredBeforeDeclaringProductionComplete'])
    assert.equal(auth.rules[flag], true, flag);
});

test('domain, Workspace and constitutional login entry registrations remain in sync', () => {
  const domain = parse('config/domain-canonical-policy.json').canonicalAuthEntry;
  const workspace = parse('config/service-workspace-policy.json').canonicalAuthenticationEntryPolicy;
  const constitution = parse('governance/constitution/constitution.json').canonicalAuthenticationEntryPolicy;
  assert.equal(domain.policyId, constitution.id);
  assert.equal(workspace.policyId, constitution.id);
  assert.equal(domain.authentication, constitution.authenticationEntry);
  assert.equal(workspace.authEntry, constitution.authenticationEntry);
  assert.equal(domain.platformAdmin, constitution.platformAdminEntry);
  assert.equal(workspace.platformAdmin, constitution.platformAdminEntry);
  assert.equal(workspace.existingSessionReusedBeforeLoginUi, true);
  assert.equal(workspace.noGenericMyRedirect, true);
  assert.equal(domain.apexOriginNotSufficientForAuthorization, true);
  assert.equal(constitution.temporaryMigrationDependency.noBulkDnsDeletionOrWildcardApexOriginAuthorization, true);
});

test('existing enforcement scripts fail closed on newly introduced EKODI subdomains', () => {
  const constitutionalGuard = read('scripts/validate-constitution.mjs');
  const domainGuard = read('scripts/zero-subdomain-guard.mjs');
  assert.match(constitutionalGuard, /CANONICAL-AUTH-ENTRY-001/);
  assert.match(domainGuard, /CANONICAL-AUTH-ENTRY-001/);
  assert.match(domainGuard, /new EKODI subdomain reference is forbidden/);
  assert.match(domainGuard, /ZERO_SUBDOMAIN_BASE_SHA/);
  assert.match(read('CONSTITUTION.md'), /Canonical Authentication Entry — Mandatory, Inherited/);
});
