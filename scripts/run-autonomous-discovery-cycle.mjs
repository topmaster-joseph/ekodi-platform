import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAutonomousDiscoveryCycle } from '../ekodi-autonomous-discovery-engine.js';
import {
  buildAutonomousDiscoveryServiceRegistry,
  inferAutonomousDiscoveryServiceId,
  scopeAutonomousDiscoveryTarget,
} from '../autonomous-discovery-service-registry.js';

const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out']);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SERVICE_REGISTRY = path.join(root, 'config', 'ecosystem-services.json');

function normalizeWorkflowName(run = {}) {
  return String(run.workflowName || run.name || 'unknown-workflow').trim() || 'unknown-workflow';
}

export function deriveSignalsFromWorkflowRuns(runs = [], serviceRegistry = []) {
  const grouped = new Map();

  for (const run of Array.isArray(runs) ? runs : []) {
    if (!FAILURE_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase())) continue;
    const name = normalizeWorkflowName(run);
    const serviceId = inferAutonomousDiscoveryServiceId(run, serviceRegistry);
    const groupKey = `${serviceId || 'platform'}::${name}`;
    const group = grouped.get(groupKey) || { serviceId, name, failures: [] };
    group.failures.push(run);
    grouped.set(groupKey, group);
  }

  return [...grouped.values()]
    .filter(group => group.failures.length >= 3)
    .sort((a, b) => b.failures.length - a.failures.length || a.name.localeCompare(b.name))
    .map(({ serviceId, name, failures }) => ({
      type: 'repeated_error_pattern',
      serviceId: serviceId || null,
      target: scopeAutonomousDiscoveryTarget(serviceId, `github-workflow:${name}`),
      count: failures.length,
      detectedAt: failures
        .map(run => String(run.createdAt || ''))
        .filter(Boolean)
        .sort()
        .at(-1) || null,
      evidenceRefs: failures
        .map(run => String(run.url || run.html_url || '').trim())
        .filter(Boolean)
        .slice(0, 10),
    }));
}

export function buildSubserviceDiscoveryCoverage(serviceRegistry = [], signals = []) {
  return serviceRegistry.map((service) => {
    const scopedSignals = signals.filter(signal => signal.serviceId === service.id);
    const cycle = service.monitorable ? runAutonomousDiscoveryCycle({ signals: scopedSignals }) : null;
    return Object.freeze({
      id: service.id,
      name: service.name || service.nameEn || service.id,
      url: service.url,
      status: service.status,
      productionVerified: service.productionVerified,
      monitoringMode: service.monitorable ? 'active_read_only' : 'registry_only',
      qualifyingSignals: scopedSignals.length,
      researchCandidates: cycle?.discovered || 0,
      productionMutationPerformed: false,
      authorityExpanded: false,
      cycle,
    });
  });
}

export function buildDiscoveryReport(runs = [], serviceConfig = {}) {
  const serviceRegistry = buildAutonomousDiscoveryServiceRegistry(serviceConfig);
  const signals = deriveSignalsFromWorkflowRuns(runs, serviceRegistry);
  const cycle = runAutonomousDiscoveryCycle({ signals });
  const sampledRuns = Array.isArray(runs) ? runs.length : 0;
  const failedRuns = Array.isArray(runs)
    ? runs.filter(run => FAILURE_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase())).length
    : 0;
  const subservices = buildSubserviceDiscoveryCoverage(serviceRegistry, signals);
  const monitoredServices = subservices.filter(service => service.monitoringMode === 'active_read_only');
  const affectedSubservices = monitoredServices.filter(service => service.qualifyingSignals > 0);

  return {
    generatedAt: new Date().toISOString(),
    source: 'github_actions_recent_runs_and_ecosystem_service_registry',
    mode: 'read_only_discovery',
    sampledRuns,
    failedRuns,
    qualifyingSignals: signals.length,
    registeredServices: subservices.length,
    monitoredServices: monitoredServices.length,
    affectedSubservices: affectedSubservices.length,
    productionMutationPerformed: false,
    authorityExpanded: false,
    cycle,
    subservices,
  };
}

export function renderDiscoverySummary(report = {}) {
  const programs = Array.isArray(report.cycle?.researchPrograms) ? report.cycle.researchPrograms : [];
  const subservices = Array.isArray(report.subservices) ? report.subservices : [];
  const affected = subservices.filter(service => Number(service.qualifyingSignals || 0) > 0);
  const lines = [
    '## EKODI Autonomous Discovery Engine',
    '',
    `- Mode: **${report.mode || 'read_only_discovery'}**`,
    `- Sampled workflow runs: **${Number(report.sampledRuns || 0)}**`,
    `- Failed/timed-out runs: **${Number(report.failedRuns || 0)}**`,
    `- Registered subservices: **${Number(report.registeredServices || subservices.length || 0)}**`,
    `- Actively monitored production-verified subservices: **${Number(report.monitoredServices || 0)}**`,
    `- Subservices with qualifying research signals: **${Number(report.affectedSubservices || affected.length || 0)}**`,
    `- Research candidates discovered: **${programs.length}**`,
    '- Production mutation: **NO**',
    '- Authority expansion: **NO**',
    '- Production deployment policy: **Human-Governed**',
    '',
  ];

  if (affected.length) {
    lines.push('| Subservice | Mode | Signals | Research candidates |');
    lines.push('|---|---|---:|---:|');
    for (const service of affected.slice(0, 20)) {
      lines.push(`| \`${service.id}\` · ${String(service.name || service.id).replaceAll('|', '\\|')} | ${service.monitoringMode} | ${Number(service.qualifyingSignals || 0)} | ${Number(service.researchCandidates || 0)} |`);
    }
    lines.push('');
  }

  if (!programs.length) {
    lines.push('No repeated-failure pattern crossed the autonomous research threshold in the sampled evidence.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| Candidate | Signal | Research question |');
  lines.push('|---|---|---|');
  for (const program of programs) {
    const question = String(program.question || '').replaceAll('|', '\\|');
    lines.push(`| \`${program.id}\` | \`${program.signal?.type || 'unknown'}\` · ${program.signal?.target || 'platform'} | ${question} |`);
  }
  lines.push('');
  lines.push('These are research candidates only. They cannot directly mutate production, expand permissions, or promote EKODI to Generation 11.');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv = []) {
  const args = { runs: '', services: DEFAULT_SERVICE_REGISTRY, output: '', summary: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--runs') args.runs = argv[++index] || '';
    else if (token === '--services') args.services = argv[++index] || '';
    else if (token === '--output') args.output = argv[++index] || '';
    else if (token === '--summary') args.summary = argv[++index] || '';
  }
  return args;
}

async function readServiceConfig(file) {
  if (!file) return {};
  try {
    return JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  } catch (error) {
    if (path.resolve(file) === path.resolve(DEFAULT_SERVICE_REGISTRY)) throw error;
    throw new Error(`Unable to read autonomous discovery service registry: ${file}`, { cause: error });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.runs) throw new Error('Usage: node scripts/run-autonomous-discovery-cycle.mjs --runs <workflow-runs.json> [--services config/ecosystem-services.json] [--output report.json] [--summary summary.md]');

  const runs = JSON.parse(await fs.readFile(path.resolve(args.runs), 'utf8'));
  const serviceConfig = await readServiceConfig(args.services);
  const report = buildDiscoveryReport(runs, serviceConfig);
  const summary = renderDiscoverySummary(report);

  if (args.output) await fs.writeFile(path.resolve(args.output), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
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
