import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const w=read('.github/workflows/verify-church-live-private-rehearsal.yml');
const s=read('scripts/verify-church-local-rehearsal-native.mjs');

test('safe native Church rehearsal runs on same-repo review and protected main release only',()=>{
  assert.match(w,/pull_request:/);
  assert.match(w,/github\.event_name == 'pull_request'/);
  assert.match(w,/github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
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
  assert.match(s,/assert\.deepEqual\(forbiddenMutations,\[\]/);
  assert.match(s,/blockedBackgroundRequests/);
  assert.match(s,/\/cdn-cgi\/challenge-platform\//);
  assert.match(s,/\/api\/telemetry\/visit/);
  assert.match(s,/serverMutations:forbiddenMutations\.length/);
  assert.match(s,/await page\.click\('#localRehearsalStart'\)/);
  assert.match(s,/await page\.click\('#localRehearsalStop'\)/);
  assert.match(s,/recordedBytes:playback\.bytes/);
  assert.match(s,/await v\.play\(\)/);
  assert.match(s,/playback\.decodedWidth>0 && playback\.decodedHeight>0/);
  assert.match(s,/playback\.playedSeconds>0\.1/);
  assert.match(s,/await browser\.close\(\)/);
  assert.doesNotMatch(s,/\.click\('#goLiveButton'/);
  assert.doesNotMatch(s,/\.click\('#hostButton'/);
  assert.doesNotMatch(s,/createRoom\(|publishStream\(|startHost\(/);
});

test('independent anonymous external viewer probes are GET-only and never publish a room',()=>{
  assert.ok(s.includes("fetch(origin+'/live/church/?mode=viewer'"));
  assert.ok(s.includes("fetch(origin+'/api/realtime/live?tenant=ekodichurch'"));
  assert.match(s,/viewerResponse\.status,200/);
  assert.match(s,/liveResponse\.status,200/);
  assert.match(s,/typeof externalLive\.live,'boolean'/);
  assert.match(s,/browser\.createBrowserContext\(\)/);
  assert.match(s,/guest\.setRequestInterception\(true\)/);
  assert.match(s,/guest\.on\('request',readOnlyRequest\)/);
  assert.match(s,/guestContext\.close\(\)/);
  assert.match(s,/if\(!externalLive\.live\)/);
  assert.match(s,/hasAccessToken,false/);
  assert.match(s,/report\.externalViewer=external/);
  assert.match(s,/serverMutations:forbiddenMutations\.length/);
});
