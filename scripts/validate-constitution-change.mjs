import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const constitution = JSON.parse(fs.readFileSync('governance/constitution/constitution.json', 'utf8').replace(/^\uFEFF/, ''));

const normalizeRepoPath = value => String(value || '')
  .trim()
  .replaceAll('\\', '/')
  .replace(/^\.\//, '')
  .replace(/\/{2,}/g, '/');

const compileProtectedPath = rawPattern => {
  if (typeof rawPattern !== 'string' || !rawPattern.trim()) {
    throw new Error('protected path entries must be non-empty strings');
  }
  const pattern = normalizeRepoPath(rawPattern);
  if (pattern.startsWith('/') || pattern.split('/').includes('..')) {
    throw new Error(`protected path must stay repository-relative: ${rawPattern}`);
  }
  if (!pattern.includes('*')) return file => normalizeRepoPath(file) === pattern;
  if (pattern.endsWith('/**') && pattern.indexOf('*') === pattern.length - 2) {
    const prefix = pattern.slice(0, -2);
    return file => normalizeRepoPath(file).startsWith(prefix);
  }
  throw new Error(`unsupported protected path pattern: ${rawPattern}`);
};
const resolveGitExecutable = () => {
  if (process.env.EKODI_GIT_BIN) return process.env.EKODI_GIT_BIN;
  if (process.platform !== 'win32') return 'git';
  try {
    const candidates = execFileSync('where.exe', ['git'], { encoding: 'utf8' })
      .split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    for (const candidate of candidates) {
      if (/\.exe$/i.test(candidate) && fs.existsSync(candidate)) return candidate;
      if (/\.(cmd|bat)$/i.test(candidate) && fs.existsSync(candidate)) {
        const wrapper = fs.readFileSync(candidate, 'utf8');
        const match = wrapper.match(/([A-Za-z]:\\[^\r\n"]*?git\.exe)/i);
        if (match && fs.existsSync(match[1].trim())) return match[1].trim();
      }
    }
  } catch {}
  return 'git';
};

const protectedPaths = constitution.changeControl?.protectedPaths;
if (!Array.isArray(protectedPaths) || protectedPaths.length === 0) {
  console.error('Constitution change gate: canonical changeControl.protectedPaths is missing or empty.');
  process.exit(1);
}

let protectedMatchers;
try {
  protectedMatchers = protectedPaths.map(pattern => ({ pattern, matches: compileProtectedPath(pattern) }));
} catch (error) {
  console.error(`Constitution change gate: ${error.message}`);
  process.exit(1);
}
const base = process.env.GITHUB_BASE_REF || process.env.EKODI_BASE_REF || '';
if (!base) {
  console.log(`Constitution change gate: local/static run; canonical protected path contract validated (${protectedPaths.length} entries), diff approval gate skipped.`);
  process.exit(0);
}

let changed = [];
try {
  const gitExecutable = resolveGitExecutable();
  const output = execFileSync(gitExecutable, ['diff', '--name-only', `origin/${base}...HEAD`], { encoding: 'utf8' });
  changed = output.split(/\r?\n/).map(normalizeRepoPath).filter(Boolean);
} catch {
  console.error('Constitution change gate cannot inspect the PR diff.');
  process.exit(1);
}

const protectedChanged = changed.filter(file => protectedMatchers.some(({ matches }) => matches(file)));
if (!protectedChanged.length) {
  console.log('Constitution change gate: no constitutional policy files changed.');
  process.exit(0);
}

const amendmentChanged = changed.some(file => file.startsWith('governance/amendments/') && file.endsWith('.json'));
if (!amendmentChanged) {
  console.error('Constitution change gate: protected policy changed without an amendment record.');
  protectedChanged.forEach(file => console.error(`- ${file}`));
  process.exit(1);
}
const isBootstrap = constitution.version === '1.0.0' && changed.includes('governance/amendments/2026-08-28-constitution-v1.json');
if (isBootstrap) {
  console.log('Constitution change gate: approved v1 bootstrap adoption detected.');
  process.exit(0);
}

if (process.env.EKODI_CONSTITUTION_APPROVED !== 'true') {
  console.error('Constitution change gate: explicit owner confirmation is required for C2/C3 protected policy changes.');
  console.error('After confirmation, apply the constitution-approved PR label and rerun checks.');
  process.exit(1);
}
console.log(`Constitution change gate: owner confirmation present for ${protectedChanged.length} protected file(s) from canonical changeControl.protectedPaths.`);
