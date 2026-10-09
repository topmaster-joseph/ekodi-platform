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
  assert.match(section, /name: reliability-release-\$\{\{ github\.run_id \}\}/);
  assert.match(section, /for profile in baseline spike; do/);
  assert.match(section, /report\.ok === true && report\.passed === true/);
  assert.match(section, /report\.targetClass === "staging"/);
  assert.match(section, /Number\.isFinite\(report\.metrics\?\.total\) && report\.metrics\.total > 0/);
  assert.match(section, /Array\.isArray\(report\.violations\) && report\.violations\.length === 0/);
  assert.match(section, /- name: Run explicitly selected staging profile\r?\n\s+if: inputs\.suite != 'release'/);
  assert.doesNotMatch(section, /--profile=baseline|--profile=spike/);
});

test('evidence failure remains fail-closed; release artifacts remain same-run and bounded', () => {
  assert.match(reliability, /name: reliability-release-\$\{\{ github\.run_id \}\}/);
  assert.match(reliability, /if-no-files-found: ignore/);
  assert.match(reliability, /test -s "\$file"/);
  assert.match(reliability, /process\.exit\(1\)/);
  assert.match(reliability, /retention-days: 14/);
});
