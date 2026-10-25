import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { closeStaleSelfUpdateClaims, SELF_UPDATE_STALE_CLAIM_MS, SELF_UPDATE_STALE_CLAIM_RESULT } from '../device-control.js';

const source = fs.readFileSync(new URL('../device-control.js', import.meta.url), 'utf8');

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE device_commands (id TEXT PRIMARY KEY,device_id TEXT NOT NULL,command_type TEXT NOT NULL,payload_json TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'queued',issued_at TEXT NOT NULL,issued_by INTEGER,claimed_at TEXT,completed_at TEXT,result_json TEXT NOT NULL DEFAULT '{}')`);
  const st = (sql, args = []) => ({ bind: (...v) => st(sql, v), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }) });
  return { raw: db, prepare: sql => st(sql) };
}

test('EKA-121: a self-update claimed without a receipt is closed as failed, never requeued', async () => {
  const DB = d1();
  const now = Date.parse('2026-10-25T01:10:00.000Z');
  const at = ms => new Date(now - ms).toISOString();
  const add = (id, type, status, claimedAgo, device = 'dev_user4') =>
    DB.raw.prepare(`INSERT INTO device_commands (id,device_id,command_type,status,issued_at,claimed_at) VALUES (?,?,?,?,?,?)`)
      .run(id, device, type, status, at(claimedAgo + 1000), claimedAgo == null ? null : at(claimedAgo));
  add('stale', 'agent.self_update', 'claimed', SELF_UPDATE_STALE_CLAIM_MS + 60_000);
  add('fresh', 'agent.self_update', 'claimed', 30_000);
  add('other-type', 'software.localai.install', 'claimed', SELF_UPDATE_STALE_CLAIM_MS + 60_000);
  add('other-device', 'agent.self_update', 'claimed', SELF_UPDATE_STALE_CLAIM_MS + 60_000, 'dev_other');
  add('done', 'agent.self_update', 'succeeded', SELF_UPDATE_STALE_CLAIM_MS + 60_000);

  await closeStaleSelfUpdateClaims({ DB }, 'dev_user4', now);
  const rows = Object.fromEntries(DB.raw.prepare('SELECT id,status,result_json FROM device_commands').all().map(r => [r.id, r]));
  assert.equal(rows.stale.status, 'failed');
  assert.deepEqual(JSON.parse(rows.stale.result_json), SELF_UPDATE_STALE_CLAIM_RESULT);
  assert.match(SELF_UPDATE_STALE_CLAIM_RESULT.message, /이 PC 연결/);
  assert.equal(rows.fresh.status, 'claimed', 'an update still inside its normal seconds-long window is untouched');
  assert.equal(rows['other-type'].status, 'claimed', 'long-running commands keep the generic 1h requeue');
  assert.equal(rows['other-device'].status, 'claimed', 'scoped to the heartbeating device');
  assert.equal(rows.done.status, 'succeeded');
});

test('EKA-121 closer runs on heartbeat and before the generic stale-claim requeue', () => {
  assert.match(source, /if \(deviceType !== 'gateway'\) await closeStaleSelfUpdateClaims\(env, device\.id\);\s+return json\(\{ ok: true, serverTime: now \}/);
  assert.match(source, /await reconcileJobs\(env\);\s+await closeStaleSelfUpdateClaims\(env, device\.id\);\s+const staleClaim/);
  assert.ok(SELF_UPDATE_STALE_CLAIM_MS >= 2 * 60 * 1000, 'the in-transaction heartbeat (seconds after claim) must never trip it');
});
