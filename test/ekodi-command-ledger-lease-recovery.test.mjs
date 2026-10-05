import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../ekodi-command-ledger.js', import.meta.url), 'utf8');

test('command ledger reclaims expired running leases before targeted and queue claims', () => {
  assert.match(source, /export async function recoverExpiredEkodiCommandTasks/);
  assert.match(source, /state = 'retry'[\s\S]*lease_until = NULL[\s\S]*attempt_count < max_attempts/);
  assert.match(source, /state = 'failed'[\s\S]*attempt_count >= max_attempts/);
  const calls = source.match(/await recoverExpiredEkodiCommandTasks\(db, \{ now: options\.now \}\);/g) || [];
  assert.equal(calls.length, 2);
});

test('expired lease recovery is advertised by the durable ledger contract', () => {
  assert.match(source, /expiredRunningLeaseRecovery: true/);
});
