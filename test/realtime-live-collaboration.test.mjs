import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('realtime collaboration schema and API expose chat and moderated participant cameras',async()=>{
  const [migration,cameraMigration,control]=await Promise.all([
    read('migrations/0097_realtime_chat_participant_sources.sql'),
    read('migrations/0104_realtime_management_camera_pairing.sql'),
    read('realtime-control.js'),
  ]);
  assert.match(migration,/realtime_chat_messages/);
  assert.match(migration,/realtime_participation_requests/);
  assert.match(cameraMigration,/realtime_management_camera_pairs/);
  assert.match(cameraMigration,/device_key_hash/);
  assert.match(control,/\/chat/);
  assert.match(control,/participation-requests/);
  assert.match(control,/participant-sources/);
  assert.match(control,/management-cameras/);
  assert.match(control,/x-ekodi-camera-key/);
  assert.match(control,/camera:'\+pair\.id/);
  assert.match(control,/source_role/);
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
  assert.match(page,/id=\"managementCameraSources\"/);
  assert.match(page,/id=\"openManagementCameraButton\"/);
  assert.match(page,/id=\"managementCameraQr\"/);
  assert.match(page,/id=\"studioChatMessages\"/);
  assert.match(page,/id=\"viewerChatMessages\"/);
  assert.match(live,/function beginOverlayDrag\(event\)/);
  assert.match(live,/function moveOverlayDrag\(event\)/);
  assert.match(live,/function removeOverlay\(id\)/);
  assert.match(live,/drawOverlays\(ctx,w,h\)/);
  assert.match(live,/connectExtraCamera/);
  assert.match(live,/ensureParticipantPull/);
  assert.match(live,/qrMatrixV5/);
  assert.match(live,/createManagementCameraPair/);
  assert.match(live,/connectManagementDeviceCamera/);
  assert.match(css,/\.program-drag-handle/);
  assert.match(css,/\.chat-messages/);
});

test('viewer and participant can choose interpretation and speaking languages',async()=>{
  const [page,live,control]=await Promise.all([read('tenant-live-page.js'),read('tenant-live.js'),read('realtime-control.js')]);
  assert.match(page,/id="viewerListenLanguage"/);
  assert.match(page,/id="participantSpeakLanguage"/);
  for(const language of ['English','中文','日本語','Tiếng Việt','Монгол']) assert.match(page,new RegExp(language));
  assert.match(live,/viewerTrackSelection/);
  assert.match(live,/switchViewerLanguage/);
  assert.match(live,/sourceType==='translation'/);
  assert.match(live,/speakingLanguage/);
  assert.match(control,/language_code/);
  assert.match(control,/source_type/);
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
  assert.match(page,/EKODI · 자동 저장/);
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


test('QR management camera pairing stays first-party and separate from participant approval',async()=>{
  const [page,live,control]=await Promise.all([read('tenant-live-page.js'),read('tenant-live.js'),read('realtime-control.js')]);
  assert.match(page,/managementCameraPage/);
  assert.match(page,/QR을 찍고 승인합니다/);
  assert.match(control,/managementCameraPairRoute/);
  assert.match(control,/management_camera_approval_required/);
  assert.match(control,/const actorKey='camera:'\+pair\.id/);
  assert.match(live,/drawManagementCameraQr/);
  assert.match(live,/managementDeviceKey/);
  assert.doesNotMatch(live,/api\.qrserver|quickchart|chart\.googleapis|googleapis\.com\/chart/);
});

test('studio layout is compact on desktop and mobile',async()=>{
  const [page,css]=await Promise.all([read('tenant-live-page.js'),read('tenant-live.css')]);
  assert.match(page,/class="controls compact-controls"/);
  assert.match(page,/<details class="compact-settings">/);
  assert.match(css,/grid-template-columns:minmax\(0,820px\) 300px/);
  assert.match(css,/\.compact-controls\{grid-template-columns:repeat\(2/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/\.compact-controls\{grid-template-columns:repeat\(4/);
});
