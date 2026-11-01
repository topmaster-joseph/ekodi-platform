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

const clientAuth=readFileSync(new URL('../auth-site/client-auth.js',import.meta.url),'utf8');
const ctl=readFileSync(new URL('../live-interpretation-control.js',import.meta.url),'utf8');
test('church login may return to the canonical /live/church/ studio (QR camera, host login)',()=>{
  assert.match(clientAuth,/const churchLive=config\.kind==='church'&&target\.origin==='https:\/\/ekodi\.kr'&&\(target\.pathname==='\/live\/church'\|\|target\.pathname\.startsWith\('\/live\/church\/'\)\)/);
  for(const f of ['../auth-site/auth.js','../auth-site/auth-workspace-target.js'])assert.match(readFileSync(new URL(f,import.meta.url),'utf8'),/startsWith\('\/live\/church\/'\)/);
});
test('overlay resize is free-aspect by default; host token is kept alive during broadcast',()=>{
  assert.match(live,/keepRatio:false/);
  assert.match(live,/setInterval\(\(\)=>\{if\(token\(\)\)void ensureFreshToken\(\)\},4\*60\*1000\)/);
});
test('simulcast channels can be added from the studio; platform owner may bind the relay PC',()=>{
  assert.match(interp,/＋ 동시송출 채널 추가/);
  assert.match(interp,/① 송출 PC 지정/);
  assert.match(ctl,/canBindRelay\(host\.access\.identity\)/);
  assert.doesNotMatch(ctl,/platformAdminRole!=='super_admin'\)return json\(request,env,\{ok:false,error:'relay_binding_super_admin_required'/);
});

test('studio settings render as one-at-a-time tabs that fit one screen',()=>{
  assert.match(live,/studio-tabs/);
  for(const name of ['화면','소스','참여','채팅','통역','송출'])assert.ok(live.includes(`'${name}'`),name);
  assert.match(css,/\.compact-panel\.studio-tabbed\{display:flex;flex-direction:column;max-height:calc\(100dvh - 100px\);overflow:hidden\}/);
});
