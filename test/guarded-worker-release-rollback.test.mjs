import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseScript = path.join(repoRoot, 'scripts', 'guarded-worker-release.mjs');

const PREVIOUS_VERSION = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_VERSION = '22222222-2222-4222-8222-222222222222';

function writeProof(outputPath, payload) {
  if (!outputPath) return;
  const resolved = path.resolve(repoRoot, outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(payload, null, 2)}\n`);
}

test('guarded Worker release automatically restores the previous stable version after post-promotion verification failure', {
  skip: process.platform === 'win32' ? 'proof harness uses the Linux CI release boundary' : false,
  timeout: 90_000,
}, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-rollback-proof-'));
  const manifestPath = path.join(tempRoot, 'manifest.json');
  const configPath = path.join(tempRoot, 'wrangler.toml');
  const preloadPath = path.join(tempRoot, 'release-proof-preload.mjs');
  const commandLogPath = path.join(tempRoot, 'wrangler-commands.log');

  try {
    fs.writeFileSync(configPath, 'name = "ekodi-rollback-proof"\nmain = "proof.js"\ncompatibility_date = "2026-09-17"\n');
    fs.writeFileSync(path.join(tempRoot, 'proof.js'), 'export default { fetch() { return new Response("proof-ok"); } };\n');
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      worker: {
        name: 'ekodi-rollback-proof',
        config: 'wrangler.toml',
        requests: [{
          url: 'https://rollback-proof.invalid/health',
          statuses: [200],
          expect: ['proof-ok'],
        }],
      },
    }, null, 2)}\n`);

    fs.writeFileSync(preloadPath, `
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const enabled = process.env.EKODI_ROLLBACK_PROOF_ACTIVE === '1'
  && process.argv.some(value => String(value).includes('guarded-worker-release.mjs'));

if (enabled) {
  const previous = process.env.EKODI_ROLLBACK_PROOF_PREVIOUS;
  const candidate = process.env.EKODI_ROLLBACK_PROOF_CANDIDATE;
  const logPath = process.env.EKODI_ROLLBACK_PROOF_COMMAND_LOG;
  let active = previous;
  const realSpawnSync = childProcess.spawnSync;
  const realSetTimeout = globalThis.setTimeout;

  childProcess.spawnSync = (command, args = [], options = {}) => {
    if (command === process.execPath) {
      const target = String(args[0] || '');
      if (target.includes('validate-ekodi-ai-change-orchestration.mjs') || target === '--test') {
        return { status: 0, signal: null, stdout: '', stderr: '', output: [null, '', ''] };
      }
    }

    if (command === 'npx') {
      const argv = args.map(String);
      const rendered = argv.join(' ');
      fs.appendFileSync(logPath, rendered + '\\n');

      let stdout = '';
      let stderr = '';
      let status = 0;

      if (rendered.includes('deployments status')) {
        stdout = JSON.stringify({ versions: [{ version_id: active, percentage: 100 }] });
      } else if (rendered.includes('versions upload')) {
        stdout = 'Worker Version ID: ' + candidate + '\\n';
      } else if (rendered.includes('versions deploy')) {
        if (argv.includes(candidate + '@100%')) active = candidate;
        else if (argv.includes(previous + '@100%')) active = previous;
        stdout = 'deployment accepted\\n';
      } else {
        status = 2;
        stderr = 'unexpected fake Wrangler invocation: ' + rendered + '\\n';
      }

      return { status, signal: null, stdout, stderr, output: [null, stdout, stderr] };
    }

    return realSpawnSync(command, args, options);
  };
  syncBuiltinESMExports();

  globalThis.setTimeout = (callback, _delay, ...args) => realSetTimeout(callback, 0, ...args);
  globalThis.fetch = async (_url, init = {}) => {
    const headers = new Headers(init.headers || {});
    const override = headers.get('Cloudflare-Workers-Version-Overrides');
    if (override) {
      return new Response('proof-ok', { status: 200, headers: { 'x-ekodi-proof': 'candidate' } });
    }
    if (active === candidate) {
      return new Response('forced post-promotion verification failure', { status: 503 });
    }
    return new Response('proof-ok', { status: 200, headers: { 'x-ekodi-proof': 'stable' } });
  };
}
`);

    const env = {
      ...process.env,
      CLOUDFLARE_API_TOKEN: 'proof-only-not-a-real-token',
      CLOUDFLARE_ACCOUNT_ID: 'proof-only-account',
      EKODI_ROLLBACK_PROOF_ACTIVE: '1',
      EKODI_ROLLBACK_PROOF_PREVIOUS: PREVIOUS_VERSION,
      EKODI_ROLLBACK_PROOF_CANDIDATE: CANDIDATE_VERSION,
      EKODI_ROLLBACK_PROOF_COMMAND_LOG: commandLogPath,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ''}--import=${preloadPath}`,
    };

    const result = spawnSync(process.execPath, [
      releaseScript,
      '--manifest', manifestPath,
      '--root', tempRoot,
    ], {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      timeout: 80_000,
    });

    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    assert.equal(result.status, 1, `fault-injected release must fail closed after verified rollback:\n${output}`);
    assert.match(output, /Rolling back ekodi-rollback-proof to 11111111-1111-4111-8111-111111111111 at 100%\./);
    assert.match(output, /Automatic rollback verified against the stable rollback contract\./);

    const commands = fs.readFileSync(commandLogPath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    const attachIndex = commands.findIndex(line => line.includes(`${PREVIOUS_VERSION}@100%`) && line.includes(`${CANDIDATE_VERSION}@0%`));
    const promoteIndex = commands.findIndex(line => line.includes(`${CANDIDATE_VERSION}@100%`) && !line.includes(`${PREVIOUS_VERSION}@100%`));
    const rollbackIndex = commands.findIndex((line, index) => index > promoteIndex && line.includes(`${PREVIOUS_VERSION}@100%`) && !line.includes(`${CANDIDATE_VERSION}@0%`));

    assert.ok(attachIndex >= 0, `candidate must first be attached at 0% traffic: ${commands.join('\n')}`);
    assert.ok(promoteIndex > attachIndex, `candidate must be promoted only after candidate verification: ${commands.join('\n')}`);
    assert.ok(rollbackIndex > promoteIndex, `previous stable version must be restored after the injected production failure: ${commands.join('\n')}`);

    const scriptDigest = crypto.createHash('sha256').update(fs.readFileSync(releaseScript)).digest('hex');
    writeProof(process.env.EKODI_ROLLBACK_PROOF_OUTPUT, {
      schemaVersion: 1,
      proofId: 'GEN10-YELLOW-ROLLBACK-FAULT-INJECTION-001',
      generatedAt: new Date().toISOString(),
      generation: 10,
      subject: 'scripts/guarded-worker-release.mjs',
      subjectDigest: `sha256:${scriptDigest}`,
      workflow: {
        runId: process.env.GITHUB_RUN_ID || null,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
        sha: process.env.GITHUB_SHA || null,
      },
      boundary: {
        mode: 'deterministic-safe-fault-injection',
        realProviderMutationPerformed: false,
        productionSecretUsed: false,
        unrelatedPreReleaseGatesStubbed: true,
        guardedReleaseImplementationExecuted: true,
      },
      sequence: {
        previousStableVersion: PREVIOUS_VERSION,
        candidateVersion: CANDIDATE_VERSION,
        candidateAttachedAtZeroPercent: true,
        candidatePromotedToOneHundredPercent: true,
        injectedFailure: 'post-promotion HTTP 503',
        previousStableRestoredToOneHundredPercent: true,
        rollbackContractReverified: true,
      },
      claimBoundary: {
        automaticRecoveryPathRuntimeProvenInSafeTestBoundary: true,
        liveProductionFaultInjected: false,
        liveProviderRollbackProvenByThisArtifact: false,
      },
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
