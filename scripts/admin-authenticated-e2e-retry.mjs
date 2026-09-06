import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { adminMenuOrder } from '../admin-menu-registry.js';

const maxAttemptsPerMenu = 2;
const menuTimeoutMs = 30_000;
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');
const menuIds = adminMenuOrder();
await fs.rm(artifactsDir, { recursive: true, force: true });
await fs.mkdir(artifactsDir, { recursive: true });

function terminate(child, signal) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {}
}

function runMenu(menuId, attempt) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['scripts/admin-authenticated-e2e-menu-worker.mjs'], {
      env: { ...process.env, E2E_MENU_ID: menuId, E2E_ATTEMPT: String(attempt) },
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`[E2E] ${menuId} attempt ${attempt} exceeded ${menuTimeoutMs}ms; terminating isolated renderer`);
      terminate(child, 'SIGTERM');
      setTimeout(() => terminate(child, 'SIGKILL'), 2_000).unref?.();
    }, menuTimeoutMs);
    timer.unref?.();
    child.once('error', error => {
      clearTimeout(timer);
      resolve({ ok: false, timedOut, code: null, signal: null, error: String(error?.message || error) });
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, timedOut, code, signal });
    });
  });
}

async function readMenuReport(menuId) {
  const file = path.join(artifactsDir, `menu-${menuId.replace(/[^a-z0-9_-]/gi, '_')}.json`);
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

const aggregate = {
  generatedAt: new Date().toISOString(),
  baseUrl: 'https://admin.ekodi.kr/',
  expectedMenuCount: menuIds.length,
  checkedMenuCount: 0,
  passed: false,
  mode: 'isolated-menu-renderers',
  results: [],
  diagnostics: { pageErrors: [], consoleErrors: [], failedAdminAssets: [], attemptFailures: [] },
  error: null,
};

let fatal = null;
for (const menuId of menuIds) {
  let passed = false;
  for (let attempt = 1; attempt <= maxAttemptsPerMenu; attempt += 1) {
    console.log(`[E2E] ${menuId}: isolated attempt ${attempt}/${maxAttemptsPerMenu}`);
    const outcome = await runMenu(menuId, attempt);
    const report = await readMenuReport(menuId);
    if (outcome.ok && report?.passed && report.results?.length === 1) {
      aggregate.results.push({ ...report.results[0], attempts: attempt });
      aggregate.checkedMenuCount += 1;
      aggregate.diagnostics.pageErrors.push(...(report.diagnostics?.pageErrors || []));
      aggregate.diagnostics.consoleErrors.push(...(report.diagnostics?.consoleErrors || []));
      aggregate.diagnostics.failedAdminAssets.push(...(report.diagnostics?.failedAdminAssets || []));
      console.log(`[E2E] ${menuId}: passed with fresh renderer on attempt ${attempt}`);
      passed = true;
      break;
    }
    const failure = { menuId, attempt, ...outcome, error: report?.error || outcome.error || 'isolated menu verification failed' };
    aggregate.diagnostics.attemptFailures.push(failure);
    console.warn(`[E2E] ${menuId}: attempt ${attempt} failed; ${failure.error}`);
    if (attempt < maxAttemptsPerMenu) console.warn(`[E2E] ${menuId}: retrying only this menu in a brand-new Chromium process`);
  }
  if (!passed) {
    fatal = new Error(`${menuId}: failed after ${maxAttemptsPerMenu} isolated renderer attempts`);
    break;
  }
}

aggregate.generatedAt = new Date().toISOString();
aggregate.passed = !fatal && aggregate.checkedMenuCount === aggregate.expectedMenuCount;
aggregate.error = fatal ? fatal.message : null;
aggregate.diagnostics.consoleErrors = aggregate.diagnostics.consoleErrors.slice(-80);
await fs.writeFile(path.join(artifactsDir, 'report.json'), JSON.stringify(aggregate, null, 2));

if (!aggregate.passed) {
  console.error(`[E2E] authenticated Admin isolated verification failed: ${aggregate.error}`);
  process.exit(1);
}
console.log(`[E2E] authenticated Admin isolated verification passed: ${aggregate.checkedMenuCount}/${aggregate.expectedMenuCount} menus`);
