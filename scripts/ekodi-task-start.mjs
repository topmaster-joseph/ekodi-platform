#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    cwd: options.cwd,
  }).trim();
}

function git(args, options = {}) {
  return run('git', args, options);
}

function slugify(value, max = 64) {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, max);
  return slug;
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

function parseArgs(argv) {
  const opts = {
    agent: null,
    taskId: null,
    base: 'main',
    worktree: true,
    description: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--agent') opts.agent = argv[++i];
    else if (arg === '--task-id') opts.taskId = argv[++i];
    else if (arg === '--base') opts.base = argv[++i];
    else if (arg === '--worktree') opts.worktree = true;
    else if (arg === '--branch-only') opts.worktree = false;
    else opts.description.push(arg);
  }

  return opts;
}

function branchExists(root, branch) {
  try {
    git(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

function remoteBranchExists(root, branch) {
  try {
    git(['ls-remote', '--exit-code', '--heads', 'origin', branch], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

const opts = parseArgs(process.argv.slice(2));
const agent = slugify(opts.agent || process.env.EKODI_AGENT || 'generic', 32);
if (!agent) {
  console.error('Missing valid agent. Use --agent chatgpt|claude|codex|gemini|copilot|human|generic.');
  process.exit(2);
}

const description = opts.description.join(' ').trim();
let taskId = slugify(opts.taskId, 64);
if (!taskId) {
  const slug = slugify(description || 'task', 36) || 'task';
  taskId = `${stamp()}-${slug}-${randomBytes(2).toString('hex')}`;
}

const base = String(opts.base || 'main').trim();
if (!base || base.startsWith('refs/') || base.includes('..') || /\s/.test(base)) {
  console.error(`Unsafe base ref: ${base}`);
  process.exit(2);
}

const branch = `ai/${agent}/${taskId}`;
const root = git(['rev-parse', '--show-toplevel']);
git(['check-ref-format', '--branch', branch], { cwd: root });

git(['fetch', '--prune', 'origin', base], { cwd: root, stdio: 'inherit' });
const baseRef = `origin/${base}`;
const baseSha = git(['rev-parse', baseRef], { cwd: root });

const localExists = branchExists(root, branch);
const remoteExists = remoteBranchExists(root, branch);

if (!localExists && remoteExists) {
  git(['fetch', 'origin', `${branch}:${branch}`], { cwd: root, stdio: 'inherit' });
}

if (!opts.worktree) {
  const status = git(['status', '--porcelain'], { cwd: root });
  if (status) {
    console.error('Refusing branch-only mode in a dirty working tree. Use the default worktree mode instead.');
    process.exit(3);
  }

  if (branchExists(root, branch)) {
    git(['switch', branch], { cwd: root, stdio: 'inherit' });
  } else {
    git(['switch', '-c', branch, baseRef], { cwd: root, stdio: 'inherit' });
  }

  if (!remoteExists) {
    git(['push', '-u', 'origin', branch], { cwd: root, stdio: 'inherit' });
  }

  const branchSha = git(['rev-parse', 'HEAD'], { cwd: root });
  console.log(JSON.stringify({
    agent,
    task_id: taskId,
    mode: 'branch',
    branch,
    worktree: root,
    base_ref: base,
    base_sha: baseSha,
    branch_sha: branchSha,
  }));
  process.exit(0);
}

const repoName = basename(root);
const worktreeRoot = join(dirname(root), '.ekodi-worktrees', repoName);
const worktreePath = join(worktreeRoot, `${agent}-${taskId}`);

if (existsSync(worktreePath)) {
  const currentBranch = git(['branch', '--show-current'], { cwd: worktreePath });
  if (currentBranch !== branch) {
    console.error(`Refusing to reuse ${worktreePath}; it is on ${currentBranch}, expected ${branch}.`);
    process.exit(4);
  }
} else if (branchExists(root, branch)) {
  git(['worktree', 'add', worktreePath, branch], { cwd: root, stdio: 'inherit' });
} else {
  git(['worktree', 'add', '-b', branch, worktreePath, baseRef], { cwd: root, stdio: 'inherit' });
}

if (!remoteExists) {
  git(['push', '-u', 'origin', branch], { cwd: worktreePath, stdio: 'inherit' });
}

const branchSha = git(['rev-parse', 'HEAD'], { cwd: worktreePath });
console.log(JSON.stringify({
  agent,
  task_id: taskId,
  mode: 'worktree',
  branch,
  worktree: worktreePath,
  base_ref: base,
  base_sha: baseSha,
  branch_sha: branchSha,
}));
