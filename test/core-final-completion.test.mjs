import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const completion = JSON.parse(fs.readFileSync('config/ekodi-core-completion.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/verify-ekodi-core-completion.yml', 'utf8');
const release = fs.readFileSync('scripts/guarded-worker-release.mjs', 'utf8');
const backup = fs.readFileSync('.github/workflows/backup-ekodi-core.yml', 'utf8');

test('EKODI Core completion covers all seven stages', () => {
  assert.equal(completion.status, 'completed');
  assert.equal(completion.stages.length, 7);
  assert.deepEqual(completion.stages.map(item => item.stage), [1,2,3,4,5,6,7]);
  assert.ok(completion.stages.every(item => item.status === 'completed'));
});

test('final completion workflow verifies live production and bounded load', () => {
  for (const marker of [
    'npm run validate:core-completion',
    'npm run verify:core-production',
    'AI_PROVIDER: NONE',
    'node scripts/ecosystem-load-test.mjs',
    'actions/upload-artifact@v4',
  ]) assert.ok(workflow.includes(marker), `missing final workflow marker: ${marker}`);
});

test('completion keeps rollback and independent restore as permanent gates', () => {
  assert.match(release, /Rolling back/);
  assert.match(release, /Automatic rollback verified/);
  assert.match(backup, /sqlite3 backup\/restored\.sqlite/);
  assert.match(backup, /PRAGMA integrity_check/);
  assert.equal(completion.gates['automatic-worker-rollback-contract-is-enforced'], true);
  assert.equal(completion.gates['backup-and-restore-path-is-verified'], true);
});
