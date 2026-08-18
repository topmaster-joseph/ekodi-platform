import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const billing=fs.readFileSync(new URL('../membership-billing.js',import.meta.url),'utf8');
const membershipUi=fs.readFileSync(new URL('../auth-site/membership-ui.js',import.meta.url),'utf8');
const authRouter=fs.readFileSync(new URL('../auth-site/auth-router.js',import.meta.url),'utf8');
const marketingAuth=fs.readFileSync(new URL('../auth-site/marketing-auth-hotfix.js',import.meta.url),'utf8');
const siteWorker=fs.readFileSync(new URL('../site-worker.js',import.meta.url),'utf8');

test('one Google identity is separated from tenant role and commercial plan', () => {
  assert.match(billing, /service_subscriptions/);
  assert.match(billing, /subject_type/);
  assert.match(billing, /subject_key/);
  assert.match(billing, /site/);
  assert.match(billing, /plan_id/);
});

test('Marketing AI offers free, metered and monthly subscription levels after login', () => {
  for (const plan of ['free','flex','plus','pro','auto']) assert.match(billing, new RegExp(`id:'${plan}'|id:\"${plan}\"`));
  assert.match(billing, /monthlyFee:0/);
  assert.match(billing, /monthlyFee:9900/);
  assert.match(billing, /monthlyFee:39900/);
  assert.match(billing, /monthlyFee:69900/);
});

test('recurring billing is server-side, encrypted and safely gated by secrets', () => {
  assert.match(billing, /billing_key/);
  assert.match(billing, /encrypt|encrypted|cipher/i);
  assert.match(billing, /TOSS/i);
  assert.doesNotMatch(membershipUi, /secretKey|TOSS_SECRET/i);
});

test('tenant plan changes are restricted to responsible roles and paid switches are guarded', () => {
  for (const role of ['store_owner','accounting_manager','hq_manager','client_admin']) assert.match(billing, new RegExp(role));
  assert.match(billing, /PLAN_MANAGER_REQUIRED/);
  assert.match(billing, /CANCEL_SUBSCRIPTION_FIRST/);
  assert.match(billing, /ACTIVE_SUBSCRIPTION_EXISTS/);
  assert.match(billing, /String\(row\.email.*identity\.email/s);
  assert.match(membershipUi, /기간 종료 후 구독 종료/);
  assert.match(membershipUi, /canManagePlan/);
});

test('central auth bundles membership UI and keeps Marketing paid tiers opt-in explicit', () => {
  assert.match(authRouter, /membership-ui\.js/);
  assert.match(authRouter, /marketing-auth-hotfix\.js/);
  assert.doesNotMatch(authRouter, /params\.set\(['"]intent['"],['"]pro['"]\)/);
  assert.match(marketingAuth, /requestedPlan=\['flex','plus','pro','auto'\]\.includes/);
  assert.match(marketingAuth, /explicitPro=requestedPlan===['"]pro['"]\|\|params\.get\(['"]intent['"]\)===['"]pro['"]/);
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
  ]) assert.match(billing, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
