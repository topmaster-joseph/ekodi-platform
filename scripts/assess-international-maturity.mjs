import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const modelPath = path.join(root, 'governance/standards/ekodi-international-maturity-model.json');
const currentPath = path.join(root, 'governance/standards/ekodi-current-maturity.json');
const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
const fail = message => { console.error(`[maturity] ${message}`); process.exitCode = 1; };

if (!Array.isArray(model.domains) || !model.domains.length) fail('model domains are missing');
if (!Array.isArray(current.domains) || !current.domains.length) fail('assessment domains are missing');
const weights = model.domains.reduce((sum, row) => sum + Number(row.weight || 0), 0);
if (weights !== 100) fail(`domain weights must total 100, got ${weights}`);
if (current.certificationStatus !== 'not-claimed') fail('internal maturity assessment must not claim certification');

const modelById = new Map(model.domains.map(row => [row.id, row]));
const currentById = new Map(current.domains.map(row => [row.id, row]));
for (const domain of model.domains) {
  const row = currentById.get(domain.id);
  if (!row) { fail(`missing assessment for ${domain.id}`); continue; }
  const score = Number(row.score);
  if (!Number.isFinite(score) || score < 0 || score > 5) fail(`invalid score for ${domain.id}: ${row.score}`);
  for (const key of ['evidence', 'gaps', 'nextActions']) {
    if (!Array.isArray(row[key]) || !row[key].length) fail(`${domain.id} requires non-empty ${key}`);
  }
}
for (const row of current.domains) if (!modelById.has(row.id)) fail(`unknown assessment domain ${row.id}`);

const historyPath = path.join(root, `governance/standards/history/${current.assessmentDate}.json`);
if (!fs.existsSync(historyPath)) fail(`immutable history snapshot missing: ${path.relative(root, historyPath)}`);

const rows = model.domains.map(domain => {
  const assessment = currentById.get(domain.id);
  const score = Number(assessment?.score || 0);
  return { id: domain.id, name: domain.name, standard: domain.standard, weight: domain.weight, target: domain.target, score, gap: Number((domain.target - score).toFixed(1)), confidence: assessment?.confidence || 'unknown' };
});
const overall = Number((rows.reduce((sum, row) => sum + row.score * row.weight, 0) / 100).toFixed(2));
const levelName = [...model.scale].reverse().find(level => overall >= level.level)?.name || model.scale[0]?.name || 'Unknown';
const targetGap = Number((5 - overall).toFixed(2));
const lowest = [...rows].sort((a, b) => a.score - b.score).slice(0, 3);
const generatedAt = new Date().toISOString();
const result = {
  modelId: model.modelId,
  assessmentId: current.assessmentId,
  assessmentDate: current.assessmentDate,
  generatedAt,
  certificationStatus: current.certificationStatus,
  overallScore: overall,
  maturityBand: levelName,
  targetScore: 5,
  targetGap,
  domains: rows,
  lowestDomains: lowest.map(row => ({ id: row.id, score: row.score, gap: row.gap })),
  priorityGaps: current.priorityGaps || []
};

const outputArg = process.argv.indexOf('--output');
if (outputArg >= 0) {
  const outputDir = path.resolve(root, process.argv[outputArg + 1] || '.artifacts/international-maturity');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'maturity-latest.json'), JSON.stringify(result, null, 2) + '\n');
  const md = [
    '# EKODI International Platform Maturity',
    '',
    `- Assessment date: ${current.assessmentDate}`,
    `- Internal maturity score: **${overall.toFixed(2)} / 5.00**`,
    `- Internal maturity band: **${levelName}**`,
    '- Certification: **Not claimed** (internal evidence-based assessment only)',
    '',
    '| Domain | Standard | Score | Target | Gap |',
    '|---|---|---:|---:|---:|',
    ...rows.map(row => `| ${row.name} | ${row.standard} | ${row.score.toFixed(1)} | ${row.target.toFixed(1)} | ${row.gap.toFixed(1)} |`),
    '',
    '## Priority gaps',
    ...(current.priorityGaps || []).map(value => `- ${value}`),
    '',
    `Generated: ${generatedAt}`,
    ''
  ].join('\n');
  fs.writeFileSync(path.join(outputDir, 'maturity-latest.md'), md);
  console.log(`[maturity] report written to ${path.relative(root, outputDir)}`);
}

console.log(JSON.stringify(result, null, 2));
if (!process.exitCode) console.log(`[maturity] valid: ${overall.toFixed(2)}/5 (${levelName}), target gap ${targetGap.toFixed(2)}`);
