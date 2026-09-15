import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out']);
const SAFE_RETRY_WORKFLOW_PATHS = new Set([
  '.github/workflows/monitor.yml',
  '.github/workflows/ekodi-ai-orchestration-gate.yml',
]);
const MAX_SAFE_RETRY_AGE_MS = 6 * 60 * 60 * 1000;
const ATTENTION_WINDOW_MS = 24 * 60 * 60 * 1000;
const PERSISTENT_FAILURE_THRESHOLD = 3;

function workflowPath(run = {}) {
  return String(run.workflowPath || run.path || '').trim();
}

function runId(run = {}) {
  return Number(run.databaseId || run.id || 0);
}

function runAttempt(run = {}) {
  const value = Number(run.runAttempt || run.run_attempt || 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function createdAtMs(run = {}) {
  const value = Date.parse(String(run.createdAt || run.created_at || ''));
  return Number.isFinite(value) ? value : 0;
}

function isFailure(run = {}) {
  return String(run.status || '').toLowerCase() === 'completed'
    && FAILURE_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase());
}

function isDelegatedSafeRetry(run = {}, nowMs = Date.now()) {
  if (!isFailure(run)) return false;
  if (String(run.event || '').toLowerCase() !== 'schedule') return false;
  if (!SAFE_RETRY_WORKFLOW_PATHS.has(workflowPath(run))) return false;
  if (runAttempt(run) !== 1) return false;
  const created = createdAtMs(run);
  return created > 0 && nowMs - created >= 0 && nowMs - created <= MAX_SAFE_RETRY_AGE_MS;
}

export function buildAutonomousOperationsPlan(runs = [], policy = {}, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('Invalid autonomous operations clock');

  const safeRetries = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!isDelegatedSafeRetry(run, nowMs)) continue;
    safeRetries.push({
      runId: runId(run),
      workflowName: String(run.workflowName || run.name || 'unknown-workflow'),
      workflowPath: workflowPath(run),
      runAttempt: runAttempt(run),
      createdAt: String(run.createdAt || run.created_at || ''),
      url: String(run.url || run.html_url || ''),
      action: 'rerun-failed-jobs-once',
      reversible: true,
      delegated: true,
    });
  }

  const recentFailures = (Array.isArray(runs) ? runs : [])
    .filter(isFailure)
    .filter((run) => {
      const created = createdAtMs(run);
      return created > 0 && nowMs - created >= 0 && nowMs - created <= ATTENTION_WINDOW_MS;
    });

  const grouped = new Map();
  for (const run of recentFailures) {
    const key = workflowPath(run) || String(run.workflowName || run.name || 'unknown-workflow');
    const group = grouped.get(key) || { key, workflowName: String(run.workflowName || run.name || key), workflowPath: workflowPath(run), failures: [] };
    group.failures.push(run);
    grouped.set(key, group);
  }

  const attention = [...grouped.values()]
    .filter(group => group.failures.length >= PERSISTENT_FAILURE_THRESHOLD)
    .map(group => ({
      workflowName: group.workflowName,
      workflowPath: group.workflowPath,
      failureCount24h: group.failures.length,
      latestUrl: String(group.failures.sort((a, b) => createdAtMs(b) - createdAtMs(a))[0]?.url || ''),
      reason: SAFE_RETRY_WORKFLOW_PATHS.has(group.workflowPath)
        ? 'persistent-failure-after-bounded-self-recovery'
        : 'persistent-failure-outside-delegated-auto-retry-allowlist',
      ownerDecisionRequired: false,
      autonomousEngineeringWorkerRequired: true,
    }))
    .sort((a, b) => b.failureCount24h - a.failureCount24h || a.workflowName.localeCompare(b.workflowName));

  const policyId = String(policy.policyId || 'EKODI-AUTONOMY-001');
  return {
    generatedAt: new Date(nowMs).toISOString(),
    policyId,
    mode: 'internal-autonomous-operations-within-delegated-authority',
    triggerOwner: 'ekodi-internal-scheduler',
    chatgptTriggerRequired: false,
    safeRetries,
    attention,
    counts: {
      sampledRuns: Array.isArray(runs) ? runs.length : 0,
      failedRuns24h: recentFailures.length,
      safeRetries: safeRetries.length,
      attention: attention.length,
    },
    authority: {
      expanded: false,
      directProductionMutation: false,
      constitutionBypassed: false,
      ownerGatesPreserved: true,
    },
  };
}

export function renderAutonomousOperationsSummary(plan = {}) {
  const lines = [
    '## EKODI Internal Autonomous Operations',
    '',
    `- Mode: **${plan.mode || 'unknown'}**`,
    `- Trigger: **${plan.triggerOwner || 'unknown'}**`,
    `- ChatGPT trigger required: **${plan.chatgptTriggerRequired ? 'YES' : 'NO'}**`,
    `- Safe bounded retries planned: **${Number(plan.counts?.safeRetries || 0)}**`,
    `- Persistent items requiring autonomous engineering attention: **${Number(plan.counts?.attention || 0)}**`,
    '- Authority expansion: **NO**',
    '- Direct production mutation from scheduler: **NO**',
    '',
  ];

  if (Array.isArray(plan.safeRetries) && plan.safeRetries.length) {
    lines.push('### Bounded self-recovery');
    for (const item of plan.safeRetries) {
      lines.push(`- retry once: \`${item.workflowName}\` · run ${item.runId}`);
    }
    lines.push('');
  }

  if (Array.isArray(plan.attention) && plan.attention.length) {
    lines.push('### Persistent attention');
    for (const item of plan.attention.slice(0, 20)) {
      lines.push(`- \`${item.workflowName}\`: ${item.failureCount24h} failures / 24h · ${item.reason}`);
    }
    lines.push('');
  }

  if (!Number(plan.counts?.safeRetries || 0) && !Number(plan.counts?.attention || 0)) {
    lines.push('No delegated recovery action or persistent attention item is required in the sampled evidence.');
  }

  return `${lines.join('\n')}\n`;
}

function parseArgs(argv = []) {
  const args = { runs: '', policy: '', output: '', summary: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--runs') args.runs = argv[++index] || '';
    else if (token === '--policy') args.policy = argv[++index] || '';
    else if (token === '--output') args.output = argv[++index] || '';
    else if (token === '--summary') args.summary = argv[++index] || '';
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.runs) throw new Error('Usage: node scripts/run-autonomous-operations-cycle.mjs --runs <workflow-runs.json> [--policy config/autonomous-operations-policy.json] [--output report.json] [--summary summary.md]');
  const runs = JSON.parse(await fs.readFile(path.resolve(args.runs), 'utf8'));
  const policy = args.policy ? JSON.parse(await fs.readFile(path.resolve(args.policy), 'utf8')) : {};
  const plan = buildAutonomousOperationsPlan(runs, policy);
  const summary = renderAutonomousOperationsSummary(plan);
  if (args.output) await fs.writeFile(path.resolve(args.output), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  if (args.summary) await fs.writeFile(path.resolve(args.summary), summary, 'utf8');
  process.stdout.write(summary);
}

const executedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (executedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
