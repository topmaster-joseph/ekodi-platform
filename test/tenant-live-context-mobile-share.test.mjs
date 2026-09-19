import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tenantLivePage } from '../tenant-live-page.js';
import { realtimeTenant } from '../realtime-tenant-registry.js';

const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');

test('live shell keeps one structure while adapting copy by tenant mode',async()=>{
  const worship=await tenantLivePage(realtimeTenant('ekodichurch')).text();
  const meeting=await tenantLivePage(realtimeTenant('cgma')).text();
  const commerce=await tenantLivePage(realtimeTenant('jadam')).text();
  assert.match(worship,/실시간 예배/);
  assert.match(worship,/예배 방송하기/);
  assert.match(worship,/data-presenter-label="설교자"/);
  assert.match(meeting,/실시간 회의/);
  assert.match(meeting,/회의 시작/);
  assert.match(commerce,/매장 LIVE/);
  assert.match(commerce,/상품·화면공유/);
  for(const html of [worship,meeting,commerce]){
    assert.match(html,/id="programOverlayLayer"/);
    assert.match(html,/id="studioChatMessages"/);
    assert.match(html,/id="externalDestinations"/);
    assert.match(html,/id="mobileShareInput"/);
  }
});

test('mobile share falls back to local image or video visual composition',async()=>{
  const source=await read('tenant-live.js');
  assert.match(source,/function isLikelyMobile\(\)/);
  assert.match(source,/function canNativeScreenShare\(\)/);
  assert.match(source,/function loadMobileShareFile\(file\)/);
  assert.match(source,/file\.type\.startsWith\('image\/'\)/);
  assert.match(source,/file\.type\.startsWith\('video\/'\)/);
  assert.match(source,/openMobileSharePicker\(\)/);
  assert.match(source,/state\.sharedVisual\|\|screen/);
  assert.match(source,/mobileShareInput/);
});

test('runtime source labels follow tenant context instead of fixed presenter wording',async()=>{
  const source=await read('tenant-live.js');
  assert.match(source,/const presenterLabel=\(\)=>cfg\.presenterLabel/);
  assert.match(source,/const participantLabel=\(\)=>cfg\.participantLabel/);
  assert.match(source,/label:presenterLabel\(\)/);
  assert.match(source,/sendChat\('studioChatInput',presenterLabel\(\)\)/);
});
