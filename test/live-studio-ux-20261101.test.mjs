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

test('QR management camera: connected pair closes dialog, opens 참여 tab and auto-shows the feed',()=>{
  assert.match(live,/function onManagementCameraConnected/);
  assert.match(live,/dialog\.close\(\);selectStudioTab\('참여'\)/);
  assert.match(live,/kind==='management_camera'&&state\.managementAutoShow&&!item\.autoShown/);
});
test('simulcast panel retries after login handoff instead of sticking on expired-session',()=>{
  assert.match(interp,/ekodi-live-auth-ready/);
  assert.match(live,/new CustomEvent\('ekodi-live-auth-ready'\)/);
  assert.match(interp,/return load\(true\)/);
});

test('ending a broadcast returns host to a ready preview and releases viewers from a frozen frame',()=>{
  assert.match(live,/await resetHostAfterEnd\(\)\}catch/);
  assert.match(live,/const ok=await prepareStudio\(\)/);
  assert.match(live,/function startViewerEndWatch\(id\)/);
  assert.match(live,/if\(!await stillLive\(\)\)return void viewerBroadcastEnded\(\)/);
  assert.match(live,/startViewerEndWatch\(id\);return\}/);
  assert.match(live,/function waitNextBroadcast\(\)/);
});
test('camera-busy error explains which app holds the camera',()=>{
  assert.match(live,/NotReadableError/);
});

test('viewer end detection survives expired login and frozen frames',()=>{
  assert.match(live,/api\(`\/live\?tenant=\$\{encodeURIComponent\(cfg\.tenant\)\}`\);if\(live&&typeof live\.live==='boolean'\)/);
  assert.match(live,/return failures<3/);
  assert.match(live,/state\.viewerFreezeTimer=setInterval/);
});
