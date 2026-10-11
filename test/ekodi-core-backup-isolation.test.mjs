import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/backup-ekodi-core.yml',import.meta.url),'utf8');

test('PR backup recovery drill is local-only and never creates a remote D1',()=>{
  assert.match(workflow,/BACKUP_LOCAL=true/);
  assert.match(workflow,/d1 migrations apply DB[\s\S]*--local --persist-to/);
  assert.match(workflow,/d1 export "\$BACKUP_DATABASE"[\s\S]*--local --persist-to/);
  assert.doesNotMatch(workflow,/d1 create "\$DB_NAME"/);
  assert.doesNotMatch(workflow,/d1 delete "\$BACKUP_DATABASE"/);
  assert.doesNotMatch(workflow,/d1 migrations apply DB --remote/);
});

test('production backup reads source D1 and writes backup evidence outside the source database',()=>{
  assert.match(workflow,/d1 export "\$BACKUP_DATABASE"[\s\S]*--remote --skip-confirmation/);
  assert.match(workflow,/r2 object put/);
  assert.match(workflow,/actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow,/INSERT INTO core_backup_runs/);
  assert.doesNotMatch(workflow,/d1 execute "\$BACKUP_DATABASE"[\s\S]*--remote/);
});

test('backup keeps orchestration policy validation without requiring a production release receipt',()=>{
  assert.match(workflow,/EKODI AI Orchestration Gate/);
  assert.match(workflow,/validate-ekodi-ai-change-orchestration\.mjs/);
  assert.doesNotMatch(workflow,/validate-ekodi-ai-change-orchestration\.mjs["']?\s+--release/);
});


test('backup concurrency discards stale PR heads without overlapping operating backups',()=>{
  assert.match(workflow,/group: ekodi-core-backup-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref_name \|\| github\.event_name \}\}/);
  assert.match(workflow,/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});
