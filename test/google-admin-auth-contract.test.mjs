import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [backend, frontend, css, entry, build, site, wrangler, migration] = await Promise.all([
  read('../admin-google-auth.js'),
  read('../google-admin-auth.js'),
  read('../google-admin-auth.css'),
  read('../customer-entry-worker.js'),
  read('../scripts/build.mjs'),
  read('../site-worker.js'),
  read('../wrangler.api.toml'),
  read('../migrations/0006_admin_google_auth.sql'),
]);

test('Google administrator API uses exact allowlist and Google subject pinning', () => {
  assert.match(backend, /admin_google_accounts/);
  assert.match(backend, /google_sub TEXT UNIQUE/);
  assert.match(backend, /WHERE email = \? AND status = 'active'/);
  assert.match(backend, /account\.google_sub && account\.google_sub !== payload\.sub/);
  assert.match(backend, /required_hd/);
  assert.match(backend, /payload\.hd/);
});

test('Google ID tokens are verified beyond the email claim', () => {
  for (const contract of [
    "header.alg !== 'RS256'",
    'payload.aud',
    'GOOGLE_ISSUERS.has(payload.iss)',
    'payload.exp',
    'payload.email_verified !== true',
    'payload.nonce !== expectedNonce',
    'crypto.subtle.verify',
  ]) assert.ok(backend.includes(contract), `missing Google token verification contract: ${contract}`);
});

test('Google login uses one-time server challenges and EKODI sessions', () => {
  assert.match(backend, /google_login_challenges/);
  assert.match(backend, /DELETE FROM google_login_challenges WHERE nonce_hash = \?/);
  assert.match(backend, /INSERT INTO sessions/);
  assert.match(backend, /session\.google_login/);
});

test('administrator preregistration is super-admin only and preserves a final super admin', () => {
  assert.match(backend, /admin\.role !== 'super_admin'/);
  assert.match(backend, /활성 최고관리자는 최소 1명 이상 유지해야 합니다/);
  assert.match(backend, /현재 로그인한 최고관리자 계정은 비활성화할 수 없습니다/);
});

test('Google auth routes are isolated at the API entry layer', () => {
  assert.match(entry, /path\.startsWith\('\/api\/google\/'\)/);
  assert.match(entry, /path\.startsWith\('\/api\/admin-access\/'\)/);
  assert.match(entry, /handleAdminGoogleAuth/);
});

test('legacy administrator password routes close when Google auth is active', () => {
  assert.match(entry, /LEGACY_ADMIN_PASSWORD_PATHS/);
  for (const route of ['/api/setup', '/api/login', '/api/password/reset', '/api/password/change']) {
    assert.ok(entry.includes(`'${route}'`), `missing legacy password route gate: ${route}`);
  }
  assert.match(entry, /GOOGLE_ADMIN_LOGIN_REQUIRED/);
  assert.match(entry, /status: 410/);
});

test('Control Center switches to Google UI only when Google is configured', () => {
  assert.match(frontend, /\/api\/google\/config/);
  assert.match(frontend, /if \(!config\.enabled \|\| !config\.clientId\)/);
  assert.match(frontend, /document\.body\.classList\.add\('google-auth-enabled'\)/);
  assert.match(frontend, /https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(css, /google-auth-enabled #loginForm/);
});

test('Control Center includes compact Google administrator preregistration management', () => {
  assert.match(frontend, /element\('h2', 'Admin'\)/);
  assert.match(frontend, /사전등록/);
  assert.match(frontend, /\/api\/admin-access\/google-accounts/);
  assert.match(frontend, /최고관리자/);
  assert.match(frontend, /운영관리자/);
  assert.match(frontend, /조회관리자/);
});

test('production build and CSP allow only required Google Identity Services resources', () => {
  assert.match(build, /'google-admin-auth\.js'/);
  assert.match(build, /'google-admin-auth\.css'/);
  assert.match(site, /script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client/);
  assert.match(site, /frame-src https:\/\/accounts\.google\.com\/gsi\//);
  assert.match(site, /Cross-Origin-Opener-Policy/);
});

test('personal Gmail super administrator and production OAuth client are exact contracts', () => {
  assert.match(wrangler, /ADMIN_GOOGLE_BOOTSTRAP_EMAILS = "topmaster\.joseph@gmail\.com"/);
  assert.match(wrangler, /GOOGLE_CLIENT_ID = "483044030492-4e6231l5glchhtniroinvuq3ev6n5mv5\.apps\.googleusercontent\.com"/);
  assert.match(wrangler, /ADMIN_WORKSPACE_DOMAIN = "ekodibiz\.kr"/);
  assert.match(migration, /admin_google_accounts/);
  assert.match(migration, /google_login_challenges/);
});
