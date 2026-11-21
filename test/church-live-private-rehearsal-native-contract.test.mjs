import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const w=read('.github/workflows/verify-church-live-private-rehearsal.yml');
const s=read('scripts/verify-church-local-rehearsal-native.mjs');

test('safe native Church rehearsal runs after protected main release or explicit manual dispatch only',()=>{
  assert.match(w,/workflow_dispatch:/);
  assert.match(w,/push:\s*\n\s+branches: \[main\]/);
  assert.match(w,/github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(w,/workflow_run:/);
  assert.match(w,/Deploy EKODI Shared Site Core/);
  assert.match(w,/github\.event\.workflow_run\.event == 'workflow_dispatch'/);
  assert.match(w,/github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(w,/github\.event\.workflow_run\.head_branch == 'main'/);
  assert.doesNotMatch(w,/pull_request_target:/);
  assert.doesNotMatch(w,/secrets\./);
});

test('local media rehearsal never opens a public room, stream or credentialed browser',()=>{
  assert.match(s,/--use-fake-device-for-media-stream/);
  assert.match(s,/--use-fake-ui-for-media-stream/);
  assert.match(s,/request\.abort\('blockedbyclient'\)/);
  assert.match(s,/assert\.deepEqual\(mutations,\[\]/);
  assert.match(s,/await page\.click\('#localRehearsalStart'\)/);
  assert.match(s,/await page\.click\('#localRehearsalStop'\)/);
  assert.match(s,/recordedBytes:playback\.bytes/);
  assert.match(s,/await browser\.close\(\)/);
  assert.doesNotMatch(s,/\.click\('#goLiveButton'/);
  assert.doesNotMatch(s,/\.click\('#hostButton'/);
  assert.doesNotMatch(s,/createRoom\(|publishStream\(|startHost\(/);
});
