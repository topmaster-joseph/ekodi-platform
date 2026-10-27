import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('independent board deployment cannot auto-purge legacy citizen records',async()=>{
  const workflow=await readFile(new URL('../.github/workflows/deploy-independent-board.yml',import.meta.url),'utf8');
  assert.doesNotMatch(workflow,/node\s+services\/independent-board\/voices-fresh\/purge-legacy\.mjs\s+--execute/);
  assert.match(workflow,/Verify legacy write retirement and retain historical records/);
  assert.match(workflow,/test "\$status" = "410"/);
  assert.match(workflow,/legacyQueue=="disabled"/);
  assert.match(workflow,/guest_reply_status/);
  assert.match(workflow,/guest_delete_status/);
  assert.match(workflow,/citizen_voice_replies_fresh/);
  assert.match(workflow,/sqlite_master/);
  assert.match(workflow,/historical records retained/);
  const script=await readFile(new URL('../services/independent-board/voices-fresh/purge-legacy.mjs',import.meta.url),'utf8');
  assert.match(script,/explicit_execute_flag_required/);
  assert.match(script,/\bDELETE FROM board_replies; DELETE FROM board_files; DELETE FROM board_posts;/);
  // Deliberate deletion must stay separately reviewable and not run automatically.
});
