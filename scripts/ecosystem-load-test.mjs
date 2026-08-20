import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const DEFAULT_TARGETS = [
  { label: 'root', url: 'https://ekodi.kr/' },
  { label: 'admin', url: 'https://admin.ekodi.kr/' },
  { label: 'api-health', url: 'https://api.ekodi.kr/health' },
  { label: 'biz', url: 'https://biz.ekodi.kr/' },
  { label: 'marketing', url: 'https://marketing.ekodi.kr/' },
  { label: 'church', url: 'https://church.ekodi.kr/' },
  { label: 'lab', url: 'https://lab.ekodi.kr/' },
];

const targets = process.env.LOAD_TARGETS_JSON
  ? JSON.parse(process.env.LOAD_TARGETS_JSON)
  : DEFAULT_TARGETS;
const concurrencies = String(process.env.LOAD_CONCURRENCY || '1,5,10,20')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0 && value <= 50);
const requestsPerStage = Math.max(10, Math.min(200, Number(process.env.LOAD_REQUESTS_PER_STAGE || 40)));
const timeoutMs = Math.max(1000, Math.min(15000, Number(process.env.LOAD_TIMEOUT_MS || 5000)));
const p95BudgetMs = Math.max(250, Number(process.env.LOAD_P95_BUDGET_MS || 1500));
const incidentP95Ms = Math.max(p95BudgetMs, Number(process.env.LOAD_INCIDENT_P95_MS || 2500));
const errorRateBudget = Math.max(0, Math.min(1, Number(process.env.LOAD_ERROR_RATE_BUDGET || 0.01)));
const userAgent = 'EKODI-Bounded-Load-Test/1.0 (+https://ekodi.kr)';

if (!Array.isArray(targets) || targets.length === 0 || targets.length > 20) {
  throw new Error('LOAD_TARGETS_JSON must contain between 1 and 20 targets.');
}
if (concurrencies.length === 0) throw new Error('At least one valid concurrency level is required.');

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function round(value, digits = 1) {
  return value == null ? null : Number(value.toFixed(digits));
}

async function probeOnce(target) {
  const started = performance.now();
  try {
    const response = await fetch(target.url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': userAgent,
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'cache-control': 'no-cache',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Consume the response so connection reuse and body delivery are represented in latency.
    await response.arrayBuffer();
    const elapsed = performance.now() - started;
    return {
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      latencyMs: elapsed,
      cfCacheStatus: response.headers.get('cf-cache-status'),
      serverTiming: response.headers.get('server-timing'),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: performance.now() - started,
      cfCacheStatus: null,
      serverTiming: null,
      error: error?.name || String(error),
    };
  }
}

async function runStage(target, concurrency) {
  const results = new Array(requestsPerStage);
  let cursor = 0;
  const started = performance.now();

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= requestsPerStage) return;
      results[index] = await probeOnce(target);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, requestsPerStage) }, () => worker()));
  const wallMs = performance.now() - started;
  const latencies = results.map((item) => item.latencyMs);
  const failures = results.filter((item) => !item.ok || item.status >= 500);
  const statuses = Object.fromEntries(
    [...new Set(results.map((item) => String(item.status)))].sort().map((status) => [
      status,
      results.filter((item) => String(item.status) === status).length,
    ]),
  );
  const cache = Object.fromEntries(
    [...new Set(results.map((item) => item.cfCacheStatus || 'NONE'))].sort().map((status) => [
      status,
      results.filter((item) => (item.cfCacheStatus || 'NONE') === status).length,
    ]),
  );

  return {
    target: target.label,
    url: target.url,
    concurrency,
    requests: results.length,
    wallMs: round(wallMs),
    rps: round((results.length * 1000) / wallMs, 2),
    avgMs: round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
    p50Ms: round(percentile(latencies, 50)),
    p95Ms: round(percentile(latencies, 95)),
    p99Ms: round(percentile(latencies, 99)),
    maxMs: round(Math.max(...latencies)),
    errorRate: round(failures.length / results.length, 4),
    failures: failures.length,
    statuses,
    cache,
    withinTarget: failures.length / results.length <= errorRateBudget && percentile(latencies, 95) <= p95BudgetMs,
    incident: failures.length / results.length > errorRateBudget || percentile(latencies, 95) > incidentP95Ms,
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  policy: {
    concurrencies,
    requestsPerStage,
    timeoutMs,
    p95BudgetMs,
    incidentP95Ms,
    errorRateBudget,
    note: 'Bounded GET-only production test. No auth, writes, payment, mutation, or customer-data endpoints are exercised.',
  },
  targets: [],
  summary: null,
};

for (const target of targets) {
  console.log(`\n## ${target.label} ${target.url}`);
  // A tiny warm-up prevents a single cold connection from dominating the first stage.
  await Promise.all(Array.from({ length: 3 }, () => probeOnce(target)));
  const stages = [];
  for (const concurrency of concurrencies) {
    const stage = await runStage(target, concurrency);
    stages.push(stage);
    console.log(
      `c=${stage.concurrency} n=${stage.requests} rps=${stage.rps} p50=${stage.p50Ms}ms p95=${stage.p95Ms}ms p99=${stage.p99Ms}ms errors=${(stage.errorRate * 100).toFixed(2)}% statuses=${JSON.stringify(stage.statuses)}`,
    );
  }
  report.targets.push({ ...target, stages });
}

const allStages = report.targets.flatMap((target) => target.stages);
const highestConcurrency = Math.max(...concurrencies);
const peakStages = allStages.filter((stage) => stage.concurrency === highestConcurrency);
report.summary = {
  totalRequests: allStages.reduce((sum, stage) => sum + stage.requests, 0),
  peakConcurrency: highestConcurrency,
  peakP95Ms: round(Math.max(...peakStages.map((stage) => stage.p95Ms || 0))),
  peakErrorRate: round(Math.max(...peakStages.map((stage) => stage.errorRate || 0)), 4),
  targetsWithinTargetAtPeak: peakStages.filter((stage) => stage.withinTarget).length,
  targetCount: report.targets.length,
  incidents: allStages.filter((stage) => stage.incident).map((stage) => ({
    target: stage.target,
    concurrency: stage.concurrency,
    p95Ms: stage.p95Ms,
    errorRate: stage.errorRate,
  })),
};

await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/ecosystem-load-test.json', `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  '# EKODI ecosystem bounded load test',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `Policy: GET-only, max concurrency ${highestConcurrency}, ${requestsPerStage} requests/stage, p95 target ${p95BudgetMs}ms, incident ${incidentP95Ms}ms, error budget ${(errorRateBudget * 100).toFixed(2)}%.`,
  '',
  '| Target | Concurrency | RPS | p50 | p95 | p99 | Errors | HTTP |',
  '|---|---:|---:|---:|---:|---:|---:|---|',
  ...allStages.map((stage) => `| ${stage.target} | ${stage.concurrency} | ${stage.rps} | ${stage.p50Ms}ms | ${stage.p95Ms}ms | ${stage.p99Ms}ms | ${(stage.errorRate * 100).toFixed(2)}% | ${Object.entries(stage.statuses).map(([code, count]) => `${code}:${count}`).join(' ')} |`),
  '',
  `Peak: p95 ${report.summary.peakP95Ms}ms, error ${(report.summary.peakErrorRate * 100).toFixed(2)}%, ${report.summary.targetsWithinTargetAtPeak}/${report.summary.targetCount} targets within the normal p95/error target at concurrency ${highestConcurrency}.`,
  '',
  report.summary.incidents.length
    ? `Incident stages: ${report.summary.incidents.map((item) => `${item.target}@${item.concurrency} p95=${item.p95Ms}ms errors=${(item.errorRate * 100).toFixed(2)}%`).join('; ')}`
    : 'No incident threshold was crossed.',
  '',
].join('\n');
await writeFile('artifacts/ecosystem-load-test.md', markdown);
console.log(`\n${markdown}`);

// Fail only for a clear production incident. Normal target misses remain visible without turning
// geographic runner variance into a false outage signal.
if (report.summary.incidents.length > 0) process.exitCode = 2;
