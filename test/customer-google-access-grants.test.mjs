import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [prereg, federated, migration, entry] = await Promise.all([
  readFile(new URL('../customer-google-prereg.js', import.meta.url), 'utf8'),
  readFile(new URL('../customer-federated-auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0012_customer_access_grants.sql', import.meta.url), 'utf8'),
  readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
]);

test('customer access registration stores tenant email and role without creating a customer identity', () => {
  assert.match(prereg, /customer_access_grants/);
  assert.match(prereg, /tenant_id, email, role/);
  assert.match(prereg, /ON CONFLICT\(tenant_id, email\)/);
  assert.doesNotMatch(prereg, /INSERT INTO customer_users/);
  assert.doesNotMatch(prereg, /randomPasswordRecord/);
  assert.doesNotMatch(prereg, /customer_invites/);
});

test('the same Google email can be granted different tenant roles independently', () => {
  assert.match(migration, /PRIMARY KEY \(tenant_id, email\)/);
  assert.doesNotMatch(migration, /email TEXT NOT NULL UNIQUE/);
  assert.match(migration, /idx_customer_access_grants_email/);
});

test('Google identity is verified first and runtime customer identity is created only at login', () => {
  assert.match(federated, /supabaseUser/);
  assert.match(federated, /FROM customer_access_grants/);
  assert.match(federated, /Number\(grant\.enabled\) !== 1/);
  assert.match(federated, /ensureRuntimeIdentity/);
  assert.match(federated, /INSERT INTO customer_users/);
  assert.match(federated, /UPDATE customer_access_grants[\s\S]*last_verified_at/);
});

test('admin user listing is sourced from access grants so unverified registrations are visible immediately', () => {
  assert.match(prereg, /listAccessUsers/);
  assert.match(prereg, /status: Number\(row\.enabled\) !== 1 \? 'disabled' : \(row\.last_verified_at \? 'active' : 'pre_registered'\)/);
  assert.match(prereg, /\/users\$/);
});

test('customer entry routes access registration before federated authentication', () => {
  const preregIndex = entry.indexOf('handleGoogleCustomerPreregistration');
  const federatedIndex = entry.indexOf('handleFederatedCustomerAuth');
  assert.ok(preregIndex >= 0);
  assert.ok(federatedIndex >= 0);
  assert.ok(entry.indexOf('const googlePreregistration = await handleGoogleCustomerPreregistration') > 0);
});
