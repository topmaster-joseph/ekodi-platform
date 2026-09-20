import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseAgentVersion,
  chooseLiveWindowsAgent,
  evaluateSelfUpdate,
  evaluateBrowserCanary,
} from '../scripts/verify-device-agent-production.mjs';

test('parses the canonical Device Agent version marker', () => {
  assert.equal(parseAgentVersion("$AgentVersion = '2.2.4'"), '2.2.4');
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
    agentVersion:'2.2.4',
    recentCommands:[{
      id:'cmd_update',
      status:'succeeded',
      completedAt:'2026-09-20T10:02:20Z',
      result:{ message:'EKODI Device Agent를 트랜잭션 방식으로 2.2.4 버전으로 업데이트했습니다. 명령 결과 전송 후 Agent를 안전 재시작합니다.' },
    }],
  };
  const passed = evaluateSelfUpdate({
    device,
    commandId:'cmd_update',
    issuedAt:'2026-09-20T10:02:00Z',
    expectedVersion:'2.2.4',
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.summary.restartedIntoCandidate, true);

  const oldProcess = evaluateSelfUpdate({
    device:{ ...device, agentVersion:'2.2.3' },
    commandId:'cmd_update',
    issuedAt:'2026-09-20T10:02:00Z',
    expectedVersion:'2.2.4',
  });
  assert.equal(oldProcess.done, false);
  assert.equal(oldProcess.reason, 'new_agent_not_running_yet');
});

test('background-browser canary requires isolated proof and stays fail-closed', () => {
  const command = {
    id:'cmd_canary',
    status:'succeeded',
    completedAt:'2026-09-20T10:04:00Z',
    result:{
      browserCanary:{
        ok:true,
        mode:'background-browser-canary',
        agentVersion:'2.2.4',
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
    agentVersion:'2.2.4',
    capabilities:{ backgroundBrowserCanary:true, backgroundBrowser:false },
    recentCommands:[command],
  };
  const passed = evaluateBrowserCanary({
    device,
    commandId:'cmd_canary',
    issuedAt:'2026-09-20T10:03:30Z',
    expectedVersion:'2.2.4',
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.summary.canaryProjected, true);
  assert.equal(passed.summary.browserExecutionStillFailClosed, true);

  const prematurelyEnabled = evaluateBrowserCanary({
    device:{ ...device, capabilities:{ backgroundBrowserCanary:true, backgroundBrowser:true } },
    commandId:'cmd_canary',
    issuedAt:'2026-09-20T10:03:30Z',
    expectedVersion:'2.2.4',
  });
  assert.equal(prematurelyEnabled.ok, false);
  assert.match(prematurelyEnabled.error, /before the full Browser Worker was verified/);

  const foregroundProof = evaluateBrowserCanary({
    device:{ ...device, recentCommands:[{ ...command, result:{ browserCanary:{ ...command.result.browserCanary, focusIsolated:false } } }] },
    commandId:'cmd_canary',
    issuedAt:'2026-09-20T10:03:30Z',
    expectedVersion:'2.2.4',
  });
  assert.equal(foregroundProof.ok, false);
  assert.match(foregroundProof.error, /non-disruptive proof contract/);
});
