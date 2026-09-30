import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scriptSource = await readFile(join(root, 'scripts/validate-constitution-change.mjs'), 'utf8');
const constitutionSource = await readFile(join(root, 'governance/constitution/constitution.json'), 'utf8');

const run = (cwd, command, args, env = {}) => spawnSync(command, args, {
  cwd,
  encoding: 'utf8',
  env: { ...process.env, ...env },
});

const resolveGitCommand = () => {
  if (process.platform !== 'win32') return 'git';
  const found = spawnSync('where.exe', ['git'], { encoding: 'utf8' }).stdout?.split(/\r?\n/).filter(Boolean) || [];
  for (const candidate of found) {
    if (/\.exe$/i.test(candidate) && fs.existsSync(candidate)) return candidate;
    if (/\.(cmd|bat)$/i.test(candidate) && fs.existsSync(candidate)) {
      const match = fs.readFileSync(candidate, 'utf8').match(/([A-Za-z]:\\[^\r\n"]*?git\.exe)/i);
      if (match && fs.existsSync(match[1].trim())) return match[1].trim();
    }
  }
  throw new Error('Git executable not found');
};
const gitCommand = resolveGitCommand();
const git = (cwd, ...args) => {
  const result = spawnSync(gitCommand, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
};
const seedRepo = async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'ekodi-change-gate-'));
  for (const dir of ['governance/constitution', 'governance/amendments', 'scripts', '.github/workflows', 'config']) {
    await mkdir(join(cwd, dir), { recursive: true });
  }
  await writeFile(join(cwd, 'governance/constitution/constitution.json'), constitutionSource);
  await writeFile(join(cwd, 'scripts/validate-constitution-change.mjs'), scriptSource);
  const fixtures = {
    'CONSTITUTION.md': '# EKODI\n',
    'governance/amendments/existing.json': '{}\n',
    'platform-boundaries.json': '{}\n',
    'config/core-data-boundaries.json': '{}\n',
    'config/storage-policy.json': '{}\n',
    'config/service-workspace-policy.json': '{}\n',
    'scripts/validate-constitution.mjs': 'console.log("ok");\n',
    '.github/workflows/constitution-check.yml': 'name: Constitution\n',
    'life-worker.js': 'export default {};\n',
  };
  for (const [file, content] of Object.entries(fixtures)) await writeFile(join(cwd, file), content);
  git(cwd, 'init');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'user.name', 'EKODI Test');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', 'baseline');
  git(cwd, 'update-ref', 'refs/remotes/origin/main', git(cwd, 'rev-parse', 'HEAD'));
  return cwd;
};
const commitChange = async (cwd, target, { withAmendment = true } = {}) => {
  await writeFile(join(cwd, target), `${await readFile(join(cwd, target), 'utf8')}\n`);
  if (withAmendment && !target.startsWith('governance/amendments/')) {
    await writeFile(join(cwd, 'governance/amendments/change-record.json'), '{"status":"approved"}\n');
  }
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', `change ${target}`);
};

const runGate = (cwd, approved) => run(cwd, process.execPath, ['scripts/validate-constitution-change.mjs'], {
  EKODI_BASE_REF: 'main',
  EKODI_CONSTITUTION_APPROVED: approved ? 'true' : 'false',
});

const newlyEnforced = [
  'governance/amendments/existing.json',
  'platform-boundaries.json',
  'scripts/validate-constitution.mjs',
  '.github/workflows/constitution-check.yml',
];

test('canonical protectedPaths enforce approval for every previously omitted hard-gate path', async () => {
  for (const target of newlyEnforced) {
    const cwd = await seedRepo();
    try {
      await commitChange(cwd, target);
      const denied = runGate(cwd, false);
      assert.equal(denied.status, 1, `${target} should require owner approval`);
      assert.match(`${denied.stdout}${denied.stderr}`, /explicit owner confirmation is required/);
      const approved = runGate(cwd, true);
      assert.equal(approved.status, 0, `${target} should pass with owner approval: ${approved.stderr}`);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});
test('protected policy change still requires an amendment record', async () => {
  const cwd = await seedRepo();
  try {
    await commitChange(cwd, 'platform-boundaries.json', { withAmendment: false });
    const result = runGate(cwd, true);
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}${result.stderr}`, /without an amendment record/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('ordinary runtime implementation remains outside C2/C3 approval', async () => {
  const cwd = await seedRepo();
  try {
    await commitChange(cwd, 'life-worker.js', { withAmendment: false });
    const result = runGate(cwd, false);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no constitutional policy files changed/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test('unsupported canonical protected path syntax fails closed', async () => {
  const cwd = await seedRepo();
  try {
    const constitutionPath = join(cwd, 'governance/constitution/constitution.json');
    const constitution = JSON.parse(await readFile(constitutionPath, 'utf8'));
    constitution.changeControl.protectedPaths = ['governance/*/unsafe.json'];
    await writeFile(constitutionPath, `${JSON.stringify(constitution, null, 2)}\n`);
    const result = run(cwd, process.execPath, ['scripts/validate-constitution-change.mjs']);
    assert.equal(result.status, 1);
    assert.match(`${result.stdout}${result.stderr}`, /unsupported protected path pattern/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
