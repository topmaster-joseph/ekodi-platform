import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('new board release rejects legacy UI and enforces fresh Google session before compose/submit',async()=>{
 const release=await read('.github/workflows/deploy-independent-board.yml');
 const worker=await read('services/independent-board/worker.js');
 const page=await read('services/independent-board/voices-fresh/page.mjs');
 assert.match(release,/Verify production board UI/);
 assert.match(release,/clean voices write control/);
 assert.match(release,/server-verification before writing/);
 assert.match(release,/legacy citizen composer was unexpectedly served/);
 assert.match(release,/api\/posts/);
 assert.match(release,/legacyQueue/);
 assert.match(page,/session\(\)/);
 assert.match(page,/accessToken\(\)/);
 assert.match(page,/Google 로그인 상태가 확인되지 않았습니다/);
 assert.match(worker,/renderFreshVoicePage\(req,shell\)/);
 assert.match(worker,/admin:requireVoiceAdmin/);
});

test('release validates signed-out API across both public and internal site mounts',async()=>{
  const release=await read('.github/workflows/deploy-independent-board.yml');
  assert.match(release,/Verify production Google login-first API without credentials/);
  assert.match(release,/https:\/\/seonammedi\.kr\/board https:\/\/ekodi\.kr\/seonammedi\/board/);
  assert.match(release,/api\/auth\/session/);
  assert.match(release,/status.*!= "401"/);
  assert.match(release,/\.authenticated==false and \.error=="google_login_required"/);
  assert.match(release,/cache-control:.*no-store/);
  assert.doesNotMatch(release,/Authorization: Bearer.*login-first API/);
});
