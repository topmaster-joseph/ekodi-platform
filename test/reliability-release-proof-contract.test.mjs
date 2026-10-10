import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reliability = readFileSync(new URL('../.github/workflows/reliability-validation.yml', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../.github/workflows/deploy-site-core.yml', import.meta.url), 'utf8');

test('shared-site must still require staging and release reliability before guarded deployment', () => {
  assert.match(shared, /reliability_gate:\r?\n\s+needs: staging_gate\r?\n\s+uses: \.\/\.github\/workflows\/reliability-validation\.yml/);
  assert.match(shared, /suite: release/);
  assert.match(shared, /deploy:\r?\n\s+needs: \[staging_gate, reliability_gate\]/);
});

test('release reliability cannot skip the former manual-only job', () => {
  assert.match(reliability, /staging-manual:\r?\n[\s\S]*?needs: \[contract, staging-release\]/);
  assert.match(reliability, /always\(\) && needs\.contract\.result == 'success'/);
  assert.match(reliability, /inputs\.suite == 'release' && needs\['staging-release'\]\.result == 'success'/);
  assert.match(reliability, /github\.event_name == 'workflow_dispatch' && inputs\.suite != 'release'/);
});

test('release evidence is independently checked without repeating staging load', () => {
  const section = reliability.slice(reliability.indexOf('  staging-manual:\n'.replaceAll('\n', reliability.includes('\r\n') ? '\r\n' : '\n')));
  assert.ok(section.length > 50);
  assert.match(section, /actions\/download-artifact@v7/);
  assert.match(section, /name: reliability-release-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(section, /run: node scripts\/verify-reliability-release-evidence\.mjs --directory=reliability-proof/);
  assert.match(section, /- name: Run explicitly selected staging profile\r?\n\s+if: inputs\.suite != 'release'/);
  assert.doesNotMatch(section, /--profile=baseline|--profile=spike/);
});

test('evidence failure remains fail-closed; release artifacts remain same-run and bounded', () => {
  assert.match(reliability, /name: reliability-release-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(reliability, /if-no-files-found: ignore/);
  assert.match(reliability, /scripts\/verify-reliability-release-evidence\.mjs --directory=reliability-proof/);
  assert.match(reliability, /if: inputs\.suite == 'release'/);
  assert.match(reliability, /retention-days: 14/);
});

test('staging reliability artifacts are isolated by run and rerun attempt', () => {
  // GITHUB_RUN_ID alone collides on a rerun. Both producer and consumer
  // must bind the same artifact to the same GitHub run *and attempt*.
  const releaseArtifact = /name: reliability-release-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/g;
  assert.equal([...reliability.matchAll(releaseArtifact)].length, 2);
  assert.match(reliability, /name: reliability-manual-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.doesNotMatch(reliability, /name: reliability-(?:release|manual)-\$\{\{ github\.run_id \}\}\r?\n/);
});
