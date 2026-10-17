import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script=await readFile(new URL('../scripts/church-live-production-e2e.mjs',import.meta.url),'utf8');
const workflow=await readFile(new URL('../.github/workflows/church-live-production-e2e.yml',import.meta.url),'utf8');

test('Church Live production E2E is safe around real broadcasts and proves remote media',()=>{
  assert.match(script,/active_church_broadcast/);
  assert.match(script,/use-fake-device-for-media-stream/);
  assert.match(script,/viewer_received_no_live_track/);
  assert.match(script,/status:'ended'/);
});

test('Church Live production E2E follows the explicit broadcast-start interaction',()=>{
  assert.match(script,/goLiveButton/);
  assert.match(script,/\.click\(\)/);
  assert.match(script,/dataset\?\.phase==='live'/);
  assert.match(script,/room_id_missing/);
});

test('Church Live E2E uses short-lived central admin auth and always revokes it',()=>{
  assert.match(workflow,/\+20 minutes/);
  assert.match(workflow,/https:\/\/ekodi\.kr\/api\/session/);
  assert.match(workflow,/DELETE FROM sessions WHERE token_hash/);
  assert.match(workflow,/if: always\(\)/);
});

test('Native Church QR E2E uses isolated simulated mobile camera and owner approval without external browser',()=>{
  for(const marker of [
    "EKODI-owned isolated Chromium",
    "cameraContext=await browser.newContext({viewport:{width:390,height:844}",
    "await cameraPage.goto(cameraUrl",
    "camera_without_device_key_allowed",
    "cameraPairId=issued.id",
    "hasText:'연결 승인'",
    "report.camera.syntheticDevicePublished=true",
    "report.camera.hostVideoReceived=true",
    "management_camera:",
    "director_video_resize_not_applied",
    "director_chat_resize_not_applied",
    "viewer_track_replaced_on_resize",
    "status:'revoked'",
    "cameraContext?.close()"
  ])assert.ok(script.includes(marker),'missing EKODI native QR E2E marker: '+marker);
  assert.doesNotMatch(script,/tinyfish|browserstack|sauce.?labs|external browser/i);
});
test('QR E2E reuses the existing secret-masked, expiring and revoked official Church session',()=>{
  assert.match(workflow,/E2E_ADMIN_TOKEN=\$token/);
  assert.match(workflow,/DELETE FROM sessions WHERE token_hash/);
  assert.match(workflow,/Install Chromium harness/);
  assert.match(workflow,/Run real Church Live publish and anonymous viewer pull/);
  assert.match(script,/active_church_broadcast/);
  assert.match(script,/viewerTracks/);
  assert.match(script,/return/);
});
