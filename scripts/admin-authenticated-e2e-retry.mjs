import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const maxAttempts = 2;
const attemptTimeoutMs = 90_000;
const artifactsDir = path.resolve('artifacts/admin-authenticated-e2e');

async function resetArtifacts() {
  await fs.rm(artifactsDir, { recursive: true, force: true });
  await fs.mkdir(artifactsDir, { recursive: true });
}

function runAttempt(attempt) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['scripts/admin-authenticated-e2e.mjs'], {
      env: { ...process.env, E2E_ATTEMPT: String(attempt) },
      stdio: 'inherit',
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`[E2E] attempt ${attempt} exceeded ${attemptTimeoutMs}ms; terminating browser verifier`);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3_000).unref?.();
    }, attemptTimeoutMs);
    timer.unref?.();

    child.once('error', error => {
      clearTimeout(timer);
      resolve({ ok: false, timedOut, code: null, error });
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut, timedOut, code, signal });
    });
  });
}

let lastFailure = null;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  await resetArtifacts();
  console.log(`[E2E] bounded verification attempt ${attempt}/${maxAttempts}`);
  const result = await runAttempt(attempt);
  if (result.ok) {
    console.log(`[E2E] authenticated Admin verification passed on attempt ${attempt}/${maxAttempts}`);
    process.exit(0);
  }

  lastFailure = result;
  console.warn(`[E2E] attempt ${attempt}/${maxAttempts} failed: ${JSON.stringify(result)}`);
  if (attempt < maxAttempts) console.warn('[E2E] retrying once from a fresh browser process to distinguish a transient renderer stall from a reproducible production failure');
}

console.error(`[E2E] authenticated Admin verification failed after ${maxAttempts} bounded attempts: ${JSON.stringify(lastFailure)}`);
process.exit(1);
