import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('SeonamMedi citizen voices use the standalone board API directly',async()=>{
  const [app,worker,config]=await Promise.all([
    read('sites/seonammedi/public/app.js'),
    read('services/independent-board/worker.js'),
    read('wrangler.independent-board.toml')
  ]);
  assert.match(app,/fetch\('\/board\/api\/posts'/);
  assert.match(app,/\/board\/api\/posts\/'\+voiceId\+'\/replies/);
  assert.doesNotMatch(app,/fetch\('\/api\/seonammedi\/voices'/);
  assert.doesNotMatch(app,/submissionId|\/voices\/submissions\//);
  assert.match(worker,/env\.BOARD_DB/);
  assert.doesNotMatch(worker,/env\.DB\b/);
  assert.match(worker,/storage:'independent-board-d1'/);
  assert.match(worker,/private_contact/);
  assert.match(config,/binding = "BOARD_DB"/);
  assert.match(config,/database_name = "ekodi-independent-board"/);
  assert.match(config,/pattern = "seonammedi\.kr\/board\*"/);
});

test('independent board deployment provisions its own storage and verifies real CRUD',async()=>{
  const workflow=await read('.github/workflows/deploy-independent-board.yml');
  assert.match(workflow,/d1 create ekodi-independent-board/);
  assert.match(workflow,/d1 migrations apply ekodi-independent-board --remote/);
  assert.match(workflow,/r2 bucket create ekodi-independent-board-files/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/health/);
  assert.match(workflow,/Production create-list-reply canary and cleanup/);
  assert.match(workflow,/DELETE FROM board_replies WHERE post_id=\$post_id/);
  assert.match(workflow,/DELETE FROM board_posts WHERE id=\$post_id/);
});

test('board schema keeps private contact out of the public read model',async()=>{
  const [migration,worker]=await Promise.all([
    read('services/independent-board/migrations/0002_citizen_voice_fields.sql'),
    read('services/independent-board/worker.js')
  ]);
  assert.match(migration,/private_contact TEXT NOT NULL DEFAULT ''/);
  const listStart=worker.indexOf('async function list');
  const listEnd=worker.indexOf('export default',listStart);
  const listBlock=worker.slice(listStart,listEnd);
  assert.doesNotMatch(listBlock,/private_contact/);
});
