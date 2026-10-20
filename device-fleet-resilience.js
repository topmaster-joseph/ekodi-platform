// EKODI Device Control cloud-first policy primitives. No host command, account
// secret, browser session, or production device state is accessed here.
// Existing Control API owns actual enrollment, authentication, queue and audit.
export const DEVICE_FLEET_LIMITS = Object.freeze({
  onlineMs: 90_000,
  staleMs: 600_000,
  clockSkewMs: 5_000,
  defaultCommandTtlMs: 120_000,
  maxCommandTtlMs: 600_000,
  retryBaseMs: 2_000,
  retryCapMs: 120_000,
});

const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const parseTime = (value) => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value))
  ? Date.parse(value) : NaN;

// Server-observed heartbeat time is an observation, NOT a proof of model
// readiness or a license to issue arbitrary remote commands.
export function classifyDevicePresence(device, now = Date.now()) {
  if (!device || typeof device !== 'object') return 'unknown';
  if (device.revokedAt || device.revoked_at) return 'revoked';
  const value = device.lastSeenAt ?? device.last_seen_at;
  if (!value) return 'enrolled';
  const observed = parseTime(value);
  if (!Number.isFinite(observed) || !Number.isFinite(now) || observed > now + DEVICE_FLEET_LIMITS.clockSkewMs)
    return 'unknown';
  const age = Math.max(0, now - observed);
  if (age <= DEVICE_FLEET_LIMITS.onlineMs) return 'online';
  if (age <= DEVICE_FLEET_LIMITS.staleMs) return 'stale';
  return 'offline';
}

// A read-only, bounded retry policy; auth/revocation/policy failures must never
// hammer the API or silently renew/ignore a rejected device credential.
export function deviceReconnectPlan({failure = 'network', attempts = 0, entropy = 0.5} = {}) {
  const hardStops = new Set(['unauthorized', 'forbidden', 'revoked', 'policy_denied', 'invalid_enrollment']);
  if (hardStops.has(failure)) return Object.freeze({retry: false, delayMs: null, reason: 'owner_authority_required'});
  if (!['network', 'timeout', 'server_unavailable', 'rate_limited'].includes(failure))
    return Object.freeze({retry: false, delayMs: null, reason: 'unclassified_failure'});
  const attempt = integer(attempts) ? Math.min(attempts, 12) : 0;
  // Bound server/API load and distribute the retry herd. No randomness or
  // environment access here: callers provide entropy [0,1] and tests are pure.
  const jitter = Number.isFinite(entropy) ? Math.min(1, Math.max(0, entropy)) : 0.5;
  const exponential = Math.min(DEVICE_FLEET_LIMITS.retryCapMs,
    DEVICE_FLEET_LIMITS.retryBaseMs * (2 ** attempt));
  const minimum = failure === 'rate_limited' ? 30_000 : 0;
  return Object.freeze({
    retry: true,
    delayMs: Math.min(DEVICE_FLEET_LIMITS.retryCapMs,
      Math.max(minimum, Math.round(exponential * (0.8 + 0.4 * jitter)))),
    reason: 'bounded_cloud_reconnect',
  });
}

// Future rollout contract for server-issued command fencing. The existing
// legacy queue MUST NOT call this until the device epoch, receipt and expiry
// fields are populated transactionally by the Control API. This routine never
// grants privileges; it only rejects envelopes that lost their authority.
export function validateCloudCommandFence({device, command, now = Date.now()} = {}) {
  const fail = (reason) => Object.freeze({allowed: false, reason});
  if (classifyDevicePresence(device, now) !== 'online') return fail('device_not_online');
  if (!device?.id || typeof device.id !== 'string') return fail('device_id_missing');
  if (!command || typeof command !== 'object' || command.deviceId !== device.id ||
      typeof command.id !== 'string' || !command.id || command.status !== 'queued')
    return fail('command_identity_or_state_invalid');
  if (!integer(device.sessionEpoch) || !integer(command.sessionEpoch) ||
      command.sessionEpoch !== device.sessionEpoch) return fail('session_epoch_mismatch');
  const issued = parseTime(command.issuedAt);
  const expiry = parseTime(command.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expiry) ||
      issued > now + DEVICE_FLEET_LIMITS.clockSkewMs || expiry <= now ||
      expiry <= issued || expiry - issued > DEVICE_FLEET_LIMITS.maxCommandTtlMs)
    return fail('command_expired_or_ttl_invalid');
  if (command.authorized !== true || command.capabilityAllowed !== true)
    return fail('command_authorization_missing');
  if (!['observe', 'maintain'].includes(command.risk) ||
      (command.risk === 'maintain' && command.confirmed !== true))
    return fail('confirmation_or_risk_invalid');
  return Object.freeze({allowed: true, reason: 'bounded_command_valid'});
}
