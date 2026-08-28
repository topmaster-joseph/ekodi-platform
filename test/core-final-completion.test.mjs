import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const completion = JSON.parse(fs.readFileSync('config/ekodi-core-completion.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/verify-ekodi-core-completion.yml', 'utf8');
const loadWorkflow = fs.readFileSync('.github/workflows/ecosystem-load-test.yml', 'utf8');
const release = fs.readFileSync('scripts/guarded-worker-release.mjs', 'utf8');
const backup = fs.readFileSync('.github/workflows/backup-ekodi-core.yml', 'utf8');

test('EKODI Core completion covers all seven stages', () => {
  assert.equal(completion.status, 'completed');
  assert.equal(completion.stages.length, 7);
  assert.deepEqual(completion.stages.map(item => item.stage), [1,2,3,4,5,6,7]);
  assert.ok(completion.stages.every(item => item.status === 'completed'));
});

test('final completion keeps production verification automatic and bounded load manual-only', () => {
  for (const marker of [
    'npm run validate:core-completion',
    'npm run verify:core-production',
    'AI_PROVIDER: NONE',
    'actions/upload-artifact@v4',
    'Production load testing is isolated to the dedicated manual capped workflow.',
  ]) assert.ok(workflow.includes(marker), `missing final workflow marker: ${marker}`);
  assert.doesNotMatch(workflow, /node scripts\/ecosystem-load-test\.mjs/);
  assert.match(loadWorkflow, /workflow_dispatch:/);
  assert.match(loadWorkflow, /EKODI_ALLOW_PRODUCTION_LOAD: MANUAL_APPROVED/);
  assert.match(loadWorkflow, /LOAD_CONCURRENCY: '1'/);
  assert.match(loadWorkflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(loadWorkflow, /node scripts\/ecosystem-load-test\.mjs/);
});

test('completion keeps rollback and independent restore as permanent gates', () => {
  assert.match(release, /Rolling back/);
  assert.match(release, /Automatic rollback verified/);
  assert.match(backup, /sqlite3 backup\/restored\.sqlite/);
  assert.match(backup, /PRAGMA integrity_check/);
  assert.equal(completion.gates['automatic-worker-rollback-contract-is-enforced'], true);
  assert.equal(completion.gates['backup-and-restore-path-is-verified'], true);
});
