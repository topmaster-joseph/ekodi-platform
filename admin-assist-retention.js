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
