import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const live=readFileSync(new URL('../live/live.js',import.meta.url),'utf8');
const materials=readFileSync(new URL('../live/worship-materials.js',import.meta.url),'utf8');

test('stale room metadata is not confirmation of a media signal',()=>{
  assert.match(live,/function roomNeedsPublisherCheck\(room\)/);
  assert.match(live,/30\*60\*1000/);
  assert.match(live,/방송 수신 확인 중/);
  assert.match(live,/실제 영상 트랙 수신/);
  assert.match(live,/event.track\?\.kind==='video'/);
  assert.match(live,/실제 영상 표시를 확인하고 있습니다/);
});

test('private authenticated viewer can fetch presentation without leaking token to URL',()=>{
  assert.match(materials,/headers:\{authorization:'Bearer '\+access\}/);
  assert.match(materials,/credentials:'omit'/);
  assert.match(materials,/const access=authToken\(\)/);
  assert.doesNotMatch(materials,/searchParams\.set\(['"]token/);
  assert.match(materials,/roomChanged=roomId!==detail.roomId/);
  assert.match(materials,/latestRevision=0/);
  assert.match(materials,/packet\)void sendPresenterSlide\(\)/);
  new Function(materials);
  new Function(live);
});
