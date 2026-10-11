import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/deploy-independent-board.yml',import.meta.url),'utf8');
const worker=await readFile(new URL('../services/independent-board/worker.js',import.meta.url),'utf8');
const canary=workflow.slice(workflow.indexOf('- name: Production queue-create-list-reply canary and cleanup'));

test('every release proves anonymous post AND reply rejection without creating any data',()=>{
 assert.match(canary,/for path in \/board\/api\/posts \/board\/api\/posts\/1\/replies/);
 assert.match(canary,/\[\[ "\$status" != "401" \]\]/);
 assert.match(canary,/google_login_required/);
 assert.match(worker,/if\(!await signedInGoogle\(req\)\)return json\(\{ok:false,error:'google_login_required'/);
 const denial=canary.indexOf('for path in /board/api/posts /board/api/posts/1/replies');
 const optional=canary.indexOf('if [[ -z "${BOARD_CANARY_GOOGLE_TOKEN:-}" ]]');
 assert.ok(denial>=0&&optional>denial,'negative probes must run even when no test user is configured');
});

test('positive production CRUD is authenticated and never silently falls back to anonymous',()=>{
 assert.match(canary,/BOARD_CANARY_GOOGLE_TOKEN: \$\{\{ secrets\.SEONAMMEDI_BOARD_CANARY_GOOGLE_TOKEN \}\}/);
 assert.match(canary,/authorization: Bearer \$BOARD_CANARY_GOOGLE_TOKEN/);
 assert.equal((canary.match(/authorization: Bearer \$BOARD_CANARY_GOOGLE_TOKEN/g)||[]).length,2);
 assert.match(canary,/authenticated production CRUD canary SKIPPED/);
 assert.match(canary,/DELETE FROM board_replies WHERE post_id=\$post_id/);
 assert.match(canary,/DELETE FROM board_posts WHERE id=\$post_id/);
});
