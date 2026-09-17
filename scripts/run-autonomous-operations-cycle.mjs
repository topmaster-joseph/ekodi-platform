import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FAIL = new Set(['failure', 'timed_out']);
const SAFE = new Set(['.github/workflows/monitor.yml', '.github/workflows/ekodi-ai-orchestration-gate.yml']);
const HOUR = 60 * 60 * 1000;
const WINDOW = 24 * HOUR;

const wpath = r => String(r.workflowPath || r.path || '').trim();
const wkey = r => wpath(r) || String(r.workflowName || r.name || 'unknown-workflow');
const rid = r => Number(r.databaseId || r.id || 0);
const attempt = r => Math.max(1, Number(r.runAttempt || r.run_attempt || 1) || 1);
const created = r => Date.parse(String(r.createdAt || r.created_at || '')) || 0;
const done = r => String(r.status || '').toLowerCase() === 'completed';
const failure = r => done(r) && FAIL.has(String(r.conclusion || '').toLowerCase());
const success = r => done(r) && String(r.conclusion || '').toLowerCase() === 'success';
const recent = (r, now, ms = WINDOW) => created(r) > 0 && now - created(r) >= 0 && now - created(r) <= ms;
const latest = (runs, key) => [...runs].filter(r => wkey(r) === key).sort((a, b) => created(b) - created(a))[0] || null;

function safeRetry(r, runs, now) {
  if (!failure(r) || String(r.event || '').toLowerCase() !== 'schedule' || !SAFE.has(wpath(r)) || attempt(r) !== 1 || !recent(r, now, 6 * HOUR)) return false;
  return !runs.some(x => wkey(x) === wkey(r) && success(x) && created(x) > created(r));
}

function recoveryLearning(runs, now) {
  const scope = runs.filter(r => recent(r, now));
  const reruns = scope.filter(r => SAFE.has(wpath(r)) && attempt(r) > 1 && done(r));
  const ok = reruns.filter(success).length;
  const bad = reruns.filter(failure).length;
  const recoveredPatterns = [];
  for (const key of new Set(scope.map(wkey))) {
    const group = scope.filter(r => wkey(r) === key);
    const last = latest(group, key);
    if (last && success(last) && group.some(failure)) recoveredPatterns.push({
      workflowName: String(last.workflowName || last.name || key),
      workflowPath: wpath(last),
      latestRunId: rid(last),
      latestUrl: String(last.url || last.html_url || ''),
      status: 'verified-recovered-from-recent-failure',
    });
  }
  return {
    windowHours: 24,
    boundedRecoveryAttempts24h: ok + bad,
    boundedRecoverySuccesses24h: ok,
    boundedRecoveryFailures24h: bad,
    boundedRecoveryEffectiveness: ok + bad ? Number((ok / (ok + bad)).toFixed(3)) : null,
    recoveredPatterns,
  };
}

function evolutionLearning(e = {}) {
  const s = e.summary || {};
  return {
    currentGeneration: Number(e.currentGeneration || 10),
    lifecycleRecords: Number(s.total || 0),
    researchVerified: Number(s.researchVerified || 0),
    operationalResolutionsVerified: Number(s.operationalResolutionsVerified || 0),
    experimentsReady: Number(s.experimentsReady || 0),
    experimentsPassed: Number(s.experimentsPassed || 0),
    candidatesReadyForSuperAdminReview: Number(s.candidatesReady || 0),
    postChangeVerified: Number(s.postChangeVerified || 0),
    rollbackRequired: Number(s.rollbackRequired || 0),
    learningLoopsClosed: Number(s.learningClosed || 0),
    automaticPromotionPerformed: false,
    authorityExpanded: false,
  };
}

function normalizeFabric(policy = {}) {
  const fabric = policy.parallelExecutionFabric || {};
  const methods = Array.isArray(fabric.methods)
    ? fabric.methods
        .filter(method => method && method.id && method.class)
        .map(method => ({
          id: String(method.id),
          class: String(method.class),
          availability: String(method.availability || 'conditional'),
          roles: Array.isArray(method.roles) ? method.roles.map(String) : [],
          requires: Array.isArray(method.requires) ? method.requires.map(String) : [],
          mutationBoundary: String(method.mutationBoundary || 'isolated-task-boundary-only'),
        }))
    : [];
  const minimumReadyLanes = Math.max(1, Number(fabric.minimumReadyLanes || 2) || 2);
  const preferredLanes = Math.max(minimumReadyLanes, Number(fabric.preferredLanes || 4) || 4);
  return {
    fabricId: String(fabric.fabricId || 'EKODI-PARALLEL-EXECUTION-FABRIC-001'),
    generation: Number(fabric.generation || 10),
    orchestrator: String(fabric.orchestrator || 'ekodi-orchestrator'),
    strategy: String(fabric.strategy || 'parallel-fan-out-independent-verify-converge'),
    minimumReadyLanes,
    preferredLanes,
    methods,
    selection: fabric.selection || {},
    convergence: fabric.convergence || {},
  };
}

function selectParallelLanes(fabric) {
  const ready = fabric.methods.filter(method => method.availability === 'ready');
  const conditional = fabric.methods.filter(method => method.availability !== 'ready');
  const selected = [];
  const classes = new Set();
  const add = method => {
    if (!method || selected.some(item => item.id === method.id)) return;
    selected.push(method);
    classes.add(method.class);
  };

  for (const method of ready) {
    if (selected.length >= fabric.preferredLanes) break;
    if (fabric.selection.diversifyMethodClasses !== false && classes.has(method.class)) continue;
    add(method);
  }
  for (const method of ready) {
    if (selected.length >= fabric.preferredLanes) break;
    add(method);
  }
  for (const method of conditional) {
    if (selected.length >= fabric.preferredLanes) break;
    if (fabric.selection.diversifyMethodClasses !== false && classes.has(method.class)) continue;
    add(method);
  }
  for (const method of conditional) {
    if (selected.length >= fabric.preferredLanes) break;
    add(method);
  }
  return selected;
}

function buildParallelExecution(attention, policy = {}) {
  const fabric = normalizeFabric(policy);
  const selected = selectParallelLanes(fabric);
  const readyMethodCount = fabric.methods.filter(method => method.availability === 'ready').length;
  const conditionalMethodCount = fabric.methods.length - readyMethodCount;
  const assignments = attention.map(task => {
    const lanes = selected.map((method, index) => ({
      laneId: `${task.taskKey}:lane-${index + 1}`,
      executorMethod: method.id,
      methodClass: method.class,
      availability: method.availability,
      state: method.availability === 'ready' ? 'ready-for-delegated-execution' : 'join-when-capability-available',
      primaryRole: method.roles[0] || 'independent-verification',
      roles: method.roles,
      requires: method.requires,
      mutationBoundary: method.mutationBoundary,
      delegated: true,
      authorityExpanded: false,
      directProductionMutation: false,
      maySelfPromote: false,
    }));
    const readyLanes = lanes.filter(lane => lane.availability === 'ready').length;
    return {
      taskKey: task.taskKey,
      workflowName: task.workflowName,
      workflowPath: task.workflowPath,
      orchestrationOwner: fabric.orchestrator,
      strategy: fabric.strategy,
      virtualizationOnly: false,
      readyLanes,
      conditionalLanes: lanes.length - readyLanes,
      minimumReadyLanes: fabric.minimumReadyLanes,
      executionState: readyLanes >= fabric.minimumReadyLanes ? 'parallel-ready' : 'degraded-insufficient-ready-lanes',
      lanes,
      convergence: {
        minimumIndependentEvidenceSources: Math.max(2, Number(fabric.convergence.minimumIndependentEvidenceSources || 2) || 2),
        requireIndependentVerification: fabric.convergence.requireIndependentVerification !== false,
        disagreementPolicy: String(fabric.convergence.disagreementPolicy || 'hold-convergence-and-collect-more-evidence'),
        failedLanePolicy: String(fabric.convergence.failedLanePolicy || 'continue-other-lanes-when-safe-and-record-degraded-capacity'),
        productionPromotion: String(fabric.convergence.productionPromotion || 'central-release-gate-only'),
      },
    };
  });

  return {
    enabled: fabric.methods.length > 0,
    fabricId: fabric.fabricId,
    generation: fabric.generation,
    orchestrator: fabric.orchestrator,
    strategy: fabric.strategy,
    virtualizationOnly: false,
    methodCount: fabric.methods.length,
    readyMethodCount,
    conditionalMethodCount,
    minimumReadyLanes: fabric.minimumReadyLanes,
    preferredLanes: fabric.preferredLanes,
    assignments,
    authority: {
      executorMayExpandAuthority: false,
      executorMayMutateProductionDirectly: false,
      executorMaySelfPromote: false,
      centralReleaseGateRequired: true,
    },
  };
}

export function buildAutonomousOperationsPlan(runs = [], policy = {}, now = new Date(), evolution = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('Invalid autonomous operations clock');
  runs = Array.isArray(runs) ? runs : [];
  const safeRetries = runs.filter(r => safeRetry(r, runs, nowMs)).map(r => ({
    runId: rid(r),
    workflowName: String(r.workflowName || r.name || 'unknown-workflow'),
    workflowPath: wpath(r),
    runAttempt: attempt(r),
    createdAt: String(r.createdAt || r.created_at || ''),
    url: String(r.url || r.html_url || ''),
    action: 'rerun-failed-jobs-once',
    reversible: true,
    delegated: true,
  }));
  const scope = runs.filter(r => recent(r, nowMs));
  const failures = scope.filter(failure);
  const groups = new Map();
  for (const r of failures) {
    const key = wkey(r);
    const g = groups.get(key) || { key, workflowName: String(r.workflowName || r.name || key), workflowPath: wpath(r), failures: [] };
    g.failures.push(r);
    groups.set(key, g);
  }
  const attention = [...groups.values()]
    .filter(g => g.failures.length >= 3 && failure(latest(scope, g.key) || {}))
    .map(g => ({
      taskKey: `autonomous-repair:${g.key}`,
      workflowName: g.workflowName,
      workflowPath: g.workflowPath,
      failureCount24h: g.failures.length,
      latestUrl: String(g.failures.sort((a, b) => created(b) - created(a))[0]?.url || ''),
      reason: SAFE.has(g.workflowPath) ? 'persistent-failure-after-bounded-self-recovery' : 'persistent-failure-outside-delegated-auto-retry-allowlist',
      ownerDecisionRequired: false,
      autonomousEngineeringWorkerRequired: true,
      isolatedEngineeringHandoffRequired: true,
      parallelExecutionRequired: true,
      executionCoordinationOwner: 'ekodi-orchestrator',
    }))
    .sort((a, b) => b.failureCount24h - a.failureCount24h || a.workflowName.localeCompare(b.workflowName));
  const recovery = recoveryLearning(runs, nowMs);
  const evo = evolutionLearning(evolution);
  const parallelExecution = buildParallelExecution(attention, policy);
  return {
    generatedAt: new Date(nowMs).toISOString(),
    policyId: String(policy.policyId || 'EKODI-AUTONOMY-001'),
    mode: 'internal-evolutionary-autonomous-operations-within-delegated-authority',
    triggerOwner: 'ekodi-internal-scheduler',
    chatgptTriggerRequired: false,
    cycle: ['observe','detect','reason','plan','execute','verify','recover','learn'],
    safeRetries,
    attention,
    parallelExecution,
    learning: {
      recovery,
      evolution: evo,
      nextCycleUsesObservedOutcomes: true,
      staleFailureRetrySuppressedAfterVerifiedRecovery: true,
      persistentAttentionClearsAfterVerifiedRecovery: true,
    },
    counts: {
      sampledRuns: runs.length,
      failedRuns24h: failures.length,
      safeRetries: safeRetries.length,
      attention: attention.length,
      recoveredPatterns24h: recovery.recoveredPatterns.length,
      learningLoopsClosed: evo.learningLoopsClosed,
      parallelExecutionAssignments: parallelExecution.assignments.length,
      readyExecutionMethods: parallelExecution.readyMethodCount,
      conditionalExecutionMethods: parallelExecution.conditionalMethodCount,
    },
    authority: {
      expanded: false,
      directProductionMutation: false,
      automaticPromotion: false,
      constitutionBypassed: false,
      ownerGatesPreserved: true,
      executionCoordinationOwner: parallelExecution.orchestrator,
    },
  };
}

export function renderAutonomousOperationsSummary(p = {}) {
  const r = p.learning?.recovery || {};
  const e = p.learning?.evolution || {};
  const fabric = p.parallelExecution || {};
  const lines = [
    '## EKODI Internal Evolutionary Autonomous Operations',
    '',
    `- Mode: **${p.mode || 'unknown'}**`,
    `- Trigger: **${p.triggerOwner || 'unknown'}**`,
    `- ChatGPT trigger required: **${p.chatgptTriggerRequired ? 'YES' : 'NO'}**`,
    `- Safe bounded retries planned: **${Number(p.counts?.safeRetries || 0)}**`,
    `- Verified recovered patterns / 24h: **${Number(p.counts?.recoveredPatterns24h || 0)}**`,
    `- Persistent autonomous engineering attention: **${Number(p.counts?.attention || 0)}**`,
    `- Evolution learning loops closed: **${Number(e.learningLoopsClosed || 0)}**`,
    `- Parallel execution fabric: **${fabric.enabled ? 'ENABLED' : 'NOT CONFIGURED'}**`,
    `- Execution coordination owner: **${fabric.orchestrator || 'ekodi-orchestrator'}**`,
    `- Ready / conditional execution methods: **${Number(fabric.readyMethodCount || 0)} / ${Number(fabric.conditionalMethodCount || 0)}**`,
    '- Virtualization-only architecture: **NO**',
    '- Authority expansion: **NO**',
    '- Direct production mutation from scheduler: **NO**',
    '- Automatic promotion: **NO**',
    '',
  ];
  if (p.safeRetries?.length) {
    lines.push('### Bounded self-recovery', ...p.safeRetries.map(x => `- retry once: \`${x.workflowName}\` · run ${x.runId}`), '');
  }
  if (r.recoveredPatterns?.length) {
    lines.push('### Verified recovery learning', ...r.recoveredPatterns.slice(0,20).map(x => `- \`${x.workflowName}\`: ${x.status}`), '');
  }
  if (p.attention?.length) {
    lines.push('### Persistent attention', ...p.attention.slice(0,20).map(x => `- \`${x.workflowName}\`: ${x.failureCount24h} failures / 24h · ${x.reason}`), '');
  }
  if (fabric.assignments?.length) {
    lines.push(
      '### Orchestrated parallel execution',
      ...fabric.assignments.slice(0,20).map(assignment => {
        const active = assignment.lanes.filter(lane => lane.availability === 'ready').map(lane => lane.executorMethod).join(', ') || 'none';
        const conditional = assignment.lanes.filter(lane => lane.availability !== 'ready').map(lane => lane.executorMethod).join(', ') || 'none';
        return `- \`${assignment.workflowName}\`: ${assignment.executionState} · ready=[${active}] · conditional=[${conditional}]`;
      }),
      '',
    );
  }
  if (!p.safeRetries?.length && !p.attention?.length) lines.push('No delegated recovery action or persistent attention item is required in the sampled evidence.');
  if (r.boundedRecoveryEffectiveness != null) lines.push('', `Bounded recovery effectiveness / 24h: **${Math.round(Number(r.boundedRecoveryEffectiveness) * 100)}%**.`);
  return `${lines.join('\n')}\n`;
}

function args(argv) {
  const a = { runs:'', policy:'', evolution:'', output:'', summary:'' };
  for (let i=0;i<argv.length;i++) {
    if (argv[i]==='--runs') a.runs=argv[++i]||'';
    else if (argv[i]==='--policy') a.policy=argv[++i]||'';
    else if (argv[i]==='--evolution') a.evolution=argv[++i]||'';
    else if (argv[i]==='--output') a.output=argv[++i]||'';
    else if (argv[i]==='--summary') a.summary=argv[++i]||'';
  }
  return a;
}
const read = async f => f ? JSON.parse(await fs.readFile(path.resolve(f),'utf8')) : {};
async function main() {
  const a=args(process.argv.slice(2));
  if(!a.runs) throw new Error('Missing --runs');
  const plan=buildAutonomousOperationsPlan(await read(a.runs),await read(a.policy),new Date(),await read(a.evolution));
  const summary=renderAutonomousOperationsSummary(plan);
  if(a.output) await fs.writeFile(path.resolve(a.output),`${JSON.stringify(plan,null,2)}\n`);
  if(a.summary) await fs.writeFile(path.resolve(a.summary),summary);
  process.stdout.write(summary);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(e => { console.error(e?.stack || String(e)); process.exitCode=1; });
