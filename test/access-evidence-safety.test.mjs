import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectEffectiveMemberCapabilities } from '../customer-member-directory.js';
import { tenantGrantCapabilityDecision } from '../tenant-access-authority.js';
import { sanitizedGrantAuditChanges } from '../customer-google-prereg.js';

const [ui, css, directory, prereg] = await Promise.all([
  readFile(new URL('../client-access.js', import.meta.url), 'utf8'),
  readFile(new URL('../client-access.css', import.meta.url), 'utf8'),
  readFile(new URL('../customer-member-directory.js', import.meta.url), 'utf8'),
  readFile(new URL('../customer-google-prereg.js', import.meta.url), 'utf8'),
]);

test('effective capability projection combines role and explicit grants with deny precedence', () => {
  const projected = projectEffectiveMemberCapabilities({
    role: 'viewer',
    capabilities_json: JSON.stringify(['tenant.preview.read', 'tenant.sales.read']),
    denied_capabilities_json: JSON.stringify(['tenant.sales.read']),
  });
  assert.ok(projected.effectiveCapabilities.includes('tenant.dashboard.read'));
  assert.ok(projected.effectiveCapabilities.includes('tenant.preview.read'));
  assert.ok(projected.effectiveCapabilities.includes('tenant.worship.manage'));
  assert.ok(!projected.effectiveCapabilities.includes('tenant.sales.read'));
  assert.deepEqual(projected.deniedCapabilities, ['tenant.sales.read']);
});

test('sanitized audit changes expose only known access fields and never raw unknown fields', () => {
  const changes = sanitizedGrantAuditChanges(
    JSON.stringify({ role:'member', enabled:1, secret_token:'do-not-expose', visibility:'private' }),
    JSON.stringify({ role:'viewer', enabled:1, secret_token:'still-secret', visibility:'public', denied_capabilities_json:'["tenant.finance.read"]' }),
  );
  assert.deepEqual(changes.map(item => item.field), ['role','denied_capabilities_json','visibility']);
  assert.equal(changes.find(item => item.field === 'role')?.before, 'member');
  assert.deepEqual(changes.find(item => item.field === 'denied_capabilities_json')?.after, ['tenant.finance.read']);
  assert.ok(!JSON.stringify(changes).includes('do-not-expose'));
  assert.ok(!JSON.stringify(changes).includes('still-secret'));
});

test('directory includes capability source columns and sanitized projections', () => {
  assert.match(directory, /a\.capabilities_json/);
  assert.match(directory, /a\.denied_capabilities_json/);
  assert.match(directory, /effectiveCapabilities:/);
  assert.match(directory, /deniedCapabilities:/);
  assert.match(directory, /schemaVersion:\s*7/);
  assert.match(directory, /tenantGrantCapabilityProjection/);
});

test('audit history endpoint is tenant-authority scoped and sanitized', () => {
  assert.match(prereg, /\/access\\\/audit/);
  assert.match(prereg, /resolveTenantAccessAuthority/);
  assert.match(prereg, /customer_access_grant_audit/);
  assert.match(prereg, /sanitizedGrantAuditChanges/);
  assert.doesNotMatch(prereg, /history:\s*rows\.results/);
  assert.match(prereg, /LIMIT \?/);
});

test('user access UI requires explicit mutation review and no-ops unchanged rows', () => {
  assert.match(ui, /function accessChangeSet/);
  assert.match(ui, /function confirmAccessChanges/);
  assert.match(ui, /if \(!changes\.length\)/);
  assert.match(ui, /변경 없음/);
  assert.match(ui, /변경 내용은 권한 감사기록에 남습니다/);
  assert.match(ui, /if \(!confirmAccessChanges\(member, changes\)\) return/);
});

test('user access UI renders verified capabilities and lazy scoped audit history', () => {
  assert.match(ui, /effectiveCapabilities/);
  assert.match(ui, /deniedCapabilities/);
  assert.match(ui, /현재 유효 권한/);
  assert.match(ui, /명시적 차단/);
  assert.match(ui, /최근 권한 변경 보기/);
  assert.match(ui, /\/access\/audit\?email=/);
  assert.match(ui, /auditCache/);
  assert.match(css, /\.client-capability-list/);
  assert.match(css, /\.client-audit-item/);
  assert.match(css, /overflow-wrap:anywhere/);
});


test('capability decision applies explicit deny before wildcard or role allow', () => {
  const wildcard = {
    role: 'admin',
    enabled: 1,
    capabilities_json: '[]',
    denied_capabilities_json: JSON.stringify(['tenant.finance.read']),
  };
  assert.deepEqual(
    tenantGrantCapabilityDecision(wildcard, 'tenant.finance.read').allowed,
    false,
  );
  assert.equal(
    tenantGrantCapabilityDecision(wildcard, 'tenant.dashboard.read').reason,
    'ROLE_WILDCARD',
  );

  const viewer = {
    role: 'viewer',
    enabled: 1,
    capabilities_json: JSON.stringify(['tenant.preview.read']),
    denied_capabilities_json: JSON.stringify(['tenant.sales.read']),
  };
  assert.equal(tenantGrantCapabilityDecision(viewer, 'tenant.worship.manage').reason, 'ROLE_ALLOW');
  assert.equal(tenantGrantCapabilityDecision(viewer, 'tenant.preview.read').reason, 'EXPLICIT_ALLOW');
  assert.equal(tenantGrantCapabilityDecision(viewer, 'tenant.sales.read').reason, 'EXPLICIT_DENY');
});

test('capability decision denies disabled and expired grants', () => {
  assert.equal(
    tenantGrantCapabilityDecision({ role:'admin', enabled:0 }, 'tenant.dashboard.read').reason,
    'GRANT_DISABLED',
  );
  assert.equal(
    tenantGrantCapabilityDecision({
      role:'admin',
      enabled:1,
      expires_at:'2000-01-01T00:00:00.000Z',
    }, 'tenant.dashboard.read', new Date('2026-09-28T00:00:00.000Z')).reason,
    'GRANT_EXPIRED',
  );
});

test('capability evaluator endpoint is scoped and returns sanitized decision fields', () => {
  assert.match(prereg, /\/access\\\/evaluate/);
  assert.match(prereg, /evaluateAccessCapability/);
  assert.match(prereg, /tenantGrantCapabilityDecision/);
  assert.match(prereg, /resolveTenantAccessAuthority/);
  assert.match(prereg, /reasonLabel/);
  assert.doesNotMatch(prereg, /policyObject/);
});

test('Admin checker asks the server for a capability decision instead of guessing locally', () => {
  assert.match(ui, /권한 확인/);
  assert.match(ui, /확인할 권한 선택/);
  assert.match(ui, /\/access\/evaluate\?email=/);
  assert.match(ui, /data\.allowed \? '허용' : '차단'/);
  assert.match(ui, /data\.reasonLabel/);
  assert.match(css, /\.client-capability-check-controls/);
  assert.match(css, /@media\(max-width:700px\)\{\.client-capability-check-controls/);
});


test('bulk access templates are server-defined, platform-only and elevation protected', () => {
  assert.match(prereg, /BULK_ACCESS_TEMPLATES/);
  assert.match(prereg, /member_active:\s*Object\.freeze\(\{ role:'member', enabled:1/);
  assert.match(prereg, /viewer_active:\s*Object\.freeze\(\{ role:'viewer', enabled:1/);
  assert.match(prereg, /client_viewer_active:\s*Object\.freeze\(\{ role:'client_viewer', enabled:1/);
  assert.match(prereg, /disable:\s*Object\.freeze\(\{ role:null, enabled:0/);
  assert.match(prereg, /BULK_ACCESS_LIMIT = 50/);
  assert.match(prereg, /authority\.scope !== 'platform'/);
  assert.match(prereg, /ACCESS_BULK_PLATFORM_ONLY/);
  assert.match(prereg, /requirePlatformElevation/);
  assert.match(prereg, /ELEVATION_REQUIRED/);
  assert.match(prereg, /handleAdminGoogleAuth/);
});

test('bulk access applies policy per target and keeps visibility outside the template mutation', () => {
  assert.match(prereg, /accessGrantManagementDecision\(authority, \{ email, role:existing\.role \}, \{ role:nextRole \}\)/);
  assert.match(prereg, /validateAccessGrantInput/);
  assert.match(prereg, /visibility:existing\.visibility/);
  assert.match(prereg, /writeGrantAudit\(env\.DB, tenant\.id, email, session, 'grant\.update'/);
  assert.match(prereg, /results\.push\(\{ email, ok:false, code:decision\.code \}\)/);
  assert.match(prereg, /ACCESS_BULK_LIMIT/);
  assert.match(prereg, /\/access\\\/bulk-template/);
});

test('Admin bulk UI requires a single site, explicit preview, confirmation and Google elevation', () => {
  assert.match(ui, /function bulkSelectionEnabled/);
  assert.match(ui, /directory\.authority\?\.scope === 'platform'/);
  assert.match(ui, /Boolean\(shell\?\.site\?\.value\)/);
  assert.match(ui, /일괄 템플릿 선택/);
  assert.match(ui, /목록 공개 설정은 유지/);
  assert.match(ui, /Google 추가 인증/);
  assert.match(ui, /window\.EKODIAdminContext\?\.elevate/);
  assert.match(ui, /\/access\/bulk-template/);
  assert.match(ui, /bulkSelectedKeys\.clear\(\)/);
  assert.match(css, /\.client-bulk-toolbar/);
  assert.match(css, /\.client-bulk-controls/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.client-bulk-controls\{grid-template-columns:1fr\}/);
});
