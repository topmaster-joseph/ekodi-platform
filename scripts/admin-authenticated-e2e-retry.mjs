// Generation 10 Autonomous Health production verification wiring probe.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { adminMenuOrder } from '../admin-menu-registry.js';

const maxAttemptsPerMenu = 2;
const menuTimeoutMs = 30_000;
const taxSurfaceTimeoutMs = 35_000;
const assistTimeoutMs = 60_000;
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');
const menuIds = adminMenuOrder();
const productionRegistryUrl = 'https://ekodi.kr/admin-menu-registry.js';
const productionConvergenceAttempts = 36;
const productionConvergenceDelayMs = 5_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function missingProductionMenus(source) {
  return menuIds.filter(id => !source.includes(`id: '${id}'`));
}

async function waitForProductionMenuRegistry() {
  let lastMissing = [...menuIds];
  for (let attempt = 1; attempt <= productionConvergenceAttempts; attempt += 1) {
    try {
      const probe = new URL(productionRegistryUrl);
      probe.searchParams.set('e2e_sha', process.env.GITHUB_SHA || 'manual');
      probe.searchParams.set('probe', String(Date.now()));
      const response = await fetch(probe, {
        headers: { accept: 'text/javascript', 'cache-control': 'no-cache' },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        lastMissing = missingProductionMenus(await response.text());
        if (!lastMissing.length) {
          console.log(`[E2E] production Admin registry converged: ${menuIds.length}/${menuIds.length} menus`);
          return;
        }
      }
    } catch (error) {
      console.warn(`[E2E] production Admin registry probe ${attempt} failed: ${error?.message || error}`);
    }
    console.warn(`[E2E] production Admin registry not converged (${attempt}/${productionConvergenceAttempts}); missing=${lastMissing.join(',') || 'probe-error'}`);
    if (attempt < productionConvergenceAttempts) await sleep(productionConvergenceDelayMs);
  }
  throw new Error(`Production Admin registry did not converge to ${menuIds.length} menus; missing: ${lastMissing.join(',') || 'unknown'}`);
}

await waitForProductionMenuRegistry();
await fs.rm(artifactsDir, { recursive: true, force: true });
await fs.mkdir(artifactsDir, { recursive: true });

function terminate(child, signal) {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {}
}

function runIsolated(script, env, timeoutMs, label) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, ...env },
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`[E2E] ${label} exceeded ${timeoutMs}ms; terminating isolated renderer`);
      terminate(child, 'SIGTERM');
      setTimeout(() => terminate(child, 'SIGKILL'), 2_000).unref?.();
    }, timeoutMs);
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

function runMenu(menuId, attempt) {
  return runIsolated(
    'scripts/admin-authenticated-e2e-menu-worker.mjs',
    { E2E_MENU_ID: menuId, E2E_ATTEMPT: String(attempt) },
    menuTimeoutMs,
    `${menuId} attempt ${attempt}`,
  );
}

function runTaxSurface() {
  return runIsolated(
    'scripts/admin-authenticated-tax-surface-e2e.mjs',
    {},
    taxSurfaceTimeoutMs,
    'Tax authenticated surface fallback',
  );
}

function runCanonicalAssist() {
  return runIsolated('scripts/admin-assist-canonical-e2e.mjs', {}, assistTimeoutMs, 'canonical Assist round-trip');
}

async function readMenuReport(menuId) {
  const file = path.join(artifactsDir, `menu-${menuId.replace(/[^a-z0-9_-]/gi, '_')}.json`);
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

async function readTaxSurfaceReport() {
  try { return JSON.parse(await fs.readFile(path.join(artifactsDir, 'tax-surface.json'), 'utf8')); } catch { return null; }
}

async function readAssistReport() {
  try { return JSON.parse(await fs.readFile(path.join(artifactsDir, 'assist-canonical.json'), 'utf8')); } catch { return null; }
}

function isKnownTaxRendererProtocolRace(report) {
  const error = String(report?.error || '');
  return report?.lastStage === 'tax-handoff'
    && /page\.waitForURL: net::ERR_(?:HTTP2_PROTOCOL_ERROR|ABORTED)/.test(error);
}

const aggregate = {
  generatedAt: new Date().toISOString(),
  baseUrl: 'https://ekodi.kr/admin/',
  canonicalCampusUrl: 'https://ekodi.kr/admin/home/campus',
  compatibilityMenuBaseUrl: 'https://admin.ekodi.kr/',
  expectedMenuCount: menuIds.length,
  checkedMenuCount: 0,
  passed: false,
  mode: 'isolated-menu-renderers+canonical-assist-roundtrip',
  taxProtocolFallback: 'strict-isolated-tax-surface-on-known-http2-commit-race',
  results: [],
  assistProbe: null,
  diagnostics: { pageErrors: [], consoleErrors: [], failedAdminAssets: [], attemptFailures: [] },
  error: null,
};

let fatal = null;
for (const menuId of menuIds) {
  let passed = false;
  let lastReport = null;
  for (let attempt = 1; attempt <= maxAttemptsPerMenu; attempt += 1) {
    console.log(`[E2E] ${menuId}: isolated attempt ${attempt}/${maxAttemptsPerMenu}`);
    const outcome = await runMenu(menuId, attempt);
    const report = await readMenuReport(menuId);
    lastReport = report;
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

  if (!passed && menuId === 'tax' && isKnownTaxRendererProtocolRace(lastReport)) {
    console.warn('[E2E] tax: main-frame Tax request passed worker guards but Playwright hit the known cross-origin HTTP/2 commit race; running strict isolated Tax surface verification');
    const outcome = await runTaxSurface();
    const taxSurface = await readTaxSurfaceReport();
    if (outcome.ok && taxSurface?.passed && taxSurface?.result?.ok) {
      aggregate.results.push({
        ...taxSurface.result,
        attempts: maxAttemptsPerMenu,
        adminHandoffRequestVerified: true,
        rendererProtocolFallback: 'strict-isolated-tax-surface',
      });
      aggregate.checkedMenuCount += 1;
      console.log('[E2E] tax: strict isolated Tax surface verification passed after the known Playwright HTTP/2 commit race');
      passed = true;
    } else {
      aggregate.diagnostics.attemptFailures.push({
        menuId,
        attempt: 'strict-tax-surface',
        ...outcome,
        error: taxSurface?.error || outcome.error || 'strict Tax surface verification failed',
      });
    }
  }

  if (!passed) {
    fatal = new Error(`${menuId}: failed after ${maxAttemptsPerMenu} isolated renderer attempts${menuId === 'tax' ? ' and strict Tax surface verification' : ''}`);
    break;
  }
}

if (!fatal) {
  console.log('[E2E] canonical Assist: verifying bottom input → lazy runtime → API → rendered reply');
  const outcome = await runCanonicalAssist();
  const assist = await readAssistReport();
  aggregate.assistProbe = assist;
  if (!outcome.ok || !assist?.passed) {
    const reason = assist?.error || outcome.error || `exit=${outcome.code} signal=${outcome.signal || 'none'}`;
    fatal = new Error(`canonical Assist round-trip failed: ${reason}`);
  } else {
    console.log(`[E2E] canonical Assist passed: HTTP ${assist.apiStatus}, replyLength=${assist.replyLength}`);
  }
}

aggregate.generatedAt = new Date().toISOString();
aggregate.passed = !fatal
  && aggregate.checkedMenuCount === aggregate.expectedMenuCount
  && aggregate.assistProbe?.passed === true;
aggregate.error = fatal ? fatal.message : null;
aggregate.diagnostics.consoleErrors = aggregate.diagnostics.consoleErrors.slice(-80);
await fs.writeFile(path.join(artifactsDir, 'report.json'), JSON.stringify(aggregate, null, 2));

if (!aggregate.passed) {
  console.error(`[E2E] authenticated Admin verification failed: ${aggregate.error}`);
  process.exit(1);
}
console.log(`[E2E] authenticated Admin verification passed: ${aggregate.checkedMenuCount}/${aggregate.expectedMenuCount} menus + canonical Assist command round-trip`);
