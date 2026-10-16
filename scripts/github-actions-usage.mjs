#!/usr/bin/env node
// Read-only operational summary: workflow runs are NOT a billing invoice.
const repository = process.env.GITHUB_REPOSITORY || process.argv[2];
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  console.error('Usage: GITHUB_REPOSITORY=owner/repo GITHUB_TOKEN=... node scripts/github-actions-usage.mjs');
  process.exit(2);
}
if (!token) {
  console.error('Read-only GitHub token required (Actions: read).');
  process.exit(2);
}
const perPage = Math.min(100, Math.max(1, Number(process.env.EKODI_GITHUB_SAMPLE_SIZE || '100')));
const endpoint = `https://api.github.com/repos/${repository}/actions/runs?per_page=${perPage}`;
const response = await fetch(endpoint, {headers:{
  'Accept':'application/vnd.github+json',
  'Authorization':`Bearer ${token}`,
  'X-GitHub-Api-Version':'2022-11-28'
}});
if (!response.ok) {
  console.error(`GitHub Actions read failed: HTTP ${response.status}`);
  process.exit(1);
}
const payload = await response.json();
const runs = (payload.workflow_runs || []).map(run => ({
  name:run.name,
  workflow_id:run.workflow_id,
  status:run.status,
  conclusion:run.conclusion,
  event:run.event,
  created_at:run.created_at,
  started_at:run.run_started_at,
  updated_at:run.updated_at,
  url:run.html_url
}));
const counts = {};
for (const run of runs) {
  const key = run.conclusion || run.status || 'unknown';
  counts[key] = (counts[key] || 0) + 1;
}
console.log(JSON.stringify({
  schema_version:1,
  repository,
  collected_at:new Date().toISOString(),
  returned_runs:runs.length,
  reported_total:payload.total_count ?? null,
  sample_limited:true,
  counts,
  caveat:'Run counts and wall-clock timestamps are not billable runner minutes, costs, or service health. Pricing and individual job metrics must be checked separately.',
  runs
},null,2));
