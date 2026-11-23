import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../auth-site/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../auth-site/auth.css', import.meta.url), 'utf8');
const router = readFileSync(new URL('../auth-site/auth-router.js', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../auth-site/auth-entry.js', import.meta.url), 'utf8');

test('login screen paints immediately with a skeleton and a loading notice', () => {
  assert.match(html, /id="googleButtonHost"[^>]*><div class="login-skeleton" data-login-skeleton/);
  assert.match(html, /id="authStatus" class="notice loading" role="status" aria-live="polite"><span>로그인 화면을 불러오는 중입니다…<br>잠시만 기다려 주세요\.<\/span>/);
  assert.match(css, /\.notice\.loading::before\{[^}]*animation:ekodi-spin/);
  assert.match(css, /\.login-skeleton span\{[^}]*animation:ekodi-shimmer/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('network handshakes are started early', () => {
  for (const origin of ['https://renzehysxirjilvdxacv.supabase.co', 'https://cdn.jsdelivr.net', 'https://accounts.google.com']) {
    assert.ok(html.includes(`<link rel="preconnect" href="${origin}"`), origin);
  }
  assert.ok(html.indexOf('rel="preconnect"') < html.indexOf('/auth-bootstrap.js'));
});

test('router retires the placeholder, warns on slow loads and preloads email auth in parallel', () => {
  assert.match(router, /function clearLoginSkeleton\(\)/);
  assert.match(router, /clearTimeout\(loginSlowTimer\);\nclearLoginSkeleton\(\);/);
  assert.match(router, /연결이 평소보다 늦어지고 있습니다/);
  assert.ok(router.indexOf('const emailPasswordPreload=') < router.indexOf('federated.handleCallback()'));
  assert.match(router, /const emailPasswordPreload=\(site!=='admin'[^\n]*import\('\.\/email-password\.js\?v=20261107-login-lock-1'\)/);
  assert.match(router, /status\.className='notice warn'/);
  assert.match(entry, /\[data-login-skeleton\]'\)\.forEach\(node => node\.remove\(\)\)/);
});

test('real renders still clear the host (skeleton is replaced, never appended to)', () => {
  const client = readFileSync(new URL('../auth-site/client-auth.js', import.meta.url), 'utf8');
  assert.match(client, /const host=\$\('googleButtonHost'\);host\.replaceChildren\(\)/);
});
