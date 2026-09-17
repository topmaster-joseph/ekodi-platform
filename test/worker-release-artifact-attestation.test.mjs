import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repoRoot, 'scripts', 'attest-worker-release-artifact.mjs');

function attest(root, output = 'artifacts/evidence.json') {
  const result = spawnSync(process.execPath, [
    script,
    '--bundle', 'bundle',
    '--assets', 'dist',
    '--file', 'config=wrangler.toml',
    '--file', 'manifest=manifest.json',
    '--output', output,
    '--source-sha', '0123456789abcdef',
    '--wrangler-version', '4.119.0',
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(fs.readFileSync(path.join(root, output), 'utf8'));
}

test('release artifact digest is deterministic and changes when any covered byte changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-release-artifact-'));
  try {
    fs.mkdirSync(path.join(root, 'bundle'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'bundle', 'worker.js'), 'export default { fetch() { return new Response("ok"); } };\n');
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><title>EKODI</title>\n');
    fs.writeFileSync(path.join(root, 'dist', 'nested', 'app.js'), 'console.log("stable");\n');
    fs.writeFileSync(path.join(root, 'wrangler.toml'), 'name = "ekodi-proof"\n');
    fs.writeFileSync(path.join(root, 'manifest.json'), '{"worker":{"name":"ekodi-proof"}}\n');

    const first = attest(root, 'artifacts/first.json');
    const second = attest(root, 'artifacts/second.json');
    assert.equal(first.artifactDigest, second.artifactDigest);
    assert.equal(first.entryCount, 5);
    assert.equal(first.claimBoundary.digestDoesNotIncludeSecrets, true);

    fs.writeFileSync(path.join(root, 'dist', 'nested', 'app.js'), 'console.log("changed");\n');
    const changed = attest(root, 'artifacts/changed.json');
    assert.notEqual(changed.artifactDigest, first.artifactDigest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('release artifact attestation rejects symbolic links', { skip: process.platform === 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ekodi-release-artifact-link-'));
  try {
    fs.mkdirSync(path.join(root, 'bundle'), { recursive: true });
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'bundle', 'worker.js'), 'export default {};\n');
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), 'ok\n');
    fs.writeFileSync(path.join(root, 'wrangler.toml'), 'name = "ekodi-proof"\n');
    fs.writeFileSync(path.join(root, 'manifest.json'), '{}\n');
    fs.symlinkSync(path.join(root, 'dist', 'index.html'), path.join(root, 'dist', 'linked.html'));

    const result = spawnSync(process.execPath, [
      script,
      '--bundle', 'bundle',
      '--assets', 'dist',
      '--file', 'config=wrangler.toml',
      '--file', 'manifest=manifest.json',
      '--output', 'artifacts/evidence.json',
    ], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /symbolic links are not allowed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
