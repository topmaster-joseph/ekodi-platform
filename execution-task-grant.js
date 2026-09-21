import crypto from 'node:crypto';

const DEFAULT_MAX_TTL_SECONDS = 900;
const DEFAULT_TTL_SECONDS = 300;
const MIN_TTL_SECONDS = 30;
const FORBIDDEN_CAPABILITY = /(^|[:/.])(production|provider-mutation|secret-export|credential-export)([:/.]|$)/i;

const clean = value => String(value ?? '').trim();
const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');

function normalizeCapabilities(value) {
  const source = Array.isArray(value) ? value : [value];
  const capabilities = [...new Set(source.map(clean).filter(Boolean))];
  if (capabilities.length === 0) throw new Error('task grant requires at least one capability');
  for (const capability of capabilities) {
    if (FORBIDDEN_CAPABILITY.test(capability)) {
      throw new Error(`task grant capability is forbidden in execution sandbox: ${capability}`);
    }
  }
  return capabilities;
}

function publicGrant(record, nowMs) {
  if (!record) return null;
  return Object.freeze({
    grantId: record.grantId,
    issuer: record.issuer,
    audience: record.audience,
    taskId: record.taskId,
    workspaceId: record.workspaceId,
    role: record.role,
    capabilities: Object.freeze([...record.capabilities]),
    issuedAt: new Date(record.issuedAtMs).toISOString(),
    expiresAt: new Date(record.expiresAtMs).toISOString(),
    expired: nowMs >= record.expiresAtMs,
    revoked: record.revoked === true,
    revocationReason: record.revocationReason || null,
    productionMutationAllowed: false,
    providerMutationAllowed: false,
    rawTokenPersisted: false,
  });
}

export const DEFAULT_TASK_GRANT_CAPABILITIES = Object.freeze([
  'execution:implement',
  'execution:test',
  'evidence:write',
]);

export class ExecutionTaskGrantBroker {
  #clock;
  #maxTtlSeconds;
  #records = new Map();

  constructor({ clock = () => Date.now(), maxTtlSeconds = DEFAULT_MAX_TTL_SECONDS } = {}) {
    this.#clock = clock;
    const parsed = Number(maxTtlSeconds);
    if (!Number.isFinite(parsed) || parsed < MIN_TTL_SECONDS || parsed > DEFAULT_MAX_TTL_SECONDS) {
      throw new Error(`max task grant TTL must be between ${MIN_TTL_SECONDS} and ${DEFAULT_MAX_TTL_SECONDS} seconds`);
    }
    this.#maxTtlSeconds = Math.floor(parsed);
  }

  issue(input = {}) {
    const taskId = clean(input.taskId || input.task_id);
    const workspaceId = clean(input.workspaceId || input.workspace_id);
    const role = clean(input.role);
    const issuer = clean(input.issuer) || 'ekodi-orchestrator';
    const audience = clean(input.audience) || 'ekodi-execution-provider';
    const capabilities = normalizeCapabilities(input.capabilities || input.capability);
    const ttlSeconds = Math.floor(Number(input.ttlSeconds ?? input.ttl_seconds ?? DEFAULT_TTL_SECONDS));

    if (!taskId) throw new Error('task grant requires taskId');
    if (!workspaceId) throw new Error('task grant requires workspaceId');
    if (!role) throw new Error('task grant requires role');
    if (!Number.isFinite(ttlSeconds) || ttlSeconds < MIN_TTL_SECONDS || ttlSeconds > this.#maxTtlSeconds) {
      throw new Error(`task grant TTL must be between ${MIN_TTL_SECONDS} and ${this.#maxTtlSeconds} seconds`);
    }

    const nowMs = Number(this.#clock());
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const record = {
      grantId: `grant_${crypto.randomUUID()}`,
      issuer,
      audience,
      taskId,
      workspaceId,
      role,
      capabilities,
      issuedAtMs: nowMs,
      expiresAtMs: nowMs + ttlSeconds * 1000,
      revoked: false,
      revocationReason: null,
      tokenHash,
    };
    this.#records.set(tokenHash, record);
    return Object.freeze({ token, grant: publicGrant(record, nowMs) });
  }

  authorize(token, request = {}) {
    const nowMs = Number(this.#clock());
    const record = this.#records.get(hashToken(token));
    if (!record) return Object.freeze({ ok: false, reason: 'grant_not_found' });
    if (record.revoked) return Object.freeze({ ok: false, reason: 'grant_revoked', grant: publicGrant(record, nowMs) });
    if (nowMs >= record.expiresAtMs) return Object.freeze({ ok: false, reason: 'grant_expired', grant: publicGrant(record, nowMs) });
    if (request.productionMutation === true || request.providerMutation === true) {
      return Object.freeze({ ok: false, reason: 'mutation_outside_execution_boundary', grant: publicGrant(record, nowMs) });
    }

    const taskId = clean(request.taskId || request.task_id);
    const workspaceId = clean(request.workspaceId || request.workspace_id);
    const role = clean(request.role);
    const capability = clean(request.capability);

    if (taskId && taskId !== record.taskId) return Object.freeze({ ok: false, reason: 'task_scope_mismatch', grant: publicGrant(record, nowMs) });
    if (workspaceId && workspaceId !== record.workspaceId) return Object.freeze({ ok: false, reason: 'workspace_scope_mismatch', grant: publicGrant(record, nowMs) });
    if (role && role !== record.role) return Object.freeze({ ok: false, reason: 'role_scope_mismatch', grant: publicGrant(record, nowMs) });
    if (!capability || !record.capabilities.includes(capability)) {
      return Object.freeze({ ok: false, reason: 'capability_scope_mismatch', grant: publicGrant(record, nowMs) });
    }

    return Object.freeze({ ok: true, reason: 'authorized', grant: publicGrant(record, nowMs) });
  }

  revoke(token, { reason = 'task_completed' } = {}) {
    const nowMs = Number(this.#clock());
    const record = this.#records.get(hashToken(token));
    if (!record) return Object.freeze({ ok: false, reason: 'grant_not_found' });
    record.revoked = true;
    record.revocationReason = clean(reason) || 'task_completed';
    return Object.freeze({ ok: true, grant: publicGrant(record, nowMs) });
  }

  inspect(token) {
    const nowMs = Number(this.#clock());
    const record = this.#records.get(hashToken(token));
    return publicGrant(record, nowMs);
  }

  get activeGrantCount() {
    const nowMs = Number(this.#clock());
    let count = 0;
    for (const record of this.#records.values()) {
      if (!record.revoked && nowMs < record.expiresAtMs) count += 1;
    }
    return count;
  }
}
