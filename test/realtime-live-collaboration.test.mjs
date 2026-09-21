import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('realtime collaboration schema and API expose chat and moderated participant cameras',async()=>{
  const [migration,pairingMigration,languageMigration,control]=await Promise.all([
    read('migrations/0097_realtime_chat_participant_sources.sql'),
    read('migrations/0104_realtime_aux_camera_pairings.sql'),
    read('migrations/0105_realtime_language_listeners.sql'),
    read('realtime-control.js'),
  ]);
  assert.match(migration,/realtime_chat_messages/);
  assert.match(migration,/realtime_participation_requests/);
  assert.match(pairingMigration,/realtime_camera_pairings/);
  assert.match(pairingMigration,/claim_hash/);
  assert.match(pairingMigration,/status IN \('open','pending','approved','revoked','expired'\)/);
  assert.match(languageMigration,/realtime_language_listeners/);
  assert.match(languageMigration,/PRIMARY KEY \(room_id, actor_key\)/);
  assert.match(control,/\/chat/);
  assert.match(control,/participation-requests/);
  assert.match(control,/participant-sources/);
  assert.match(control,/camera-pairings/);
  assert.match(control,/aux-camera:/);
  assert.match(control,/actor_key NOT LIKE 'aux-camera:%'/);
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
  assert.match(page,/id=\"createCameraPairingButton\"/);
  assert.match(page,/id=\"cameraPairQr\"/);
  assert.match(page,/id=\"managedCameraSources\"/);
  assert.match(page,/id=\"participantSources\"/);
  assert.match(page,/id=\"studioChatMessages\"/);
  assert.match(page,/id=\"viewerChatMessages\"/);
  assert.match(live,/function beginOverlayDrag\(event\)/);
  assert.match(live,/function moveOverlayDrag\(event\)/);
  assert.match(live,/function removeOverlay\(id\)/);
  assert.match(live,/drawOverlays\(ctx,w,h\)/);
  assert.match(live,/connectExtraCamera/);
  assert.match(live,/createCameraPairing/);
  assert.match(live,/claimAuxCamera/);
  assert.match(live,/switchAuxCamera/);
  assert.match(live,/ensureAuxCameraPull/);
  assert.match(live,/ensureParticipantPull/);
  assert.match(css,/\.compact-controls/);
  assert.match(css,/\.aux-camera-only/);
  assert.match(css,/\.program-drag-handle/);
  assert.match(css,/\.chat-messages/);
});

test('viewer interpretation selector chooses available translated audio and falls back to original',async()=>{
  const [page,live,control]=await Promise.all([read('tenant-live-page.js'),read('tenant-live.js'),read('realtime-control.js')]);
  assert.match(page,/id="viewerLanguageSelect"/);
  assert.match(page,/<option value="original">원음<\/option>/);
  for(const language of ['English','中文','日本語','Tiếng Việt','Монгол']) assert.match(page,new RegExp(language));
  assert.match(live,/viewerTracksForLanguage/);
  assert.match(live,/trackSource\(t\)==='translation'/);
  assert.match(live,/translated\.length\?translated:original/);
  assert.match(live,/setViewerLanguagePreference/);
  assert.match(live,/reconnectViewerLanguage/);
  assert.match(control,/language-listener/);
  assert.match(control,/realtime_language_channels/);
  assert.match(control,/source_type/);
  assert.match(control,/language_code/);
  assert.match(control,/viewerInterpretationTrackSelection:true/);
  assert.match(control,/viewerInterpretationDemandTracking:true/);
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


test('QR auxiliary camera pairing uses an on-site short URL and a local QR renderer',async()=>{
  const [qr,control,page,router]=await Promise.all([
    read('qr-code-v2.js'),
    read('realtime-control.js'),
    read('tenant-live-page.js'),
    read('platform-router-entry-worker.js'),
  ]);
  assert.match(qr,/const SIZE=25,DATA_CODEWORDS=34,ECC_CODEWORDS=10/);
  assert.match(qr,/globalThis\.EKODIQR/);
  assert.match(control,/pairUrl:.*ekodi\.kr\/live\/c/);
  assert.match(page,/\/qr-code-v2\.js/);
  assert.match(router,/liveAuxCameraPage/);
  assert.match(router,/A-Z0-9/);
  assert.doesNotMatch(qr,/https?:\/\//);
});

test('auxiliary camera pairing uses one-time device proof and host approval before publishing',async()=>{
  const control=await read('realtime-control.js');
  assert.match(control,/claimKey\.length<24/);
  assert.match(control,/claim_hash/);
  assert.match(control,/camera_pairing_not_claimed/);
  assert.match(control,/status='approved'/);
  assert.match(control,/x-ekodi-camera-key/);
  assert.match(control,/createAuxCameraMediaSession/);
  assert.match(control,/auxiliaryCameraQrPairing:true/);
});


test('studio copy stays compact and advanced settings collapse behind details',async()=>{
  const [page,css]=await Promise.all([read('tenant-live-page.js'),read('tenant-live.css')]);
  assert.match(page,/class="controls compact-controls"/);
  assert.match(page,/<details class="studio-block"><summary>화면 설정<\/summary>/);
  assert.match(page,/<details class="studio-block"><summary>채팅<\/summary>/);
  assert.match(page,/<details class="studio-block"><summary>송출 설정<\/summary>/);
  assert.match(css,/grid-template-columns:minmax\(0,880px\) 292px/);
  assert.match(css,/\.stage\{width:100%;min-height:0;aspect-ratio:16\/9/);
  assert.doesNotMatch(page,/별도 앱 없이 브라우저에서 방송하거나 공개 방송에 참여할 수 있습니다/);
});
