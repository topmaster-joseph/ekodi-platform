import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { analyzeCapabilityEcosystem, EKODI_SELF_AUTOMATION_POLICY } from '../ekodi-self-automation-engine.js';
import { appendCapabilityExperience } from '../ekodi-capability-ecosystem-store.js';

const CAPABILITY_ID = 'community.site-board';

/** Minimal D1-shaped binding over node:sqlite, enough for the ecosystem store. */
function createD1(sqlite) {
  const prepare = query => {
    let params = [];
    const statement = {
      bind(...values) { params = values; return statement; },
      async run() { sqlite.prepare(query).run(...params); return { success: true }; },
      async all() { return { results: sqlite.prepare(query).all(...params) }; },
      async first() { return sqlite.prepare(query).get(...params) ?? null; },
    };
    return statement;
  };
  return {
    prepare,
    async batch(statements) { return Promise.all(statements.map(item => item.all())); },
  };
}

function migratedDb() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0076_capability_ecosystem.sql', '0077_capability_sandbox_evidence.sql']) {
    sqlite.exec(fs.readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  return createD1(sqlite);
}

async function seedRepeatedExperience(db, occurrences) {
  for (let index = 0; index < occurrences; index += 1) {
    await appendCapabilityExperience(db, {
      id: `exp_site_board_${index + 1}`,
      taskId: `task_site_board_${index + 1}`,
      patternKey: 'community-site-board-post',
      goalFingerprint: 'publish an isolated community board post',
      source: 'test',
      risk: 'low',
      capabilityIds: [CAPABILITY_ID],
      resultState: 'verified',
      verified: true,
      costClass: 'low',
      durationMs: 120,
      occurredAt: new Date(Date.now() - index * 1000).toISOString(),
    });
  }
}

test('the self-automation policy performs the functional sandbox automatically', () => {
  assert.ok(
    EKODI_SELF_AUTOMATION_POLICY.automaticScope.includes('functional_sandbox'),
    'the functional sandbox must be part of the automatic scope, not a manual step',
  );
  assert.equal(EKODI_SELF_AUTOMATION_POLICY.directProductionMutation, false);
});

test('a contract-passing candidate is carried into the functional sandbox and recorded with real counts', async () => {
  const db = migratedDb();
  await seedRepeatedExperience(db, 5);

  const analysis = await analyzeCapabilityEcosystem(db, { minOccurrences: 2, functionalSandboxTrials: 3 });
  const functionalRuns = analysis.sandbox.newFunctionalRuns;

  assert.ok(Array.isArray(functionalRuns), 'the analysis must report functional sandbox runs');
  assert.ok(functionalRuns.length >= 1, 'an adapter-backed candidate must reach the functional sandbox');

  const run = functionalRuns.find(item => item.capabilityId === CAPABILITY_ID);
  assert.ok(run, `expected a functional run for ${CAPABILITY_ID}`);
  assert.equal(run.evaluation.verified, true, run.reason || 'the functional run must verify');
  assert.equal(run.evidence.testCount, 3);
  assert.equal(run.evidence.passed, 3);
  assert.equal(run.evidence.rollbackPassed, 3);
  assert.equal(run.productionMutationPerformed, false);

  // The stored row must carry the evidence, not zeroes: this is what any later
  // promotion decision reads.
  const stored = await db.prepare(
    'SELECT status, test_count, passed, success_rate, promotion FROM capability_sandbox_runs WHERE id = ?',
  ).bind(run.id).first();
  assert.ok(stored, 'the functional run must be persisted');
  assert.equal(stored.status, 'verified');
  assert.equal(stored.test_count, 3);
  assert.equal(stored.passed, 3);
  assert.equal(stored.success_rate, 1);
  assert.equal(stored.promotion, 'architecture_benchmark_required');
});

test('candidates without a registered sandbox adapter stop before the functional stage', async () => {
  const db = migratedDb();
  for (let index = 0; index < 5; index += 1) {
    await appendCapabilityExperience(db, {
      id: `exp_assist_${index + 1}`,
      taskId: `task_assist_${index + 1}`,
      patternKey: 'documents-assist',
      goalFingerprint: 'summarise a document',
      source: 'test',
      risk: 'low',
      capabilityIds: ['core.documents'],
      resultState: 'verified',
      verified: true,
      costClass: 'low',
      durationMs: 90,
      occurredAt: new Date(Date.now() - index * 1000).toISOString(),
    });
  }

  const analysis = await analyzeCapabilityEcosystem(db, { minOccurrences: 2, functionalSandboxTrials: 3 });
  assert.equal(
    analysis.sandbox.newFunctionalRuns.length,
    0,
    'a capability with no sandbox-safe adapter must not be executed',
  );
});
