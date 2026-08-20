import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/backup-ekodi-core.yml', 'utf8');
const migration = fs.readFileSync('migrations/0031_core_backup_state.sql', 'utf8');

test('Core recovery exports D1 and proves an independent SQLite restore', () => {
  assert.match(workflow, /BACKUP_DATABASE: \$\{\{ github\.event_name == 'pull_request' && 'ekodi-auth-staging' \|\| 'ekodi-auth' \}\}/);
  assert.match(workflow, /wrangler@\$\{WRANGLER_VERSION\} d1 export "\$BACKUP_DATABASE"/);
  assert.match(workflow, /sqlite3 backup\/restored\.sqlite < backup\/ekodi-auth\.sql/);
  assert.match(workflow, /PRAGMA integrity_check/);
  assert.match(workflow, /required_tables/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test('Core recovery ledger persists restore evidence', () => {
  for (const field of ['checksum_sha256','export_bytes','restore_integrity','required_tables','created_at']) {
    assert.ok(migration.includes(field), `missing ${field}`);
  }
  assert.match(workflow, /INSERT INTO core_backup_runs/);
});

test('Core backup runs daily and can be invoked manually', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /cron: '30 18 \* \* \*'/);
});
