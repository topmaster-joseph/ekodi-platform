const ALLOWED_CAPABILITIES = new Set([
  'jubilee.evaluate',
  'jubilee.policy.read',
  'jubilee.audit.read',
  'jubilee.support.write',
  'jubilee.pool.write',
]);

/**
 * Parse hashed service-token grants from a secret/environment value.
 *
 * Expected shape:
 * [
 *   {
 *     "tokenSha256": "<64 lowercase/uppercase hex chars>",
 *     "actorId": "service:discovery",
 *     "capabilities": ["jubilee.evaluate"],
 *     "expiresAt": "2027-01-01T00:00:00.000Z"
 *   }
 * ]
 *
 * Raw bearer tokens must never be stored in repository configuration.
 */
export function parseJubileeCapabilityGrants(raw) {
  if (!raw) return Object.freeze([]);

  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('invalid_jubilee_capability_grants_json');
  }

  if (!Array.isArray(parsed)) throw new Error('invalid_jubilee_capability_grants');

  const grants = parsed.map((grant, index) => normalizeGrant(grant, index));
  return Object.freeze(grants);
}

/**
 * Fail-closed capability authorization for the Jubilee API boundary.
 *
 * Service-token authorization is provider-neutral: an EKODI service, ChatGPT
 * adapter, Gemini adapter, MCP gateway, A2A gateway or another future client is
 * represented only by the capabilities it has been granted.
 *
 * Human/admin session fallback is OFF by default. It must be explicitly injected
 * by a trusted integration and returns a capability-scoped session result.
 */
export function createJubileeCapabilityAuthorizer(options = {}) {
  const grants = parseJubileeCapabilityGrants(options.grants || options.grantsJson || '[]');
  const sessionVerifier = typeof options.sessionVerifier === 'function' ? options.sessionVerifier : null;

  return async function authorize(request, requirement = {}) {
    const capability = String(requirement.capability || '').trim();
    if (!ALLOWED_CAPABILITIES.has(capability)) {
      return Object.freeze({ allowed: false, reason: 'unknown_jubilee_capability' });
    }

    const authorization = request?.headers?.get?.('authorization') || '';
    if (authorization.startsWith('Bearer ')) {
      const rawToken = authorization.slice(7).trim();
      if (rawToken) {
        const tokenSha256 = await sha256Hex(rawToken);
        const now = new Date();
        const grant = grants.find(item => secureEqual(item.tokenSha256, tokenSha256));

        if (grant) {
          if (grant.expiresAt && new Date(grant.expiresAt) <= now) {
            return Object.freeze({ allowed: false, reason: 'jubilee_capability_grant_expired' });
          }
          if (!grant.capabilities.includes(capability)) {
            return Object.freeze({ allowed: false, reason: 'jubilee_capability_not_granted' });
          }
          return Object.freeze({
            allowed: true,
            actorId: grant.actorId,
            actorType: 'service',
            capability,
            authMethod: 'hashed_bearer_grant',
          });
        }
      }
    }

    if (sessionVerifier) {
      const session = await sessionVerifier(request, { capability });
      if (session?.allowed === true && session.capabilities?.includes?.(capability)) {
        return Object.freeze({
          allowed: true,
          actorId: safeActorId(session.actorId) || 'session:authorized',
          actorType: 'session',
          capability,
          authMethod: 'capability_scoped_session',
        });
      }
    }

    return Object.freeze({ allowed: false, reason: 'jubilee_authorization_required' });
  };
}

export async function hashJubileeBearerToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (token.length < 24) throw new Error('jubilee_token_too_short');
  return sha256Hex(token);
}

function normalizeGrant(rawGrant, index) {
  const grant = rawGrant && typeof rawGrant === 'object' ? rawGrant : {};
  const tokenSha256 = String(grant.tokenSha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(tokenSha256)) throw new Error(`invalid_jubilee_grant_hash:${index}`);

  const actorId = safeActorId(grant.actorId);
  if (!actorId) throw new Error(`invalid_jubilee_grant_actor:${index}`);

  const capabilities = [...new Set(Array.isArray(grant.capabilities) ? grant.capabilities.map(item => String(item || '').trim()) : [])];
  if (capabilities.length === 0 || capabilities.some(item => !ALLOWED_CAPABILITIES.has(item))) {
    throw new Error(`invalid_jubilee_grant_capabilities:${index}`);
  }

  let expiresAt = null;
  if (grant.expiresAt) {
    const parsed = new Date(grant.expiresAt);
    if (Number.isNaN(parsed.getTime())) throw new Error(`invalid_jubilee_grant_expiry:${index}`);
    expiresAt = parsed.toISOString();
  }

  return Object.freeze({
    tokenSha256,
    actorId,
    capabilities: Object.freeze(capabilities),
    expiresAt,
  });
}

function safeActorId(value) {
  const actorId = String(value || '').trim();
  if (!actorId) return null;
  return /^[A-Za-z0-9:._-]{1,160}$/.test(actorId) ? actorId : null;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function secureEqual(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
