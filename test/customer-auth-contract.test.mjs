import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CUSTOMER_TENANTS, normalizeCustomerRole, normalizeTenantSlug } from '../customer-auth.js';

const source = await readFile(new URL('../customer-auth.js', import.meta.url), 'utf8');
const entry = await readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.api.toml', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0005_customer_auth.sql', import.meta.url), 'utf8');

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
  assert.ok(source.includes('customer_sessions.tenant_id'));
  assert.ok(source.includes('customer_memberships.tenant_id = customer_tenants.id'));
});

test('customer registration is invitation-only', () => {
  assert.ok(source.includes('/api/customer/accept-invite'));
  assert.ok(source.includes('/api/customers/tenants/'));
  assert.ok(!source.includes("'/api/customer/signup'"));
  assert.ok(source.includes('accepted_at'));
  assert.ok(source.includes('revoked_at'));
  assert.ok(source.includes('expires_at'));
});

test('customer APIs use a dedicated entry layer without replacing control API behavior', () => {
  assert.ok(entry.includes("path.startsWith('/api/customer/')"));
  assert.ok(entry.includes("path.startsWith('/api/customers/')"));
  assert.ok(entry.includes('return apiWorker.fetch(request, env, ctx)'));
  assert.ok(wrangler.includes('main = "customer-entry-worker.js"'));
});

test('all customer production origins are explicitly allowed', () => {
  for (const [, domain] of expected) assert.ok(wrangler.includes(`https://${domain}`), `${domain} origin missing`);
});
