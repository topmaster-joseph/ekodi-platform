import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  normalizeSlidesAudioPilot, validateSlidesAudioPilotReceipt,
  SLIDES_AUDIO_ITEMS, SLIDES_AUDIO_PILOT_ID, SLIDES_AUDIO_PRESENTATION_ID,
  SLIDES_AUDIO_OPERATION, SLIDES_AUDIO_SECURITY
} from '../google-workspace-slides-audio-policy.js';
const input = () => ({
  presentationId:SLIDES_AUDIO_PRESENTATION_ID,
  operation:SLIDES_AUDIO_OPERATION,
  pilotId:SLIDES_AUDIO_PILOT_ID,
});
const receipt = () => ({
  status:'completed', presentationId:SLIDES_AUDIO_PRESENTATION_ID,
  dedicatedProfileVerified:true, foregroundFocusStolen:false,
  activeUserProfileReused:false, interactiveLoginOpened:false,
  items:SLIDES_AUDIO_ITEMS.map(({slideId,fileId})=>({
    slideId, fileId, nativeAudioControlObserved:true,
    playbackVerified:true, hyperlinkOnly:false,
  })),
});
test('bounded Google Workspace job contains only the eight approved slide/audio pairs',()=>{
 const v=normalizeSlidesAudioPilot(input());
 assert.equal(v.items.length,8);
 assert.deepEqual(v.items.map(x=>x.slideNumber),[22,23,24,38,39,40,41,42]);
 assert.equal(v.maxAttempts,1);
 assert.equal(v.interactiveLoginAllowed,false);
 assert.equal(v.reuseActiveUserBrowserProfile,false);
 assert.equal(v.foregroundTakeoverAllowed,false);
 assert.equal(v.executionMode,'dedicated-headless-browser');
 assert.equal(SLIDES_AUDIO_SECURITY.allowGenericExternalBrowsing,false);
});
test('extra URLs, copied tokens, arbitrary IDs and global browser flags are rejected',()=>{
 for(const inject of [
 {url:'https://evil.test/'},
 {path:'//evil.test'},
 {fileId:'attacker'},
 {audioFiles:[]},
 {host:'docs.google.com'},
 {access_token:'fake'},
 {createUserBrowserTab:true},
 {browserProfile:'Default'},
 {items:[]}
 ]) {
  assert.throws(()=>normalizeSlidesAudioPilot({...input(),...inject}),/GOOGLE_WORKSPACE_PILOT_SCOPE_DENIED/);
 }
 for(const field of ['presentationId','pilotId','operation']) {
  assert.throws(()=>normalizeSlidesAudioPilot({...input(),[field]:'wrong'}),/SCOPE_DENIED/);
 }
 for(const value of [null,[],1,'abc']) {
  assert.throws(()=>normalizeSlidesAudioPilot(value),/PAYLOAD_INVALID/);
 }
});
test('a hyperlink is never accepted as native audio insertion',()=>{
 const r=receipt();
 r.items[0].nativeAudioControlObserved=false;
 assert.equal(validateSlidesAudioPilotReceipt(r).ok,false);
 r.items[0].nativeAudioControlObserved=true;
 r.items[1].hyperlinkOnly=true;
 assert.equal(validateSlidesAudioPilotReceipt(r).ok,false);
});
test('native audio receipt requires all eight playback probes and isolation',()=>{
 assert.equal(validateSlidesAudioPilotReceipt(receipt()).verifiedItems,8);
 let r=receipt();r.items[0].playbackVerified=false;
 assert.equal(validateSlidesAudioPilotReceipt(r).ok,false);
 r=receipt();r.items[1].fileId='different';
 assert.equal(validateSlidesAudioPilotReceipt(r).ok,false);
 r=receipt();r.items.push(r.items[0]);
 assert.equal(validateSlidesAudioPilotReceipt(r).ok,false);
 r=receipt();r.dedicatedProfileVerified=false;
 assert.equal(validateSlidesAudioPilotReceipt(r).ok,false);
 r=receipt();r.interactiveLoginOpened=true;
 assert.equal(validateSlidesAudioPilotReceipt(r).ok,false);
 r=receipt();r.foregroundFocusStolen=true;
 assert.equal(validateSlidesAudioPilotReceipt(r).ok,false);
 r=receipt();r.activeUserProfileReused=true;
 assert.equal(validateSlidesAudioPilotReceipt(r).ok,false);
});

test('queue, admin UI and Windows Agent are wired but default closed',()=>{
 const base=new URL('../', import.meta.url);
 const files=['hybrid-execution.js','hybrid-execution-admin.js','tools/ekodi-device-agent/windows/ekodi-device-agent.ps1'];
 const [queue,ui,agent]=files.map(f=>readFileSync(new URL(f,base),'utf8'));
 assert.match(queue, /'computer\.workspace\.slides\.audio\.insert': \{ capability:'workspaceSlidesAudio'/);
 assert.match(queue, /GOOGLE_WORKSPACE_NATIVE_NODE_NOT_READY/);
 assert.match(queue, /GOOGLE_WORKSPACE_PREVIOUS_ATTEMPT_REQUIRES_REVIEW/);
 assert.match(queue, /validateSlidesAudioPilotReceipt\(result\.workspaceSlidesAudio\)/);
 assert.match(ui, /id="enqueueWorkspaceAudio" disabled/);
 assert.match(ui, /'computer\.workspace\.slides\.audio\.insert'/);
 assert.match(agent, /workspaceSlidesAudio = \[bool\]\(Get-WorkspaceSlidesAudioState\)\.verified/);
 assert.match(agent, /workspace_audio_canary_required/);
 assert.match(agent, /Invoke-WorkspaceSlidesAudioTask \$payload/);
 assert.match(agent, /\$AgentVersion = '2\.5\.3'/);
});
