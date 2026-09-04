import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [edge, entry, site, wrangler, adminAuth, adminSession, authorization, customerEntry, projection, coreApi, externalAi, openAi, claude, gemini, aiContractRaw] = await Promise.all([
  read('security-edge.js'),
  read('mission-control-entry-worker.js'),
  read('site-worker.js'),
  read('wrangler.api.toml'),
  read('admin-google-auth.js'),
  read('admin-session-fastpath.js'),
  read('ekodi-authorization.js'),
  read('customer-entry-worker.js'),
  read('secure-projection.js'),
  read('core-api.js'),
  read('external-ai-module-gateway.js'),
  read('openai-provider-adapter.js'),
  read('claude-provider-adapter.js'),
  read('gemini-provider-adapter.js'),
  read('config/external-ai-module-contract.json'),
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
  'admin_privileged_sessions',
  'PRIVILEGED_MINUTES = 15',
  'ELEVATION_REQUIRED',
  'session.elevated',
  "'/api/admin-access/elevation'",
]) assert(adminAuth.includes(marker), `Google admin auth control missing: ${marker}`);

for (const marker of [
  'identity-context-capability',
  'explicitDenyWins: true',
  'contextSwitchGrantsAuthority: false',
  "'admin:accounts.write'",
  'authorizeEkodiAction',
  'scopeAllows',
]) assert(authorization.includes(marker), `Admin authorization contract missing: ${marker}`);

for (const marker of [
  "from './ekodi-authorization.js'",
  'adminAuthorityForRole',
  'elevated_until',
]) assert(adminSession.includes(marker), `Admin session authority projection missing: ${marker}`);

for (const marker of [
  "'/api/login'",
  "'/api/password/reset'",
  "GOOGLE_ADMIN_LOGIN_REQUIRED",
  'disabledPasswordResponse',
]) assert(customerEntry.includes(marker), `legacy password shutdown missing: ${marker}`);

for (const marker of [
  'purpose-bound-minimum-disclosure',
  'never-project-to-browser-or-external-ai',
  'experience_public',
  'admin_safe',
  'ai_minimum',
  'projectForExternalAi',
  'crypto.subtle.digest',
]) assert(projection.includes(marker), `Secure Projection runtime missing: ${marker}`);

for (const marker of [
  "from './secure-projection.js'",
  'projectedCorePayload',
  "purpose: 'admin-recovery-status'",
  'projectionStamp',
]) assert(coreApi.includes(marker), `Core API projection integration missing: ${marker}`);

for (const marker of [
  'projectForExternalAi',
  'projectionStamp',
  'projected.context.spaceId',
  'projected.context.actorId',
  'capabilities: [body.capability]',
  'input: projected.input',
]) assert(externalAi.includes(marker), `External AI projection boundary missing: ${marker}`);

assert(openAi.includes('projectForExternalAi(context'), 'Admin OpenAI context must be projected before outbound calls');
assert(claude.includes('sanitizeProjectionText(text(message), { strict: true'), 'Claude personal provider must sanitize outbound text');
assert(gemini.includes('sanitizeProjectionText(text(message), { strict: true'), 'Gemini personal provider must sanitize outbound text');
const aiContract = JSON.parse(aiContractRaw);
assert(aiContract.security?.secureProjectionRequired === true, 'External AI contract must require Secure Projection');
assert(aiContract.security?.canonicalActorIdMayLeaveEkodi === false, 'canonical actor IDs must stay inside EKODI');
assert(aiContract.security?.canonicalSpaceIdMayLeaveEkodi === false, 'canonical space IDs must stay inside EKODI');
assert(aiContract.security?.sourceTopologyMayLeaveEkodi === false, 'source topology must stay inside EKODI');

assert(!edge.includes('authorization.slice(7).trim().slice('), 'raw bearer token fragments must not be used as rate-limit keys');
assert(edge.includes("crypto.subtle.digest('SHA-256'"), 'rate-limit identities must be hashed');
assert(edge.includes("return { available: false, allowed: false }"), 'protected routes must fail closed when rate limiting is unavailable');

console.log('Security baseline valid: fail-closed edge throttling, capability-scoped Admin OS authority, temporary Google elevation, browser headers, session revocation, password shutdown and Secure Projection enforced.');

function assert(condition, message) {
  if (!condition) {
    console.error(`Security baseline validation failed: ${message}`);
    process.exit(1);
  }
}
