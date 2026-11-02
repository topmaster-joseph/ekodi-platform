import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const live=readFileSync(new URL('../live/live.js',import.meta.url),'utf8');
test('나의 예배 viewer clears the frozen frame and shows an end notice when the broadcast ends',()=>{
  assert.match(live,/function startViewerEndWatch\(id\)/);
  assert.match(live,/if\(!await stillLive\(\)\)return void viewerBroadcastEnded\(\)/);
  assert.match(live,/setViewerEmpty\('방송이 종료되었습니다','다음 방송이 시작되면 자동으로 연결됩니다\.'\)/);
  assert.match(live,/startViewerEndWatch\(id\);/);
  assert.match(live,/function waitNextBroadcast\(\)/);
});
