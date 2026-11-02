import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('live studio exposes fullscreen and switchable screen-share compositions',async()=>{
  const [html,js,css]=await Promise.all([read('live/index.html'),read('live/live.js'),read('live/live.css')]);
  assert.match(html,/id="fullscreenButton"/);
  assert.match(html,/data-layout="pip"/);
  assert.match(html,/data-layout="side"/);
  assert.match(html,/data-layout="equal"/);
  assert.match(html,/data-layout="screen"/);
  assert.match(js,/canvas\.captureStream\(30\)/);
  assert.match(js,/function setLayout\(layout\)/);
  assert.match(js,/getDisplayMedia/);
  assert.match(js,/requestFullscreen/);
  assert.match(css,/\.program-stage:fullscreen/);
});

test('screen layout changes reuse the program stream instead of republishing tracks',async()=>{
  const js=await read('live/live.js');
  const start=js.indexOf('async function shareScreen');
  const end=js.indexOf('async function toggleFullscreen',start);
  assert.notEqual(start,-1);
  assert.notEqual(end,-1);
  const share=js.slice(start,end);
  assert.match(share,/state\.layout='pip'/);
  assert.doesNotMatch(share,/publishStream\(/);
  assert.doesNotMatch(share,/addTrack\(/);
});

test('interpretation targets are automatic and displayed as supported languages',async()=>{
  const [html,js]=await Promise.all([read('live/index.html'),read('live/live.js')]);
  assert.match(html,/통역/);
  assert.match(html,/통역 음성 준비 상태/);
  assert.match(html,/id="languageChips"/);
  assert.doesNotMatch(html,/id="languageSelect"/);
  assert.match(js,/const SUPPORTED_LANGUAGES=/);
  assert.match(js,/languages:selectedLanguages\(\)/);
  assert.match(js,/interpretationMode:'auto'/);
  assert.match(js,/sourceLanguage:'auto'/);
});

test('live studio guards accidental navigation while broadcasting',async()=>{
  const js=await read('live/live.js');
  assert.match(js,/function guardLiveExit\(event\)/);
  assert.match(js,/beforeunload/);
  assert.match(js,/if\(!state\.isLive\)return/);
});


test('presenter PIP can be repositioned by pointer without republishing the live stream',async()=>{
  const [html,js,css]=await Promise.all([read('live/index.html'),read('live/live.js'),read('live/live.css')]);
  assert.match(html,/id="presenterDragHandle"/);
  assert.match(html,/PIP 발표자는 화면에서 마우스로 이동/);
  assert.match(js,/presenterPosition:\{x:/);
  assert.match(js,/function beginPresenterDrag\(event\)/);
  assert.match(js,/function movePresenterDrag\(event\)/);
  assert.match(js,/state\.presenterPosition\.x=/);
  assert.match(js,/state\.presenterPosition\.y=/);
  assert.match(js,/drawCovered\(ctx,camera,px,py,pw,ph\)/);
  assert.match(css,/\.presenter-drag-handle/);
  const start=js.indexOf('function beginPresenterDrag');
  const end=js.indexOf('function setLayout',start);
  assert.doesNotMatch(js.slice(start,end),/publishStream\(|addTrack\(/);
});


test('all auxiliary program sources are movable, removable, and composed into the program stream',async()=>{
  const [html,js,css]=await Promise.all([read('live/index.html'),read('live/live.js'),read('live/live.css')]);
  assert.match(html,/id="programOverlayLayer"/);
  assert.match(html,/id="chatOverlaySource"/);
  assert.match(html,/id="extraCameraSelect"/);
  assert.match(html,/id="participantSources"/);
  assert.match(js,/function ensureOverlay\(/);
  assert.match(js,/function beginOverlayDrag\(event\)/);
  assert.match(js,/function moveOverlayDrag\(event\)/);
  assert.match(js,/function removeOverlay\(id\)/);
  assert.match(js,/drawOverlaySources\(ctx,w,h\)/);
  assert.match(css,/\.program-drag-handle/);
  assert.match(css,/\.overlay-remove/);
});

test('live collaboration includes chat and moderated participant camera publishing',async()=>{
  const [html,js]=await Promise.all([read('live/index.html'),read('live/live.js')]);
  assert.match(html,/id="studioChatMessages"/);
  assert.match(html,/id="viewerChatMessages"/);
  assert.match(html,/id="participantCameraSelect"/);
  assert.match(js,/\/chat/);
  assert.match(js,/participation-requests/);
  assert.match(js,/participant-sources/);
  assert.match(js,/role:'presenter'/);
});

test('interpretation UI is concise and only shows automatic simultaneous interpretation with language list',async()=>{
  const html=await read('live/index.html');
  assert.match(html,/통역 음성 준비 상태/);
  assert.match(html,/id="languageChips"/);
  assert.doesNotMatch(html,/원음을 자동으로 인식/);
  assert.doesNotMatch(html,/class="auto-badge"/);
});


test('presenter PIP can be removed from the composed program without ending screen share',async()=>{
  const [html,js]=await Promise.all([read('live/index.html'),read('live/live.js')]);
  assert.match(html,/id="presenterRemoveButton"/);
  assert.match(js,/presenterRemoveButton/);
  assert.match(js,/setLayout\('screen'\)/);
});


test('compact viewer keeps interpretation display-only with no language selector',async()=>{
  const [html,js]=await Promise.all([read('live/index.html'),read('live/live.js')]);
  assert.match(html,/통역 음성 준비 상태/);
  assert.match(html,/id="viewerLanguageChips"/);
  assert.doesNotMatch(html,/id="viewerLanguageSelect"/);
  assert.doesNotMatch(js,/ekodi-live-interpretation-language/);
});


test('recording link recognizes shared-drive archive response shape',async()=>{
  const js=await read('live/live.js');
  assert.match(js,/recording\?\.driveWebViewLink/);
  assert.match(js,/archive\?\.file\?\.webViewLink/);
});

test('Church director QR camera uses authorized existing first-party pairing',async()=>{
 const [page,live,qr]=await Promise.all([read('live/index.html'),read('live/live.js'),read('live/management-camera-qr.js')]);
 for(const id of ['openManagementCameraButton','managementCameraDialog','managementCameraQr','managementCameraPairs','managementCameraSources'])assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(live,/async function createManagementCameraPair\(/);
 assert.match(live,/async function decideManagementCameraPair\(/);
 assert.match(live,/source\.sourceRole==='management_camera'/);
 assert.match(live,/if\(!state\.room\)\{const created=await createRoom\(/);
 assert.match(qr,/function qrMatrixV5/);assert.doesNotMatch(qr,/qrserver|quickchart|googleapis/);
 new Function(live);new Function(qr);
});

test('video participant presenter and chat can resize in the emitted canvas without republishing',async()=>{
 const [page,live,styles]=await Promise.all([read('live/index.html'),read('live/live.js'),read('live/live.css')]);
 assert.match(page,/id="presenterResizeGrip"/);assert.match(live,/function beginOverlayResize\(/);assert.match(live,/function moveOverlayResize\(/);
 assert.match(live,/function resizeOverlay\(/);assert.match(live,/function beginPresenterResize\(/);assert.match(live,/function movePresenterResize\(/);
 assert.match(live,/drawOverlaySources\(ctx,w,h\)/);assert.match(styles,/\.overlay-resize-grip/);
 const start=live.indexOf('function resizeOverlay('),end=live.indexOf('function sourceCard(',start);
 assert.doesNotMatch(live.slice(start,end),/publishStream\(|addTrack\(/);new Function(live);
});
