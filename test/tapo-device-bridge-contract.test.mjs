import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { projectTapoDeviceForCloud, assertSafeTapoCloudProjection, tapoSupports } from '../tapo-provider-adapter.js';

const [control,admin,deviceAdmin,bridge,registryText,packsText,build]=await Promise.all([
  readFile(new URL('../device-control.js',import.meta.url),'utf8'),
  readFile(new URL('../tapo-device-admin.js',import.meta.url),'utf8'),
  readFile(new URL('../device-control-admin.js',import.meta.url),'utf8'),
  readFile(new URL('../tools/ekodi-device-agent/tapo/index.mjs',import.meta.url),'utf8'),
  readFile(new URL('../config/capability-registry.json',import.meta.url),'utf8'),
  readFile(new URL('../config/workspace-packs.json',import.meta.url),'utf8'),
  readFile(new URL('../scripts/build.mjs',import.meta.url),'utf8'),
]);
const registry=JSON.parse(registryText),packs=JSON.parse(packsText);

test('Tapo cloud projection strips local credentials and topology',()=>{
  const projected=projectTapoDeviceForCloud({id:'front',label:'Front',type:'camera',model:'C210',protocols:['rtsp','onvif'],capabilities:['camera.live','camera.status'],rtspUrl:'rtsp://u:p@192.168.0.10/stream1',username:'u',password:'p',ip:'192.168.0.10'},'dev_demo');
  assert.equal(projected.externalId,'front');
  assert.equal(tapoSupports({id:'front',type:'camera'},'camera.live'),true);
  assert.equal(assertSafeTapoCloudProjection(projected),true);
  assert.doesNotMatch(JSON.stringify(projected),/rtsp:\/\/|192\.168\.|password|username/i);
});
test('gateway authority is observe-only and stream bounded',()=>{
  assert.match(control,/gateway: Object\.freeze/);
  assert.match(control,/allowedCommands: Object\.freeze\(\['camera\.live\.start'\]\)/);
  assert.match(control,/STREAM_SESSION_TTL_MS = 3 \* 60 \* 1000/);
  assert.match(control,/DEVICE_BRIDGE_ALLOWED_HOST_SUFFIXES/);
  assert.match(control,/edge-bridge/);
});

test('edge bridge keeps RTSP local and has executable synthetic media proof',()=>{
  assert.match(bridge,/rtspUrl/);
  assert.match(bridge,/127\.0\.0\.1/);
  assert.match(bridge,/selfTest/);
  assert.match(bridge,/testsrc/);
  assert.match(bridge,/camera\.live\.start/);
  const projection=bridge.match(/function cameraProjection[\s\S]*?\n\}/)?.[0]||'';
  assert.doesNotMatch(projection,/rtspUrl|username|password/);
});

test('admin exposes Tapo bridge enrollment and live view without raw RTSP',()=>{
  assert.match(admin,/Tapo 웹 연결/);
  assert.match(admin,/Tapo 카메라/);
  assert.match(admin,/실시간 보기/);
  assert.match(admin,/deviceType:'gateway'/);
  assert.doesNotMatch(admin,/rtsp:\/\//i);
  assert.match(deviceAdmin,/demandLoader\?\.loadScript\|\|demandLoader\?\.loadJs/);
  assert.match(deviceAdmin,/loadTapoScript\.call\(demandLoader,'tapo-device-admin\.js'\)/);
  assert.match(build,/tapo-device-admin\.js/);
});
test('device observation is a registered generation-10 capability composition',()=>{
  const capability=registry.capabilities.find(x=>x.id==='device.observe');
  assert.ok(capability);
  assert.equal(registry.version,'3.1.0');
  assert.equal(capability.actionTier,'observe');
  assert.equal(capability.maturity,'service-backed-readonly');
  assert.ok(capability.surfaces.includes('my'));
  assert.ok(packs.packs.find(x=>x.id==='small-business').capabilities.includes('device.observe'));
});

test('stream session persists only a hash and browser assembles the edge token',()=>{
  assert.match(control,/CREATE TABLE IF NOT EXISTS device_stream_sessions/);
  assert.match(control,/secret_hash TEXT NOT NULL/);
  assert.match(control,/statusUrl/);
  assert.match(control,/DEVICE_STREAM_ROUTE_REQUIRED/);
  assert.match(control,/payload_json='\{\}'/);
  assert.match(admin,/waitForStream/);
  assert.match(admin,/issued\.sessionToken/);
  assert.match(admin,/ready\.playbackBase/);
  assert.doesNotMatch(control,/playbackUrl:[^\n]+sessionSecret/);
});
