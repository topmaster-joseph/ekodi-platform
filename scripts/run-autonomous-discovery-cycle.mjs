import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runAutonomousDiscoveryCycle } from '../ekodi-autonomous-discovery-engine.js';

const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out']);

function normalizeWorkflowName(run = {}) {
  return String(run.workflowName || run.name || 'unknown-workflow').trim() || 'unknown-workflow';
}

export function deriveSignalsFromWorkflowRuns(runs = []) {
  const grouped = new Map();

  for (const run of Array.isArray(runs) ? runs : []) {
    if (!FAILURE_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase())) continue;
    const name = normalizeWorkflowName(run);
    const group = grouped.get(name) || [];
    group.push(run);
    grouped.set(name, group);
  }

  return [...grouped.entries()]
    .filter(([, failures]) => failures.length >= 3)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, failures]) => ({
      type: 'repeated_error_pattern',
      target: `github-workflow:${name}`,
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

export function buildDiscoveryReport(runs = []) {
  const signals = deriveSignalsFromWorkflowRuns(runs);
  const cycle = runAutonomousDiscoveryCycle({ signals });
  const sampledRuns = Array.isArray(runs) ? runs.length : 0;
  const failedRuns = Array.isArray(runs)
    ? runs.filter(run => FAILURE_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase())).length
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    source: 'github_actions_recent_runs',
    mode: 'read_only_discovery',
    sampledRuns,
    failedRuns,
    qualifyingSignals: signals.length,
    productionMutationPerformed: false,
    authorityExpanded: false,
    cycle,
  };
}

export function renderDiscoverySummary(report = {}) {
  const programs = Array.isArray(report.cycle?.researchPrograms) ? report.cycle.researchPrograms : [];
  const lines = [
    '## EKODI Autonomous Discovery Engine',
    '',
    `- Mode: **${report.mode || 'read_only_discovery'}**`,
    `- Sampled workflow runs: **${Number(report.sampledRuns || 0)}**`,
    `- Failed/timed-out runs: **${Number(report.failedRuns || 0)}**`,
    `- Research candidates discovered: **${programs.length}**`,
    '- Production mutation: **NO**',
    '- Authority expansion: **NO**',
    '- Production deployment policy: **Human-Governed**',
    '',
  ];

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
  const args = { runs: '', output: '', summary: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--runs') args.runs = argv[++index] || '';
    else if (token === '--output') args.output = argv[++index] || '';
    else if (token === '--summary') args.summary = argv[++index] || '';
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.runs) throw new Error('Usage: node scripts/run-autonomous-discovery-cycle.mjs --runs <workflow-runs.json> [--output report.json] [--summary summary.md]');

  const runs = JSON.parse(await fs.readFile(path.resolve(args.runs), 'utf8'));
  const report = buildDiscoveryReport(runs);
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
