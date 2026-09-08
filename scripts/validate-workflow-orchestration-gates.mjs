import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workflowDir = path.join(root, '.github', 'workflows');
const fix = process.argv.includes('--fix');
const gateName = 'EKODI AI Orchestration Gate';
const gateCommand = 'node "$GITHUB_WORKSPACE/scripts/validate-ekodi-ai-change-orchestration.mjs" --release';

const mutationPatterns = [
  /guarded-worker-release\.mjs/,
  /guarded-pages-release\.mjs/,
  /apply-d1-migrations-with-retry\.sh/,
  /wrangler(?:@[^\s]+)?[^\n]*\bsecret\s+put\b/i,
  /wrangler(?:@[^\s]+)?[^\n]*\bd1\s+migrations\s+apply\b[^\n]*--remote/i,
  /wrangler(?:@[^\s]+)?[^\n]*\bd1\s+execute\b[^\n]*--remote/i,
  /wrangler(?:@[^\s]+)?[^\n]*\btriggers\s+deploy\b/i,
  /wrangler(?:@[^\s]+)?[^\n]*\bpages\s+deploy\b/i,
  /wrangler(?:@[^\s]+)?[^\n]*\bdeploy\b(?!ments)/i,
];

function isMutation(block) {
  return mutationPatterns.some(pattern => pattern.test(block.replace(/--dry-run[^\n]*/g, '')));
}

function jobRanges(lines) {
  const jobsIndex = lines.findIndex(line => /^jobs:\s*$/.test(line));
  if (jobsIndex < 0) return [];
  const starts = [];
  for (let i = jobsIndex + 1; i < lines.length; i += 1) {
    if (/^[^\s]/.test(lines[i]) && !/^\s*$/.test(lines[i])) break;
    if (/^  [A-Za-z0-9_.-]+:\s*$/.test(lines[i])) starts.push(i);
  }
  return starts.map((start, index) => ({
    start,
    end: index + 1 < starts.length ? starts[index + 1] : lines.length,
  }));
}

function findInsertion(lines, range) {
  const steps = lines.findIndex((line, index) => index > range.start && index < range.end && /^    steps:\s*$/.test(line));
  if (steps < 0) return -1;
  let preferred = -1;
  for (let i = steps + 1; i < range.end; i += 1) {
    if (/uses: actions\/setup-node@/.test(lines[i])) preferred = i;
    if (preferred >= 0 && i > preferred && /^      - /.test(lines[i])) return i;
  }
  if (preferred >= 0) return range.end;
  for (let i = steps + 1; i < range.end; i += 1) {
    if (/uses: actions\/checkout@/.test(lines[i])) preferred = i;
    if (preferred >= 0 && i > preferred && /^      - /.test(lines[i])) return i;
  }
  return preferred >= 0 ? range.end : -1;
}

let failed = false;
let changed = 0;
for (const name of fs.readdirSync(workflowDir).filter(name => /\.ya?ml$/.test(name)).sort()) {
  const file = path.join(workflowDir, name);
  let lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const ranges = jobRanges(lines).reverse();
  let fileChanged = false;
  for (const range of ranges) {
    const block = lines.slice(range.start, range.end).join('\n');
    if (!isMutation(block) || block.includes(gateCommand)) continue;
    const jobName = (lines[range.start].match(/^  ([^:]+):/) || [])[1] || 'unknown';
    const insertAt = findInsertion(lines, range);
    if (insertAt < 0) {
      console.error(`❌ ${name}:${jobName} mutates EKODI state but has no checkout/setup lane for ${gateName}.`);
      failed = true;
      continue;
    }
    if (!fix) {
      console.error(`❌ ${name}:${jobName} mutates EKODI state without ${gateName}.`);
      failed = true;
      continue;
    }
    lines.splice(insertAt, 0,
      `      - name: ${gateName}`,
      `        run: ${gateCommand}`,
    );
    fileChanged = true;
  }
  if (fileChanged) {
    fs.writeFileSync(file, `${lines.join('\n').replace(/\n+$/, '')}\n`);
    changed += 1;
  }
}

if (failed) process.exit(1);
console.log(fix
  ? `✅ ${gateName} inserted into ${changed} mutating workflow files.`
  : `✅ All mutation-capable workflow jobs are behind ${gateName}.`);
