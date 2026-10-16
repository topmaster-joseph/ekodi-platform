import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/backup-ekodi-core.yml', 'utf8');
const migration = fs.readFileSync('migrations/0031_core_backup_state.sql', 'utf8');

test('Core recovery uses local PR D1 and read-only production export before independent SQLite restore', () => {
  assert.match(workflow, /PRODUCTION_BACKUP_DATABASE: 'ekodi-auth'/);
  assert.match(workflow, /BACKUP_LOCAL=true/);
  assert.match(workflow, /rm -rf \.wrangler\/state/);
  assert.match(workflow, /d1 migrations apply DB[\s\S]*--local --config/);
  assert.doesNotMatch(workflow, /d1 create "\$DB_NAME"/);
  assert.doesNotMatch(workflow, /d1 delete "\$BACKUP_DATABASE"/);
  assert.doesNotMatch(workflow, /ekodi-auth-staging/);
  assert.match(workflow, /wrangler@\$\{WRANGLER_VERSION\} d1 export "\$BACKUP_DATABASE"/);
  assert.match(workflow, /--remote --skip-confirmation/);
  assert.match(workflow, /sqlite3 backup\/restored\.sqlite < backup\/ekodi-auth\.sql/);
  assert.match(workflow, /PRAGMA integrity_check/);
  assert.match(workflow, /required_tables/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test('Core recovery evidence remains durable without writing back into the source database', () => {
  for (const field of ['checksum_sha256','export_bytes','restore_integrity','required_tables','created_at']) {
    assert.ok(migration.includes(field), `missing ${field}`);
  }
  assert.doesNotMatch(workflow, /INSERT INTO core_backup_runs/);
  assert.doesNotMatch(workflow, /d1 execute "\$BACKUP_DATABASE"[\s\S]*--remote/);
  assert.match(workflow, /backup\/restore-report\.txt/);
  assert.match(workflow, /r2 object put/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test('Core backup runs daily and can be invoked manually', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /cron: '30 18 \* \* \*'/);
});
