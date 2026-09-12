import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  assertScenarioAllowed,
  runScenario,
  summarizeResults,
  validateReliabilityConfig
} from './reliability-validation-lib.mjs';

const configPath = fileURLToPath(new URL('../config/reliability-validation.json', import.meta.url));
const config = JSON.parse(await readFile(configPath, 'utf8'));
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : 'true'];
}));

const configErrors = validateReliabilityConfig(config);
if (configErrors.length) {
  console.error(JSON.stringify({ ok: false, phase: 'policy', errors: configErrors }, null, 2));
  process.exit(1);
}
if (args.get('validate-only') === 'true') {
  console.log(JSON.stringify({ ok: true, phase: 'policy', profiles: Object.keys(config.profiles) }, null, 2));
  process.exit(0);
}

const profileName = args.get('profile') || 'synthetic';
const targetUrl = args.get('target') || process.env.EKODI_RELIABILITY_TARGET;
const observedPeakRps = Number(args.get('observed-rps') || process.env.EKODI_OBSERVED_PEAK_RPS || 0);
const manual = args.get('manual') === 'true';
const output = args.get('output') || '';
if (!targetUrl) {
  console.error('Missing --target or EKODI_RELIABILITY_TARGET');
  process.exit(2);
}

let allowed;
try {
  allowed = assertScenarioAllowed({ targetUrl, profileName, config, manual });
} catch (error) {
  console.error(JSON.stringify({ ok: false, phase: 'guardrail', error: String(error.message || error) }, null, 2));
  process.exit(2);
}

const profile = structuredClone(allowed.profile);
if (Number.isFinite(observedPeakRps) && observedPeakRps > 0) {
  const adaptiveRps = Math.ceil(observedPeakRps * Math.max(0.01, Number(profile.trafficMultiplier || 1)));
  profile.targetRps = Math.max(profile.targetRps, adaptiveRps);
}
if (profile.targetRps > config.guardrails.maxTargetRps) {
  console.error(JSON.stringify({
    ok: false,
    phase: 'guardrail',
    error: `Adaptive target ${profile.targetRps} RPS exceeds hard cap ${config.guardrails.maxTargetRps} RPS; revise policy deliberately instead of auto-escalating load.`
  }, null, 2));
  process.exit(2);
}

const headers = {
  'user-agent': 'EKODI-Reliability-Validator/1.0',
  'cache-control': 'no-cache'
};
if (allowed.targetClass === 'staging' && config.defaults.hostHeader) {
  headers['x-ekodi-staging-host'] = config.defaults.hostHeader;
}

const startedAt = new Date().toISOString();
const wallStart = performance.now();
const results = await runScenario({
  targetUrl,
  path: args.get('path') || config.defaults.path,
  profile,
  expectedStatuses: config.defaults.expectedStatuses,
  headers,
  timeoutMs: config.guardrails.requestTimeoutMs,
  maxDurationSeconds: config.guardrails.maxDurationSeconds
});
const evaluation = summarizeResults(results, profile);
const report = {
  ok: evaluation.passed,
  engine: 'EKODI Reliability & Validation Engine',
  policyVersion: config.version,
  targetClass: allowed.targetClass,
  targetHost: allowed.target.hostname,
  profile: profileName,
  observedPeakRps: observedPeakRps > 0 ? observedPeakRps : null,
  effectiveTargetRps: profile.targetRps,
  trafficMultiplier: profile.trafficMultiplier,
  startedAt,
  durationMs: Math.round(performance.now() - wallStart),
  thresholds: profile.thresholds,
  ...evaluation
};

console.log(JSON.stringify(report, null, 2));
if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [
    `### EKODI Reliability Validation — ${profileName}`,
    '',
    `- Target class: **${report.targetClass}**`,
    `- Effective traffic: **${report.effectiveTargetRps} RPS**`,
    `- Requests: **${report.metrics.total}**`,
    `- p95: **${report.metrics.p95Ms} ms** / limit ${profile.thresholds.p95Ms} ms`,
    `- Error rate: **${(report.metrics.errorRate * 100).toFixed(2)}%** / limit ${(profile.thresholds.errorRate * 100).toFixed(2)}%`,
    `- Gate: **${report.ok ? 'PASS' : 'FAIL'}**`,
    report.violations.length ? `- Violations: ${report.violations.join(', ')}` : ''
  ].filter(Boolean).join('\n');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${md}\n`, 'utf8');
}
if (!evaluation.passed) process.exit(1);
