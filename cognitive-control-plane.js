import { evaluateMissionAction } from './ai-governance-runtime.js';

export const CONTROL_PLANE_VERSION = '1.0.0';
export const CONTROL_PLANE_PREFIX = '/api/control/ai/control-plane';
const EVENT_VERSION = 1;
const MAX_EVENT_BYTES = 32_768;
const MAX_LIST = 100;
const SECRET_KEY = /(authorization|password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)/i;

const SUPPORTED_EVENTS = Object.freeze({
  'mall.product.promotion.requested': Object.freeze({
    goal: 'promote_product',
    agentId: 'marketing',
    area: 'campaign_operations',
    steps: Object.freeze([
      Object.freeze({ capability: 'campaign.compose', adapter: 'campaign.default', approvalRequired: false }),
      Object.freeze({ capability: 'media.render.short_video', adapter: 'media.default', approvalRequired: false }),
      Object.freeze({ capability: 'publisher.youtube.private', adapter: 'social.youtube', approvalRequired: false }),
      Object.freeze({ capability: 'analytics.observe', adapter: 'analytics.default', approvalRequired: false }),
      Object.freeze({ capability: 'publisher.youtube.public', adapter: 'social.youtube', approvalRequired: true }),
    ]),
  }),
});

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function jsonBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function containsSecretKey(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 8) return false;
  if (Array.isArray(value)) return value.some(item => containsSecretKey(item, depth + 1));
  return Object.entries(value).some(([key, child]) => SECRET_KEY.test(key) || containsSecretKey(child, depth + 1));
}

function randomId(prefix) {
  const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${suffix}`;
}

export function normalizeControlPlaneEvent(body = {}, now = new Date().toISOString()) {
  const source = plainObject(body.source);
  const actor = plainObject(body.actor);
  const subject = plainObject(body.subject);
  const payload = plainObject(body.payload);
  return {
    eventId: clean(body.event_id || body.eventId, 120) || randomId('evt'),
    eventType: clean(body.event_type || body.eventType, 160),
    eventVersion: Number(body.event_version || body.eventVersion || EVENT_VERSION),
    occurredAt: clean(body.occurred_at || body.occurredAt, 80) || now,
    receivedAt: now,
    workspaceId: clean(body.workspace_id || body.workspaceId, 120),
    source: {
      serviceId: clean(source.service_id || source.serviceId, 120),
      adapterId: clean(source.adapter_id || source.adapterId, 120),
    },
    actor: {
      type: clean(actor.type || 'system', 60),
      id: clean(actor.id, 160),
    },
    subject: {
      type: clean(subject.type, 100),
      id: clean(subject.id, 180),
    },
    correlationId: clean(body.correlation_id || body.correlationId, 120),
    payload,
  };
}

export function validateControlPlaneEvent(event = {}) {
  if (!event.eventType || !event.workspaceId || !event.source?.serviceId || !event.subject?.type || !event.subject?.id) {
    return { ok: false, code: 'CONTROL_EVENT_FIELDS_REQUIRED', error: 'event_type, workspace_id, source.service_id, subject.type, subject.id는 필수입니다.' };
  }
  if (event.eventVersion !== EVENT_VERSION) {
    return { ok: false, code: 'CONTROL_EVENT_VERSION_UNSUPPORTED', error: `event_version ${EVENT_VERSION}만 지원합니다.` };
  }
  if (!SUPPORTED_EVENTS[event.eventType]) {
    return { ok: false, code: 'CONTROL_EVENT_UNSUPPORTED', error: '아직 등록되지 않은 Control Plane 이벤트입니다.' };
  }
  if (containsSecretKey(event.payload)) {
    return { ok: false, code: 'CONTROL_EVENT_SECRET_FORBIDDEN', error: 'Control Plane 이벤트 payload에는 credential, token, secret을 포함할 수 없습니다.' };
  }
  const bytes = jsonBytes(event);
  if (!Number.isFinite(bytes)) {
    return { ok: false, code: 'CONTROL_EVENT_INVALID_JSON', error: 'Control Plane 이벤트는 JSON으로 직렬화할 수 있어야 합니다.' };
  }
  if (bytes > MAX_EVENT_BYTES) {
    return { ok: false, code: 'CONTROL_EVENT_TOO_LARGE', error: `Control Plane 이벤트는 ${MAX_EVENT_BYTES}바이트 이하여야 합니다.` };
  }
  return { ok: true, bytes };
}

export function planControlPlaneJob(event, now = new Date().toISOString()) {
  const contract = SUPPORTED_EVENTS[event.eventType];
  if (!contract) return null;
  const governanceAction = {
    agentId: contract.agentId,
    actionType: 'control_plane.plan_and_dispatch',
    area: contract.area,
    target: `${event.subject.type}:${event.subject.id}`,
    rationale: `Handle ${event.eventType} for workspace ${event.workspaceId}`,
    payload: {
      eventId: event.eventId,
      eventType: event.eventType,
      workspaceId: event.workspaceId,
      subject: event.subject,
    },
    reversible: true,
    delegated: true,
    logged: true,
    preflightVerified: true,
    reducesUserRights: false,
    crossTenantPrivateData: false,
    violates: [],
  };
  const governance = evaluateMissionAction(governanceAction);
  const steps = contract.steps.map((step, index) => ({
    stepId: `${index + 1}`,
    capability: step.capability,
    adapter: step.adapter,
    status: step.approvalRequired ? 'awaiting_human' : 'queued',
    approvalRequired: step.approvalRequired,
  }));
  const approvalRequired = steps.some(step => step.approvalRequired);
  const blocked = ['forbidden', 'human_gate'].includes(governance.tier);
  return {
    jobId: randomId('job'),
    controlPlaneVersion: CONTROL_PLANE_VERSION,
    workspaceId: event.workspaceId,
    serviceId: event.source.serviceId,
    sourceEventId: event.eventId,
    correlationId: event.correlationId || event.eventId,
    goal: contract.goal,
    status: governance.tier === 'forbidden' ? 'blocked' : governance.tier === 'human_gate' ? 'awaiting_human' : 'ready_for_executor',
    approvalRequired,
    governance,
    governanceAction,
    steps: blocked ? steps.map(step => ({ ...step, status: step.approvalRequired ? 'awaiting_human' : 'blocked_by_governance' })) : steps,
    createdAt: now,
    updatedAt: now,
  };
}

export function getControlPlaneContract() {
  return {
    version: CONTROL_PLANE_VERSION,
    eventVersion: EVENT_VERSION,
    role: ['plan', 'dispatch', 'govern', 'observe'],
    executionModel: 'modular_monolith_with_explicit_capability_adapters',
    credentialPolicy: 'credentials_are_external_to_event_and_job_payloads',
    supportedEvents: Object.keys(SUPPORTED_EVENTS),
    capabilities: [...new Set(Object.values(SUPPORTED_EVENTS).flatMap(contract => contract.steps.map(step => step.capability)))],
  };
}

export async function ensureControlPlaneSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS cognitive_control_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      event_version INTEGER NOT NULL,
      workspace_id TEXT NOT NULL,
      source_service_id TEXT NOT NULL,
      source_adapter_id TEXT NOT NULL DEFAULT '',
      actor_type TEXT NOT NULL DEFAULT 'system',
      actor_id TEXT NOT NULL DEFAULT '',
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      correlation_id TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      received_by TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_cognitive_events_workspace ON cognitive_control_events(workspace_id, received_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_cognitive_events_type ON cognitive_control_events(event_type, received_at DESC)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS cognitive_control_jobs (
      job_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      source_event_id TEXT NOT NULL UNIQUE,
      correlation_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      approval_required INTEGER NOT NULL DEFAULT 0,
      governance_tier TEXT NOT NULL,
      governance_reason TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(source_event_id) REFERENCES cognitive_control_events(event_id)
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_cognitive_jobs_workspace ON cognitive_control_jobs(workspace_id, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_cognitive_jobs_status ON cognitive_control_jobs(status, created_at DESC)'),
  ]);
}

export async function acceptControlPlaneEvent(db, session, input) {
  const now = new Date().toISOString();
  const event = normalizeControlPlaneEvent(input, now);
  const validation = validateControlPlaneEvent(event);
  if (!validation.ok) return { ok: false, status: validation.code === 'CONTROL_EVENT_TOO_LARGE' ? 413 : 400, ...validation };

  await ensureControlPlaneSchema(db);
  const existing = await db.prepare('SELECT job_id, status, plan_json FROM cognitive_control_jobs WHERE source_event_id = ?').bind(event.eventId).first();
  if (existing) {
    return { ok: true, status: 200, idempotent: true, event, job: safeJob(existing) };
  }

  const job = planControlPlaneJob(event, now);
  await db.batch([
    db.prepare(`INSERT INTO cognitive_control_events
      (event_id, event_type, event_version, workspace_id, source_service_id, source_adapter_id, actor_type, actor_id, subject_type, subject_id, correlation_id, payload_json, occurred_at, received_at, received_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(event.eventId, event.eventType, event.eventVersion, event.workspaceId, event.source.serviceId, event.source.adapterId, event.actor.type, event.actor.id, event.subject.type, event.subject.id, event.correlationId, JSON.stringify(event.payload), event.occurredAt, event.receivedAt, clean(session?.email || 'unknown', 240)),
    db.prepare(`INSERT INTO cognitive_control_jobs
      (job_id, workspace_id, service_id, source_event_id, correlation_id, goal, status, approval_required, governance_tier, governance_reason, plan_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(job.jobId, job.workspaceId, job.serviceId, job.sourceEventId, job.correlationId, job.goal, job.status, job.approvalRequired ? 1 : 0, job.governance.tier, job.governance.reason, JSON.stringify(job), job.createdAt, job.updatedAt),
  ]);
  return { ok: true, status: 202, idempotent: false, event, job };
}

function safeJob(row) {
  if (!row) return null;
  try {
    const plan = JSON.parse(row.plan_json || '{}');
    return { ...plan, status: row.status || plan.status };
  } catch {
    return { jobId: row.job_id, status: row.status, degraded: true };
  }
}

export async function listControlPlaneJobs(db, url) {
  await ensureControlPlaneSchema(db);
  const requested = Number.parseInt(url.searchParams.get('limit') || '30', 10);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 30, 1), MAX_LIST);
  const workspaceId = clean(url.searchParams.get('workspace_id') || url.searchParams.get('workspaceId'), 120);
  const status = clean(url.searchParams.get('status'), 80);
  const clauses = [];
  const values = [];
  if (workspaceId) { clauses.push('workspace_id = ?'); values.push(workspaceId); }
  if (status) { clauses.push('status = ?'); values.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.prepare(`SELECT job_id, status, plan_json FROM cognitive_control_jobs ${where} ORDER BY created_at DESC LIMIT ?`).bind(...values, limit).all();
  return (rows.results || []).map(safeJob);
}

export async function getControlPlaneJob(db, jobId) {
  await ensureControlPlaneSchema(db);
  const row = await db.prepare('SELECT job_id, status, plan_json FROM cognitive_control_jobs WHERE job_id = ?').bind(jobId).first();
  return safeJob(row);
}
