import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(path)=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('standalone board release fails if login-first public UI markers disappear',async()=>{
  const release=await read('.github/workflows/deploy-independent-board.yml');
  const worker=await read('services/independent-board/worker.js');
  assert.match(release,/Verify production board UI/);
  assert.match(release,/verified Google account badge/);
  assert.match(release,/account verification before composer/);
  assert.match(release,/account verification before post submit/);
  assert.match(release,/Google handoff preserving compose intent/);
  assert.match(worker,/function voiceWriteAuthScript\(\)/);
  assert.match(worker,/async function verifyVoiceAccount\(allowRefresh=true\)/);
  assert.match(worker,/async function requireVoiceAccount\(intent="compose"\)/);
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
