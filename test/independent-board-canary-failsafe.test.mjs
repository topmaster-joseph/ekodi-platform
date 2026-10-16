import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const workflow=read('.github/workflows/deploy-independent-board.yml');
const worker=read('services/independent-board/worker.js');
const migration=read('services/independent-board/migrations/0006_canary_queue_cancellation.sql');
const canary=workflow.slice(workflow.indexOf('      - name: Production queue-create-list-reply canary and cleanup'));

test('production canary keeps mandatory anonymous 401 probes and skips real writes without Google session',()=>{
  assert.match(canary,/BOARD_CANARY_GOOGLE_TOKEN: \$\{\{ secrets\.SEONAMMEDI_BOARD_CANARY_GOOGLE_TOKEN \}\}/);
  assert.match(canary,/if \[\[ -z "\$\{BOARD_CANARY_GOOGLE_TOKEN:-\}" \]\]/);
  assert.match(canary,/Anonymous board write must return 401/);
  assert.match(canary,/authenticated production CRUD canary SKIPPED/);
  assert.match(canary,/if \[\[ ! "\$GITHUB_RUN_ID" =~ \^\[0-9\]\+\$ \]\]/);
});
test('EXIT trap first persists the numeric marker cancellation then cleans only that marker',()=>{
  assert.match(canary,/cleanup_canary\(\)/);
  assert.match(canary,/trap cleanup_canary EXIT/);
  assert.match(canary,/canary_started=true/);
  assert.match(canary,/INSERT INTO board_canary_cleanup_tombstones\(marker,post_id\)/);
  assert.match(canary,/ON CONFLICT\(marker\) DO UPDATE SET post_id=COALESCE/);
  assert.match(canary,/DELETE FROM board_replies WHERE post_id IN \(SELECT id FROM board_posts WHERE body=/);
  assert.match(canary,/DELETE FROM board_posts WHERE body=/);
  assert.match(canary,/Durable canary tombstone or marker-scoped cleanup failed/);
  assert.match(canary,/Canary cleanup verification failed/);
  assert.doesNotMatch(canary,/WHERE message=/,'D1 stores message content in body, not message');
  assert.doesNotMatch(canary,/DELETE FROM board_posts WHERE id=\$post_id/);
  assert.doesNotMatch(canary,/DELETE FROM board_posts;|DELETE FROM board_replies;/);
});
test('D1 retains a durable canary-only cancellation record with post id',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS board_canary_cleanup_tombstones/);
  assert.match(migration,/marker TEXT PRIMARY KEY/);
  assert.match(migration,/post_id INTEGER/);
  assert.match(migration,/CHECK\(marker GLOB 'EKODI-BOARD-CANARY-/);
  assert.match(migration,/idx_board_canary_cleanup_post/);
});
test('late queue post and reply insertions are atomically gated by D1 tombstone',()=>{
  assert.match(worker,/const CANARY_POST_MARKER=\/\^EKODI-BOARD-CANARY-/);
  assert.match(worker,/const CANARY_REPLY_MARKER=\/\^reply-canary-/);
  assert.match(worker,/INSERT INTO board_posts[\s\S]*?WHERE NOT EXISTS \(SELECT 1 FROM board_canary_cleanup_tombstones WHERE marker=\?\)/);
  assert.match(worker,/INSERT INTO board_replies[\s\S]*?WHERE NOT EXISTS \(SELECT 1 FROM board_canary_cleanup_tombstones WHERE post_id=\?\)/);
  assert.match(worker,/if\(canary&&Number\(r\?\.meta\?\.changes\|\|0\)===0\)return 0/);
  assert.match(worker,/if\(!post\?\.id\)throw new Error\('reply_parent_unavailable'\)/);
  assert.match(worker,/VALUES\(\?,\?,\?,\?,\?,\?,\?,\?,\?\)/,'normal citizen submissions retain original insert path');
  assert.match(worker,/VALUES\(\?,\?,\?,\?,\?\)/,'normal citizen replies retain original insert path');
});
