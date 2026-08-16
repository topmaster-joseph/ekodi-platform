import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [edge, entry, site, wrangler, adminAuth, customerEntry] = await Promise.all([
  read('security-edge.js'),
  read('mission-control-entry-worker.js'),
  read('site-worker.js'),
  read('wrangler.api.toml'),
  read('admin-google-auth.js'),
  read('customer-entry-worker.js'),
]);

for (const marker of [
  'AUTH_RATE_LIMITER',
  'SENSITIVE_RATE_LIMITER',
  'REQUEST_BODY_TOO_LARGE',
  'AUTH_RATE_LIMITED',
  'SENSITIVE_ACTION_RATE_LIMITED',
  'SECURITY_RATE_LIMITER_UNAVAILABLE',
  "Strict-Transport-Security",
  "X-Frame-Options",
  "Permissions-Policy",
]) assert(edge.includes(marker), `security edge missing: ${marker}`);

assert(entry.includes("import { applyApiSecurityHeaders, enforceEdgeSecurity } from './security-edge.js'"), 'Control API entry must use the centralized security edge');
assert(entry.includes('const guard = await enforceEdgeSecurity(request, env)'), 'security edge must run before API routing');
assert(entry.includes('return applyApiSecurityHeaders(response)'), 'all Control API responses must receive security headers');

for (const marker of [
  "Strict-Transport-Security",
  "X-Frame-Options",
  "Permissions-Policy",
  "Content-Security-Policy",
  "Cross-Origin-Opener-Policy",
]) assert(site.includes(marker), `site security headers missing: ${marker}`);

for (const marker of [
  'name = "AUTH_RATE_LIMITER"',
  'name = "SENSITIVE_RATE_LIMITER"',
  'limit = 20',
  'limit = 120',
]) assert(wrangler.includes(marker), `wrangler security binding missing: ${marker}`);

for (const marker of [
  'GOOGLE_ISSUERS',
  'email_verified !== true',
  'payload.nonce !== expectedNonce',
  'account.google_sub !== payload.sub',
  "status = 'active'",
  "DELETE FROM sessions WHERE admin_id = ?",
]) assert(adminAuth.includes(marker), `Google admin auth control missing: ${marker}`);

for (const marker of [
  "'/api/login'",
  "'/api/password/reset'",
  "GOOGLE_ADMIN_LOGIN_REQUIRED",
  'disabledPasswordResponse',
]) assert(customerEntry.includes(marker), `legacy password shutdown missing: ${marker}`);

assert(!edge.includes('authorization.slice(7).trim().slice('), 'raw bearer token fragments must not be used as rate-limit keys');
assert(edge.includes("crypto.subtle.digest('SHA-256'"), 'rate-limit identities must be hashed');
assert(edge.includes("return { available: false, allowed: false }"), 'protected routes must fail closed when rate limiting is unavailable');

console.log('Security baseline valid: fail-closed edge throttling, browser headers, Google allowlist, session revocation and password shutdown enforced.');

function assert(condition, message) {
  if (!condition) {
    console.error(`Security baseline validation failed: ${message}`);
    process.exit(1);
  }
}
