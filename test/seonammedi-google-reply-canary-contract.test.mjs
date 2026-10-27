import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const flow=await readFile(new URL('../.github/workflows/deploy-independent-board.yml',import.meta.url),'utf8');
const start=flow.indexOf('- name: Verify clean citizen authenticated write and legacy retirement');
const end=flow.indexOf('      # Data-retention guard:',start);
assert.ok(start>0&&end>start,'find isolated verified login canary step');
const canary=flow.slice(start,end);
const run=canary.slice(canary.indexOf('        run: |')+'        run: |'.length).trimStart().split('\n').map(line=>line.replace(/^          /,'')).join('\n');

test('production Google canary is a valid bash script with no identity bypass',()=>{
  const syntax=spawnSync('bash',['-n'],{input:run,encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  assert.match(flow,/BOARD_CANARY_GOOGLE_TOKEN: \$\{\{ secrets\.SEONAMMEDI_BOARD_CANARY_GOOGLE_TOKEN \}\}/);
  assert.match(canary,/if \[\[ -z "\$\{BOARD_CANARY_GOOGLE_TOKEN:-\}" \]\]/);
  assert.match(canary,/Real Google writer test SKIPPED/);
  assert.doesNotMatch(canary,/synthetic-google-user|bypass_auth|test-only-identity/);
});

test('real Google token exercises post owner and reply queue/create/edit/delete',()=>{
  assert.match(canary,/\.mine==true/);
  assert.match(canary,/reply_submission_id=.*jq -r/);
  assert.match(canary,/api\/voices-fresh\/\$post_id\/replies/);
  assert.match(canary,/api\/voices-fresh\/replies\/submissions\/\$reply_submission_id/);
  assert.match(canary,/curl -fsS -X PUT/);
  assert.match(canary,/curl -fsS -X DELETE/);
  assert.match(canary,/reply_original/);
  assert.match(canary,/reply_edited/);
  assert.match(canary,/https:\/\/ekodi\.kr\/seonammedi\/board\/api\/voices-fresh/);
  assert.match(canary,/Real Google post ownership and reply create\/update\/delete VERIFIED/);
});

test('canary removes only its UUID-bound synthetic records, even after failure',()=>{
  assert.match(canary,/trap cleanup_canary EXIT/);
  assert.match(canary,/DELETE FROM citizen_voice_replies_fresh WHERE voice_id=\$post_id AND submission_key='\$reply_submission_id'/);
  assert.match(canary,/DELETE FROM citizen_voices_fresh WHERE id=\$post_id AND submission_key='\$submission_id' AND body='\$marker'/);
  assert.match(canary,/trap - EXIT/);
  assert.doesNotMatch(canary,/DELETE FROM board_posts|DELETE FROM board_replies|purge-legacy\.mjs --execute/);
});
