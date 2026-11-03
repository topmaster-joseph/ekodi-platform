const finite = n => typeof n === 'number' && Number.isFinite(n);
const bounded = n => Math.max(0, Math.min(1, n));
const required = (ok, why) => { if (!ok) throw new Error(`Invalid eval evidence: ${why}`); };

export function scoreTrajectory(golden, execution) {
  required(golden && typeof golden.id === 'string' && golden.id.length > 0, 'golden.id');
  required(execution && execution.caseId === golden.id, 'matching caseId');
  required(typeof execution.completed === 'boolean', 'explicit completed judgment');
  required(Array.isArray(execution.trajectory), 'trajectory array');
  required(Array.isArray(golden.expectedTools), 'expectedTools list');
  required(Number.isInteger(golden.maxSteps) && golden.maxSteps > 0, 'positive maxSteps');
  required(finite(golden.maxCostKrw) && golden.maxCostKrw >= 0, 'maxCostKrw');
  required(finite(golden.maxLatencyMs) && golden.maxLatencyMs > 0, 'maxLatencyMs');
  required(finite(execution.costKrw) && execution.costKrw >= 0, 'observed costKrw');
  required(finite(execution.latencyMs) && execution.latencyMs >= 0, 'observed latencyMs');
  required(Array.isArray(execution.safetyViolations), 'observed safetyViolations');
  required(Array.isArray(golden.allowedRoutes) && golden.allowedRoutes.length > 0, 'allowedRoutes');
  const used = execution.trajectory.filter(step => step?.type === 'tool').map(step => step.name);
  required(execution.trajectory.every(step => step && ['tool','model','decision','handoff','retry'].includes(step.type)), 'trajectory step type');
  const expected = golden.expectedTools;
  const routeMatch = golden.allowedRoutes.includes(execution.route);
  const goal = execution.completed && routeMatch ? 1 : 0;
  const toolMatch = expected.length === used.length && expected.every((x, i) => x === used[i]) ? 1 : 0;
  const wasted = Math.max(0, execution.trajectory.length - golden.maxSteps);
  const efficiency = bounded(1 - wasted / golden.maxSteps);
  const cost = execution.costKrw <= golden.maxCostKrw ? 1 : 0;
  const latency = execution.latencyMs <= golden.maxLatencyMs ? 1 : 0;
  const safety = execution.safetyViolations.length === 0 ? 1 : 0;
  return Object.freeze({caseId:golden.id, goal, tools:toolMatch, efficiency, cost, latency, safety,
    costKrw:execution.costKrw, latencyMs:execution.latencyMs, violations:execution.safetyViolations.length,
    route:execution.route, steps:execution.trajectory.length});
}
export function summarize(scored) {
  required(Array.isArray(scored) && scored.length > 0, 'scored runs');
  const dimensions=['goal','tools','efficiency','cost','latency','safety'];
  const metrics=Object.fromEntries(dimensions.map(k=>[k,scored.reduce((s,row)=>s+row[k],0)/scored.length]));
  return {runs:scored.length, cases:new Set(scored.map(x=>x.caseId)).size, metrics,
    averageCostKrw:scored.reduce((s,x)=>s+x.costKrw,0)/scored.length,
    averageLatencyMs:scored.reduce((s,x)=>s+x.latencyMs,0)/scored.length,
    safetyViolations:scored.reduce((s,x)=>s+x.violations,0)};
}
