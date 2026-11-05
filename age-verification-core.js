// EKODI common adult eligibility verification: provider-proof only, never browser-proclaimed age.
// A site-scoped eligibility grant is not an authentication session, payment right or site entitlement.
const ROOT = '/api/age-verification';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^ekodi-age-[0-9a-f]{32}$/;
const INICIS_ID = /^ekodi-inicis-[0-9a-f]{32}$/;
const INICIS_PROVIDER = 'kg-inicis-unified';
const SITE = /^[a-z][a-z0-9-]{1,39}$/;
const POLICIES = new Set(['civil_adult_19', 'youth_protection_19']);
const ONE_DAY = 86400000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow, noarchive',
    'cross-origin-resource-policy': 'same-origin', 'vary': 'Origin',
  } });
}
function kstToday(now) {
  const time = new Date(now.getTime() + 9 * 3600000);
  return [time.getUTCFullYear(), time.getUTCMonth() + 1, time.getUTCDate()];
}
export function verifiedAgeEligible(birthDate, policy = 'civil_adult_19', now = new Date()) {
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !POLICIES.has(policy)) return false;
  const [year, month, day] = birthDate.split('-').map(Number);
  if (year < 1900 || year > 9999) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() + 1 !== month || probe.getUTCDate() !== day) return false;
  const [todayYear, todayMonth, todayDay] = kstToday(now);
  if (year > todayYear || (year === todayYear && (month > todayMonth || (month === todayMonth && day > todayDay)))) return false;
  if (policy === 'youth_protection_19') return year <= todayYear - 19;
  return year < todayYear - 19 || (year === todayYear - 19 &&
    (month < todayMonth || (month === todayMonth && day <= todayDay)));
}
function policies(env) {
  if (env?.AGE_VERIFICATION_ENABLED !== 'true') return {};
  try {
    const obj = JSON.parse(String(env.AGE_VERIFICATION_SITE_POLICIES || '{}'));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    return Object.fromEntries(Object.entries(obj).filter(([site, policy]) =>
      SITE.test(site) && POLICIES.has(policy)));
  } catch { return {}; }
}
function authConfig(env) {
  const supabaseUrl = String(env?.SUPABASE_URL || env?.MY_SUPABASE_URL || '');
  const publishableKey = String(env?.SUPABASE_PUBLISHABLE_KEY || env?.MY_SUPABASE_PUBLISHABLE_KEY || '');
  try {
    const origin = new URL(supabaseUrl);
    if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.supabase.co') || !publishableKey) return null;
    return { supabaseUrl: origin.origin, publishableKey };
  } catch { return null; }
}
// Provider choice is server-only, scoped to each site and never accepted from callers.
// Any unknown provider or malformed map fails closed instead of silently falling back.
function providerForSite(env, site) {
  try {
    const choices = JSON.parse(String(env?.AGE_VERIFICATION_SITE_PROVIDERS || '{}'));
    if (!choices || typeof choices !== 'object' || Array.isArray(choices)) return null;
    const value = Object.hasOwn(choices, site) ? choices[site] : 'portone-v2';
    return value === 'portone-v2' || value === INICIS_PROVIDER ? value : null;
  } catch { return null; }
}
function channelForProvider(env, provider) {
  if (provider === INICIS_PROVIDER) return env?.PORTONE_INICIS_AGE_CHANNEL_KEY;
  if (provider === 'portone-v2') return env?.PORTONE_AGE_CHANNEL_KEY;
  return null;
}
function attemptMatchesProvider(id, provider) {
  return provider === INICIS_PROVIDER ? INICIS_ID.test(id || '') :
    provider === 'portone-v2' && ID.test(id || '');
}
function configured(env, provider = 'portone-v2') {
  return Boolean(env?.DB && authConfig(env) && env?.PORTONE_AGE_API_SECRET &&
    /^store-[a-zA-Z0-9-]{8,64}$/.test(String(env?.PORTONE_AGE_STORE_ID || '')) &&
    /^channel-key-[a-zA-Z0-9-]{8,64}$/.test(String(channelForProvider(env, provider) || '')) &&
    (provider !== INICIS_PROVIDER || env?.AGE_VERIFICATION_INICIS_CONTRACT_APPROVED === 'true'));
}
function config(env, site) {
  const policy = policies(env)[site];
  const provider = providerForSite(env, site);
  if (!SITE.test(site) || !policy || !provider || !configured(env, provider)) return null;
  return { provider, storeId: env.PORTONE_AGE_STORE_ID,
    channelKey: channelForProvider(env, provider), policy, auth: authConfig(env) };
}
async function authenticate(req, env) {
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer [^\s]+$/i.test(authorization)) return null;
  const auth = authConfig(env);
  if (!auth) return null;
  const origin = new URL(auth.supabaseUrl);
  try {
    const response = await fetch(origin.origin + '/auth/v1/user', {
      headers: { authorization, apikey: auth.publishableKey },
      redirect: 'error', signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    return UUID.test(user?.id || '') && user?.is_anonymous !== true ? user.id : null;
  } catch { return null; }
}
async function input(req) {
  const max = 2048;
  if (Number(req.headers.get('content-length') || 0) > max) return null;
  const raw = await req.text();
  if (raw.length > max) return null;
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch { return null; }
}
async function providerVerification(id, env) {
  try {
    const response = await fetch('https://api.portone.io/identity-verifications/' + encodeURIComponent(id), {
      headers: { authorization: 'PortOne ' + env.PORTONE_AGE_API_SECRET },
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}
const iso = ms => new Date(ms).toISOString();

export async function handleAgeVerificationRequest(request, env) {
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
  if (path !== ROOT && !path.startsWith(ROOT + '/')) return null;
  if (request.headers.get('origin') && request.headers.get('origin') !== 'https://ekodi.kr')
    return json({ error: 'origin_not_allowed' }, 403);
  if (path === ROOT + '/config' && request.method === 'GET') {
    const site = url.searchParams.get('site') || '';
    const ready = config(env, site);
    return json(ready ? { enabled: true, ...ready } : { enabled: false }, 200);
  }
  if (!new Set([ROOT + '/start', ROOT + '/complete', ROOT + '/status']).has(path))
    return json({ error: 'not_found' }, 404);
  if ((path === ROOT + '/status' && request.method !== 'GET') ||
      (path !== ROOT + '/status' && request.method !== 'POST'))
    return json({ error: 'method_not_allowed' }, 405);
  // A KG-only deployment does not require the unrelated legacy PortOne channel.
  // A specific site's production provider is still checked in config() below.
  if (!env?.DB || !authConfig(env) || Object.keys(policies(env)).length === 0)
    return json({ error: 'age_verification_unavailable' }, 503);
  const userId = await authenticate(request, env);
  if (!userId) return json({ error: 'unauthorized' }, 401);
  const data = request.method === 'POST' ? await input(request) : null;
  if (request.method === 'POST' && !data) return json({ error: 'invalid_payload' }, 400);
  const site = request.method === 'GET' ? url.searchParams.get('site') : data.site;
  const cfg = config(env, site);
  if (!cfg) return json({ error: 'site_not_enabled' }, 403);
  const now = Date.now(), stamp = iso(now);
  try {
    if (path === ROOT + '/status') {
      const row = await env.DB.prepare(
        'SELECT expires_at,attempt_id FROM age_verification_grants WHERE subject_id=? AND site=? AND policy=? AND expires_at>?'
      ).bind(userId, site, cfg.policy, stamp).first();
      // A newly selected provider must not inherit a grant from a different provider.
      const verified = Boolean(row && attemptMatchesProvider(row.attempt_id, cfg.provider));
      return json({ verified, site, policy: cfg.policy, expiresAt: verified ? row.expires_at : null });
    }
    if (path === ROOT + '/start') {
      if (Object.keys(data).some(key => key !== 'site'))
        return json({ error: 'invalid_payload' }, 400);
      const limit = await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM age_verification_attempts WHERE subject_id=? AND created_at>?'
      ).bind(userId, iso(now - ONE_DAY)).first();
      if (Number(limit?.total || 0) >= 5)
        return json({ error: 'too_many_attempts', retryAfterSeconds: 86400 }, 429);
      // Distinct provider-bound IDs prevent an outstanding request being finalized
      // against a different provider after a site configuration change.
      const prefix = cfg.provider === INICIS_PROVIDER ? 'ekodi-inicis-' : 'ekodi-age-';
      const id = prefix + crypto.randomUUID().replaceAll('-', '');
      // The insert rechecks the daily quota atomically; concurrent calls cannot bypass it.
      const created = await env.DB.prepare(
        'INSERT INTO age_verification_attempts (id,subject_id,site,policy,status,created_at,expires_at) ' +
        'SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM age_verification_attempts WHERE subject_id=? AND created_at>?)<5'
      ).bind(id, userId, site, cfg.policy, 'pending', stamp, iso(now + 10 * 60000), userId, iso(now - ONE_DAY)).run();
      if (Number(created?.meta?.changes || 0) !== 1)
        return json({ error: 'too_many_attempts', retryAfterSeconds: 86400 }, 429);
      return json({ identityVerificationId: id, provider: cfg.provider,
        storeId: cfg.storeId, channelKey: cfg.channelKey, policy: cfg.policy,
        expiresAt: iso(now + 10 * 60000) }, 201);
    }
    if (Object.keys(data).some(key => !['site', 'identityVerificationId'].includes(key)) ||
        !attemptMatchesProvider(String(data.identityVerificationId || ''), cfg.provider))
      return json({ error: 'invalid_payload' }, 400);
    const id = data.identityVerificationId;
    const row = await env.DB.prepare(
      'SELECT status,expires_at FROM age_verification_attempts WHERE id=? AND subject_id=? AND site=? AND policy=?'
    ).bind(id, userId, site, cfg.policy).first();
    if (!row) return json({ error: 'attempt_not_found' }, 404);
    if (row.status !== 'pending') return json({ error: 'attempt_already_consumed' }, 409);
    if (row.expires_at <= stamp) return json({ error: 'attempt_expired' }, 410);
    const result = await providerVerification(id, env);
    if (!result) return json({ error: 'provider_unavailable' }, 502);
    if (result?.id !== id || result?.status !== 'VERIFIED')
      return json({ error: 'provider_not_verified' }, 409);
    // Restrict proof to the configured store/channel whenever the provider returns those fields.
    if ((result.storeId && result.storeId !== cfg.storeId) ||
        (result.channel?.key && result.channel.key !== cfg.channelKey))
      return json({ error: 'provider_context_mismatch' }, 502);
    // KG Inicis production grants require the exact PortOne channel and LIVE
    // evidence. Missing channel identity and TEST responses are NEVER sufficient.
    if (cfg.provider === INICIS_PROVIDER &&
        (result.channel?.key !== cfg.channelKey || result.channel?.type !== 'LIVE'))
      return json({ error: 'provider_context_mismatch' }, 502);
    const birthDate = result?.verifiedCustomer?.birthDate;
    if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate))
      return json({ error: 'provider_evidence_missing' }, 502);
    const eligible = verifiedAgeEligible(birthDate, cfg.policy, new Date(now));
    const status = eligible ? 'verified' : 'denied';
    // D1 batch is atomic: a replay or concurrent completion cannot mint a second grant.
    const updates = [];
    if (eligible) updates.push(env.DB.prepare(
      'INSERT INTO age_verification_grants (subject_id,site,policy,verified_at,expires_at,attempt_id) ' +
      'SELECT subject_id,site,policy,?,?,id FROM age_verification_attempts ' +
      'WHERE id=? AND subject_id=? AND status=? AND expires_at>? ' +
      'ON CONFLICT(subject_id,site,policy) DO UPDATE SET verified_at=excluded.verified_at,expires_at=excluded.expires_at,attempt_id=excluded.attempt_id'
    ).bind(stamp, iso(now + 90 * ONE_DAY), id, userId, 'pending', stamp));
    updates.push(env.DB.prepare(
      'UPDATE age_verification_attempts SET status=?,completed_at=? WHERE id=? AND subject_id=? AND status=? AND expires_at>?'
    ).bind(status, stamp, id, userId, 'pending', stamp));
    const batch = await env.DB.batch(updates);
    if (Number(batch.at(-1)?.meta?.changes || 0) !== 1)
      return json({ error: 'attempt_already_consumed' }, 409);
    return json({ verified: eligible, site, policy: cfg.policy,
      expiresAt: eligible ? iso(now + 90 * ONE_DAY) : null }, eligible ? 200 : 403);
  } catch (error) {
    console.error('Age verification request failed', { route: path, code: 'AGE_VERIFY_FAILED' });
    return json({ error: 'age_verification_backend_unavailable' }, 503);
  }
}


// Existing Control API cron performs privacy retention without introducing a new scheduler.
// This is best-effort before first migration; failure cannot open a verification grant.
export async function pruneAgeVerification(env) {
  if (!env?.DB) return;
  try {
    const available = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='age_verification_attempts'"
    ).first();
    if (!available) return;
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM age_verification_attempts WHERE created_at<?').bind(iso(now - 30 * ONE_DAY)),
      env.DB.prepare('DELETE FROM age_verification_grants WHERE expires_at<?').bind(iso(now)),
    ]);
  } catch {
    console.warn('Age verification retention unavailable; migration may not be installed');
  }
}

/**
 * Platform Control API read-only readiness view. Caller must have an authenticated,
 * platform-scoped admin session before invoking this function. No personal rows or keys.
 */
export async function ageVerificationAdminSnapshot(env) {
  let sitePolicies = {};
  try {
    const raw = JSON.parse(String(env?.AGE_VERIFICATION_SITE_POLICIES || '{}'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      sitePolicies = Object.fromEntries(Object.entries(raw).filter(([site, policy]) =>
        SITE.test(site) && POLICIES.has(policy)));
    }
  } catch { /* Invalid config must not enable service. */ }
  const result = {
    service: 'ekodi-age-verification',
    enabled: env?.AGE_VERIFICATION_ENABLED === 'true',
    provider: 'portone-v2',
    providerConfigured: Object.keys(sitePolicies).some(site => configured(env, providerForSite(env, site))),
    siteProviders: Object.fromEntries(Object.keys(sitePolicies).map(site =>
      [site, providerForSite(env, site) || 'invalid'])),
    siteReadiness: Object.fromEntries(Object.keys(sitePolicies).map(site => {
      const provider = providerForSite(env, site);
      return [site, Boolean(provider && configured(env, provider))];
    })),
    schemaReady: false,
    sitePolicies,
    retentionDays: 30,
    grantValidityDays: 90,
    maxAttemptsPerDay: 5,
    activeGrants: null,
    attempts24h: null
  };
  if (!env?.DB) return result;
  try {
    const schema = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='age_verification_attempts'").first();
    if (!schema) return result;
    const now = Date.now();
    const [grants, attempts] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS total FROM age_verification_grants WHERE expires_at>?').bind(iso(now)).first(),
      env.DB.prepare('SELECT COUNT(*) AS total FROM age_verification_attempts WHERE created_at>?').bind(iso(now - ONE_DAY)).first()
    ]);
    result.schemaReady = true;
    result.activeGrants = Number(grants?.total || 0);
    result.attempts24h = Number(attempts?.total || 0);
  } catch { /* Fail closed; never pretend the schema is ready. */ }
  return result;
}
