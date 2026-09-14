export async function assertAutonomousEvolutionSchema(db) {
  if (!db) throw new Error('Autonomous Evolution Loop requires a database binding.');
  try {
    await db.batch([
      db.prepare('SELECT 1 FROM autonomous_evolution_cycles LIMIT 0'),
      db.prepare('SELECT 1 FROM autonomous_evolution_records LIMIT 0'),
    ]);
  } catch {
    throw new Error('Autonomous Evolution lifecycle schema is not migrated. Run the guarded additive migration lane first.');
  }
}

function cycleId(report = {}) {
  const generatedAt = String(report.generatedAt || new Date().toISOString());
  const source = String(report.source || 'platform');
  const seed = `${generatedAt}:${source}:${JSON.stringify(report.summary || {})}`;
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `aec_${(hash >>> 0).toString(36)}`;
}

function recordId(cycle, researchId, index) {
  const safeResearch = String(researchId || `record-${index}`).replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 90);
  return `${cycle}:${safeResearch}:${index}`;
}

export async function persistAutonomousEvolutionCycle(db, report = {}) {
  await assertAutonomousEvolutionSchema(db);
  if (report.productionMutationPerformed === true || report.authorityExpanded === true || report.automaticPromotionPerformed === true) {
    throw new Error('Autonomous Evolution lifecycle boundary violation: persistence refused.');
  }
  const id = cycleId(report);
  const generatedAt = report.generatedAt || new Date().toISOString();
  const summary = report.summary || {};
  const insertCycle = db.prepare(`INSERT INTO autonomous_evolution_cycles
    (id, generated_at, source, current_generation, lifecycle_total, research_verified,
     experiments_ready, experiments_passed, candidates_ready, post_change_verified,
     rollback_required, learning_closed, production_mutation, authority_expanded,
     automatic_promotion, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
    ON CONFLICT(id) DO UPDATE SET
      generated_at=excluded.generated_at,
      source=excluded.source,
      current_generation=excluded.current_generation,
      lifecycle_total=excluded.lifecycle_total,
      research_verified=excluded.research_verified,
      experiments_ready=excluded.experiments_ready,
      experiments_passed=excluded.experiments_passed,
      candidates_ready=excluded.candidates_ready,
      post_change_verified=excluded.post_change_verified,
      rollback_required=excluded.rollback_required,
      learning_closed=excluded.learning_closed,
      production_mutation=0,
      authority_expanded=0,
      automatic_promotion=0,
      payload_json=excluded.payload_json`)
    .bind(
      id,
      generatedAt,
      report.source || 'platform_evolution_intelligence',
      Number(report.currentGeneration || 10),
      Number(summary.total || 0),
      Number(summary.researchVerified || 0),
      Number(summary.experimentsReady || 0),
      Number(summary.experimentsPassed || 0),
      Number(summary.candidatesReady || 0),
      Number(summary.postChangeVerified || 0),
      Number(summary.rollbackRequired || 0),
      Number(summary.learningClosed || 0),
      JSON.stringify(report),
    );
  await insertCycle.run();

  const records = Array.isArray(report.records) ? report.records : [];
  if (records.length) {
    const insertRecord = db.prepare(`INSERT INTO autonomous_evolution_records
      (id, cycle_id, research_id, target, status, research_verified, experiment_ready,
       experiment_passed, candidate_ready, post_change_verified, rollback_required,
       learning_closed, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status,
        research_verified=excluded.research_verified,
        experiment_ready=excluded.experiment_ready,
        experiment_passed=excluded.experiment_passed,
        candidate_ready=excluded.candidate_ready,
        post_change_verified=excluded.post_change_verified,
        rollback_required=excluded.rollback_required,
        learning_closed=excluded.learning_closed,
        payload_json=excluded.payload_json`);
    const statements = records.map((record, index) => {
      const researchId = record?.research?.researchId || record?.candidate?.researchId || null;
      const target = record?.research?.target || record?.candidate?.target || 'platform';
      return insertRecord.bind(
        recordId(id, researchId, index),
        id,
        researchId,
        target,
        record?.status || 'unknown',
        record?.research?.verified ? 1 : 0,
        record?.experiment?.executableAutonomously ? 1 : 0,
        record?.experimentEvaluation?.passed ? 1 : 0,
        record?.candidate?.readyForSuperAdminReview ? 1 : 0,
        record?.verification?.verified ? 1 : 0,
        record?.verification?.rollbackRequired ? 1 : 0,
        record?.learning?.status === 'learning_loop_closed' ? 1 : 0,
        JSON.stringify(record),
        generatedAt,
      );
    });
    await db.batch(statements);
  }
  return { id, persistedRecords: records.length };
}

export async function listAutonomousEvolutionCycles(db, options = {}) {
  await assertAutonomousEvolutionSchema(db);
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(options.limit) || 20)));
  const rows = await db.prepare(`SELECT payload_json
    FROM autonomous_evolution_cycles
    ORDER BY generated_at DESC
    LIMIT ?`).bind(limit).all();
  return rows.results.map(row => JSON.parse(row.payload_json));
}

export async function autonomousEvolutionStoreSummary(db) {
  await assertAutonomousEvolutionSchema(db);
  const row = await db.prepare(`SELECT
      COUNT(*) AS cycles,
      SUM(lifecycle_total) AS lifecycle_total,
      SUM(research_verified) AS research_verified,
      SUM(experiments_ready) AS experiments_ready,
      SUM(experiments_passed) AS experiments_passed,
      SUM(candidates_ready) AS candidates_ready,
      SUM(post_change_verified) AS post_change_verified,
      SUM(rollback_required) AS rollback_required,
      SUM(learning_closed) AS learning_closed,
      MAX(generated_at) AS last_cycle_at
    FROM autonomous_evolution_cycles`).first();
  const active = await db.prepare(`SELECT
      COUNT(*) AS records,
      SUM(CASE WHEN status = 'evolution_candidate_ready_for_super_admin_review' THEN 1 ELSE 0 END) AS candidates_waiting,
      SUM(CASE WHEN status = 'rollback_required' THEN 1 ELSE 0 END) AS rollback_waiting
    FROM autonomous_evolution_records`).first();
  return {
    cycles: Number(row?.cycles || 0),
    lifecycleTotal: Number(row?.lifecycle_total || 0),
    researchVerified: Number(row?.research_verified || 0),
    experimentsReady: Number(row?.experiments_ready || 0),
    experimentsPassed: Number(row?.experiments_passed || 0),
    candidatesReady: Number(row?.candidates_ready || 0),
    postChangeVerified: Number(row?.post_change_verified || 0),
    rollbackRequired: Number(row?.rollback_required || 0),
    learningClosed: Number(row?.learning_closed || 0),
    records: Number(active?.records || 0),
    candidatesWaiting: Number(active?.candidates_waiting || 0),
    rollbackWaiting: Number(active?.rollback_waiting || 0),
    lastCycleAt: row?.last_cycle_at || null,
  };
}
