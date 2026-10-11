import test from 'node:test';
import assert from 'node:assert/strict';
import {projectNativeDeviceProofs} from '../device-control.js';

const now=Date.parse('2026-10-11T04:00:00.000Z');
const completedAt=new Date(now-30000).toISOString();
const browser={ok:true,mode:'native-cdp',url:'https://ekodi.kr/',contentBytes:1024,dedicatedAutomationProfile:true,focusIsolated:true,clipboardShared:false,userInputInjection:false};
const localAi={ollamaApi:'ready',inference:'passed',credentialCollection:false,executionMode:'fixed_loopback_api'};
const row=(type,proof,status='succeeded',time=completedAt)=>({
  command_type:type,status,completed_at:time,
  result_json:JSON.stringify(type==='computer.browser.canary'?{browserCanary:proof}:{localAiProof:proof})
});

test('read-only native projection requires matching fresh browser and Ollama proof, not process exit',()=>{
  const evidence=projectNativeDeviceProofs([
    row('computer.browser.canary',browser),row('software.localai.verify',localAi)
  ],now);
  assert.equal(evidence.browser.verified,true);
  assert.equal(evidence.browser.mode,'native-cdp');
  assert.equal(evidence.localAi.verified,true);
  assert.doesNotMatch(JSON.stringify(evidence),/token|modelOutput|device_id/);
});
test('browser exit-zero, old proof or non-CDP may never count as passed',()=>{
  for(const fake of [
    {...browser,contentBytes:0},
    {...browser,mode:'background-browser-canary'},
    {...browser,url:'https://other.invalid/'},
    {...browser,focusIsolated:false},
    {...browser,clipboardShared:true}
  ])assert.equal(projectNativeDeviceProofs([row('computer.browser.canary',fake)],now).browser.verified,false);
  assert.equal(projectNativeDeviceProofs([
    row('computer.browser.canary',browser,'succeeded',new Date(now-90000000).toISOString())
  ],now).browser.verified,false);
});
test('old success cannot mask newer queued or failed canary',()=>{
  const proof=projectNativeDeviceProofs([
    row('computer.browser.canary',{},'failed',completedAt),
    row('computer.browser.canary',browser,'succeeded',new Date(now-60000).toISOString())
  ],now);
  assert.equal(proof.browser.status,'failed');
  assert.equal(proof.browser.verified,false);
});
test('Ollama cannot claim inference from install, unsafe mode, or missing response',()=>{
  assert.equal(projectNativeDeviceProofs([row('software.localai.install',localAi)],now).localAi,null);
  assert.equal(projectNativeDeviceProofs([
    row('software.localai.verify',{...localAi,credentialCollection:true})
  ],now).localAi.verified,false);
  assert.equal(projectNativeDeviceProofs([
    row('software.localai.verify',{...localAi,inference:'not_checked'})
  ],now).localAi.verified,false);
  assert.equal(projectNativeDeviceProofs([
    row('software.localai.verify',{...localAi,executionMode:'cloud-provider'})
  ],now).localAi.verified,false);
});
test('malformed and unknown results do not leak as raw data',()=>{
  const projected=projectNativeDeviceProofs([
    {command_type:'computer.browser.canary',status:'queued',completed_at:null,result_json:'{malformed'},
    {command_type:'software.localai.verify',status:'failed',completed_at:completedAt,result_json:'{"secret":"api-key"}'}
  ],now);
  assert.equal(projected.browser.verified,false);
  assert.equal(projected.localAi.verified,false);
  assert.doesNotMatch(JSON.stringify(projected),/api-key|malformed/);
});
