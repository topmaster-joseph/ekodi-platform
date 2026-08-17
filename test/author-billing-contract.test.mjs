import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [migration, control, mission, worker, browser, admin, build, access, ai, shared, wrangler] = await Promise.all([
  read('migrations/0023_author_billing.sql'),
  read('author-billing-control.js'),
  read('mission-control-entry-worker.js'),
  read('author-worker.js'),
  read('author/billing.js'),
  read('author-billing-admin.js'),
  read('scripts/build.mjs'),
  read('supabase/functions/author-access-api/index.ts'),
  read('supabase/functions/author-ai-api/index.ts'),
  read('supabase/functions/_shared/author-billing.ts'),
  read('wrangler.api.toml'),
]);

test('paid plans deploy at zero and disabled so no accidental charge is possible', () => {
  assert.match(migration, /\('author', 'CREATOR', 0, 0,/);
  assert.match(migration, /\('pro', 'PRO', 0, 0,/);
  assert.match(control, /VALUES \('author','CREATOR',0,0,/);
  assert.match(control, /VALUES \('pro','PRO',0,0,/);
});

test('checkout uses server plan price and refuses disabled or zero-price plans', () => {
  assert.match(control, /!Boolean\(plan\.enabled\) \|\| Number\(plan\.monthly_fee \|\| 0\) <= 0/);
  assert.match(control, /amount:Number\(plan\.monthly_fee\)/);
  assert.doesNotMatch(control, /amount:Number\(body\?\.amount/);
  assert.match(control, /Number\(plan\.monthly_fee\) !== Number\(checkout\.amount\)/);
  assert.match(control, /code:'PLAN_CHANGED'/);
});

test('subscription lifecycle is period-end cancellation and renewal failure becomes past_due', () => {
  assert.match(control, /cancel_at_period_end=1/);
  assert.match(control, /status='canceled'.*cancel_at_period_end=1/s);
  assert.match(control, /status='past_due'/);
  assert.match(control, /amount:Number\(row\.monthly_fee\)/);
});

test('billing state is private per authenticated Supabase user and admin pricing is separately authenticated', () => {
  assert.match(control, /async function identityFromRequest/);
  assert.match(control, /if \(!identity\) return json\(\{ error:'Google 로그인 세션을 확인해 주세요.'/);
  assert.match(control, /async function adminPlans/);
  assert.match(control, /const session = await adminSession/);
  assert.match(control, /\/api\/author\/billing\/admin\/plans/);
  assert.match(control, /author_billing_plan_audit/);
});

test('Author AI fails closed before provider calls when billing cannot be verified', () => {
  const verification = ai.indexOf('reconcileAuthorBilling(req,admin,user.id)');
  const unavailable = ai.indexOf('billing_verification_unavailable');
  const unpaid = ai.indexOf('paid_membership_required');
  const provider = ai.indexOf('https://api.openai.com/v1/responses');
  assert.ok(verification > 0);
  assert.ok(unavailable > verification && unavailable < provider);
  assert.ok(unpaid > verification && unpaid < provider);
  assert.match(ai, /if\(!billingVerification\?\.paid_ai_active\)/);
});

test('workspace access remains available while paid AI is suppressed if billing verification is unavailable', () => {
  assert.match(access, /billing verification unavailable/);
  assert.match(access, /if\(entitlement\.is_paid&&!billingVerification\.verified\)/);
  assert.match(access, /entitlement\.paid_ai_active=false/);
  assert.match(access, /entitlement\.remaining_ai_units=0/);
  assert.match(access, /path==="\/workspace"/);
});

test('the shared reconciliation helper binds billing to the same user identity', () => {
  assert.match(shared, /AUTHOR_BILLING_API_URL/);
  assert.match(shared, /Authorization:auth/);
  assert.match(shared, /String\(data\?\.userId\|\|""\)!==userId/);
  assert.match(shared, /plan_code:"free"/);
  assert.match(shared, /billable_ai_enabled:false/);
});

test('Creator browser exposes no server billing or Supabase service secrets', () => {
  for (const [name, source] of [['browser', browser], ['admin', admin], ['worker', worker], ['control', control]]) {
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/, `${name} must not expose service-role key`);
  }
  assert.doesNotMatch(browser, /TOSS_BILLING_SECRET_KEY/);
  assert.doesNotMatch(browser, /MEMBERSHIP_BILLING_ENCRYPTION_KEY/);
  assert.match(browser, /requestBillingAuth/);
});

test('Creator site and control plane route the isolated billing surface', () => {
  assert.match(worker, /https:\/\/api\.ekodi\.kr/);
  assert.match(worker, /js\.tosspayments\.com/);
  assert.match(worker, /paidAiBilling: 'server-verified'/);
  assert.match(mission, /handleAuthorBillingControl/);
  assert.match(mission, /path\.startsWith\('\/api\/author\/billing\/'\)/);
  assert.match(wrangler, /https:\/\/author\.ekodi\.kr/);
});

test('admin pricing code is bundled into already authenticated admin assets', () => {
  assert.match(build, /author-billing-admin\.css/);
  assert.match(build, /author-billing-admin\.js/);
  assert.match(build, /admin-lazy-features\.js/);
  assert.match(build, /compact-control-center\.css/);
  assert.match(admin, /Creator AI 유료회원 요금/);
  assert.match(admin, /가격 변경은 새 구독에 적용/);
});
