import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const generator = fs.readFileSync(new URL('../admin-secret-generator.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../admin-secret-generator.css', import.meta.url), 'utf8');
const provider = fs.readFileSync(new URL('../admin-ai-control-plane.js', import.meta.url), 'utf8');
const production = fs.readFileSync(new URL('../scripts/verify-admin-provider-control-production.mjs', import.meta.url), 'utf8');

test('security workspace groups Cloudflare target and secret registration without changing API boundaries', () => {
  assert.match(generator, /class="admin-secret-auto-card"[^>]*|class="admin-secret-card admin-secret-auto-card"/);
  assert.match(generator, /class="admin-secret-setup"/);
  assert.match(generator, /class="admin-secret-setup-heading"/);
  assert.match(provider, /class="ekodi-provider-section-heading"/);
  assert.match(styles, /\.admin-secret-auto-card:has\(>\.ekodi-provider-context\)/);
  assert.match(styles, /grid-template-columns:minmax\(0,1\.1fr\) minmax\(360px,\.9fr\)/);
  assert.match(styles, /@media\(max-width:620px\)/);
  assert.match(generator, /\/api\/control\/secrets\/generate/);
});

test('Cloudflare target fallback stays available when provider inventory cannot list workers', () => {
  assert.match(provider, /oldField\.style\.display=workers\.length\?'none':''/);
  assert.match(provider, /else oldField\.removeAttribute\('aria-hidden'\)/);
  assert.match(generator, /data-cloudflare-target/);
  assert.match(provider, /data-ekodi-cf-worker/);
});

test('Cloudflare select layout survives the inserted heading and pending replacement cannot follow a changed Worker', () => {
  assert.match(styles, /\.ekodi-provider-context>div:has\(\[data-ekodi-cf-worker\]\)/);
  assert.ok(!styles.includes('.ekodi-provider-context>div:nth-child(2)'), 'No position-based Worker layout selector');
  assert.match(provider, /original\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/);
  assert.match(generator, /field\.addEventListener\('change', resetReplaceMode\)/);
  assert.match(generator, /replaceMode = false/);
});

test('security statuses are accessible and secrets remain hidden from automatic registration', () => {
  assert.match(generator, /data-cloudflare-status role="status" aria-live="polite"/);
  assert.match(generator, /data-cloudflare-readiness role="status" aria-live="polite"/);
  assert.match(provider, /for="ekodiSecurityCfWorker"/);
  assert.match(styles, /:focus-visible/);
  assert.match(generator, /비밀값 자체는 브라우저로 반환되지 않았습니다/);
  assert.match(generator, /response\.status === 409/);
  assert.match(generator, /DISPLAY_TTL_MS = 30_000/);
});

test('production verifier checks live security shell and exact bundled asset markers', () => {
  for (const marker of ['/admin/accounts/security', '/admin/admin-secret-generator.css', '/admin/admin-secret-generator.js', 'Security workspace v2', 'EKODIAdminAIControlPlane']) {
    assert.ok(production.includes(marker), `Missing production assertion: ${marker}`);
  }
  assert.match(production, /response\.status!==200/);
  assert.doesNotMatch(production, /\/api\/control\/secrets\/generate/);
});
