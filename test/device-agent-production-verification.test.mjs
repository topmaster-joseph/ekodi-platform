import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseAgentVersion,
  chooseLiveWindowsAgent,
  evaluateSelfUpdate,
  evaluateBrowserCanary,
  evaluateBrowserWorker,
} from '../scripts/verify-device-agent-production.mjs';

test('parses the canonical Device Agent version marker', () => {
  assert.equal(parseAgentVersion("$AgentVersion = '2.3.0'"), '2.3.0');
  assert.throws(() => parseAgentVersion('Write-Host missing'));
});

test('selects only the freshest online enrolled Windows PC', () => {
  const devices = [
    { id:'offline', status:'offline', platform:'windows', lastSeenAt:'2026-09-20T10:00:00Z', management:{ source:'agent', type:'pc' } },
    { id:'inventory', status:'inventory', platform:'inventory', lastSeenAt:null, management:{ source:'inventory', type:'pc' } },
    { id:'pos', status:'online', platform:'Windows 11', lastSeenAt:'2026-09-20T10:03:00Z', management:{ source:'agent', type:'pos' } },
    { id:'older', status:'online', platform:'windows', lastSeenAt:'2026-09-20T10:01:00Z', management:{ source:'agent', type:'pc' } },
    { id:'newer', status:'online', platform:'Windows 11', lastSeenAt:'2026-09-20T10:02:00Z', management:{ source:'agent', type:'pc' } },
  ];
  assert.equal(chooseLiveWindowsAgent(devices)?.id, 'newer');
});

test('self-update requires the new process version plus a fresh heartbeat', () => {
  const device = {
    status:'online',
    lastSeenAt:'2026-09-20T10:02:30Z',
    agentVersion:'2.3.0',
    recentCommands:[{
      id:'cmd_update',
      status:'succeeded',
      completedAt:'2026-09-20T10:02:20Z',
      result:{ message:'EKODI Device Agent를 트랜잭션 방식으로 2.3.0 버전으로 업데이트했습니다. 명령 결과 전송 후 Agent를 안전 재시작합니다.' },
    }],
  };
  const passed = evaluateSelfUpdate({
    device,
    commandId:'cmd_update',
    issuedAt:'2026-09-20T10:02:00Z',
    expectedVersion:'2.3.0',
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.summary.restartedIntoCandidate, true);

  const oldProcess = evaluateSelfUpdate({
    device:{ ...device, agentVersion:'2.2.4' },
    commandId:'cmd_update',
    issuedAt:'2026-09-20T10:02:00Z',
    expectedVersion:'2.3.0',
  });
  assert.equal(oldProcess.done, false);
  assert.equal(oldProcess.reason, 'new_agent_not_running_yet');
});

test('background-browser canary requires isolated proof and projects the gated worker capability', () => {
  const command = {
    id:'cmd_canary',
    status:'succeeded',
    completedAt:'2026-09-20T10:04:00Z',
    result:{
      browserCanary:{
        ok:true,
        mode:'background-browser-canary',
        agentVersion:'2.3.0',
        browser:'msedge.exe',
        url:'https://ekodi.kr/',
        contentBytes:1024,
        dedicatedAutomationProfile:true,
        offscreenOrHeadless:true,
        focusIsolated:true,
        clipboardShared:false,
        userInputInjection:false,
        checkedAt:'2026-09-20T10:03:58Z',
      },
    },
  };
  const device = {
    status:'online',
    lastSeenAt:'2026-09-20T10:04:30Z',
    agentVersion:'2.3.0',
    capabilities:{ backgroundBrowserCanary:true, backgroundBrowser:true },
    recentCommands:[command],
  };
  const passed = evaluateBrowserCanary({
    device,
    commandId:'cmd_canary',
    issuedAt:'2026-09-20T10:03:30Z',
    expectedVersion:'2.3.0',
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.summary.canaryProjected, true);
  assert.equal(passed.summary.browserExecutionCapabilityProjected, true);

  const notProjected = evaluateBrowserCanary({
    device:{ ...device, capabilities:{ backgroundBrowserCanary:true, backgroundBrowser:false } },
    commandId:'cmd_canary',
    issuedAt:'2026-09-20T10:03:30Z',
    expectedVersion:'2.3.0',
  });
  assert.equal(notProjected.done, false);
  assert.equal(notProjected.reason, 'browser_worker_capability_not_projected_yet');

  const foregroundProof = evaluateBrowserCanary({
    device:{ ...device, recentCommands:[{ ...command, result:{ browserCanary:{ ...command.result.browserCanary, focusIsolated:false } } }] },
    commandId:'cmd_canary',
    issuedAt:'2026-09-20T10:03:30Z',
    expectedVersion:'2.3.0',
  });
  assert.equal(foregroundProof.ok, false);
  assert.match(foregroundProof.error, /non-disruptive proof contract/);
});


test('native background-browser worker requires production-isolated read-only proof', () => {
  const proof={
    ok:true,
    mode:'background-browser-worker',
    virtualizationProvider:'ekodi-native-remote-computer',
    routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001',
    agentVersion:'2.3.0',
    browser:'msedge.exe',
    url:'https://ekodi.kr/',
    deviceProfile:'desktop',
    viewportWidth:1440,
    viewportHeight:900,
    contentBytes:4096,
    contentSha256:'a'.repeat(64),
    screenshotBytes:8192,
    screenshotSha256:'b'.repeat(64),
    dedicatedAutomationProfile:true,
    ephemeralProfile:true,
    profileRemoved:true,
    activeUserProfileReused:false,
    offscreenOrHeadless:true,
    focusIsolated:true,
    clipboardShared:false,
    userInputInjection:false,
    javascriptEnabled:false,
    mutationMode:'read-only-static-surface',
    checkedAt:'2026-09-20T10:05:00Z',
  };
  const device={
    status:'online',
    lastSeenAt:'2026-09-20T10:05:30Z',
    agentVersion:'2.3.0',
    capabilities:{backgroundBrowser:true},
    recentCommands:[{
      id:'cmd_worker',
      status:'succeeded',
      completedAt:'2026-09-20T10:05:10Z',
      result:{browserWorker:proof},
    }],
  };
  const passed=evaluateBrowserWorker({
    device,
    commandId:'cmd_worker',
    issuedAt:'2026-09-20T10:04:30Z',
    expectedVersion:'2.3.0',
  });
  assert.equal(passed.ok,true);
  assert.equal(passed.summary.nativeBrowserOperationServiceReady,true);
  assert.equal(passed.summary.proof.profileRemoved,true);

  const reused=evaluateBrowserWorker({
    device:{...device,recentCommands:[{...device.recentCommands[0],result:{browserWorker:{...proof,activeUserProfileReused:true}}}]},
    commandId:'cmd_worker',
    issuedAt:'2026-09-20T10:04:30Z',
    expectedVersion:'2.3.0',
  });
  assert.equal(reused.ok,false);
  assert.match(reused.error,/isolated read-only execution proof contract/);
});
