#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
    cwd: options.cwd,
  }).trim();
}

function slugify(input) {
  const slug = input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return slug || 'task';
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

function parseArgs(argv) {
  const opts = { worktree: false, base: null, description: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--worktree') opts.worktree = true;
    else if (arg === '--branch-only') opts.worktree = false;
    else if (arg === '--base') opts.base = argv[++i];
    else opts.description.push(arg);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.description.length) {
  console.error('Usage: node scripts/ekodi-task-start.mjs [--worktree|--branch-only] [--base <ref>] <task description>');
  process.exit(2);
}

const root = git(['rev-parse', '--show-toplevel']);
const status = git(['status', '--porcelain'], { cwd: root });
if (status) {
  console.error('Refusing to start a new task from a dirty working tree. Preserve or isolate the existing work first.');
  process.exit(3);
}

try {
  git(['fetch', 'origin', '--prune'], { cwd: root });
} catch (error) {
  console.error('Unable to fetch origin. Task isolation was not created.');
  throw error;
}

let base = opts.base;
if (!base) {
  try {
    base = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { cwd: root });
  } catch {
    base = 'origin/main';
  }
}
if (!base.includes('/')) base = `origin/${base}`;

const shortId = randomBytes(2).toString('hex');
const slug = slugify(opts.description.join(' '));
const branch = `task/${stamp()}-${slug}-${shortId}`;

if (opts.worktree) {
  const repoName = basename(root);
  const worktreesRoot = join(dirname(root), `${repoName}.worktrees`);
  const worktreePath = join(worktreesRoot, branch.replaceAll('/', '__'));
  git(['worktree', 'add', '-b', branch, worktreePath, base], { cwd: root, stdio: 'inherit' });
  console.log(JSON.stringify({ mode: 'worktree', branch, base, worktree: worktreePath }));
} else {
  git(['switch', '-c', branch, base], { cwd: root, stdio: 'inherit' });
  console.log(JSON.stringify({ mode: 'branch', branch, base, worktree: root }));
}
