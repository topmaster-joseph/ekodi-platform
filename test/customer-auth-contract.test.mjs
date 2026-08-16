import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CUSTOMER_TENANTS, normalizeCustomerRole, normalizeTenantSlug } from '../customer-auth.js';

const [source, entry, missionEntry, wrangler, migration] = await Promise.all([
  readFile(new URL('../customer-auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../mission-control-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0005_customer_auth.sql', import.meta.url), 'utf8'),
]);

const expected = [
  ['cgma', 'cgma.ekodi.kr'],
  ['jadam', 'jadam.ekodi.kr'],
  ['pizzamaru', 'pizzamaru.ekodi.kr'],
  ['yogurt', 'yogurt.ekodi.kr'],
];

test('revenue clients are seeded as independent customer tenants', () => {
  assert.equal(CUSTOMER_TENANTS.length, 4);
  for (const [slug, domain] of expected) {
    const tenant = CUSTOMER_TENANTS.find(item => item.slug === slug);
    assert.ok(tenant, `${slug} tenant missing`);
    assert.equal(tenant.domain, domain);
    assert.equal(normalizeTenantSlug(slug), slug);
    assert.match(migration, new RegExp(`'${slug}',\\s*'[^']+',\\s*'${domain.replaceAll('.', '\\.')}'`));
  }
});

test('customer roles are explicit and closed', () => {
  for (const role of ['client_admin', 'client_editor', 'client_viewer']) {
    assert.equal(normalizeCustomerRole(role), role);
  }
  assert.equal(normalizeCustomerRole('super_admin'), '');
  assert.equal(normalizeCustomerRole('owner'), '');
});

test('customer identities, memberships and sessions are isolated from admin auth tables', () => {
  for (const table of ['customer_users', 'customer_memberships', 'customer_sessions', 'customer_invites', 'customer_audit_logs']) {
    assert.ok(source.includes(table), `${table} missing from runtime schema`);
    assert.ok(migration.includes(table), `${table} missing from migration`);
  }
  assert.match(source, /customer_sessions\.tenant_id/);
  assert.match(source, /customer_memberships\.tenant_id = customer_tenants\.id/);
  assert.doesNotMatch(source, /INSERT INTO sessions \(/);
});

test('customer registration is invitation-only and expiring', () => {
  assert.ok(source.includes('/api/customer/accept-invite'));
  assert.match(source, /inviteListMatch = path\.match/);
  assert.doesNotMatch(source, /\/api\/customer\/(signup|register)/);
  for (const field of ['accepted_at', 'revoked_at', 'expires_at']) assert.ok(source.includes(field));
  assert.match(source, /INVITE_HOURS = 72/);
});

test('customer session is tenant-bound and membership is revalidated', () => {
  assert.match(source, /customer_sessions\.tenant_id = customer_tenants\.id|customer_sessions\.tenant_id/);
  assert.match(source, /membership_status !== 'active'/);
  assert.match(source, /tenant_status !== 'active'/);
  assert.match(source, /user_status !== 'active'/);
  assert.match(source, /SESSION_HOURS = 12/);
});

test('customer APIs keep their dedicated entry layer behind security-wrapped Mission Control without replacing control behavior', () => {
  assert.ok(entry.includes("path.startsWith('/api/customer/')"));
  assert.ok(entry.includes("path.startsWith('/api/customers/')"));
  assert.ok(entry.includes('return apiWorker.fetch(request, env, ctx)'));
  assert.ok(entry.includes('return apiWorker.scheduled(controller, env, ctx)'));
  assert.ok(wrangler.includes('main = "mission-control-entry-worker.js"'));
  assert.ok(missionEntry.includes("import customerEntryWorker from './customer-entry-worker.js'"));
  assert.ok(missionEntry.includes('const response = await customerEntryWorker.fetch(request, env, ctx)'));
  assert.ok(missionEntry.includes('return applyApiSecurityHeaders(response)'));
  assert.ok(missionEntry.includes('const guard = await enforceEdgeSecurity(request, env)'));
  assert.ok(missionEntry.includes('return customerEntryWorker.scheduled(controller, env, ctx)'));
});

test('all customer production origins are explicitly allowed', () => {
  for (const [, domain] of expected) assert.ok(wrangler.includes(`https://${domain}`), `${domain} origin missing`);
});
