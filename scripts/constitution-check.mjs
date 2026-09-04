import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const registryPath = path.join(root, 'governance/registry/constitution-registry.json');
const constitutionPath = path.join(root, 'governance/constitution/constitution.json');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matches(file, pattern) {
  if (!pattern.includes('*')) return file === pattern || file.startsWith(`${pattern}/`);
  return globToRegExp(pattern).test(file);
}

function resolvePointer(document, pointer) {
  if (!pointer || pointer === '/') return document;
  return pointer
    .split('/')
    .slice(1)
    .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((value, key) => value?.[key], document);
}

function explicitFiles() {
  const index = process.argv.indexOf('--files');
  if (index === -1 || !process.argv[index + 1]) return [];
  return process.argv[index + 1].split(',').map(value => value.trim()).filter(Boolean);
}

function changedFiles() {
  const explicit = explicitFiles();
  if (explicit.length) return explicit;

  const base = process.env.GITHUB_BASE_REF || process.env.EKODI_BASE_REF || '';
  if (!base) return [];

  try {
    const output = execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`], {
      cwd: root,
      encoding: 'utf8'
    });
    return output.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  } catch (error) {
    console.warn(`Constitution Check advisory: diff unavailable (${error.message}).`);
    return [];
  }
}

function emit(lines) {
  for (const line of lines) console.log(line);
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) fs.appendFileSync(summaryFile, `${lines.join('\n')}\n`, 'utf8');
}

try {
  const registry = readJson(registryPath);
  const constitution = readJson(constitutionPath);
  const changed = changedFiles();
  const activeRules = (registry.rules || []).filter(rule => rule.status === 'active');
  const brokenPointers = activeRules.filter(rule => resolvePointer(constitution, rule.sourcePointer) === undefined);

  const registryChanged = changed.some(file => [
    'governance/registry/constitution-registry.json',
    registry.authority?.canonicalSource,
    registry.authority?.humanReadableMirror
  ].filter(Boolean).includes(file));

  const related = activeRules.filter(rule =>
    changed.some(file => (rule.impactPaths || []).some(pattern => matches(file, pattern)))
  );

  const architectureSignals = [
    'config/',
    'deploy/',
    '.github/workflows/',
    'auth-site/',
    'migrations/',
    'database/'
  ];
  const architectureFileNames = new Set([
    'platform-boundaries.json',
    'site-worker.js',
    'api-worker.js',
    'auth-worker.js',
    'security-edge.js',
    'ai-agent-control.js',
    'ai-governance.js',
    'ai-governance-runtime.js',
    'ai-resilience-runtime.js'
  ]);
  const hasUnmappedArchitecturalChange = changed.some(file =>
    (architectureSignals.some(prefix => file.startsWith(prefix)) || architectureFileNames.has(file)) &&
    !related.some(rule => (rule.impactPaths || []).some(pattern => matches(file, pattern)))
  );

  let result = 'PASS';
  if (registryChanged) result = 'UPDATE';
  else if (related.length) result = 'RELATED';
  else if (hasUnmappedArchitecturalChange) result = 'NEW_AREA';

  const lines = [
    '## EKODI Constitution Check',
    '',
    `**Result:** ${result}`,
    `**Mode:** advisory, non-blocking`,
    `**Changed files inspected:** ${changed.length}`,
    `**Canonical source:** ${registry.authority?.canonicalSource || 'unknown'}`
  ];

  if (!changed.length) {
    lines.push('', 'No PR/base diff was supplied. Registry integrity was inspected without change-impact classification.');
  }

  if (related.length) {
    lines.push('', '### Related active principles');
    for (const rule of related) lines.push(`- ${rule.id} · ${rule.area} · ${rule.title}`);
  }

  if (hasUnmappedArchitecturalChange) {
    lines.push('', '### Review note', '- Architectural change detected outside the current registry index. Consider whether a new registry entry is needed.');
  }

  if (brokenPointers.length) {
    lines.push('', '### Registry maintenance warning');
    for (const rule of brokenPointers) lines.push(`- ${rule.id}: source pointer not found: ${rule.sourcePointer}`);
  }

  lines.push(
    '',
    'Semantic conflicts are intentionally not auto-decided. EKODI Orchestrator or an authorized human reviews constitutional meaning when needed.',
    'This advisory check never grants approval and never replaces existing security, release, or C2/C3 change-control gates.'
  );

  emit(lines);
  process.exit(0);
} catch (error) {
  emit([
    '## EKODI Constitution Check',
    '',
    '**Result:** CHECK_ERROR',
    '**Mode:** advisory, non-blocking',
    `Registry check could not complete: ${error.message}`,
    '',
    'Existing hard validation and release gates remain authoritative.'
  ]);
  process.exit(0);
}
