import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [billing, migration, entry, authRouter, marketingAuth, clientAuth, membershipUi, siteWorker, onboarding] = await Promise.all([
  readFile(new URL('../membership-billing.js', import.meta.url), 'utf8'),
  readFile(new URL('../migrations/0016_membership_billing.sql', import.meta.url), 'utf8'),
  readFile(new URL('../customer-entry-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../auth-site/auth-router.js', import.meta.url), 'utf8'),
  readFile(new URL('../auth-site/marketing-auth-hotfix.js', import.meta.url), 'utf8'),
  readFile(new URL('../auth-site/client-auth.js', import.meta.url), 'utf8'),
  readFile(new URL('../auth-site/membership-ui.js', import.meta.url), 'utf8'),
  readFile(new URL('../site-worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../auth-site/marketing-onboarding.js', import.meta.url), 'utf8'),
]);

test('one Google identity is separated from tenant role and commercial plan', () => {
  assert.match(billing, /subject_type.*person.*tenant/s);
  assert.match(billing, /customer_access_grants/);
  assert.match(billing, /grant\.enabled/);
  assert.match(migration, /UNIQUE\(subject_type, subject_key, site\)/);
  assert.match(clientAuth, /Google 본인확인을 한 번 마치면 다른 EKODI 서비스에서도 같은 로그인 상태를 사용/);
  assert.doesNotMatch(clientAuth, /점주 Google 로그인/);
});

test('Marketing AI offers free, metered and monthly subscription levels after login', () => {
  for (const plan of ['free','flex','plus','pro','auto']) assert.match(billing, new RegExp(`id:'${plan}'`));
  assert.match(billing, /monthlyFee:9900/);
  assert.match(billing, /monthlyFee:39900/);
  assert.match(billing, /monthlyFee:69900/);
  assert.match(membershipUi, /\/api\/membership\/select/);
  assert.match(membershipUi, /\/api\/membership\/billing\/start/);
  assert.match(onboarding, /FREE·PLUS·PRO·AUTO|FREE로 계속|FLEX·PLUS·PRO·AUTO/);
  assert.doesNotMatch(onboarding, /setTimeout\(goFree/);
});

test('recurring billing is server-side, encrypted and safely gated by secrets', () => {
  assert.match(billing, /TOSS_BILLING_CLIENT_KEY/);
  assert.match(billing, /TOSS_BILLING_SECRET_KEY/);
  assert.match(billing, /MEMBERSHIP_BILLING_ENCRYPTION_KEY/);
  assert.match(billing, /AES-GCM/);
  assert.match(billing, /runMembershipBillingSchedule/);
  assert.match(billing, /billing_charge_events/);
  assert.doesNotMatch(billing, /test_sk_|live_sk_/);
  assert.match(entry, /runMembershipBillingSchedule/);
});

test('tenant plan changes are restricted to responsible roles and paid switches are guarded', () => {
  assert.match(billing, /TENANT_PLAN_MANAGERS/);
  for (const role of ['store_owner','accounting_manager','hq_manager','client_admin']) assert.match(billing, new RegExp(role));
  assert.match(billing, /PLAN_MANAGER_REQUIRED/);
  assert.match(billing, /CANCEL_SUBSCRIPTION_FIRST/);
  assert.match(billing, /ACTIVE_SUBSCRIPTION_EXISTS/);
  assert.match(billing, /String\(row\.email.*identity\.email/s);
  assert.match(membershipUi, /기간 종료 후 구독 종료/);
  assert.match(membershipUi, /canManagePlan/);
});

test('central auth bundles membership UI and keeps Marketing Pro opt-in explicit', () => {
  assert.match(authRouter, /membership-ui\.js/);
  assert.match(authRouter, /marketing-auth-hotfix\.js/);
  assert.doesNotMatch(authRouter, /params\.set\(['"]intent['"],['"]pro['"]\)/);
  assert.match(marketingAuth, /params\.get\(['"]plan['"]\)===['"]pro['"].*params\.get\(['"]intent['"]\)===['"]pro['"]/s);
  assert.match(membershipUi, /js\.tosspayments\.com\/v2\/standard/);
  assert.match(siteWorker, /https:\/\/js\.tosspayments\.com/);
  assert.match(siteWorker, /'\/membership-ui\.js'/);
});

test('membership API exposes state, billing, cancellation and administrator observability', () => {
  for (const path of [
    '/api/membership/catalog',
    '/api/membership/me',
    '/api/membership/select',
    '/api/membership/billing/start',
    '/api/membership/billing/complete',
    '/api/membership/cancel',
    '/api/membership/admin/subscriptions',
    '/api/membership/admin/charges',
  ]) assert.ok(billing.includes(path), `missing ${path}`);
  assert.match(billing, /adminSession/);

  const subscriptionsStart = billing.indexOf('async function adminSubscriptions');
  const chargesStart = billing.indexOf('async function adminCharges');
  const routesStart = billing.indexOf('export async function handleMembershipBilling');
  assert.ok(subscriptionsStart >= 0 && chargesStart > subscriptionsStart && routesStart > chargesStart);
  const adminReadSurface = billing.slice(subscriptionsStart, routesStart);
  assert.doesNotMatch(adminReadSurface, /billing_key_cipher|billing_key_iv/);
});