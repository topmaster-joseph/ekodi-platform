import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('realtime collaboration schema and API expose chat and moderated participant cameras',async()=>{
  const [migration,control]=await Promise.all([
    read('migrations/0097_realtime_chat_participant_sources.sql'),
    read('realtime-control.js'),
  ]);
  assert.match(migration,/realtime_chat_messages/);
  assert.match(migration,/realtime_participation_requests/);
  assert.match(control,/\/chat/);
  assert.match(control,/participation-requests/);
  assert.match(control,/participant-sources/);
  assert.match(control,/role='presenter'/);
  assert.match(control,/chat_rate_limited/);
});

test('shared tenant live UI exposes movable chat, extra cameras, and participant sources',async()=>{
  const [page,live,css]=await Promise.all([
    read('tenant-live-page.js'),
    read('tenant-live.js'),
    read('tenant-live.css'),
  ]);
  assert.match(page,/id=\"programOverlayLayer\"/);
  assert.match(page,/id=\"chatOverlaySource\"/);
  assert.match(page,/id=\"extraCameraSelect\"/);
  assert.match(page,/id=\"participantSources\"/);
  assert.match(page,/id=\"studioChatMessages\"/);
  assert.match(page,/id=\"viewerChatMessages\"/);
  assert.match(live,/function beginOverlayDrag\(event\)/);
  assert.match(live,/function moveOverlayDrag\(event\)/);
  assert.match(live,/function removeOverlay\(id\)/);
  assert.match(live,/drawOverlays\(ctx,w,h\)/);
  assert.match(live,/connectExtraCamera/);
  assert.match(live,/ensureParticipantPull/);
  assert.match(css,/\.program-drag-handle/);
  assert.match(css,/\.chat-messages/);
});

test('shared interpretation UI is concise and lists supported languages only',async()=>{
  const page=await read('tenant-live-page.js');
  assert.match(page,/자동동시통역 가능/);
  for(const language of ['English','中文','日本語','Tiếng Việt','Монгол']) assert.match(page,new RegExp(language));
  assert.doesNotMatch(page,/원음을 자동으로 인식/);
});

test('internal recording remains default while optional external channel selection is fail-closed',async()=>{
  const [control,live,page]=await Promise.all([
    read('realtime-control.js'),
    read('tenant-live.js'),
    read('tenant-live-page.js'),
  ]);
  assert.match(control,/internalRecordingDefault:true/);
  assert.match(control,/externalChannelSelection:true/);
  assert.match(control,/distribution_engine_pending/);
  assert.match(control,/external_destination_not_ready/);
  assert.match(live,/destinationIds/);
  assert.match(live,/recording:true/);
  assert.match(page,/EKODI 내부 방송 · 자동 저장/);
  assert.match(page,/외부 동시방송/);
});


test('live chat does not trust client supplied broadcaster names',async()=>{
  const control=await read('realtime-control.js');
  const start=control.indexOf("const chat=url.pathname.match");
  const end=control.indexOf("const requestMe=url.pathname.match",start);
  assert.ok(start>=0&&end>start,'chat route must exist');
  const chat=control.slice(start,end);
  assert.match(chat,/ADMIN_ROLES\.has\(actorRole\)\?'방송자'/);
  assert.doesNotMatch(chat,/displayName=clean\(input\?\.displayName/);
});


test('presenter source can be removed and re-added during screen share like other overlays',async()=>{
  const [page,live]=await Promise.all([read('tenant-live-page.js'),read('tenant-live.js')]);
  assert.match(page,/id="presenterOverlaySource"/);
  assert.match(live,/presenterHidden:false/);
  assert.match(live,/if\(id==='presenter'\)state\.presenterHidden=true/);
  assert.match(live,/presenter\.visible=!state\.presenterHidden/);
  assert.match(live,/addOverlay\('presenter'\)/);
});


test('live studio exposes compact shared-surface controls and QR camera invitation',async()=>{
  const [page,live,css]=await Promise.all([
    read('tenant-live-page.js'),
    read('tenant-live.js'),
    read('tenant-live.css'),
  ]);
  for(const marker of ['cameraInviteButton','cameraInviteDialog','sharedSurfaceControls','surfaceScrollButton','screenFreezeButton','participantFlipButton'])assert.match(page,new RegExp(marker));
  assert.match(live,/CaptureController/);
  assert.match(live,/forwardWheel/);
  assert.match(live,/screenFrozen/);
  assert.match(live,/camera=1/);
  assert.match(live,/replaceTrack/);
  assert.match(css,/\.studio-focus/);
  assert.match(css,/\.camera-source-mode/);
});

test('presenter compositor uses a round transparent-outside mask',async()=>{
  const [live,css]=await Promise.all([read('tenant-live.js'),read('tenant-live.css')]);
  assert.match(live,/function drawPresenterOverlay/);
  assert.match(live,/ctx\.ellipse\(/);
  assert.match(live,/overlay\.id==='presenter'/);
  assert.match(css,/\.program-drag-handle\.presenter-handle/);
});
