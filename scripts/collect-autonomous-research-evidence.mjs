import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled', 'action_required']);
const SUCCESS_CONCLUSIONS = new Set(['success']);

function workflowName(run = {}) {
  return String(run.workflowName || run.name || 'unknown-workflow').trim() || 'unknown-workflow';
}

function runId(run = {}) {
  return Number(run.databaseId || run.id || 0) || null;
}

function runUrl(run = {}) {
  return String(run.url || run.html_url || '').trim();
}

function runTime(run = {}) {
  const value = String(run.createdAt || run.created_at || run.runStartedAt || run.run_started_at || '').trim();
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function targetWorkflowName(program = {}) {
  const target = String(program?.signal?.target || '');
  return target.startsWith('github-workflow:') ? target.slice('github-workflow:'.length) : '';
}

function failedStepNames(job = {}) {
  return (Array.isArray(job.steps) ? job.steps : [])
    .filter(step => FAILURE_CONCLUSIONS.has(String(step?.conclusion || '').toLowerCase()))
    .map(step => String(step.name || '').trim())
    .filter(Boolean);
}

function recoveryWindow(relevant = []) {
  const chronological = [...relevant].sort((left, right) => runTime(left) - runTime(right));
  const lastFailureIndex = chronological.map(run => FAILURE_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase())).lastIndexOf(true);
  if (lastFailureIndex < 0) {
    return {
      lastFailureAt: null,
      healthyRunsAfterLastFailure: chronological.filter(run => SUCCESS_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase())).length,
      consecutiveHealthyRuns: chronological.slice().reverse().findIndex(run => !SUCCESS_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase())) === -1
        ? chronological.length
        : chronological.slice().reverse().findIndex(run => !SUCCESS_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase())),
      resolvedOperationally: false,
    };
  }
  const afterFailure = chronological.slice(lastFailureIndex + 1);
  const healthyAfter = afterFailure.filter(run => SUCCESS_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase()));
  let consecutiveHealthyRuns = 0;
  for (let index = chronological.length - 1; index >= 0; index -= 1) {
    if (!SUCCESS_CONCLUSIONS.has(String(chronological[index].conclusion || '').toLowerCase())) break;
    consecutiveHealthyRuns += 1;
  }
  return {
    lastFailureAt: String(chronological[lastFailureIndex].createdAt || chronological[lastFailureIndex].created_at || '') || null,
    healthyRunsAfterLastFailure: healthyAfter.length,
    consecutiveHealthyRuns,
    resolvedOperationally: healthyAfter.length >= 2 && consecutiveHealthyRuns >= 2,
  };
}

export function buildWorkflowResearchEvidence(program = {}, runs = [], jobsByRunId = {}) {
  const expectedWorkflow = targetWorkflowName(program);
  const relevant = (Array.isArray(runs) ? runs : []).filter(run => workflowName(run) === expectedWorkflow);
  const failed = relevant.filter(run => FAILURE_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase()));
  const recovered = relevant.filter(run => SUCCESS_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase()));
  const failedJobs = [];
  const failedSteps = [];
  const jobFailureFrequency = new Map();
  const stepFailureFrequency = new Map();

  for (const run of failed) {
    const id = runId(run);
    const jobs = id ? (jobsByRunId[id] || jobsByRunId[String(id)] || []) : [];
    for (const job of Array.isArray(jobs) ? jobs : []) {
      if (!FAILURE_CONCLUSIONS.has(String(job?.conclusion || '').toLowerCase())) continue;
      const jobName = String(job.name || '').trim();
      if (jobName) {
        failedJobs.push(jobName);
        jobFailureFrequency.set(jobName, (jobFailureFrequency.get(jobName) || 0) + 1);
      }
      for (const stepName of failedStepNames(job)) {
        failedSteps.push(stepName);
        stepFailureFrequency.set(stepName, (stepFailureFrequency.get(stepName) || 0) + 1);
      }
    }
  }

  const repeatedJob = [...jobFailureFrequency.values()].some(count => count >= 2);
  const repeatedStep = [...stepFailureFrequency.values()].some(count => count >= 2);
  const recovery = recoveryWindow(relevant);
  const evidenceRefs = [
    ...(program?.signal?.evidenceRefs || []),
    ...failed.map(runUrl),
    ...recovered.slice(0, 5).map(runUrl),
  ].filter(Boolean);

  return {
    researchId: program.id,
    target: program?.signal?.target || '',
    workflowName: expectedWorkflow,
    observations: relevant.length,
    failedRuns: failed.length,
    recoveredRuns: recovered.length,
    failedJobs: [...new Set(failedJobs)],
    failedSteps: [...new Set(failedSteps)],
    reproducible: failed.length >= 3 && (repeatedJob || repeatedStep || failedJobs.length === 0),
    recurrence: {
      repeatedJob,
      repeatedStep,
      jobFailureFrequency: Object.fromEntries([...jobFailureFrequency.entries()].sort()),
      stepFailureFrequency: Object.fromEntries([...stepFailureFrequency.entries()].sort()),
    },
    recovery,
    evidenceRefs: [...new Set(evidenceRefs)].slice(0, 20),
    productionMutationPerformed: false,
    authorityExpanded: false,
  };
}

export function collectResearchEvidence(discoveryReport = {}, runs = [], jobsByRunId = {}) {
  const programs = Array.isArray(discoveryReport?.cycle?.researchPrograms)
    ? discoveryReport.cycle.researchPrograms
    : Array.isArray(discoveryReport?.researchPrograms)
      ? discoveryReport.researchPrograms
      : [];
  const evidenceByResearchId = {};
  for (const program of programs) {
    evidenceByResearchId[program.id] = buildWorkflowResearchEvidence(program, runs, jobsByRunId);
  }
  return {
    generatedAt: new Date().toISOString(),
    source: 'github_actions_jobs_steps_and_recovery',
    researchPrograms: programs.length,
    evidenceByResearchId,
    productionMutationPerformed: false,
    authorityExpanded: false,
  };
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'EKODI-Autonomous-Research/1.0',
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${url}`);
  return response.json();
}

async function collectJobsForPrograms(discoveryReport, runs, repository, token, maxRunsPerProgram = 5) {
  const programs = discoveryReport?.cycle?.researchPrograms || discoveryReport?.researchPrograms || [];
  const ids = new Set();
  for (const program of programs) {
    const expected = targetWorkflowName(program);
    const matches = runs
      .filter(run => workflowName(run) === expected && FAILURE_CONCLUSIONS.has(String(run.conclusion || '').toLowerCase()))
      .sort((left, right) => runTime(right) - runTime(left))
      .slice(0, maxRunsPerProgram);
    for (const run of matches) {
      const id = runId(run);
      if (id) ids.add(id);
    }
  }

  const jobsByRunId = {};
  for (const id of ids) {
    const payload = await fetchJson(`https://api.github.com/repos/${repository}/actions/runs/${id}/jobs?per_page=100`, token);
    jobsByRunId[id] = Array.isArray(payload.jobs) ? payload.jobs : [];
  }
  return jobsByRunId;
}

function parseArgs(argv = []) {
  const args = { discovery: '', runs: '', output: '', jobs: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--discovery') args.discovery = argv[++index] || '';
    else if (token === '--runs') args.runs = argv[++index] || '';
    else if (token === '--output') args.output = argv[++index] || '';
    else if (token === '--jobs') args.jobs = argv[++index] || '';
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.discovery || !args.runs) {
    throw new Error('Usage: node scripts/collect-autonomous-research-evidence.mjs --discovery <report.json> --runs <runs.json> [--jobs jobs.json] --output <evidence.json>');
  }
  const discoveryReport = JSON.parse(await fs.readFile(path.resolve(args.discovery), 'utf8'));
  const runs = JSON.parse(await fs.readFile(path.resolve(args.runs), 'utf8'));
  let jobsByRunId = {};
  if (args.jobs) {
    jobsByRunId = JSON.parse(await fs.readFile(path.resolve(args.jobs), 'utf8'));
  } else {
    const repository = String(process.env.GITHUB_REPOSITORY || '').trim();
    const token = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim();
    if (!repository || !token) throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required when --jobs is not provided.');
    jobsByRunId = await collectJobsForPrograms(discoveryReport, runs, repository, token);
  }
  const evidence = collectResearchEvidence(discoveryReport, runs, jobsByRunId);
  const output = `${JSON.stringify(evidence, null, 2)}\n`;
  if (args.output) await fs.writeFile(path.resolve(args.output), output, 'utf8');
  process.stdout.write(output);
}

const executedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (executedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
