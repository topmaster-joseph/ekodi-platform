export async function assertCapabilityEcosystemSchema(db) {
  if (!db) throw new Error('EKODI Capability Ecosystem requires a database binding.');
  try {
    await db.batch([
      db.prepare('SELECT 1 FROM capability_experiences LIMIT 0'),
      db.prepare('SELECT 1 FROM capability_automation_candidates LIMIT 0'),
    ]);
  } catch {
    throw new Error('EKODI Capability Ecosystem schema is not migrated. Run the guarded additive migration lane first.');
  }
}

export async function appendCapabilityExperience(db, record = {}) {
  await assertCapabilityEcosystemSchema(db);
  const statement = db.prepare(`INSERT OR IGNORE INTO capability_experiences
    (id, task_id, pattern_key, goal_fingerprint, source, risk, capability_ids_json,
     result_state, verified, cost_class, duration_ms, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  await statement.bind(
    record.id,
    record.taskId || null,
    record.patternKey,
    record.goalFingerprint,
    record.source || 'ekodi-core',
    record.risk || 'normal',
    JSON.stringify(record.capabilityIds || []),
    record.resultState || 'unknown',
    record.verified ? 1 : 0,
    record.costClass || 'unknown',
    Number(record.durationMs || 0),
    record.occurredAt || new Date().toISOString(),
  ).run();
  return record;
}
function experienceFromRow(row = {}) {
  return Object.freeze({
    id: row.id,
    taskId: row.task_id || null,
    patternKey: row.pattern_key,
    goalFingerprint: row.goal_fingerprint,
    source: row.source,
    risk: row.risk,
    capabilityIds: Object.freeze(JSON.parse(row.capability_ids_json || '[]')),
    resultState: row.result_state,
    verified: Number(row.verified || 0) === 1,
    costClass: row.cost_class,
    durationMs: Number(row.duration_ms || 0),
    occurredAt: row.occurred_at,
  });
}

export async function listCapabilityExperiences(db, options = {}) {
  await assertCapabilityEcosystemSchema(db);
  const limit = Math.max(1, Math.min(1000, Math.trunc(Number(options.limit) || 500)));
  const rows = await db.prepare(`SELECT id, task_id, pattern_key, goal_fingerprint, source,
      risk, capability_ids_json, result_state, verified, cost_class, duration_ms, occurred_at
    FROM capability_experiences
    ORDER BY occurred_at DESC
    LIMIT ?`).bind(limit).all();
  return Object.freeze((rows.results || []).map(experienceFromRow));
}
export async function upsertAutomationCandidates(db, candidates = [], generatedAt = new Date().toISOString()) {
  await assertCapabilityEcosystemSchema(db);
  const source = Array.isArray(candidates) ? candidates : [];
  if (!source.length) return { persisted: 0 };
  const statement = db.prepare(`INSERT INTO capability_automation_candidates
    (id, pattern_key, status, occurrence_count, success_rate, risk, spec_json, evaluation_json, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pattern_key=excluded.pattern_key, status=excluded.status,
      occurrence_count=excluded.occurrence_count, success_rate=excluded.success_rate,
      risk=excluded.risk, spec_json=excluded.spec_json,
      evaluation_json=excluded.evaluation_json, last_seen_at=excluded.last_seen_at`);
  const statements = source.map(candidate => statement.bind(
    candidate.id,
    candidate.patternKey,
    candidate.state || 'candidate',
    Number(candidate.evidence?.occurrences || 0),
    Number(candidate.evidence?.observedSuccessRate || 0),
    candidate.risk || 'normal',
    JSON.stringify(candidate),
    candidate.evaluation ? JSON.stringify(candidate.evaluation) : null,
    generatedAt,
    generatedAt,
  ));
  await db.batch(statements);
  return { persisted: statements.length };
}
export async function listAutomationCandidates(db, options = {}) {
  await assertCapabilityEcosystemSchema(db);
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(options.limit) || 100)));
  const rows = await db.prepare(`SELECT spec_json, evaluation_json, status, first_seen_at, last_seen_at
    FROM capability_automation_candidates
    ORDER BY occurrence_count DESC, last_seen_at DESC
    LIMIT ?`).bind(limit).all();
  return Object.freeze((rows.results || []).map(row => {
    const spec = JSON.parse(row.spec_json || '{}');
    const evaluation = row.evaluation_json ? JSON.parse(row.evaluation_json) : null;
    return Object.freeze({
      ...spec,
      state: row.status || spec.state || 'candidate',
      evaluation,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    });
  }));
}

export async function capabilityEcosystemStoreSummary(db) {
  await assertCapabilityEcosystemSchema(db);
  const [experience, candidates] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END) AS verified,
      COUNT(DISTINCT pattern_key) AS patterns, MAX(occurred_at) AS last_seen_at FROM capability_experiences`).first(),
    db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) AS quarantined,
      MAX(last_seen_at) AS last_seen_at FROM capability_automation_candidates`).first(),
  ]);
  return Object.freeze({
    experiences: Object.freeze({
      total: Number(experience?.total || 0),
      verified: Number(experience?.verified || 0),
      patterns: Number(experience?.patterns || 0),
      lastSeenAt: experience?.last_seen_at || null,
    }),
    candidates: Object.freeze({
      total: Number(candidates?.total || 0),
      verified: Number(candidates?.verified || 0),
      quarantined: Number(candidates?.quarantined || 0),
      lastSeenAt: candidates?.last_seen_at || null,
    }),
  });
}
