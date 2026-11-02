import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../live/live.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../live/index.html',import.meta.url),'utf8');

test('translated speech is never announced ready based solely on requested language metadata',()=>{
  assert.match(script,/function renderLanguageOptions\(tracks=\[\]\)/);
  assert.match(script,/source_type\|\|track.sourceType/);
  assert.match(script,/track.media_kind\|\|track.mediaKind/);
  assert.match(script,/track.language_code\|\|track.languageCode/);
  assert.match(script,/dataset.interpretationReady/);
  assert.match(script,/음성 트랙 확인/);
  assert.match(script,/원음 방송 · 통역 음성 준비 중/);
  assert.doesNotMatch(script,/textContent='자동동시통역 가능'/);
  assert.doesNotMatch(html,/자동동시통역 가능/);
});
test('viewer starts with original, does not accidentally mix every translation audio track',()=>{
  assert.match(script,/\.filter\(track=>\(track.source_type\|\|track.sourceType\)!=='translation'\)/);
  assert.match(script,/renderLanguageOptions\(detail.tracks\|\|\[\]\)/);
  assert.match(script,/new RTCPeerConnection/);
});
