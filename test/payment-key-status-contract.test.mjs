import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const handoff = await readFile(new URL('../admin-central-handoff.js', import.meta.url), 'utf8');
const billingAdmin = await readFile(new URL('../author-billing-admin.js', import.meta.url), 'utf8');
const billingCss = await readFile(new URL('../author-billing-admin.css', import.meta.url), 'utf8');
const financeMonitor = await readFile(new URL('../finance-monitor.js', import.meta.url), 'utf8');
const financeWorker = await readFile(new URL('../finance-worker.js', import.meta.url), 'utf8');
const loader = await readFile(new URL('../admin-demand-loader.js', import.meta.url), 'utf8');
const build = await readFile(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const siteWorker = await readFile(new URL('../site-worker.js', import.meta.url), 'utf8');

test('payment readiness belongs to the Finance lazy path while Creator Billing stays in Books', () => {
  assert.doesNotMatch(handoff, /api\/finance\/overview|FINANCE_API|ekodi-finance-overview|tossSecretConfigured/);
  assert.doesNotMatch(billingAdmin, /ekodi-finance-overview|tossSecretConfigured|tossLiveKey|tossMidConfigured/);
  assert.doesNotMatch(billingAdmin, /TOSS_SECRET_KEY\s*[:=]|api\/finance\/overview|FINANCE_API/);
  assert.match(billingAdmin, /#booksAdminSection/);
  assert.match(financeMonitor, /api\/finance\/overview/);
  assert.match(financeMonitor, /tossSecretConfigured/);
  assert.match(financeMonitor, /tossLiveKey/);
  assert.match(financeMonitor, /new CustomEvent\('ekodi-finance-overview'/);
  assert.match(loader, /loadScript\('finance-monitor\.js'\)/);
  assert.match(loader, /loadScript\('author-billing-admin\.js'\)/);
});

test('finance readiness exposes status booleans without exposing the server key value', () => {
  assert.match(financeWorker, /tossSecretConfigured:\s*Boolean\(env\.TOSS_SECRET_KEY\)/);
  assert.match(financeWorker, /tossLiveKey:\s*String\(env\.TOSS_SECRET_KEY\s*\|\|\s*''\)\.startsWith\('live_'\)/);
  assert.match(financeWorker, /tossMidConfigured:\s*Boolean\(env\.TOSS_MID\)/);
  assert.doesNotMatch(financeWorker, /readiness:\s*\{[^}]*TOSS_SECRET_KEY\s*[,}]/s);
});

test('payment key status client ships only as an existing Finance lazy asset', () => {
  assert.match(build, /'author-billing-admin\.js'/);
  assert.match(build, /'author-billing-admin\.css'/);
  assert.doesNotMatch(build, /<script src="author-billing-admin\.js" defer><\/script>/);
});

test('admin HTML stays no-store while versioned static admin assets are immutable', () => {
  assert.match(siteWorker, /'\/admin-central-handoff\.js'/);
  assert.match(siteWorker, /'\/author-billing-admin\.js'/);
  assert.match(siteWorker, /ADMIN_ASSETS/);
  assert.ok(siteWorker.includes("withHostSecurity(response, ADMIN_CSP, 'no-store', 'admin-shell')"));
  assert.match(siteWorker, /function adminAssetCacheControl\(url\)/);
  assert.match(siteWorker, /max-age=31536000, immutable/);
  assert.match(siteWorker, /max-age=0, must-revalidate/);
  assert.match(siteWorker, /adminAssetCacheControl\(url\), 'admin-asset'/);
});
