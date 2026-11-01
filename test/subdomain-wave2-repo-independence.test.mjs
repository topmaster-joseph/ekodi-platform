import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Public subdomain wave 2 (owner decision 2026-11-01): before DNS for these hosts is deleted,
// the repository must not recreate their Worker custom domains or probe them in deploy lanes.
// Targets still registered outside this repository (OAuth callbacks, cross-repo API bases,
// Supabase origin allowlists) stay excluded until that external registration is moved.
const EXCLUDED = new Map([
  ['author', 'Supabase author-* Edge Function CORS/return-URL allowlists accept only the legacy origin'],
  ['drive', 'Google OAuth redirect URI and Cloudflare Access application are registered on the legacy host'],
  ['marketing-api', 'jadam-maru marketing pages embed the legacy host as their API base'],
  ['marketing-publish-api', 'YouTube OAuth redirect URI defaults to the legacy host'],
]);

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const wave = JSON.parse(read('config/retire-public-subdomains-wave2.json'));
const safe = wave.targets.filter(target => !EXCLUDED.has(target.label));
const host = label => [label, wave.rootDomain].join('.');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('every wave-2 target is either retired from the repo or explicitly excluded', () => {
  for (const label of EXCLUDED.keys()) assert.ok(wave.targets.some(target => target.label === label), label);
  assert.equal(safe.length + EXCLUDED.size, wave.targets.length);
  for (const target of safe) assert.match(target.apexHealth, /^https:\/\/ekodi\.kr\//, target.label);
});

// Phase B (Worker routes + workflow probes) lands separately: those edits touch
// .github/workflows, which the recovery token cannot issue.
