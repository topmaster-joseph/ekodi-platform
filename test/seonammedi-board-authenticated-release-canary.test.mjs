import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-independent-board.yml',import.meta.url),'utf8');
const worker=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
const canary=workflow.slice(workflow.indexOf('- name: Verify clean citizen authenticated write and legacy retirement'));

test('production canary rejects anonymous fresh posts, and old API is fully retired',()=>{
 assert.match(canary,/api\/voices-fresh/);
 assert.match(canary,/status" = "401"/);
 assert.match(canary,/status" = "410"/);
 assert.match(worker,/legacy_citizen_board_retired/);
 assert.match(worker,/message\.body\?\.kind===POST_QUEUE_KIND\|\|message\.body\?\.kind===REPLY_QUEUE_KIND/);
});

test('production signed-in write is verified or transparently skipped',()=>{
 assert.match(canary,/BOARD_CANARY_GOOGLE_TOKEN: \$\{\{ secrets\.SEONAMMEDI_BOARD_CANARY_GOOGLE_TOKEN \}\}/);
 assert.match(canary,/authorization: Bearer \$BOARD_CANARY_GOOGLE_TOKEN/);
 assert.match(canary,/Real Google writer test SKIPPED/);
 assert.match(canary,/\.published==true/);
 assert.match(canary,/DELETE FROM citizen_voices_fresh WHERE id=\$post_id/);
 assert.match(canary,/Remove old citizen records and referenced photos after cutover/);
 assert.match(canary,/node services\/independent-board\/voices-fresh\/purge-legacy\.mjs --execute/);
});
