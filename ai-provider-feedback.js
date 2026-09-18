const text = (value, max = 240) => String(value ?? '').trim().slice(0, max);

export async function ensureAiProviderFeedbackSchema(db) {
  if (!db?.prepare) return false;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_provider_feedback (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      adopted INTEGER,
      outcome_score REAL,
      source TEXT NOT NULL DEFAULT 'user_feedback',
      note TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_provider_feedback_provider_time ON ai_provider_feedback(provider_id, created_at DESC)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_provider_feedback_task ON ai_provider_feedback(task_id, created_at ASC)'),
  ]);
  return true;
}

export async function recordAiProviderFeedback(env = {}, event = {}) {
  if (!env.DB?.prepare) return Object.freeze({ recorded:false, reason:'feedback_store_unavailable' });
  await ensureAiProviderFeedbackSchema(env.DB);
  const taskId = text(event.taskId, 160);
  const providerId = text(event.providerId, 80).toLowerCase();
  if (!taskId || !providerId) throw new Error('feedback_task_and_provider_required');
  const adopted = typeof event.adopted === 'boolean' ? (event.adopted ? 1 : 0) : null;
  let outcomeScore = event.outcomeScore;
  if (outcomeScore === '' || outcomeScore === undefined || outcomeScore === null) outcomeScore = null;
  else {
    outcomeScore = Number(outcomeScore);
    if (!Number.isFinite(outcomeScore) || outcomeScore < 0 || outcomeScore > 1) throw new Error('feedback_outcome_score_invalid');
  }
  if (adopted === null && outcomeScore === null) throw new Error('feedback_signal_required');
  const createdAt = event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString();
  await env.DB.prepare(`INSERT INTO ai_provider_feedback
    (id,task_id,provider_id,adopted,outcome_score,source,note,created_by,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(
      text(event.id || crypto.randomUUID(), 120),
      taskId,
      providerId,
      adopted,
      outcomeScore,
      text(event.source || 'user_feedback', 60),
      text(event.note, 1200),
      text(event.createdBy, 200),
      createdAt,
    ).run();
  return Object.freeze({ recorded:true, taskId, providerId, adopted:adopted === null ? null : Boolean(adopted), outcomeScore, createdAt });
}

export async function getAiProviderFeedbackMetrics(env = {}, { since = '', limit = 1000 } = {}) {
  if (!env.DB?.prepare) return {};
  await ensureAiProviderFeedbackSchema(env.DB);
  const bounded = Math.max(1, Math.min(5000, Number(limit) || 1000));
  const rows = since
    ? await env.DB.prepare(`SELECT provider_id,adopted,outcome_score FROM ai_provider_feedback
        WHERE created_at>=? ORDER BY created_at DESC LIMIT ?`).bind(since, bounded).all()
    : await env.DB.prepare(`SELECT provider_id,adopted,outcome_score FROM ai_provider_feedback
        ORDER BY created_at DESC LIMIT ?`).bind(bounded).all();
  const metrics = {};
  for (const row of rows.results || []) {
    const id = text(row.provider_id, 80).toLowerCase();
    if (!id) continue;
    const metric = metrics[id] || (metrics[id] = { feedbackRuns:0, adoptionSignals:0, adoptedRuns:0, outcomeSignals:0, outcomeTotal:0, qualityScore:null });
    metric.feedbackRuns += 1;
    if (row.adopted !== null && row.adopted !== undefined) {
      metric.adoptionSignals += 1;
      if (Number(row.adopted) === 1) metric.adoptedRuns += 1;
    }
    if (row.outcome_score !== null && row.outcome_score !== undefined && Number.isFinite(Number(row.outcome_score))) {
      metric.outcomeSignals += 1;
      metric.outcomeTotal += Math.max(0, Math.min(1, Number(row.outcome_score)));
    }
  }
  for (const metric of Object.values(metrics)) {
    const parts = [];
    if (metric.adoptionSignals) parts.push(metric.adoptedRuns / metric.adoptionSignals);
    if (metric.outcomeSignals) parts.push(metric.outcomeTotal / metric.outcomeSignals);
    metric.qualityScore = parts.length ? parts.reduce((sum, value) => sum + value, 0) / parts.length : null;
    delete metric.outcomeTotal;
  }
  return metrics;
}
