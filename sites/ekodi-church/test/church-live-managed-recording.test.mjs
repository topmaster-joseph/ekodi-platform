import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('church live records the composited program stream with managed multipart storage',async()=>{
  const source=await read('live/live.js');
  assert.match(source,/RECORD_PART_TARGET=6\*1024\*1024/);
  assert.match(source,/const source=state\.program\|\|state\.local/);
  assert.match(source,/new MediaRecorder\(source/);
  assert.match(source,/\/recordings\//);
  assert.match(source,/\/parts\//);
  assert.match(source,/startManagedRecording\(\)/);
  assert.match(source,/stopManagedRecording\(\)/);
});

test('recording failure never tears down the live broadcast',async()=>{
  const source=await read('live/live.js');
  assert.match(source,/실시간 방송은 계속됩니다/);
  const start=source.indexOf('async function startManagedRecording');
  const end=source.indexOf('async function stopManagedRecording',start);
  const block=source.slice(start,end);
  assert.doesNotMatch(block,/state\.pc\?\.close\(\)|endLive\(/);
});

test('live end finalizes recording before stopping program tracks',async()=>{
  const source=await read('live/live.js');
  const start=source.indexOf('async function endLive');
  const end=source.indexOf('async function joinViewer',start);
  const block=source.slice(start,end);
  const finalize=block.indexOf('await stopManagedRecording()');
  const stopTracks=block.indexOf("state.local?.getTracks().forEach");
  assert.ok(finalize>=0);
  assert.ok(stopTracks>finalize,'recording must finalize before program tracks are stopped');
});
