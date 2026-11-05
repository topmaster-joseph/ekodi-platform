// EKODI KG Inicis / PortOne V2 TEST harness.
// Completely independent of production eligibility. No grant is ever written.
// Only the existing Control API super_admin session may invoke this module.
const ID = /^ekodi-inicis-sandbox-[0-9a-f]{32}$/;
const CHANNEL = /^channel-key-[a-zA-Z0-9-]{8,80}$/;
const STORE = /^store-[a-zA-Z0-9-]{8,80}$/;
const SITE = 'singles-sandbox';
const POLICY = 'civil_adult_19';
const ONE_DAY = 86400000;
const iso = time => new Date(time).toISOString();

export function sandboxConfiguration(env) {
  const storeId = String(env?.PORTONE_INICIS_SANDBOX_STORE_ID || '');
  const channelKey = String(env?.PORTONE_INICIS_SANDBOX_CHANNEL_KEY || '');
  const enabled = env?.AGE_VERIFICATION_SANDBOX_ENABLED === 'true';
  return {
    enabled: Boolean(enabled && STORE.test(storeId) && CHANNEL.test(channelKey) && env?.DB),
    mode: 'TEST',
    provider: 'kg-inicis-unified',
    productionEligibility: false,
    // These are public PortOne SDK identifiers, not MID API key or API Secret.
    storeId: enabled && STORE.test(storeId) && CHANNEL.test(channelKey) ? storeId : null,
    channelKey: enabled && STORE.test(storeId) && CHANNEL.test(channelKey) ? channelKey : null,
    serverProofAvailable: Boolean(env?.PORTONE_AGE_API_SECRET),
    maxAttemptsPerDay: 5
  };
}

export async function startInicisSandbox(env, adminId, now = Date.now()) {
  const cfg = sandboxConfiguration(env);
  if (!cfg.enabled) return { status: 503, body: { error: 'sandbox_unavailable' } };
  if (adminId === null || adminId === undefined || String(adminId).length < 1)
    return { status: 403, body: { error: 'admin_not_found' } };
  const subject = String(adminId);
  const id = 'ekodi-inicis-sandbox-' + crypto.randomUUID().replaceAll('-', '');
  const createdAt = iso(now), expiresAt = iso(now + 10 * 60000);
  try {
    // Quota enforcement must happen in the SQL insert, not only in an earlier SELECT.
    const created = await env.DB.prepare(
      'INSERT INTO age_verification_attempts (id,subject_id,site,policy,status,created_at,expires_at) ' +
      'SELECT ?,?,?,?,?,?,? WHERE ' +
      '(SELECT COUNT(*) FROM age_verification_attempts WHERE subject_id=? AND created_at>?)<5'
    ).bind(id, subject, SITE, POLICY, 'pending', createdAt, expiresAt, subject, iso(now - ONE_DAY)).run();
    if (Number(created?.meta?.changes || 0) !== 1)
      return { status: 429, body: { error: 'sandbox_attempt_limit' } };
  } catch {
    return { status: 503, body: { error: 'sandbox_database_unavailable' } };
  }
  return { status: 201, body: {
    mode: 'TEST', provider: cfg.provider, productionEligibility: false,
    identityVerificationId: id, storeId: cfg.storeId, channelKey: cfg.channelKey,
    expiresAt
  } };
}

export async function finishInicisSandbox(env, adminId, id, now = Date.now()) {
  const cfg = sandboxConfiguration(env);
  if (!cfg.enabled) return { status: 503, body: { error: 'sandbox_unavailable' } };
  if (adminId === null || adminId === undefined || !ID.test(String(id || '')))
    return { status: 400, body: { error: 'invalid_sandbox_attempt' } };
  const subject = String(adminId), stamp = iso(now);
  let attempt;
  try {
    attempt = await env.DB.prepare(
      'SELECT status,expires_at FROM age_verification_attempts WHERE id=? AND subject_id=? AND site=? AND policy=?'
    ).bind(id, subject, SITE, POLICY).first();
  } catch { return { status: 503, body: { error: 'sandbox_database_unavailable' } }; }
  if (!attempt) return { status: 404, body: { error: 'sandbox_attempt_not_found' } };
  if (attempt.status !== 'pending') return { status: 409, body: { error: 'sandbox_attempt_consumed' } };
  if (attempt.expires_at <= stamp) return { status: 410, body: { error: 'sandbox_attempt_expired' } };
  if (!env?.PORTONE_AGE_API_SECRET) return {
    status: 503, body: { error: 'sandbox_server_proof_unavailable',
      productionEligibility: false }
  };

  let proof;
  try {
    const response = await fetch('https://api.portone.io/identity-verifications/' + encodeURIComponent(id), {
      headers: { authorization: 'PortOne ' + env.PORTONE_AGE_API_SECRET },
      redirect: 'error', signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return { status: 502, body: { error: 'sandbox_provider_unavailable' } };
    proof = await response.json();
  } catch { return { status: 502, body: { error: 'sandbox_provider_unavailable' } }; }
  // TEST-only proof! A LIVE proof, another channel, wrong store, missing channel,
  // or fabricated ID may never be considered a sandbox pass either.
  if (proof?.id !== id || proof?.status !== 'VERIFIED' ||
      proof.channel?.type !== 'TEST' || proof.channel?.key !== cfg.channelKey ||
      (proof.storeId && proof.storeId !== cfg.storeId))
    return { status: 409, body: { sandboxPassed: false,
      productionEligibility: false, error: 'sandbox_provider_not_verified' } };

  try {
    // Consume the test attempt as 'denied' intentionally: this schema has no TEST
    // state and no row can be interpreted as an active production eligibility grant.
    const updated = await env.DB.prepare(
      'UPDATE age_verification_attempts SET status=?,completed_at=? ' +
      'WHERE id=? AND subject_id=? AND site=? AND status=? AND expires_at>?'
    ).bind('denied', stamp, id, subject, SITE, 'pending', stamp).run();
    if (Number(updated?.meta?.changes || 0) !== 1)
      return { status: 409, body: { error: 'sandbox_attempt_consumed' } };
  } catch { return { status: 503, body: { error: 'sandbox_database_unavailable' } }; }
  // Deliberately no "verified: true", no name, DOB, phone, CI, DI, or raw proof.
  return { status: 200, body: {
    sandboxPassed: true, mode: 'TEST', provider: cfg.provider,
    productionEligibility: false, ageGrantCreated: false
  } };
}
