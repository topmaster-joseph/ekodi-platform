import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [api, admin, policyText, migration] = await Promise.all([
  fs.readFile(new URL('../api-worker.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('../ai-ops-admin.js', import.meta.url), 'utf8'),
  fs.readFile(new URL('../config/autonomous-operations-policy.json', import.meta.url), 'utf8'),
  fs.readFile(new URL('../migrations/0100_ekodi_owner_reports.sql', import.meta.url), 'utf8'),
]);
const policy = JSON.parse(policyText);

test('EKODI internal scheduler owns autonomous owner-report generation', () => {
  assert.match(api, /ownerReportSnapshot\(env, \{ persist:true, evolution, limit:10 \}\)/);
  assert.match(api, /reportOwner: 'ekodi-orchestrator'/);
  assert.match(api, /chatgptTriggerRequired: false/);
  assert.equal(policy.reporting.reportOwner, 'ekodi-orchestrator');
  assert.equal(policy.reporting.reportAuthor, 'EKODI Orchestrator');
  assert.equal(policy.reporting.chatgptTriggerRequired, false);
});

test('owner reports are durable and material-state-only', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ekodi_owner_reports/);
  assert.match(migration, /signature TEXT NOT NULL/);
  assert.equal(policy.reporting.emitOnlyOnMaterialStateChange, true);
  assert.equal(policy.reporting.suppressDuplicateStateReports, true);
  assert.equal(policy.reporting.reportVerifiedRecovery, true);
});

test('authenticated Control API exposes native report read and check endpoints', () => {
  assert.match(api, /\$\{CONTROL_PREFIX\}\/owner-report/);
  assert.match(api, /\$\{CONTROL_PREFIX\}\/owner-report\/check/);
  assert.match(api, /owner-report\.check/);
});

test('AI Ops presents EKODI Orchestrator reports instead of a ChatGPT scheduler', () => {
  assert.match(admin, /EKODI AUTONOMOUS REPORT/);
  assert.match(admin, /중요 운영보고/);
  assert.match(admin, /EKODI Orchestrator/);
  assert.match(admin, /\/api\/control\/owner-report\?limit=8/);
  assert.match(admin, /\/api\/control\/owner-report\/check/);
  assert.doesNotMatch(admin, /ChatGPT 자동화/);
});
