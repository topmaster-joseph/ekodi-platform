import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTechnologyRadarReport } from '../ekodi-technology-radar.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_POLICY = path.join(root, 'config', 'autonomous-technology-evolution-policy.json');

function parseArgs(argv = []) {
  const args = { policy: DEFAULT_POLICY, output: '', summary: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--policy') args.policy = path.resolve(argv[++index] || DEFAULT_POLICY);
    else if (token === '--output') args.output = path.resolve(argv[++index] || '');
    else if (token === '--summary') args.summary = path.resolve(argv[++index] || '');
  }
  return args;
}

function headers() {
  const value = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'EKODI-Autonomous-Technology-Radar/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
  if (token) value.Authorization = `Bearer ${token}`;
  return value;
}

function pickRelease(releases = [], patternText = '') {
  const pattern = new RegExp(patternText);
  for (const release of Array.isArray(releases) ? releases : []) {
    if (release?.draft === true || release?.prerelease === true) continue;
    const tag = String(release?.tag_name || '').trim();
    const match = tag.match(pattern);
    if (!match) continue;
    return {
      latestVersion: match[1] || tag,
      latestTag: tag,
      publishedAt: release?.published_at || release?.created_at || null,
      evidenceUrl: release?.html_url || null,
    };
  }
  return null;
}

async function collectObservation(technology) {
  const repository = String(technology?.source?.repository || '').trim();
  const tagPattern = String(technology?.source?.tagPattern || '').trim();
  const url = `https://api.github.com/repos/${repository}/releases?per_page=40`;
  try {
    const response = await fetch(url, {
      headers: headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return {
        id: technology.id,
        fetchOk: false,
        error: `github_release_http_${response.status}`,
        evidenceUrl: `https://github.com/${repository}/releases`,
      };
    }
    const releases = await response.json();
    const selected = pickRelease(releases, tagPattern);
    if (!selected) {
      return {
        id: technology.id,
        fetchOk: false,
        error: 'matching_stable_release_not_found',
        evidenceUrl: `https://github.com/${repository}/releases`,
      };
    }
    return { id: technology.id, fetchOk: true, ...selected };
  } catch (error) {
    return {
      id: technology.id,
      fetchOk: false,
      error: String(error?.message || error || 'fetch_failed').slice(0, 240),
      evidenceUrl: `https://github.com/${repository}/releases`,
    };
  }
}

export async function collectTechnologyObservations(policy = {}) {
  const technologies = Array.isArray(policy.technologies) ? policy.technologies : [];
  const observations = [];
  for (const technology of technologies) {
    observations.push(await collectObservation(technology));
  }
  return Object.freeze(observations);
}

export function renderTechnologyRadarSummary(report = {}) {
  const lines = [
    '## EKODI Autonomous Technology Radar',
    '',
    `- Generation: **${report.currentGeneration || 10}**`,
    `- Scale tier: **${report.scaleTier || 'S0'}**`,
    '- Source policy: **official sources only**',
    '- Automatic paid activation: **NO**',
    '- Direct production mutation: **NO**',
    '- Authority expansion: **NO**',
    '',
    '| Technology | Baseline → Latest | Score | Decision | Evidence |',
    '|---|---|---:|---|---|',
  ];
  for (const entry of report.entries || []) {
    const version = `${entry.baselineVersion || '?'} → ${entry.latestVersion || '?'}`;
    const evidence = entry.evidenceUrl ? `[official](${entry.evidenceUrl})` : '-';
    lines.push(`| ${entry.name || entry.id} | ${version} | ${entry.score} | \`${entry.action}\` | ${evidence} |`);
  }
  lines.push('');
  lines.push(`Material change signals: **${(report.signals || []).length}**`);
  lines.push(`Sandbox candidates: **${Number(report.counts?.sandbox_candidate || 0)}** · Assess: **${Number(report.counts?.assess || 0)}** · Human gate: **${Number(report.counts?.human_gate || 0)}**`);
  lines.push('');
  lines.push('A radar finding is research evidence only. It does not purchase a service, create a secret, expand permissions, mutate production, or promote a platform generation.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const policy = JSON.parse(await fs.readFile(args.policy, 'utf8'));
  const observations = await collectTechnologyObservations(policy);
  const report = buildTechnologyRadarReport(policy, observations);
  const summary = renderTechnologyRadarSummary(report);
  if (args.output) await fs.writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (args.summary) await fs.writeFile(args.summary, summary, 'utf8');
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
