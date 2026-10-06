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
  assert.match(worker,/env\.BOARD_DB/);
  assert.doesNotMatch(worker,/env\.DB\b/);
  assert.match(worker,/storage:'independent-board-d1'/);
  assert.match(worker,/private_contact/);
  assert.match(config,/binding = "BOARD_DB"/);
  assert.match(config,/database_name = "ekodi-independent-board"/);
  assert.match(config,/pattern = "seonammedi\.kr\/board\*"/);
  assert.match(worker,/function boardPage\(\)/);
  assert.match(worker,/\/board\/voices/);
  assert.match(worker,/의견 등록/);
  assert.match(worker,/검색/);
  assert.match(worker,/답글 등록/);
  assert.match(worker,/data-edit/);
  assert.match(worker,/data-delete/);
  assert.match(worker,/data-reply-delete/);
});

test('finance and notice boards are first-class standalone board routes',async()=>{
  const [worker,migration,site]=await Promise.all([
    read('services/independent-board/worker.js'),
    read('services/independent-board/migrations/0003_finance_notice_boards.sql'),
    read('sites/seonammedi/public/index.html')
  ]);
  assert.match(worker,/function financePage\(\)/);
  assert.match(worker,/function noticesPage\(\)/);
  assert.match(worker,/path==='\/finance'/);
  assert.match(worker,/path==='\/notices'/);
  assert.match(worker,/\/board\/api\/admin\/finance/);
  assert.match(worker,/\/board\/api\/admin\/notices/);
  assert.match(worker,/requirePermission\(req,'finance'\)/);
  assert.match(worker,/requirePermission\(req,'notices'\)/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS finance_posts/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS notice_posts/);
  assert.match(site,/href="\/board\/voices">시민의견/);
  assert.match(site,/href="\/board\/finance">회계/);
  assert.match(site,/href="\/board\/notices">공지/);
});

test('all three board pages share the SeonamMedi header and footer contract',async()=>{
  const worker=await read('services/independent-board/worker.js');
  assert.match(worker,/서남권 의대 설립 비상대책위원회 관련 공개 기록·소통 채널/);
  assert.match(worker,/자료의 성격과 출처를 구분해 보존합니다/);
  assert.match(worker,/link\('\/board\/voices'/);
  assert.match(worker,/link\('\/board\/finance'/);
  assert.match(worker,/link\('\/board\/notices'/);
  assert.match(worker,/id="adminLink" href="#admin">관리자/);
  assert.match(worker,/document\.getElementById\("adminLink"\)\?\.addEventListener\("click",[\s\S]*login\(\)/);
});

test('independent board deployment provisions its own storage and verifies real CRUD',async()=>{
  const workflow=await read('.github/workflows/deploy-independent-board.yml');
  assert.match(workflow,/d1 create ekodi-independent-board/);
  assert.match(workflow,/d1 migrations apply ekodi-independent-board --remote/);
  assert.match(workflow,/r2 bucket create ekodi-independent-board-files/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/health/);
  assert.match(workflow,/Verify production board UI/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/voices/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/finance/);
  assert.match(workflow,/https:\/\/seonammedi\.kr\/board\/notices/);
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

test('standalone boards reuse EKODI authentication and own their mutations',async()=>{
  const [worker,voiceAdmin,adminJs]=await Promise.all([
    read('services/independent-board/worker.js'),
    read('sites/seonammedi/public/voice-public-admin.js'),
    read('sites/seonammedi/public/admin/admin.js')
  ]);
  assert.match(worker,/new URL\('\/api\/seonammedi\/admin\/me'/);
  assert.match(worker,/auth\.permissions\?\.\[permission\]/);
  assert.match(worker,/path==='\/api\/admin\/posts'/);
  assert.match(worker,/createFinance\(req,env\)/);
  assert.match(worker,/createNotice\(req,env\)/);
  assert.doesNotMatch(worker,/\/api\/admin\/bootstrap|\/api\/admin\/login|board_sessions|board_admins/);
  assert.match(voiceAdmin,/\/board\/api\/admin\/posts/);
  assert.doesNotMatch(voiceAdmin,/\/api\/seonammedi\/admin\/voices/);
  assert.match(adminJs,/\/board\/api\/admin\/posts/);
});


test('SeonamMedi board admin login receives a one-time portal handoff token on the customer domain',async()=>{
  const [worker,auth,access]=await Promise.all([
    read('services/independent-board/worker.js'),
    read('auth-site/auth.js'),
    read('supabase/functions/access-api/index.ts')
  ]);
  assert.match(worker,/commonScript\('\/board\/voices'\)/);
  assert.match(worker,/return_to",location\.origin\+"\'\+returnPath\+\'"/);
  assert.match(worker,/\/api\/seonammedi\/admin\/auth\/exchange/);
  assert.match(auth,/seonamMediHandoff/);
  assert.match(auth,/await handoffToService\(\)/);
  assert.match(access,/portal:\["https:\/\/ekodi\.kr","https:\/\/seonammedi\.kr"/);
  assert.match(access,/if\(site==="portal"\)[\s\S]*generateLink\(\{type:"magiclink",email\}\)[\s\S]*workspace:null/);
});
