export async function assertEvolutionSchema(db) {
  if (!db) throw new Error('Evolution Intelligence requires a database binding.');
  const rows = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('evolution_recommendations','evolution_evidence')`).all();
  const names = new Set((rows.results || []).map(row => row.name));
  if (!names.has('evolution_recommendations') || !names.has('evolution_evidence')) {
    throw new Error('Evolution Intelligence schema is not migrated. Run the guarded additive migration lane first.');
  }
}
export async function persistEvolutionReport(db, report = {}) {
  await assertEvolutionSchema(db);
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
  if (!recommendations.length) return { persisted: 0, evidence: 0 };
  const seenAt = report.generatedAt || new Date().toISOString();
  const upsertRecommendation = db.prepare(`INSERT INTO evolution_recommendations
    (id, type, title, target, score, priority, confidence, evidence_grade,
     status, approval_required, payload_json, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type, title=excluded.title, target=excluded.target,
      score=excluded.score, priority=excluded.priority, confidence=excluded.confidence,
      evidence_grade=excluded.evidence_grade, status=excluded.status,
      approval_required=excluded.approval_required, payload_json=excluded.payload_json,
      last_seen_at=excluded.last_seen_at`);

  const recommendationStatements = recommendations.map(item => upsertRecommendation.bind(
    item.id, item.type, item.title, item.target, Number(item.score || 0), item.priority,
    Number(item.confidence || 0), item.evidenceGrade || 'C', item.status || 'evidence_required',
    item.approval?.required ? 1 : 0, JSON.stringify(item), seenAt, seenAt
  ));
  await db.batch(recommendationStatements);

  const evidenceStatements = [];
  const upsertEvidence = db.prepare(`INSERT INTO evolution_evidence
    (recommendation_id, url, title, publisher, source_type, version, claim, verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(recommendation_id, url) DO UPDATE SET
      title=excluded.title, publisher=excluded.publisher, source_type=excluded.source_type,
      version=excluded.version, claim=excluded.claim, verified_at=excluded.verified_at`);
  for (const item of recommendations) {
    for (const source of item.references || []) {
      if (!source?.url) continue;
      evidenceStatements.push(upsertEvidence.bind(
        item.id,
        source.url,
        source.title || 'Untitled source',
        source.publisher || 'Unknown',
        source.type || 'independent_analysis',
        source.version || null,
        source.claim || '',
        source.verifiedAt || seenAt
      ));
    }
  }
  if (evidenceStatements.length) await db.batch(evidenceStatements);
  return { persisted: recommendationStatements.length, evidence: evidenceStatements.length };
}

export async function listEvolutionRecommendations(db, options = {}) {
  await assertEvolutionSchema(db);
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(options.limit) || 50)));
  const rows = await db.prepare(`SELECT payload_json, first_seen_at, last_seen_at
    FROM evolution_recommendations
    ORDER BY score DESC, last_seen_at DESC
    LIMIT ?`).bind(limit).all();
  return rows.results.map(row => {
    const payload = JSON.parse(row.payload_json);
    return { ...payload, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at };
  });
}
export async function evolutionStoreSummary(db) {
  await assertEvolutionSchema(db);
  const row = await db.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN priority = 'critical_strategic' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) AS high,
      SUM(CASE WHEN priority = 'recommend' THEN 1 ELSE 0 END) AS recommended,
      SUM(CASE WHEN priority = 'watch' THEN 1 ELSE 0 END) AS watch,
      SUM(CASE WHEN approval_required = 1 THEN 1 ELSE 0 END) AS approval_required,
      SUM(CASE WHEN status = 'evidence_required' THEN 1 ELSE 0 END) AS evidence_required,
      MAX(last_seen_at) AS last_seen_at
    FROM evolution_recommendations`).first();
  return {
    total: Number(row?.total || 0),
    critical: Number(row?.critical || 0),
    high: Number(row?.high || 0),
    recommended: Number(row?.recommended || 0),
    watch: Number(row?.watch || 0),
    approvalRequired: Number(row?.approval_required || 0),
    evidenceRequired: Number(row?.evidence_required || 0),
    lastSeenAt: row?.last_seen_at || null,
  };
}