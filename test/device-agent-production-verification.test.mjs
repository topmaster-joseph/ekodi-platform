import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseAgentVersion,
  chooseLiveWindowsAgent,
  evaluateSelfUpdate,
  evaluateBrowserCanary,
  evaluateBrowserWorker,
  evaluateDesktopProbe,
  evaluateDesktopCanary,
  evaluateDesktopGuestCanary,
  evaluateDesktopUiCanary,
} from '../scripts/verify-device-agent-production.mjs';

test('parses the canonical Device Agent version marker', () => {
  assert.equal(parseAgentVersion("$AgentVersion = '2.3.4'"), '2.3.4');
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
    agentVersion:'2.3.4',
    recentCommands:[{
      id:'cmd_update',
      status:'succeeded',
      completedAt:'2026-09-20T10:02:20Z',
      result:{ message:'EKODI Device Agent를 트랜잭션 방식으로 2.3.4 버전으로 업데이트했습니다. 명령 결과 전송 후 Agent를 안전 재시작합니다.' },
    }],
  };
  const passed = evaluateSelfUpdate({
    device,
    commandId:'cmd_update',
    issuedAt:'2026-09-20T10:02:00Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.summary.restartedIntoCandidate, true);

  const oldProcess = evaluateSelfUpdate({
    device:{ ...device, agentVersion:'2.3.3' },
    commandId:'cmd_update',
    issuedAt:'2026-09-20T10:02:00Z',
    expectedVersion:'2.3.4',
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
        agentVersion:'2.3.4',
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
    agentVersion:'2.3.4',
    capabilities:{ backgroundBrowserCanary:true, backgroundBrowser:true },
    recentCommands:[command],
  };
  const passed = evaluateBrowserCanary({
    device,
    commandId:'cmd_canary',
    issuedAt:'2026-09-20T10:03:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(passed.ok, true);
  assert.equal(passed.summary.canaryProjected, true);
  assert.equal(passed.summary.browserExecutionCapabilityProjected, true);

  const notProjected = evaluateBrowserCanary({
    device:{ ...device, capabilities:{ backgroundBrowserCanary:true, backgroundBrowser:false } },
    commandId:'cmd_canary',
    issuedAt:'2026-09-20T10:03:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(notProjected.done, false);
  assert.equal(notProjected.reason, 'browser_worker_capability_not_projected_yet');

  const foregroundProof = evaluateBrowserCanary({
    device:{ ...device, recentCommands:[{ ...command, result:{ browserCanary:{ ...command.result.browserCanary, focusIsolated:false } } }] },
    commandId:'cmd_canary',
    issuedAt:'2026-09-20T10:03:30Z',
    expectedVersion:'2.3.4',
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
    agentVersion:'2.3.4',
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
    agentVersion:'2.3.4',
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
    expectedVersion:'2.3.4',
  });
  assert.equal(passed.ok,true);
  assert.equal(passed.summary.nativeBrowserOperationServiceReady,true);
  assert.equal(passed.summary.proof.profileRemoved,true);

  const reused=evaluateBrowserWorker({
    device:{...device,recentCommands:[{...device.recentCommands[0],result:{browserWorker:{...proof,activeUserProfileReused:true}}}]},
    commandId:'cmd_worker',
    issuedAt:'2026-09-20T10:04:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(reused.ok,false);
  assert.match(reused.error,/isolated read-only execution proof contract/);
});


test('isolated desktop probe classifies the native backend gap without enabling execution', () => {
  const desktopProbe={
    ok:true,
    mode:'isolated-desktop-backend-probe',
    provider:'ekodi-native-remote-computer',
    routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001',
    backendPolicy:'EKODI-ISOLATED-DESKTOP-BACKEND-001',
    agentVersion:'2.3.4',
    virtualizationFirmwareEnabled:true,
    hyperVState:'Disabled',
    hyperVPowerShellAvailable:false,
    baseVmPresent:false,
    windowsSandboxState:'Disabled',
    windowsSandboxPresent:false,
    windowsSandboxForegroundOnly:true,
    windowsSandboxAcceptedForActivation:false,
    recommendedBackend:'none',
    headlessBackendReady:false,
    isolatedDesktopActivationReady:false,
    sharedInteractiveDesktop:false,
    userInputInjection:false,
    clipboardShared:false,
    credentialCollection:false,
    gapReason:'native-capability-not-production-ready',
    checkedAt:'2026-09-23T13:10:00Z',
  };
  const device={
    status:'online',
    lastSeenAt:'2026-09-23T13:10:30Z',
    agentVersion:'2.3.4',
    capabilities:{isolatedDesktopProbe:true,isolatedDesktop:false},
    recentCommands:[{
      id:'cmd_desktop_probe',
      status:'succeeded',
      completedAt:'2026-09-23T13:10:10Z',
      result:{desktopProbe},
    }],
  };
  const passed=evaluateDesktopProbe({
    device,
    commandId:'cmd_desktop_probe',
    issuedAt:'2026-09-23T13:09:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(passed.ok,true);
  assert.equal(passed.summary.probeProjected,true);
  assert.equal(passed.summary.isolatedDesktopExecutionStillFailClosed,true);
  assert.equal(passed.summary.proof.gapReason,'native-capability-not-production-ready');

  const prematurelyEnabled=evaluateDesktopProbe({
    device:{...device,capabilities:{isolatedDesktopProbe:true,isolatedDesktop:true}},
    commandId:'cmd_desktop_probe',
    issuedAt:'2026-09-23T13:09:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(prematurelyEnabled.ok,false);
  assert.match(prematurelyEnabled.error,/before verified headless backend execution proof/);
});


test('headless Hyper-V desktop canary proves ephemeral VM lifecycle but keeps execution gated', () => {
  const proof={
    ok:true,
    mode:'isolated-desktop-hyperv-canary',
    provider:'ekodi-native-remote-computer',
    routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001',
    backendPolicy:'EKODI-ISOLATED-DESKTOP-BACKEND-001',
    agentVersion:'2.3.4',
    backend:'hyper-v-ekodi-base',
    sessionType:'vm',
    baseVmGeneration:2,
    baseDiskPathSha256:'c'.repeat(64),
    headless:true,
    networkAttached:false,
    sharedInteractiveDesktop:false,
    clipboardShared:false,
    userInputInjection:false,
    credentialCollection:false,
    ephemeralDifferencingDisk:true,
    baseDiskWriteForbidden:true,
    secureBootRequested:true,
    vmReachedRunning:true,
    boundedStartWaitSeconds:30,
    sessionVmRemoved:true,
    sessionDiskRemoved:true,
    checkedAt:'2026-09-23T13:20:00Z',
  };
  const device={
    status:'online',
    lastSeenAt:'2026-09-23T13:20:30Z',
    agentVersion:'2.3.4',
    capabilities:{isolatedDesktopCanary:true,isolatedDesktop:false},
    recentCommands:[{
      id:'cmd_desktop_canary',
      status:'succeeded',
      completedAt:'2026-09-23T13:20:10Z',
      result:{desktopCanary:proof},
    }],
  };
  const passed=evaluateDesktopCanary({
    device,
    commandId:'cmd_desktop_canary',
    issuedAt:'2026-09-23T13:19:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(passed.ok,true);
  assert.equal(passed.summary.verified,true);
  assert.equal(passed.summary.isolatedDesktopExecutionStillFailClosed,true);
  assert.equal(passed.summary.proof.sessionVmRemoved,true);
  assert.equal(passed.summary.proof.sessionDiskRemoved,true);

  const prematurelyEnabled=evaluateDesktopCanary({
    device:{...device,capabilities:{isolatedDesktopCanary:true,isolatedDesktop:true}},
    commandId:'cmd_desktop_canary',
    issuedAt:'2026-09-23T13:19:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(prematurelyEnabled.ok,false);
  assert.match(prematurelyEnabled.error,/canary proof alone/);
});


test('isolated guest runtime canary proves credentialless offline execution and stays fail-closed', () => {
  const proof={
    ok:true,
    mode:'isolated-desktop-guest-runtime-canary',
    provider:'ekodi-native-remote-computer',
    routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001',
    backendPolicy:'EKODI-ISOLATED-DESKTOP-BACKEND-001',
    agentVersion:'2.3.4',
    guestAgentVersion:'1.1.0',
    backend:'hyper-v-ekodi-base',
    sessionType:'vm',
    taskType:'guest.runtime.probe',
    receiptSha256:'d'.repeat(64),
    executedAsSystem:true,
    guestSessionId:0,
    noNetworkAdapter:true,
    noActiveNetwork:true,
    interactiveDesktopUsed:false,
    sharedInteractiveDesktop:false,
    clipboardShared:false,
    userInputInjection:false,
    credentialCollection:false,
    hostProfileMounted:false,
    mutationScope:'ephemeral-guest-only',
    vmReachedRunning:true,
    heartbeatObserved:true,
    networkAttached:false,
    ephemeralDifferencingDisk:true,
    baseDiskWriteForbidden:true,
    sessionVmRemoved:true,
    sessionDiskRemoved:true,
    checkedAt:'2026-09-24T00:10:00Z',
  };
  const device={
    status:'online',
    lastSeenAt:'2026-09-24T00:10:30Z',
    agentVersion:'2.3.4',
    capabilities:{isolatedDesktopGuestCanary:true,isolatedDesktop:false},
    recentCommands:[{
      id:'cmd_guest_canary',
      status:'succeeded',
      completedAt:'2026-09-24T00:10:10Z',
      result:{desktopGuestCanary:proof},
    }],
  };
  const passed=evaluateDesktopGuestCanary({
    device,
    commandId:'cmd_guest_canary',
    issuedAt:'2026-09-24T00:09:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(passed.ok,true);
  assert.equal(passed.summary.verified,true);
  assert.equal(passed.summary.isolatedDesktopExecutionStillFailClosed,true);
  assert.equal(passed.summary.proof.noNetworkAdapter,true);
  assert.equal(passed.summary.proof.executedAsSystem,true);

  const interactiveLeak=evaluateDesktopGuestCanary({
    device:{...device,recentCommands:[{...device.recentCommands[0],result:{desktopGuestCanary:{...proof,interactiveDesktopUsed:true}}}]},
    commandId:'cmd_guest_canary',
    issuedAt:'2026-09-24T00:09:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(interactiveLeak.ok,false);
  assert.match(interactiveLeak.error,/credentialless offline task\/receipt proof contract/);

  const prematurelyEnabled=evaluateDesktopGuestCanary({
    device:{...device,capabilities:{isolatedDesktopGuestCanary:true,isolatedDesktop:true}},
    commandId:'cmd_guest_canary',
    issuedAt:'2026-09-24T00:09:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(prematurelyEnabled.ok,false);
  assert.match(prematurelyEnabled.error,/guest canary proof alone/);
});


test('isolated semantic UI canary proves guest-only UI automation and keeps general execution disabled', () => {
  const proof={
    ok:true,
    mode:'isolated-desktop-guest-ui-canary',
    provider:'ekodi-native-remote-computer',
    routingPolicy:'EKODI-VIRTUALIZATION-ROUTING-001',
    backendPolicy:'EKODI-ISOLATED-DESKTOP-BACKEND-001',
    agentVersion:'2.3.4',
    guestAgentVersion:'1.1.0',
    backend:'hyper-v-ekodi-base',
    sessionType:'vm',
    taskType:'guest.ui.probe',
    receiptSha256:'e'.repeat(64),
    executedAsSystem:true,
    noNetworkAdapter:true,
    noActiveNetwork:true,
    guestUiSurfaceUsed:true,
    hostInteractiveDesktopUsed:false,
    sharedInteractiveDesktop:false,
    semanticUiAutomation:true,
    lowLevelInputInjection:false,
    clipboardShared:false,
    credentialCollection:false,
    hostProfileMounted:false,
    syntheticUiOnly:true,
    windowHandleObserved:true,
    windowFound:true,
    buttonFound:true,
    invokePatternAvailable:true,
    controlInvoked:true,
    resultCode:'EKODI_UI_OK',
    windowClosed:true,
    mutationScope:'ephemeral-guest-ui-only',
    vmReachedRunning:true,
    heartbeatObserved:true,
    networkAttached:false,
    ephemeralDifferencingDisk:true,
    baseDiskWriteForbidden:true,
    sessionVmRemoved:true,
    sessionDiskRemoved:true,
    checkedAt:'2026-09-24T01:00:00Z',
  };
  const device={
    status:'online',
    lastSeenAt:'2026-09-24T01:00:30Z',
    agentVersion:'2.3.4',
    capabilities:{isolatedDesktopUiCanary:true,isolatedDesktop:false},
    recentCommands:[{
      id:'cmd_ui_canary',
      status:'succeeded',
      completedAt:'2026-09-24T01:00:10Z',
      result:{desktopUiCanary:proof},
    }],
  };
  const passed=evaluateDesktopUiCanary({
    device,
    commandId:'cmd_ui_canary',
    issuedAt:'2026-09-24T00:59:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(passed.ok,true);
  assert.equal(passed.summary.verified,true);
  assert.equal(passed.summary.generalDesktopExecutionStillFailClosed,true);
  assert.equal(passed.summary.proof.semanticUiAutomation,true);
  assert.equal(passed.summary.proof.hostInteractiveDesktopUsed,false);

  const lowLevelLeak=evaluateDesktopUiCanary({
    device:{...device,recentCommands:[{...device.recentCommands[0],result:{desktopUiCanary:{...proof,lowLevelInputInjection:true}}}]},
    commandId:'cmd_ui_canary',
    issuedAt:'2026-09-24T00:59:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(lowLevelLeak.ok,false);
  assert.match(lowLevelLeak.error,/semantic, networkless, host-independent UI proof contract/);

  const prematurelyEnabled=evaluateDesktopUiCanary({
    device:{...device,capabilities:{isolatedDesktopUiCanary:true,isolatedDesktop:true}},
    commandId:'cmd_ui_canary',
    issuedAt:'2026-09-24T00:59:30Z',
    expectedVersion:'2.3.4',
  });
  assert.equal(prematurelyEnabled.ok,false);
  assert.match(prematurelyEnabled.error,/General isolated desktop execution became active/);
});
