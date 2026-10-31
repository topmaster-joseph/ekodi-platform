/**
 * Admin AI conversation retention.
 *
 * The question an administrator asked has always been kept in
 * `ai_agent_actions.rationale`, but the reply was not, so the record was half a
 * conversation and could not be read back as one. Keeping the reply makes the
 * record whole — and a whole record of pastoral and member-facing
 * conversations must expire rather than accumulate.
 *
 * After the retention window the verbatim text is redacted in place and a short
 * summary is kept, so the audit row, its decision tier and its provenance
 * survive while the words do not.
 *
 * This module is deliberately standalone: both the control plane
 * (ai-agent-control.js) and the scheduled worker (api-worker.js) use it, and
 * those two already import one another.
 */

const freeze = value => Object.freeze(value);

export const ADMIN_ASSIST_RETENTION = freeze({
  version: '1.0.0',
  verbatimRetentionDays: 90,
  summaryChars: 200,
  redactionMarker: '[보존기간 경과·원문 삭제]',
  maxReplyChars: 8_000,
  pruneBatch: 200,
  auditRowRetained: true,
});

/** Columns the conversation record needs; the table predates all of them. */
export const ADMIN_ASSIST_COLUMNS = freeze([
  freeze(['reply_text', "TEXT NOT NULL DEFAULT ''"]),
  freeze(['reply_summary', "TEXT NOT NULL DEFAULT ''"]),
  freeze(['rationale_summary', "TEXT NOT NULL DEFAULT ''"]),
  freeze(['redacted_at', 'TEXT']),
]);

export function summarizeConversationText(value, limit = ADMIN_ASSIST_RETENTION.summaryChars) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function retentionCutoffIso(now = new Date(), days = ADMIN_ASSIST_RETENTION.verbatimRetentionDays) {
  const at = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const window = Number.isFinite(Number(days)) ? Math.max(1, Math.trunc(Number(days))) : ADMIN_ASSIST_RETENTION.verbatimRetentionDays;
  return new Date(at.getTime() - window * 86_400_000).toISOString();
}

/** Additive and idempotent. Safe to call on every request path. */
export async function ensureAdminAssistColumns(db) {
  if (!db) return false;
  for (const [column, definition] of ADMIN_ASSIST_COLUMNS) {
    try { await db.prepare(`ALTER TABLE ai_agent_actions ADD COLUMN ${column} ${definition}`).run(); } catch {}
  }
  try {
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_agent_actions_retention ON ai_agent_actions(redacted_at, created_at)').run();
  } catch {}
  return true;
}

/**
 * Redact conversation text past the retention window, keeping the audit row.
 * Called from the Control API's existing cron rather than a schedule of its own.
 */
export async function pruneAdminAssistConversations(db, options = {}) {
  if (!db) return freeze({ redacted: 0, reason: 'no_database_binding' });
  const days = Number.isFinite(Number(options.retentionDays))
    ? Math.max(1, Math.trunc(Number(options.retentionDays)))
    : ADMIN_ASSIST_RETENTION.verbatimRetentionDays;
  const cutoff = retentionCutoffIso(options.now, days);
  const limit = Math.max(1, Math.min(1_000, Math.trunc(Number(options.limit) || ADMIN_ASSIST_RETENTION.pruneBatch)));
  try {
    await ensureAdminAssistColumns(db);
    const rows = await db.prepare(`SELECT id, rationale, reply_text, rationale_summary, reply_summary
      FROM ai_agent_actions
      WHERE redacted_at IS NULL AND created_at < ?
      ORDER BY created_at ASC LIMIT ?`).bind(cutoff, limit).all();
    const pending = rows?.results || [];
    if (!pending.length) return freeze({ redacted: 0, cutoff, retentionDays: days });
    const redactedAt = new Date().toISOString();
    await db.batch(pending.map(row => db.prepare(`UPDATE ai_agent_actions
        SET rationale = ?, reply_text = ?, rationale_summary = ?, reply_summary = ?, redacted_at = ?
        WHERE id = ?`)
      .bind(
        ADMIN_ASSIST_RETENTION.redactionMarker,
        ADMIN_ASSIST_RETENTION.redactionMarker,
        summarizeConversationText(row.rationale_summary || row.rationale),
        summarizeConversationText(row.reply_summary || row.reply_text),
        redactedAt,
        row.id,
      )));
    return freeze({ redacted: pending.length, cutoff, retentionDays: days, redactedAt });
  } catch (error) {
    return freeze({ redacted: 0, error: String(error?.message || error).slice(0, 240) });
  }
}

/**
 * Reading the record back.
 *
 * The question and reply were already being written down; what was missing was
 * any way to read them. This is that path, and it is scoped in SQL rather than
 * in the handler: `requested_by = ?` is part of every statement, so a bug in a
 * route cannot widen it.
 *
 * Owner-only, deliberately — not owner-or-superadmin. These conversations carry
 * pastoral and member-facing material. Someone else's administrative authority
 * is not a reason to read them, and a platform that quietly allowed it would be
 * one its administrators could not speak freely to.
 */
const MAX_RECALL = 50;

function conversationRow(row) {
  const redacted = Boolean(row.redacted_at);
  return freeze({
    id: Number(row.id),
    createdAt: row.created_at,
    // A redacted row has lost its words and kept its summary; say which it is
    // rather than returning a marker that reads like content.
    redacted,
    redactedAt: row.redacted_at || null,
    question: redacted ? '' : String(row.rationale || ''),
    reply: redacted ? '' : String(row.reply_text || ''),
    questionSummary: String(row.rationale_summary || ''),
    replySummary: String(row.reply_summary || ''),
    status: row.status,
    target: row.target || '',
    verifiedAt: row.verified_at || null,
  });
}

export async function listOwnConversations(db, options = {}) {
  const email = String(options.email ?? '').trim();
  if (!db || !email) return freeze({ conversations: freeze([]), reason: 'owner_required' });
  const limit = Math.max(1, Math.min(MAX_RECALL, Math.trunc(Number(options.limit) || 20)));
  await ensureAdminAssistColumns(db);
  const rows = await db.prepare(`SELECT id, created_at, rationale, reply_text, rationale_summary,
      reply_summary, redacted_at, status, target, verified_at
    FROM ai_agent_actions
    WHERE action_type = 'admin.assist_chat' AND requested_by = ?
    ORDER BY id DESC LIMIT ?`).bind(email, limit).all();
  return freeze({
    conversations: freeze((rows?.results || []).map(conversationRow)),
    retentionDays: ADMIN_ASSIST_RETENTION.verbatimRetentionDays,
    ownerScoped: true,
  });
}

/**
 * The administrator's own delete. It redacts rather than deletes: the words go,
 * the audit row — who asked, when, which decision tier, what the provider was —
 * stays. Erasing the row itself would erase the accountability along with the
 * content, and that is not the administrator's to remove.
 */
export async function redactOwnConversation(db, options = {}) {
  const email = String(options.email ?? '').trim();
  const id = Math.trunc(Number(options.id));
  if (!db || !email || !Number.isFinite(id) || id <= 0) {
    return freeze({ redacted: false, reason: 'owner_and_id_required' });
  }
  await ensureAdminAssistColumns(db);
  const row = await db.prepare(`SELECT id, rationale, reply_text, rationale_summary, reply_summary, redacted_at
    FROM ai_agent_actions
    WHERE id = ? AND action_type = 'admin.assist_chat' AND requested_by = ?`).bind(id, email).first();
  if (!row) return freeze({ redacted: false, reason: 'not_found_or_not_owned' });
  if (row.redacted_at) return freeze({ redacted: false, reason: 'already_redacted', redactedAt: row.redacted_at });
  const redactedAt = new Date().toISOString();
  await db.prepare(`UPDATE ai_agent_actions
      SET rationale = ?, reply_text = ?, rationale_summary = ?, reply_summary = ?, redacted_at = ?
      WHERE id = ? AND action_type = 'admin.assist_chat' AND requested_by = ?`)
    .bind(
      ADMIN_ASSIST_RETENTION.redactionMarker,
      ADMIN_ASSIST_RETENTION.redactionMarker,
      summarizeConversationText(row.rationale_summary || row.rationale),
      summarizeConversationText(row.reply_summary || row.reply_text),
      redactedAt,
      id,
      email,
    ).run();
  return freeze({ redacted: true, id, redactedAt, auditRowRetained: true });
}

/**
 * Feedback (되먹임): what the model is allowed to be reminded of.
 *
 * Recall and feedback are not the same thing. `listOwnConversations` serves the
 * administrator, who may read their own words back. This serves the *model*, and
 * a past conversation placed into a model's context stops being a record and
 * starts reading like an instruction. The danger is specific: a request that was
 * refused, gated, or still awaiting a human could return through memory and be
 * treated as settled. Memory must not become a route around approval.
 *
 * So four limits, each narrowing a different way it could go wrong:
 *
 * 1. Summaries only. `rationale`/`reply_text` are never selected here — only
 *    `rationale_summary`/`reply_summary`. A summary has lost the grammar of an
 *    instruction: "자동발행을 켜달라고 요청함" is a record, not a command.
 * 2. An allow-list of completed, non-gated conversations. `decision_tier` must
 *    be one EKODI already treats as read-only or advisory, and `status` must be
 *    `verified`. An allow-list, not a deny-list, so a tier invented later is
 *    excluded until someone decides it belongs — and so a conversation that
 *    ended at `human_gate`, `blocked`, `awaiting_human` or `failed` never
 *    returns. Today no assist conversation reaches the gate (the area is
 *    observe-only); this is the filter that keeps that true if it ever does.
 * 3. Redacted conversations are excluded. The administrator's delete has to mean
 *    the words stop coming back — including coming back to the model.
 * 4. A hard cap on items and characters. Context on every call costs tokens
 *    linearly, and a free-tier platform cannot pay for a growing transcript.
 *
 * The in-flight conversation excludes itself without special-casing: its row is
 * inserted before the provider runs, so it is not yet `verified`.
 */
export const ADMIN_ASSIST_FEEDBACK = freeze({
  version: '1.0.0',
  maxItems: 3,
  maxChars: 600,
  perFieldChars: 200,
  allowedTiers: freeze(['observe', 'assist']),
  requiredStatus: 'verified',
  summariesOnly: true,
  readOnly: true,
});

export async function buildAssistRecall(db, options = {}) {
  const email = String(options.email ?? '').trim();
  if (!db || !email) return freeze({ items: freeze([]), reason: 'owner_required' });
  const requested = Math.trunc(Number(options.limit) || ADMIN_ASSIST_FEEDBACK.maxItems);
  const limit = Math.max(1, Math.min(ADMIN_ASSIST_FEEDBACK.maxItems, requested));
  await ensureAdminAssistColumns(db);
  const tiers = ADMIN_ASSIST_FEEDBACK.allowedTiers;
  const rows = await db.prepare(`SELECT created_at, rationale_summary, reply_summary
    FROM ai_agent_actions
    WHERE action_type = 'admin.assist_chat' AND requested_by = ?
      AND redacted_at IS NULL
      AND status = ?
      AND decision_tier IN (${tiers.map(() => '?').join(', ')})
    ORDER BY id DESC LIMIT ?`)
    .bind(email, ADMIN_ASSIST_FEEDBACK.requiredStatus, ...tiers, limit)
    .all();

  const cut = value => String(value ?? '').trim().slice(0, ADMIN_ASSIST_FEEDBACK.perFieldChars);
  const items = [];
  let chars = 0;
  // Oldest first: the model reads it as a sequence rather than a stack.
  for (const row of (rows?.results || []).slice().reverse()) {
    const asked = cut(row.rationale_summary);
    const answered = cut(row.reply_summary);
    if (!asked && !answered) continue;
    if (chars + asked.length + answered.length > ADMIN_ASSIST_FEEDBACK.maxChars) break;
    chars += asked.length + answered.length;
    items.push(freeze({ at: String(row.created_at || '').slice(0, 10), asked, answered }));
  }
  return freeze({
    items: freeze(items),
    readOnly: true,
    summariesOnly: true,
    chars,
  });
}
