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
  assert.match(worker,/function boardPage\(\)/);
  assert.match(worker,/의견 등록/);
  assert.match(worker,/검색/);
  assert.match(worker,/답글 등록/);
  assert.match(worker,/data-edit/);
  assert.match(worker,/data-delete/);
  assert.match(worker,/data-reply-delete/);
  assert.doesNotMatch(worker,/Response\.redirect\(new URL\(\'\/#voices\'/);
});

test('independent board deployment provisions its own storage and verifies real CRUD',async()=>{
  const workflow=await read('.github/workflows/deploy-independent-board.yml');
  assert.match(workflow,/d1 create ekodi-independent-board/);
  assert.match(workflow,/d1 migrations apply ekodi-independent-board --remote/);
  assert.match(workflow,/r2 bucket create ekodi-independent-board-files/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/health/);
  assert.match(workflow,/Verify production board UI/);
  assert.match(workflow,/id="writeToggle"/);
  assert.match(workflow,/aria-current="page">시민의견/);
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
  const listEnd=worker.indexOf('async function adminList',listStart);
  const listBlock=worker.slice(listStart,listEnd);
  assert.doesNotMatch(listBlock,/private_contact/);
});

test('standalone board reuses EKODI authentication for moderation and owns the mutations',async()=>{
  const [worker,voiceAdmin,adminJs]=await Promise.all([
    read('services/independent-board/worker.js'),
    read('sites/seonammedi/public/voice-public-admin.js'),
    read('sites/seonammedi/public/admin/admin.js')
  ]);
  assert.match(worker,/new URL\('\/api\/seonammedi\/admin\/me',url\.origin\)/);
  assert.match(worker,/permissions\?\.voices===true/);
  assert.match(worker,/path==='\/api\/admin\/posts'/);
  assert.match(worker,/adminUpdate\(req,env/);
  assert.match(worker,/adminDeleteReply\(req,env/);
  assert.doesNotMatch(worker,/\/api\/admin\/bootstrap|\/api\/admin\/login|board_sessions|board_admins/);
  assert.match(voiceAdmin,/\/board\/api\/admin\/posts/);
  assert.doesNotMatch(voiceAdmin,/\/api\/seonammedi\/admin\/voices/);
  assert.match(adminJs,/\/board\/api\/admin\/posts/);
});
