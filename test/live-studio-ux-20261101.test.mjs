import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const live=readFileSync(new URL('../tenant-live.js',import.meta.url),'utf8');
const interp=readFileSync(new URL('../live-interpretation.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../tenant-live.css',import.meta.url),'utf8');
const icss=readFileSync(new URL('../live-interpretation.css',import.meta.url),'utf8');

test('program overlay sources can be moved and resized (grip, wheel, keyboard)',()=>{
  assert.match(live,/overlay-resize/);
  assert.match(live,/mode:resize\?'resize':'move'/);
  assert.match(live,/addEventListener\('wheel'/);
  assert.match(live,/function overlayKey/);
  assert.match(css,/\.overlay-resize\{/);
});
test('studio program monitor is capped smaller on desktop',()=>{
  assert.match(css,/\.studio\{grid-template-columns:minmax\(0,860px\) 410px\}/);
});
test('interpretation source and target languages are both select boxes',()=>{
  assert.match(interp,/live-lang-dropdown/);
  assert.match(interp,/text:'변환어'/);
  assert.match(interp,/filter\(x=>x!==sourceSelect\.value\)/);
  assert.match(icss,/\.live-lang-menu\{/);
});
test('studio refreshes the EKODI auth token instead of failing external/simulcast checks',()=>{
  assert.match(live,/grant_type=refresh_token/);
  assert.match(live,/ekodi-auth-refresh-token/);
  assert.match(live,/storeSession\(data\);return true/);
  assert.match(interp,/window\.EKODI_LIVE_AUTH\?\.\(\)/);
  assert.match(interp,/다시 로그인 · 진행자 권한 확인/);
});
