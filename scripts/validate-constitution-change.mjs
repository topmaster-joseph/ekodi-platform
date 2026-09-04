import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const constitution = JSON.parse(fs.readFileSync('governance/constitution/constitution.json', 'utf8').replace(/^\uFEFF/, ''));
const base = process.env.GITHUB_BASE_REF || process.env.EKODI_BASE_REF || '';
if (!base) {
  console.log('Constitution change gate: local/static run, diff approval gate skipped.');
  process.exit(0);
}

let changed = [];
try {
  const output = execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`], { encoding: 'utf8' });
  changed = output.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
} catch {
  console.error('Constitution change gate cannot inspect the PR diff.');
  process.exit(1);
}

const protectedPrefixes = [
  'CONSTITUTION.md',
  'governance/constitution/',
  'config/core-data-boundaries.json',
  'config/storage-policy.json',
  'config/service-workspace-policy.json',
  'config/cloud-portability-policy.json',
  'config/data-plane-contract.json',
  'scripts/validate-cloud-portability.mjs'
];
const protectedChanged = changed.filter(file => protectedPrefixes.some(prefix => file === prefix || file.startsWith(prefix)));
if (!protectedChanged.length) {
  console.log('Constitution change gate: no constitutional policy files changed.');
  process.exit(0);
}

const amendmentChanged = changed.some(file => file.startsWith('governance/amendments/') && file.endsWith('.json'));
if (!amendmentChanged) {
  console.error('Constitution change gate: protected policy changed without an amendment record.');
  protectedChanged.forEach(file => console.error(`- ${file}`));
  process.exit(1);
}

const isBootstrap = constitution.version === '1.0.0' && changed.includes('governance/amendments/2026-08-28-constitution-v1.json');
if (isBootstrap) {
  console.log('Constitution change gate: approved v1 bootstrap adoption detected.');
  process.exit(0);
}

if (process.env.EKODI_CONSTITUTION_APPROVED !== 'true') {
  console.error('Constitution change gate: explicit owner confirmation is required for C2/C3 protected policy changes.');
  console.error('After confirmation, apply the constitution-approved PR label and rerun checks.');
  process.exit(1);
}
console.log(`Constitution change gate: owner confirmation present for ${protectedChanged.length} protected file(s).`);
