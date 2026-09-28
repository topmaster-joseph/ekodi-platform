import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectEffectiveMemberCapabilities } from '../customer-member-directory.js';
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
  assert.match(directory, /schemaVersion:\s*6/);
  assert.match(directory, /tenantAdminCapabilitiesForRole/);
  assert.match(directory, /effectiveAccessCapabilities/);
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
