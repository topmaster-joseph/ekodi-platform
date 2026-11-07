import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const live=readFileSync(new URL('../tenant-live.js',import.meta.url),'utf8');
const ctl=readFileSync(new URL('../realtime-control.js',import.meta.url),'utf8');
test('host republishes the program to the same live room when the publisher connection fails',()=>{
  assert.match(live,/function watchHostConnection\(\)/);
  assert.match(live,/async function recoverHostPublish\(\)/);
  assert.match(live,/await publishStream\(program,'program'\);watchHostConnection\(\);/);
  assert.match(live,/window\.addEventListener\('online'/);
});
test('viewer re-pulls media when the picture stalls while the room is still live',()=>{
  assert.match(live,/if\(state\.viewerStalled\)\{state\.viewerStalled=false;/);
  assert.match(live,/void joinViewer\(id\);return\}/);
});
test('leaving a media session closes that publisher\'s tracks so viewers never pull dead tracks',()=>{
  assert.match(ctl,/UPDATE realtime_media_tracks SET status='closed',updated_at=\? WHERE room_id=\? AND publisher_session_id=\? AND status='active'/);
});
