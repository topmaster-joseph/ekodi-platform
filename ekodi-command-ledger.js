const TASK_STATES = new Set(['queued', 'running', 'retry', 'human_gate', 'verified', 'degraded', 'core_only', 'ignored', 'failed']);

function text(value, max = 1200) {
  return String(value ?? '').trim().slice(0, max);
}

function safeJson(value, fallback = {}) {
  try { return JSON.stringify(value ?? fallback); } catch { return JSON.stringify(fallback); }
}

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || JSON.stringify(fallback)); } catch { return fallback; }
}

function iso(value = Date.now()) {
  return new Date(value).toISOString();
}

function normalizeId(value, prefix) {
  const raw = text(value, 110).replace(/[^a-zA-Z0-9._:-]+/g, '_');
  if (raw) return raw;
  const uuid = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${uuid}`;
}

function dbFrom(input) {
  const db = input?.DB || input;
  if (!db?.prepare) throw new Error('EKODI_COMMAND_LEDGER_DB_REQUIRED');
  return db;
}

export async function ensureEkodiCommandLedger(input) {
  const db = dbFrom(input);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_pulse_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      change_class TEXT NOT NULL DEFAULT 'green',
      risk TEXT NOT NULL DEFAULT 'normal',
      actionable INTEGER NOT NULL DEFAULT 1,
      requires_human INTEGER NOT NULL DEFAULT 0,
      event_json TEXT NOT NULL DEFAULT '{}',
      state TEXT NOT NULL DEFAULT 'observed',
      task_id TEXT,
      observed_at TEXT NOT NULL,
      processed_at TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_pulse_events_state ON ai_pulse_events(state, observed_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_command_tasks (
      id TEXT PRIMARY KEY,
      pulse_event_id TEXT UNIQUE,
      goal TEXT NOT NULL,
      risk TEXT NOT NULL DEFAULT 'normal',
      target_json TEXT NOT NULL DEFAULT '{}',
      delegation_json TEXT NOT NULL DEFAULT '{}',
      context_json TEXT NOT NULL DEFAULT '{}',
      state TEXT NOT NULL DEFAULT 'queued',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 2,
      next_attempt_at TEXT,
      lease_until TEXT,
      plan_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT NOT NULL DEFAULT '{}',
      evidence_json TEXT NOT NULL DEFAULT '{}',
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_command_tasks_due ON ai_command_tasks(state, next_attempt_at, created_at)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_command_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      state TEXT NOT NULL,
      provider_diversity INTEGER NOT NULL DEFAULT 0,
      sentinel_independent INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_command_runs_task ON ai_command_runs(task_id, id DESC)'),
  ]);
  return db;
}

export async function ingestEkodiPulse(input, payload = {}) {
  const db = await ensureEkodiCommandLedger(input);
  const eventInput = payload.event || payload.pulse || payload;
  const eventId = normalizeId(eventInput.id || eventInput.eventId, 'pulse');
  const taskId = normalizeId(payload.taskId || `task_${eventId}`, 'task');
  const now = iso();
  const kind = text(eventInput.kind || eventInput.type || 'system_event', 60).toLowerCase() || 'system_event';
  const source = text(eventInput.source || 'ekodi-pulse', 120) || 'ekodi-pulse';
  const summary = text(eventInput.summary || eventInput.message || payload.goal || eventId, 1200);
  const changeClass = text(eventInput.changeClass || 'green', 80).toLowerCase() || 'green';
  const risk = text(payload.risk || eventInput.risk || 'normal', 20).toLowerCase() || 'normal';
  const actionable = eventInput.actionable !== false;
  const requiresHuman = eventInput.requiresHumanDecision === true;

  await db.prepare(`INSERT OR IGNORE INTO ai_pulse_events
    (id, kind, source, summary, change_class, risk, actionable, requires_human, event_json, state, task_id, observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed', ?, ?)`)
    .bind(eventId, kind, source, summary, changeClass, risk, actionable ? 1 : 0, requiresHuman ? 1 : 0, safeJson(eventInput), taskId, now).run();

  if (actionable) {
    const maxAttempts = Math.min(Math.max(Number(payload.maxAttempts) || 2, 1), 3);
    await db.prepare(`INSERT OR IGNORE INTO ai_command_tasks
      (id, pulse_event_id, goal, risk, target_json, delegation_json, context_json, state, attempt_count, max_attempts, next_attempt_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?)`)
      .bind(
        taskId,
        eventId,
        text(payload.goal || summary || eventId, 1200),
        risk,
        safeJson(payload.target || {}),
        safeJson(payload.delegation || {}),
        safeJson(payload.context || {}),
        maxAttempts,
        now,
        now,
        now,
      ).run();
  } else {
    await db.prepare("UPDATE ai_pulse_events SET state = 'ignored', processed_at = ? WHERE id = ?").bind(now, eventId).run();
  }

  return getEkodiCommandTask(db, taskId, { includeEvent: true });
}

export async function getEkodiCommandTask(input, taskId, options = {}) {
  const db = await ensureEkodiCommandLedger(input);
  const row = await db.prepare(`SELECT * FROM ai_command_tasks WHERE id = ?`).bind(text(taskId, 120)).first();
  if (!row) return null;
  const task = hydrateTask(row);
  if (!options.includeEvent || !task.pulseEventId) return task;
  const event = await db.prepare('SELECT * FROM ai_pulse_events WHERE id = ?').bind(task.pulseEventId).first();
  return { ...task, event: hydrateEvent(event) };
}

export async function listEkodiCommandTasks(input, options = {}) {
  const db = await ensureEkodiCommandLedger(input);
  const limit = Math.min(Math.max(Number(options.limit) || 30, 1), 100);
  const state = text(options.state, 40).toLowerCase();
  const rows = state
    ? await db.prepare('SELECT * FROM ai_command_tasks WHERE state = ? ORDER BY created_at DESC LIMIT ?').bind(state, limit).all()
    : await db.prepare('SELECT * FROM ai_command_tasks ORDER BY created_at DESC LIMIT ?').bind(limit).all();
  return (rows.results || []).map(hydrateTask);
}

export async function getEkodiCommandLedgerStatus(input) {
  const db = await ensureEkodiCommandLedger(input);
  const [tasks, pulses, runs] = await Promise.all([
    db.prepare(`SELECT state, COUNT(*) AS count FROM ai_command_tasks GROUP BY state`).all(),
    db.prepare(`SELECT state, COUNT(*) AS count FROM ai_pulse_events GROUP BY state`).all(),
    db.prepare('SELECT COUNT(*) AS count FROM ai_command_runs').first(),
  ]);
  return Object.freeze({
    schemaVersion: 1,
    durable: true,
    taskStates: Object.fromEntries((tasks.results || []).map(row => [row.state, Number(row.count || 0)])),
    pulseStates: Object.fromEntries((pulses.results || []).map(row => [row.state, Number(row.count || 0)])),
    runCount: Number(runs?.count || 0),
  });
}

export async function claimNextEkodiCommandTask(input, options = {}) {
  const db = await ensureEkodiCommandLedger(input);
  const now = iso(options.now || Date.now());
  const leaseMs = Math.min(Math.max(Number(options.leaseMs) || 120000, 30000), 300000);
  const leaseUntil = iso(new Date(now).getTime() + leaseMs);
  const row = await db.prepare(`SELECT id FROM ai_command_tasks
    WHERE state IN ('queued','retry')
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      AND (lease_until IS NULL OR lease_until <= ?)
    ORDER BY created_at ASC LIMIT 1`).bind(now, now).first();
  if (!row?.id) return null;
  const result = await db.prepare(`UPDATE ai_command_tasks
    SET state = 'running', attempt_count = attempt_count + 1, lease_until = ?, updated_at = ?
    WHERE id = ? AND state IN ('queued','retry') AND (lease_until IS NULL OR lease_until <= ?)`)
    .bind(leaseUntil, now, row.id, now).run();
  if (Number(result?.meta?.changes ?? result?.changes ?? 0) < 1) return null;
  return getEkodiCommandTask(db, row.id, { includeEvent: true });
}

export async function settleEkodiCommandTask(input, task, result, options = {}) {
  const db = await ensureEkodiCommandLedger(input);
  const nowMs = options.now || Date.now();
  const now = iso(nowMs);
  const resultState = TASK_STATES.has(text(result?.state, 40).toLowerCase()) ? text(result.state, 40).toLowerCase() : 'failed';
  const attempt = Math.max(1, Number(task?.attemptCount || task?.attempt_count || 1));
  const maxAttempts = Math.max(1, Number(task?.maxAttempts || task?.max_attempts || 2));
  let state = resultState;
  let nextAttemptAt = null;
  let closedAt = null;
  if (resultState === 'verified' || resultState === 'ignored') closedAt = now;
  else if (resultState === 'human_gate') state = 'human_gate';
  else if (['degraded', 'core_only', 'failed'].includes(resultState) && attempt < maxAttempts) {
    state = 'retry';
    nextAttemptAt = iso(nowMs + Math.min(30, 10 * attempt) * 60_000);
  } else if (resultState === 'core_only') state = 'core_only';
  else if (resultState === 'degraded') state = 'degraded';
  else state = 'failed';

  const evidence = result?.evidence || {};
  await db.prepare(`UPDATE ai_command_tasks SET
      state = ?, next_attempt_at = ?, lease_until = NULL, plan_json = ?, result_json = ?, evidence_json = ?,
      last_error = ?, updated_at = ?, closed_at = ? WHERE id = ?`)
    .bind(
      state,
      nextAttemptAt,
      safeJson(result?.plan || {}),
      safeJson(result || {}),
      safeJson(evidence),
      text(result?.error || result?.reason || '', 1000),
      now,
      closedAt,
      task.id,
    ).run();

  await db.prepare(`INSERT INTO ai_command_runs
      (task_id, attempt, state, provider_diversity, sentinel_independent, result_json, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      task.id,
      attempt,
      resultState,
      Math.max(0, Number(evidence?.providerDiversity) || 0),
      evidence?.sentinelIndependent ? 1 : 0,
      safeJson(result || {}),
      text(options.startedAt || now, 40),
      now,
    ).run();

  if (task.pulseEventId) {
    const pulseState = state === 'retry' ? 'queued' : state === 'human_gate' ? 'human_gate' : state;
    await db.prepare('UPDATE ai_pulse_events SET state = ?, processed_at = ? WHERE id = ?').bind(pulseState, now, task.pulseEventId).run();
  }
  return getEkodiCommandTask(db, task.id, { includeEvent: true });
}

function hydrateTask(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    pulseEventId: row.pulse_event_id || null,
    goal: row.goal,
    risk: row.risk,
    target: parseJson(row.target_json),
    delegation: parseJson(row.delegation_json),
    context: parseJson(row.context_json),
    state: row.state,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 0),
    nextAttemptAt: row.next_attempt_at || null,
    leaseUntil: row.lease_until || null,
    plan: parseJson(row.plan_json),
    result: parseJson(row.result_json),
    evidence: parseJson(row.evidence_json),
    lastError: row.last_error || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    closedAt: row.closed_at || null,
  });
}

function hydrateEvent(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    kind: row.kind,
    source: row.source,
    summary: row.summary,
    changeClass: row.change_class,
    risk: row.risk,
    actionable: Number(row.actionable) === 1,
    requiresHumanDecision: Number(row.requires_human) === 1,
    event: parseJson(row.event_json),
    state: row.state,
    taskId: row.task_id || null,
    observedAt: row.observed_at,
    processedAt: row.processed_at || null,
  });
}

export const EKODI_COMMAND_LEDGER = Object.freeze({
  version: '1.0.0',
  durableStore: 'cloudflare-d1',
  maxAutomaticAttempts: 3,
  states: Object.freeze([...TASK_STATES]),
});
