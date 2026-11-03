// EKODI Eval Lab — operational baseline from canonical Production ledgers (read-only, aggregate-only).
// Source of truth: Cloudflare D1 `ekodi-auth` tables `ai_provider_routing_events`, `ekodi_orchestrator_tasks`.
// No prompts, user ids or payloads are read; only counts. Zero external AI calls.

export const OPS_BASELINE_SQL = Object.freeze({
  providerReliability: `SELECT provider_id,
      SUM(event_type IN ('attempt','fallback-attempt')) AS tries,
      SUM(event_type='selected') AS ok,
      SUM(event_type='attempt-failed') AS failed
    FROM ai_provider_routing_events
    WHERE capability = ?1 AND created_at >= ?2
    GROUP BY provider_id HAVING tries > 0`,
  routingDaily: `SELECT substr(created_at,1,10) AS day,
      SUM(event_type='selected') AS ok,
      SUM(event_type IN ('attempt','fallback-attempt')) AS tries
    FROM ai_provider_routing_events WHERE created_at >= ?1 GROUP BY 1 ORDER BY 1`,
  orchestratorStates: `SELECT state,
      SUM(created_at <  datetime('now','-7 days')) AS older7d,
      SUM(created_at >= datetime('now','-7 days')) AS last7d
    FROM ekodi_orchestrator_tasks GROUP BY state`,
});

// Wilson score interval: honest uncertainty for small or skewed samples.
export function wilson(successes, total, z = 1.959964) {
  if (!Number.isInteger(successes) || !Number.isInteger(total) || total <= 0 || successes < 0 || successes > total) {
    return { estimate: null, lower: null, upper: null, n: total || 0 };
  }
  const p = successes / total, z2 = z * z, d = 1 + z2 / total;
  const c = p + z2 / (2 * total), m = z * Math.sqrt(p * (1 - p) / total + z2 / (4 * total * total));
  return { estimate: p, lower: (c - m) / d, upper: (c + m) / d, n: total };
}

export function providerReliability(rows) {
  if (!Array.isArray(rows)) throw new Error('rows required');
  return rows
    .map(r => ({ provider: String(r.provider_id), ...wilson(Number(r.ok), Number(r.tries)), failed: Number(r.failed) || 0 }))
    .filter(r => r.estimate !== null)
    .sort((a, b) => b.lower - a.lower); // rank by lower bound, not by lucky point estimates
}

// Orchestrator outcome health. "assigned" tasks older than 7 days without a lease are treated as orphaned.
export function orchestratorHealth(rows) {
  if (!Array.isArray(rows)) throw new Error('rows required');
  const by = Object.fromEntries(rows.map(r => [r.state, { older7d: Number(r.older7d) || 0, last7d: Number(r.last7d) || 0 }]));
  const sum = (s, k) => by[s]?.[k] || 0;
  const terminalOrOpen = ['completed', 'assigned', 'blocked', 'failed', 'cancelled', 'executing', 'validating', 'pr_gates', 'staging', 'deploying', 'production_verifying', 'received', 'triaged'];
  const last7Total = terminalOrOpen.reduce((t, s) => t + sum(s, 'last7d'), 0);
  const allTotal = terminalOrOpen.reduce((t, s) => t + sum(s, 'last7d') + sum(s, 'older7d'), 0);
  return {
    completionLast7d: wilson(sum('completed', 'last7d'), last7Total),
    completionAllTime: wilson(sum('completed', 'last7d') + sum('completed', 'older7d'), allTotal),
    orphanedAssigned: sum('assigned', 'older7d'),
    openAssignedLast7d: sum('assigned', 'last7d'),
    total: allTotal,
  };
}

// Release gate for ops health: fail closed on unknowns, block on clear degradation versus a frozen baseline.
export function opsGate(baseline, candidate, { margin = 0.02 } = {}) {
  const blocks = [];
  for (const key of ['completionLast7d']) {
    const b = baseline?.[key], c = candidate?.[key];
    if (!b || !c || b.estimate == null || c.estimate == null) { blocks.push(`${key}: 확인필요(측정값 없음)`); continue; }
    if (c.upper < b.lower - margin) blocks.push(`${key}: 유의한 하락`);
  }
  if ((candidate?.orphanedAssigned ?? Infinity) > (baseline?.orphanedAssigned ?? -1)) blocks.push('orphanedAssigned: 증가');
  return { pass: blocks.length === 0, blocks };
}
