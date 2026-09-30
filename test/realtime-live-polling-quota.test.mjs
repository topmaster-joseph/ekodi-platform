import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=()=>readFile(new URL('../tenant-live.js',import.meta.url),'utf8');

test('shared live collaboration polling adapts to visibility and Worker free-quota pressure',async()=>{
  const js=await source();
  assert.match(js,/function collaborationPollDelay\(kind\)/);
  assert.match(js,/document\.visibilityState==='hidden'\)return 30000/);
  assert.match(js,/kind==='chat'\?8000:kind==='approval'\?5000:10000/);
  assert.doesNotMatch(js,/setInterval\(refreshChat,2000\)/);
  assert.doesNotMatch(js,/setInterval\(refreshParticipantSources,2500\)/);
  assert.doesNotMatch(js,/participantTimer=setInterval\(poll,2000\)/);
  assert.match(js,/document\.addEventListener\('visibilitychange'/);
});

test('shared viewer approval polling starts only after camera participation request',async()=>{
  const js=await source();
  const join=js.slice(js.indexOf('async function joinViewer'),js.indexOf('async function refreshLive'));
  assert.doesNotMatch(join,/startParticipantApprovalPolling\(\)/);
  const request=js.slice(js.indexOf('async function requestCameraParticipation'),js.indexOf('function startParticipantApprovalPolling'));
  assert.match(request,/startParticipantApprovalPolling\(\)/);
});
