import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAutonomousEvolutionLoop } from '../ekodi-autonomous-evolution-loop.js';

function serviceIdFromTarget(target = '') {
  const match = String(target || '').trim().match(/^service:([a-z0-9][a-z0-9-]{0,63}):/i);
  return match?.[1]?.toLowerCase() || null;
}

export function serviceIdForLifecycleRecord(record = {}) {
  return serviceIdFromTarget(
    record?.research?.target
    || record?.candidate?.target
    || record?.verification?.target
    || record?.learning?.target
    || ''
  );
}

function lifecycleCounts(records = []) {
  return {
    total: records.length,
    researchVerified: records.filter(item => item.research?.verified).length,
    operationalResolutionsVerified: records.filter(item => item.operationalResolution?.verified).length,
    experimentsReady: records.filter(item => item.experiment?.executableAutonomously).length,
    experimentsPassed: records.filter(item => item.experimentEvaluation?.passed).length,
    candidatesReady: records.filter(item => item.candidate?.readyForSuperAdminReview).length,
    postChangeVerified: records.filter(item => item.verification?.verified).length,
    rollbackRequired: records.filter(item => item.verification?.rollbackRequired).length,
    learningClosed: records.filter(item => ['learning_loop_closed', 'learning_loop_closed_operational_resolution'].includes(item.learning?.status)).length,
  };
}

export function buildSubserviceEvolutionCoverage(discoveryReport = {}, report = {}) {
  const registered = Array.isArray(discoveryReport?.subservices) ? discoveryReport.subservices : [];
  const records = Array.isArray(report?.records) ? report.records : [];
  return registered.map((service) => {
    const serviceRecords = records.filter(record => serviceIdForLifecycleRecord(record) === service.id);
    return {
      id: service.id,
      name: service.name || service.id,
      url: service.url || '',
      status: service.status || 'unknown',
      productionVerified: service.productionVerified === true,
      monitoringMode: service.monitoringMode || 'registry_only',
      evolutionMode: service.monitoringMode === 'active_read_only' ? 'active_evidence_loop' : 'registry_only',
      lifecycle: lifecycleCounts(serviceRecords),
      productionMutationPerformed: false,
      authorityExpanded: false,
    };
  });
}

export function buildAutonomousEvolutionReport(discoveryReport = {}, researchEvidence = {}, options = {}) {
  const researchPrograms = Array.isArray(discoveryReport?.cycle?.researchPrograms)
    ? discoveryReport.cycle.researchPrograms
    : Array.isArray(discoveryReport?.researchPrograms)
      ? discoveryReport.researchPrograms
      : [];
  const rawReport = runAutonomousEvolutionLoop({
    generatedAt: options.generatedAt,
    researchPrograms,
    evidenceByResearchId: researchEvidence?.evidenceByResearchId || {},
    experimentOutcomes: options.experimentOutcomes || {},
    deploymentOutcomes: options.deploymentOutcomes || {},
    recommendations: options.recommendations || [],
  });
  const records = (Array.isArray(rawReport.records) ? rawReport.records : []).map(record => ({
    ...record,
    serviceId: serviceIdForLifecycleRecord(record),
  }));
  const scopedReport = { ...rawReport, records };
  const subservices = buildSubserviceEvolutionCoverage(discoveryReport, scopedReport);
  const lifecycleActiveServices = subservices.filter(service => service.lifecycle.total > 0).length;
  return {
    ...scopedReport,
    source: 'autonomous_discovery_research_evidence_and_subservice_lifecycle',
    discovery: {
      sampledRuns: Number(discoveryReport?.sampledRuns || 0),
      failedRuns: Number(discoveryReport?.failedRuns || 0),
      researchCandidates: researchPrograms.length,
    },
    evolutionScope: {
      registeredServices: subservices.length,
      monitoredServices: subservices.filter(service => service.monitoringMode === 'active_read_only').length,
      lifecycleActiveServices,
      platformScopedRecords: records.filter(record => !record.serviceId).length,
    },
    subservices,
    researchEvidenceGeneratedAt: researchEvidence?.generatedAt || null,
  };
}

export function renderAutonomousEvolutionSummary(report = {}) {
  const summary = report.summary || {};
  const scope = report.evolutionScope || {};
  const lines = [
    '## EKODI Autonomous Evolution Loop',
    '',
    `- Generation baseline: **${Number(report.currentGeneration || 10)}**`,
    `- Lifecycle records: **${Number(summary.total || 0)}**`,
    `- Registered subservices: **${Number(scope.registeredServices || 0)}**`,
    `- Actively monitored subservices: **${Number(scope.monitoredServices || 0)}**`,
    `- Subservices with lifecycle records: **${Number(scope.lifecycleActiveServices || 0)}**`,
    `- Research verified: **${Number(summary.researchVerified || 0)}**`,
    `- Operational recoveries verified: **${Number(summary.operationalResolutionsVerified || 0)}**`,
    `- Bounded experiments ready: **${Number(summary.experimentsReady || 0)}**`,
    `- Experiments passed: **${Number(summary.experimentsPassed || 0)}**`,
    `- Evolution candidates ready for Super Admin: **${Number(summary.candidatesReady || 0)}**`,
    `- Post-change verified: **${Number(summary.postChangeVerified || 0)}**`,
    `- Rollback required: **${Number(summary.rollbackRequired || 0)}**`,
    `- Learning loops closed: **${Number(summary.learningClosed || 0)}**`,
    '- Production mutation by autonomous research loop: **NO**',
    '- Authority expansion: **NO**',
    '- Automatic generation promotion: **NO**',
    '',
  ];

  const subservices = Array.isArray(report.subservices) ? report.subservices : [];
  const activeServices = subservices.filter(service => Number(service?.lifecycle?.total || 0) > 0);
  if (activeServices.length) {
    lines.push('| Subservice | Lifecycle | Research | Experiments | Candidates | Learned |');
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const service of activeServices.slice(0, 20)) {
      const counts = service.lifecycle || {};
      lines.push(`| \`${service.id}\` · ${String(service.name || service.id).replaceAll('|', '\\|')} | ${Number(counts.total || 0)} | ${Number(counts.researchVerified || 0)} | ${Number(counts.experimentsReady || 0)} | ${Number(counts.candidatesReady || 0)} | ${Number(counts.learningClosed || 0)} |`);
    }
    lines.push('');
  }

  const records = Array.isArray(report.records) ? report.records : [];
  if (!records.length) {
    lines.push('No lifecycle record crossed the discovery threshold in this cycle.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| Target | Research | Resolution | Experiment | Candidate | Current state |');
  lines.push('|---|---|---|---|---|---|');
  for (const record of records.slice(0, 20)) {
    const target = String(record?.research?.target || 'platform').replaceAll('|', '\\|');
    const research = record?.research?.verified ? `verified ${Math.round(Number(record.research.confidence || 0))}%` : 'evidence required';
    const resolution = record?.operationalResolution?.verified ? 'recovery verified' : 'change/research path';
    const experiment = record?.experimentEvaluation?.status || record?.experiment?.status || 'not designed';
    const candidate = record?.candidate?.readyForSuperAdminReview ? 'Super Admin review' : 'not ready';
    const state = String(record?.status || 'unknown').replaceAll('|', '\\|');
    lines.push(`| ${target} | ${research} | ${resolution} | ${experiment} | ${candidate} | \`${state}\` |`);
  }
  lines.push('');
  lines.push('A research record is not an evolution. A verified recovery closes learning without inventing a change. A candidate is not a deployment. A structural evolution is only learned after guarded deployment, post-change verification, and learning-loop closure.');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv = []) {
  const args = { discovery: '', evidence: '', output: '', summary: '', experiments: '', deployments: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--discovery') args.discovery = argv[++index] || '';
    else if (token === '--evidence') args.evidence = argv[++index] || '';
    else if (token === '--output') args.output = argv[++index] || '';
    else if (token === '--summary') args.summary = argv[++index] || '';
    else if (token === '--experiments') args.experiments = argv[++index] || '';
    else if (token === '--deployments') args.deployments = argv[++index] || '';
  }
  return args;
}

async function readOptionalJson(file) {
  return file ? JSON.parse(await fs.readFile(path.resolve(file), 'utf8')) : {};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.discovery || !args.evidence) {
    throw new Error('Usage: node scripts/run-autonomous-evolution-loop.mjs --discovery <report.json> --evidence <research-evidence.json> [--output lifecycle.json] [--summary summary.md]');
  }
  const discoveryReport = JSON.parse(await fs.readFile(path.resolve(args.discovery), 'utf8'));
  const researchEvidence = JSON.parse(await fs.readFile(path.resolve(args.evidence), 'utf8'));
  const experimentOutcomes = await readOptionalJson(args.experiments);
  const deploymentOutcomes = await readOptionalJson(args.deployments);
  const report = buildAutonomousEvolutionReport(discoveryReport, researchEvidence, {
    experimentOutcomes,
    deploymentOutcomes,
  });
  const summary = renderAutonomousEvolutionSummary(report);
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
