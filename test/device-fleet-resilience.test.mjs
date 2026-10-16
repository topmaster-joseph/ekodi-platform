import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyDevicePresence, deviceReconnectPlan, validateCloudCommandFence,
  DEVICE_FLEET_LIMITS} from '../device-fleet-resilience.js';

const now = Date.parse('2026-10-16T12:00:00Z');
const iso = (offset) => new Date(now + offset).toISOString();
const device = {id:'dev_sample',lastSeenAt:iso(-10_000),revokedAt:null,sessionEpoch:3};
const command = {id:'cmd_safe',deviceId:device.id,status:'queued',sessionEpoch:3,
  issuedAt:iso(-1_000),expiresAt:iso(30_000),authorized:true,capabilityAllowed:true,
  risk:'maintain',confirmed:true};

test('presence is based on cloud clock, never inference or cached proof',()=>{
  assert.equal(classifyDevicePresence(device,now),'online');
  assert.equal(classifyDevicePresence({...device,lastSeenAt:iso(-90_000)},now),'online');
  assert.equal(classifyDevicePresence({...device,lastSeenAt:iso(-90_001)},now),'stale');
  assert.equal(classifyDevicePresence({...device,lastSeenAt:iso(-600_001)},now),'offline');
  assert.equal(classifyDevicePresence({...device,lastSeenAt:iso(30_000)},now),'unknown');
  assert.equal(classifyDevicePresence({...device,lastSeenAt:'invalid'},now),'unknown');
  assert.equal(classifyDevicePresence({...device,lastSeenAt:null},now),'enrolled');
  assert.equal(classifyDevicePresence({...device,revokedAt:iso(-100)},now),'revoked');
  assert.equal(classifyDevicePresence(null,now),'unknown');
  assert.equal(DEVICE_FLEET_LIMITS.onlineMs,90_000);
});

test('auth, revoked and unknown errors fail closed without polling',()=>{
  for(const failure of ['unauthorized','forbidden','revoked','policy_denied','invalid_enrollment','other']){
    const result=deviceReconnectPlan({failure,attempts:2});
    assert.equal(result.retry,false);
    assert.equal(result.delayMs,null);
  }
});

test('network retries use bounded exponential backoff, jitter, and rate-limit floor',()=>{
  assert.deepEqual(deviceReconnectPlan({failure:'network',attempts:0,entropy:0.5}),
    {retry:true,delayMs:2000,reason:'bounded_cloud_reconnect'});
  assert.equal(deviceReconnectPlan({failure:'timeout',attempts:3,entropy:0.5}).delayMs,16_000);
  assert.equal(deviceReconnectPlan({failure:'network',attempts:999,entropy:0.5}).delayMs,120_000);
  assert.equal(deviceReconnectPlan({failure:'network',attempts:999,entropy:1}).delayMs,120_000);
  assert.equal(deviceReconnectPlan({failure:'network',attempts:-5,entropy:0.5}).delayMs,2000);
  assert.equal(deviceReconnectPlan({failure:'rate_limited',attempts:0,entropy:0}).delayMs,30_000);
  assert.equal(deviceReconnectPlan({failure:'network',attempts:1,entropy:1}).delayMs,4_800);
});

test('command fence validates one live device and the exact issuance epoch',()=>{
  assert.deepEqual(validateCloudCommandFence({device,command,now}),
    {allowed:true,reason:'bounded_command_valid'});
  const variants=[
    [{...device,revokedAt:iso(-100)},command],
    [{...device,lastSeenAt:iso(-600_001)},command],
    [device,{...command,deviceId:'dev_other'}],
    [device,{...command,status:'claimed'}],
    [device,{...command,sessionEpoch:2}],
    [{...device,sessionEpoch:4},command],
    [device,{...command,expiresAt:iso(-1)}],
    [device,{...command,issuedAt:iso(120_000)}],
    [device,{...command,expiresAt:iso(1_000_000)}],
    [device,{...command,authorized:false}],
    [device,{...command,capabilityAllowed:false}],
    [device,{...command,risk:'maintain',confirmed:false}],
    [device,{...command,risk:'unbounded_shell'}]
  ];
  for(const [d,c] of variants)assert.equal(validateCloudCommandFence({device:d,command:c,now}).allowed,false);
});

test('an observe-only command does not acquire maintain-level authority',()=>{
  const observed={...command,risk:'observe',confirmed:false};
  assert.equal(validateCloudCommandFence({device,command:observed,now}).allowed,true);
  assert.equal(validateCloudCommandFence({device,command:{...observed,authorized:false},now}).allowed,false);
  assert.equal(validateCloudCommandFence({device,command:{...command,expiresAt:null},now}).allowed,false);
  assert.equal(validateCloudCommandFence({device:{...device,sessionEpoch:null},command,now}).allowed,false);
});
