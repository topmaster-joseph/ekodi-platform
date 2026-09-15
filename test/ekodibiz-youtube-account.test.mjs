import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('EKODIBIZ YouTube OAuth forces explicit account choice while allowing any authorized account', async () => {
  const [growth, broker] = await Promise.all([read('marketing-growth-worker.js'), read('google-drive-storage-control.js')]);
  assert.ok(growth.includes("const requestedHint = clean(body.accountHint||registry?.login_hint||registry?.provider_account_id,180)"));
  assert.match(growth,/registryConnectionId/);
  assert.match(growth, /startYouTubeOAuth\(\{state,accountHint\}\)/);
  assert.doesNotMatch(growth, /subject\.key === 'ekodi-biz' \? 'ekodibiz@gmail\.com'/);
  assert.match(broker, /prompt:'consent select_account'/);
  assert.match(broker, /if\(hint\) params\.set\('login_hint',hint\)/);
});

test('EKODIBIZ channel operator grant is migration-backed', async () => {
  const sql = await read('migrations/0063_ekodibiz_channel_operator.sql');
  assert.match(sql, /ekodibiz@gmail\.com/);
  assert.match(sql, /hq_manager/);
  assert.match(sql, /ON CONFLICT\(tenant_id,email\) DO UPDATE/);
});
