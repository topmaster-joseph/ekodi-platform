import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminAuth = fs.readFileSync(new URL('../auth-site/admin-auth.js', import.meta.url), 'utf8');
const router = fs.readFileSync(new URL('../auth-site/auth-router.js', import.meta.url), 'utf8');
const handoff = fs.readFileSync(new URL('../admin-central-handoff.js', import.meta.url), 'utf8');

test('admin auth detects unsupported embedded webviews and offers external browser continuation', () => {
  assert.match(adminAuth, /isEmbeddedWebView/);
  assert.match(adminAuth, /ChatGPT/);
  assert.match(adminAuth, /androidChromeIntent/);
  assert.match(adminAuth, /Chrome에서 관리자 로그인 열기/);
  assert.match(adminAuth, /기본 브라우저에서 관리자 로그인 열기/);
});

test('admin auth only enables FedCM button where supported and keeps popup fallback', () => {
  assert.match(adminAuth, /supportsFedCmButton/);
  assert.match(adminAuth, /major>=128/);
  assert.match(adminAuth, /use_fedcm_for_button:supportsFedCmButton\(\)/);
  assert.match(adminAuth, /ux_mode:'popup'/);
});

test('successful admin login navigates with replace and provides a delayed manual fallback', () => {
  assert.match(adminAuth, /navigateToAdmin\(result\)/);
  assert.match(adminAuth, /ekodi_admin_token:result\.token/);
  assert.match(adminAuth, /location\.replace\(targetHref\)/);
  assert.match(adminAuth, /showNavigationFallback\(targetHref\)/);
  assert.match(adminAuth, /인증 완료 · 관리자 화면 열기/);
});

test('admin destination still accepts the same handoff token and router cache is bumped', () => {
  assert.match(handoff, /hash\.get\('ekodi_admin_token'\)/);
  assert.match(handoff, /sessionStorage\.setItem\('ekodi-auth-token'/);
  assert.match(router, /admin-auth\.js\?v=20260823-mobile-handoff-1/);
});
