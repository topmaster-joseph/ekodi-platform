import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const workflow=fs.readFileSync(new URL('../.github/workflows/deploy-independent-board.yml',import.meta.url),'utf8');
const canary=workflow.slice(workflow.indexOf('      - name: Production queue-create-list-reply canary and cleanup'));
test('protected production board canary skips writes without genuine Google session',()=>{
  assert.match(canary,/SEONAMMEDI_BOARD_CANARY_GOOGLE_TOKEN/);
  assert.match(canary,/if \[\[ -z "\$\{BOARD_CANARY_GOOGLE_TOKEN:-\}" \]\]/);
  assert.match(canary,/Anonymous board write must return 401/);
});
test('authenticated canary cleans its own marker on failure and success',()=>{
  assert.match(canary,/cleanup_canary\(\)/);
  assert.match(canary,/trap cleanup_canary EXIT/);
  assert.match(canary,/canary_started=true/);
  assert.match(canary,/DELETE FROM board_replies WHERE post_id IN \(SELECT id FROM board_posts WHERE message=/);
  assert.match(canary,/DELETE FROM board_posts WHERE message=/);
  assert.match(canary,/Canary cleanup verification failed/);
  assert.doesNotMatch(canary,/DELETE FROM board_posts WHERE id=\$post_id/);
});
