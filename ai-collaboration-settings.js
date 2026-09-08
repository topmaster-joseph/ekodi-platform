const SCOPE = 'global';
const MAX_AUDIT_ROWS = 50;
const PROFILE_VALUES = new Set(['fast', 'balanced', 'deep']);
const RISK_VALUES = new Set(['read_only', 'code_write', 'production_write']);
const EXECUTION_TARGETS = Object.freeze(['cloud', 'remote', 'local']);
const LOCAL_REASONS = Object.freeze(['cloud_unavailable', 'local_resource_required', 'gui_or_device_required']);

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function finite(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function roleDefaults(profile, risk, tools) {
  return Object.freeze({ enabled: true, profile, risk, tools: Object.freeze([...tools]) });
}

export const DEFAULT_AI_COLLABORATION_POLICY = Object.freeze({
  schemaVersion: 1,
  collaborationByDefault: true,
  execution: Object.freeze({
    cloudFirst: true,
    order: EXECUTION_TARGETS,
    localFallback: Object.freeze({ enabled: true, allowedReasons: LOCAL_REASONS }),
    requireLiveProductionVerification: true,
  }),
  openai: Object.freeze({
    enabled: true,
    credentialMode: 'project_service_credential',
    secretStorage: 'server_secret_only',
    profiles: Object.freeze({
      fast: Object.freeze({ env: 'EKODI_OPENAI_MODEL_FAST', fallbackEnv: 'OPENAI_MODEL' }),
      balanced: Object.freeze({ env: 'EKODI_OPENAI_MODEL_BALANCED', fallbackEnv: 'OPENAI_MODEL' }),
      deep: Object.freeze({ env: 'EKODI_OPENAI_MODEL_DEEP', fallbackEnv: 'OPENAI_MODEL' }),
    }),
    roles: Object.freeze({
      coordinator: roleDefaults('deep', 'read_only', ['plan', 'delegate', 'review']),
      planner: roleDefaults('balanced', 'read_only', ['plan', 'research']),
      builder: roleDefaults('balanced', 'code_write', ['code', 'test', 'git']),
      reviewer: roleDefaults('deep', 'read_only', ['review', 'security', 'quality']),
      verifier: roleDefaults('balanced', 'read_only', ['test', 'health', 'production_verify']),
    }),
  }),
  governance: Object.freeze({
    maxParallelCollaborators: 4,
    requireHumanApprovalForProductionWrite: true,
    requireHumanApprovalForDestructiveAction: true,
    failClosedOnInvalidPolicy: true,
    auditChanges: true,
  }),
});

function normalizeTools(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.map(item => text(item, 48).toLowerCase()).filter(Boolean))].slice(0, 12);
}

function normalizeRole(value, fallback) {
  const source = value && typeof value === 'object' ? value : {};
  const profile = PROFILE_VALUES.has(source.profile) ? source.profile : fallback.profile;
  const risk = RISK_VALUES.has(source.risk) ? source.risk : fallback.risk;
  return {
    enabled: bool(source.enabled, fallback.enabled),
    profile,
    risk,
    tools: normalizeTools(source.tools, fallback.tools),
  };
}

export function normalizeAiCollaborationPolicy(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const execution = source.execution && typeof source.execution === 'object' ? source.execution : {};
  const openai = source.openai && typeof source.openai === 'object' ? source.openai : {};
  const roles = openai.roles && typeof openai.roles === 'object' ? openai.roles : {};
  const governance = source.governance && typeof source.governance === 'object' ? source.governance : {};
  const defaults = DEFAULT_AI_COLLABORATION_POLICY;

  const normalizedRoles = {};
  for (const [name, fallback] of Object.entries(defaults.openai.roles)) normalizedRoles[name] = normalizeRole(roles[name], fallback);

  return {
    schemaVersion: 1,
    collaborationByDefault: bool(source.collaborationByDefault, defaults.collaborationByDefault),
    execution: {
      cloudFirst: true,
      order: [...EXECUTION_TARGETS],
      localFallback: {
        enabled: bool(execution.localFallback?.enabled, true),
        allowedReasons: [...LOCAL_REASONS],
      },
      requireLiveProductionVerification: bool(execution.requireLiveProductionVerification, true),
    },
    openai: {
      enabled: bool(openai.enabled, true),
      credentialMode: 'project_service_credential',
      secretStorage: 'server_secret_only',
      profiles: defaults.openai.profiles,
      roles: normalizedRoles,
    },
    governance: {
      maxParallelCollaborators: finite(governance.maxParallelCollaborators, defaults.governance.maxParallelCollaborators, 1, 8),
      requireHumanApprovalForProductionWrite: bool(governance.requireHumanApprovalForProductionWrite, true),
      requireHumanApprovalForDestructiveAction: true,
      failClosedOnInvalidPolicy: true,
      auditChanges: true,
    },
  };
}

export function resolveOpenAiProfiles(env = {}, policy = DEFAULT_AI_COLLABORATION_POLICY) {
  const fallback = text(env.OPENAI_MODEL, 120) || null;
  const result = {};
  for (const [name, descriptor] of Object.entries(policy.openai.profiles)) {
    result[name] = text(env[descriptor.env], 120) || fallback;
  }
  return Object.freeze(result);
}

export function selectAiExecutionTarget(policy, availability = {}) {
  const normalized = normalizeAiCollaborationPolicy(policy);
  if (availability.cloud !== false) return Object.freeze({ target: 'cloud', reason: 'cloud_first' });
  if (availability.remote === true) return Object.freeze({ target: 'remote', reason: 'cloud_unavailable' });
  const localReason = text(availability.localReason, 60).toLowerCase();
  if (availability.local === true && normalized.execution.localFallback.enabled && LOCAL_REASONS.includes(localReason)) {
    return Object.freeze({ target: 'local', reason: localReason });
  }
  return Object.freeze({ target: null, reason: 'no_approved_execution_target' });
}

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_collaboration_settings (
    scope TEXT PRIMARY KEY,
    policy_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_collaboration_settings_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    revision INTEGER NOT NULL,
    actor TEXT,
    action TEXT NOT NULL,
    policy_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
}

async function rowForPolicy(env) {
  if (!env.DB?.prepare) return null;
  await ensureTables(env.DB);
  return env.DB.prepare('SELECT * FROM ai_collaboration_settings WHERE scope = ?').bind(SCOPE).first();
}

export async function loadAiCollaborationPolicy(env = {}) {
  const row = await rowForPolicy(env);
  if (!row?.policy_json) return { policy: normalizeAiCollaborationPolicy(DEFAULT_AI_COLLABORATION_POLICY), revision: 0, source: 'defaults' };
  try {
    return { policy: normalizeAiCollaborationPolicy(JSON.parse(row.policy_json)), revision: Number(row.revision) || 1, source: 'database' };
  } catch (error) {
    if (DEFAULT_AI_COLLABORATION_POLICY.governance.failClosedOnInvalidPolicy) throw new Error('AI_COLLABORATION_POLICY_INVALID');
    return { policy: normalizeAiCollaborationPolicy(DEFAULT_AI_COLLABORATION_POLICY), revision: 0, source: 'defaults' };
  }
}

export async function saveAiCollaborationPolicy(env = {}, value = {}, actor = 'admin', action = 'update') {
  if (!env.DB?.prepare) throw new Error('AI_COLLABORATION_DB_UNAVAILABLE');
  await ensureTables(env.DB);
  const normalized = normalizeAiCollaborationPolicy(value);
  const current = await env.DB.prepare('SELECT revision FROM ai_collaboration_settings WHERE scope = ?').bind(SCOPE).first();
  const revision = (Number(current?.revision) || 0) + 1;
  const now = new Date().toISOString();
  const policyJson = JSON.stringify(normalized);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ai_collaboration_settings (scope, policy_json, revision, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(scope) DO UPDATE SET policy_json=excluded.policy_json, revision=excluded.revision, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
      .bind(SCOPE, policyJson, revision, now, text(actor, 200)),
    env.DB.prepare(`INSERT INTO ai_collaboration_settings_audit (scope, revision, actor, action, policy_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(SCOPE, revision, text(actor, 200), text(action, 40) || 'update', policyJson, now),
  ]);
  return { policy: normalized, revision, source: 'database', updatedAt: now, updatedBy: text(actor, 200) };
}

export async function resetAiCollaborationPolicy(env = {}, actor = 'admin') {
  return saveAiCollaborationPolicy(env, DEFAULT_AI_COLLABORATION_POLICY, actor, 'reset');
}

export async function listAiCollaborationAudit(env = {}, limit = 20) {
  if (!env.DB?.prepare) return [];
  await ensureTables(env.DB);
  const bounded = Math.min(Math.max(Number(limit) || 20, 1), MAX_AUDIT_ROWS);
  const rows = await env.DB.prepare(`SELECT revision, actor, action, created_at FROM ai_collaboration_settings_audit
    WHERE scope = ? ORDER BY id DESC LIMIT ?`).bind(SCOPE, bounded).all();
  return rows.results || [];
}

export async function getAiCollaborationAdminSnapshot(env = {}) {
  const loaded = await loadAiCollaborationPolicy(env);
  const profiles = resolveOpenAiProfiles(env, loaded.policy);
  return Object.freeze({
    ...loaded,
    credential: Object.freeze({
      configured: Boolean(text(env.OPENAI_API_KEY, 10_000)),
      storage: 'server_secret_only',
      recommendedIsolation: 'openai_project_per_environment',
    }),
    resolvedProfiles: profiles,
    executionRule: 'cloud_first_remote_second_local_exception_only',
  });
}

export const AI_COLLABORATION_SETTINGS = Object.freeze({
  version: '1.0.0',
  scope: SCOPE,
  executionTargets: EXECUTION_TARGETS,
  localReasons: LOCAL_REASONS,
});
