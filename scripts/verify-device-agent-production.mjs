import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const API_BASE = 'https://ekodi.kr';
const DEVICES_PATH = '/api/control/devices';
const SELF_UPDATE = 'agent.self_update';
const BROWSER_CANARY = 'computer.browser.canary';
const BROWSER_EXECUTE = 'computer.browser.execute';
const DESKTOP_PROBE = 'computer.desktop.probe';
const DESKTOP_CANARY = 'computer.desktop.canary';
const DESKTOP_GUEST_CANARY = 'computer.desktop.guest.canary';
const DESKTOP_UI_CANARY = 'computer.desktop.ui.canary';
const DESKTOP_SESSION_CANARY = 'computer.desktop.session.canary';
const DESKTOP_SESSION_EXECUTE = 'computer.desktop.session.execute';
const DEFAULT_TARGET_WAIT_MS = 120_000;
const DEFAULT_COMMAND_WAIT_MS = 240_000;
const DEFAULT_POLL_MS = 5_000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const time = value => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const sha256 = value => createHash('sha256').update(String(value || ''),'utf8').digest('hex');

export function parseAgentVersion(source) {
  const match = String(source || '').match(/\$AgentVersion\s*=\s*'([^']+)'/);
  if (!match) throw new Error('Device Agent source version marker is missing.');
  return match[1];
}

export function isEligibleLiveWindowsAgent(device) {
  return Boolean(
    device &&
    device.revokedAt == null &&
    device.status === 'online' &&
    device.management?.source === 'agent' &&
    device.management?.type === 'pc' &&
    /win/i.test(String(device.platform || '')) &&
    time(device.lastSeenAt) > 0
  );
}

export function chooseLiveWindowsAgent(devices = []) {
  return [...devices]
    .filter(isEligibleLiveWindowsAgent)
    .sort((a, b) => time(b.lastSeenAt) - time(a.lastSeenAt))[0] || null;
}

function commandFor(device, commandId) {
  return (device?.recentCommands || []).find(item => item.id === commandId) || null;
}

export function evaluateSelfUpdate({ device, commandId, issuedAt, expectedVersion }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command = commandFor(device, commandId);
  if (!command) return { done:false, reason:'command_not_visible' };
  if (['failed','cancelled'].includes(command.status)) {
    return { done:true, ok:false, error:`Device Agent self-update failed: ${String(command.result?.message || command.status).slice(0, 500)}` };
  }
  if (command.status !== 'succeeded') return { done:false, reason:command.status || 'pending' };
  const message = String(command.result?.message || '');
  if (!message.includes(expectedVersion) || !message.includes('트랜잭션')) {
    return { done:true, ok:false, error:`Self-update result did not prove transactional promotion to ${expectedVersion}.` };
  }
  if (device.status !== 'online') return { done:false, reason:'device_not_online_yet' };
  if (String(device.agentVersion || '') !== expectedVersion) return { done:false, reason:'new_agent_not_running_yet' };
  if (time(device.lastSeenAt) < time(issuedAt)) return { done:false, reason:'heartbeat_not_fresh_yet' };
  return {
    done:true, ok:true,
    summary:{
      expectedVersion,
      reportedAgentVersion:String(device.agentVersion || ''),
      status:device.status,
      lastSeenAt:device.lastSeenAt,
      commandCompletedAt:command.completedAt || null,
      heartbeatAfterIssue:true,
      transactionalResult:true,
      restartedIntoCandidate:true,
    },
  };
}

export function evaluateBrowserCanary({ device, commandId, issuedAt, expectedVersion }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command = commandFor(device, commandId);
  if (!command) return { done:false, reason:'command_not_visible' };
  if (['failed','cancelled'].includes(command.status)) {
    return { done:true, ok:false, error:`Background Browser canary failed: ${String(command.result?.message || command.status).slice(0, 500)}` };
  }
  if (command.status !== 'succeeded') return { done:false, reason:command.status || 'pending' };

  const proof = command.result?.browserCanary || {};
  const proofOk = (
    proof.ok === true &&
    proof.mode === 'background-browser-canary' &&
    String(proof.agentVersion || '') === expectedVersion &&
    proof.dedicatedAutomationProfile === true &&
    proof.offscreenOrHeadless === true &&
    proof.focusIsolated === true &&
    proof.clipboardShared === false &&
    proof.userInputInjection === false &&
    String(proof.url || '') === 'https://ekodi.kr/'
  );
  if (!proofOk) return { done:true, ok:false, error:'Browser canary result did not satisfy the non-disruptive proof contract.' };
  if (device.status !== 'online') return { done:false, reason:'device_not_online_yet' };
  if (String(device.agentVersion || '') !== expectedVersion) return { done:false, reason:'agent_version_drift' };
  if (device.capabilities?.backgroundBrowserCanary !== true) return { done:false, reason:'canary_heartbeat_not_projected_yet' };
  if (device.capabilities?.backgroundBrowser !== true) return { done:false, reason:'browser_worker_capability_not_projected_yet' };
  if (time(device.lastSeenAt) < Math.max(time(issuedAt), time(command.completedAt))) {
    return { done:false, reason:'post_canary_heartbeat_not_fresh_yet' };
  }

  return {
    done:true, ok:true,
    summary:{
      expectedVersion,
      status:device.status,
      lastSeenAt:device.lastSeenAt,
      commandCompletedAt:command.completedAt || null,
      canaryProjected:true,
      browserExecutionCapabilityProjected:true,
      browserExecutionStillFailClosed:false,
      proof:{
        browser:String(proof.browser || ''),
        contentBytes:Number(proof.contentBytes || 0),
        dedicatedAutomationProfile:true,
        offscreenOrHeadless:true,
        focusIsolated:true,
        clipboardShared:false,
        userInputInjection:false,
        checkedAt:proof.checkedAt || null,
      },
    },
  };
}

export function evaluateBrowserWorker({ device, commandId, issuedAt, expectedVersion }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command = commandFor(device, commandId);
  if (!command) return { done:false, reason:'command_not_visible' };
  if (['failed','cancelled'].includes(command.status)) {
    return { done:true, ok:false, error:`Native Background Browser Worker failed: ${String(command.result?.message || command.status).slice(0, 500)}` };
  }
  if (command.status !== 'succeeded') return { done:false, reason:command.status || 'pending' };

  const proof = command.result?.browserWorker || {};
  const hashOk = value => /^[a-f0-9]{64}$/.test(String(value || ''));
  const proofOk = (
    proof.ok === true &&
    proof.mode === 'background-browser-worker' &&
    proof.virtualizationProvider === 'ekodi-native-remote-computer' &&
    proof.routingPolicy === 'EKODI-VIRTUALIZATION-ROUTING-001' &&
    String(proof.agentVersion || '') === expectedVersion &&
    String(proof.url || '') === 'https://ekodi.kr/' &&
    proof.deviceProfile === 'desktop' &&
    Number(proof.viewportWidth) === 1440 &&
    Number(proof.viewportHeight) === 900 &&
    Number(proof.contentBytes) > 0 &&
    Number(proof.screenshotBytes) > 0 &&
    hashOk(proof.contentSha256) &&
    hashOk(proof.screenshotSha256) &&
    proof.dedicatedAutomationProfile === true &&
    proof.ephemeralProfile === true &&
    proof.profileRemoved === true &&
    proof.activeUserProfileReused === false &&
    proof.offscreenOrHeadless === true &&
    proof.focusIsolated === true &&
    proof.clipboardShared === false &&
    proof.userInputInjection === false &&
    proof.javascriptEnabled === false &&
    proof.mutationMode === 'read-only-static-surface'
  );
  if (!proofOk) return { done:true, ok:false, error:'Native Browser Worker result did not satisfy the isolated read-only execution proof contract.' };
  if (device.status !== 'online') return { done:false, reason:'device_not_online_yet' };
  if (String(device.agentVersion || '') !== expectedVersion) return { done:false, reason:'agent_version_drift' };
  if (device.capabilities?.backgroundBrowser !== true) return { done:false, reason:'browser_worker_capability_not_projected' };
  if (time(device.lastSeenAt) < Math.max(time(issuedAt), time(command.completedAt))) {
    return { done:false, reason:'post_worker_heartbeat_not_fresh_yet' };
  }

  return {
    done:true, ok:true,
    summary:{
      expectedVersion,
      status:device.status,
      lastSeenAt:device.lastSeenAt,
      commandCompletedAt:command.completedAt || null,
      nativeBrowserOperationServiceReady:true,
      proof:{
        virtualizationProvider:proof.virtualizationProvider,
        routingPolicy:proof.routingPolicy,
        browser:String(proof.browser || ''),
        contentBytes:Number(proof.contentBytes || 0),
        contentSha256:String(proof.contentSha256 || ''),
        screenshotBytes:Number(proof.screenshotBytes || 0),
        screenshotSha256:String(proof.screenshotSha256 || ''),
        deviceProfile:proof.deviceProfile,
        viewportWidth:Number(proof.viewportWidth || 0),
        viewportHeight:Number(proof.viewportHeight || 0),
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
        checkedAt:proof.checkedAt || null,
      },
    },
  };
}

export function evaluateDesktopProbe({ device, commandId, issuedAt, expectedVersion }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command = commandFor(device, commandId);
  if (!command) return { done:false, reason:'command_not_visible' };
  if (['failed','cancelled'].includes(command.status)) {
    return { done:true, ok:false, error:`Native isolated desktop probe failed: ${String(command.result?.message || command.status).slice(0, 500)}` };
  }
  if (command.status !== 'succeeded') return { done:false, reason:command.status || 'pending' };

  const proof = command.result?.desktopProbe || {};
  const allowedGap = new Set([
    '',
    'native-capability-unavailable',
    'native-capability-not-production-ready',
    'required-capability-not-yet-implemented',
    'native-capacity-or-runtime-failure',
  ]);
  const proofOk = (
    proof.ok === true &&
    proof.mode === 'isolated-desktop-backend-probe' &&
    proof.provider === 'ekodi-native-remote-computer' &&
    proof.routingPolicy === 'EKODI-VIRTUALIZATION-ROUTING-001' &&
    proof.backendPolicy === 'EKODI-ISOLATED-DESKTOP-BACKEND-001' &&
    String(proof.agentVersion || '') === expectedVersion &&
    proof.windowsSandboxAcceptedForActivation === false &&
    proof.sharedInteractiveDesktop === false &&
    proof.userInputInjection === false &&
    proof.clipboardShared === false &&
    proof.credentialCollection === false &&
    allowedGap.has(String(proof.gapReason || ''))
  );
  if (!proofOk) return { done:true, ok:false, error:'Isolated desktop probe did not satisfy the native non-disruptive backend contract.' };
  if (proof.headlessBackendReady === true && proof.recommendedBackend !== 'hyper-v-ekodi-base') {
    return { done:true, ok:false, error:'Ready isolated desktop backend did not resolve to the EKODI Hyper-V base.' };
  }
  if (device.status !== 'online') return { done:false, reason:'device_not_online_yet' };
  if (String(device.agentVersion || '') !== expectedVersion) return { done:false, reason:'agent_version_drift' };
  if (device.capabilities?.isolatedDesktopProbe !== true) return { done:false, reason:'desktop_probe_capability_not_projected' };
  if (device.capabilities?.isolatedDesktop === true) {
    return { done:true, ok:false, error:'Isolated desktop execution became active before verified headless backend execution proof.' };
  }
  if (time(device.lastSeenAt) < Math.max(time(issuedAt), time(command.completedAt))) {
    return { done:false, reason:'post_desktop_probe_heartbeat_not_fresh_yet' };
  }

  return {
    done:true, ok:true,
    summary:{
      expectedVersion,
      status:device.status,
      lastSeenAt:device.lastSeenAt,
      commandCompletedAt:command.completedAt || null,
      probeProjected:true,
      isolatedDesktopExecutionStillFailClosed:true,
      proof:{
        virtualizationFirmwareEnabled:proof.virtualizationFirmwareEnabled === true,
        hyperVState:String(proof.hyperVState || ''),
        hyperVPowerShellAvailable:proof.hyperVPowerShellAvailable === true,
        baseVmPresent:proof.baseVmPresent === true,
        windowsSandboxState:String(proof.windowsSandboxState || ''),
        windowsSandboxPresent:proof.windowsSandboxPresent === true,
        windowsSandboxForegroundOnly:true,
        windowsSandboxAcceptedForActivation:false,
        recommendedBackend:String(proof.recommendedBackend || ''),
        headlessBackendReady:proof.headlessBackendReady === true,
        isolatedDesktopActivationReady:proof.isolatedDesktopActivationReady === true,
        gapReason:String(proof.gapReason || ''),
        sharedInteractiveDesktop:false,
        userInputInjection:false,
        clipboardShared:false,
        credentialCollection:false,
        checkedAt:proof.checkedAt || null,
      },
    },
  };
}

export function evaluateDesktopCanary({ device, commandId, issuedAt, expectedVersion }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command = commandFor(device, commandId);
  if (!command) return { done:false, reason:'command_not_visible' };
  if (['failed','cancelled'].includes(command.status)) {
    return { done:true, ok:false, error:`Native isolated desktop canary failed: ${String(command.result?.message || command.status).slice(0, 500)}` };
  }
  if (command.status !== 'succeeded') return { done:false, reason:command.status || 'pending' };

  const proof = command.result?.desktopCanary || {};
  const hashOk = value => /^[a-f0-9]{64}$/.test(String(value || ''));
  const proofOk = (
    proof.ok === true &&
    proof.mode === 'isolated-desktop-hyperv-canary' &&
    proof.provider === 'ekodi-native-remote-computer' &&
    proof.routingPolicy === 'EKODI-VIRTUALIZATION-ROUTING-001' &&
    proof.backendPolicy === 'EKODI-ISOLATED-DESKTOP-BACKEND-001' &&
    String(proof.agentVersion || '') === expectedVersion &&
    proof.backend === 'hyper-v-ekodi-base' &&
    proof.sessionType === 'vm' &&
    hashOk(proof.baseDiskPathSha256) &&
    proof.headless === true &&
    proof.networkAttached === false &&
    proof.sharedInteractiveDesktop === false &&
    proof.clipboardShared === false &&
    proof.userInputInjection === false &&
    proof.credentialCollection === false &&
    proof.ephemeralDifferencingDisk === true &&
    proof.baseDiskWriteForbidden === true &&
    proof.vmReachedRunning === true &&
    Number(proof.boundedStartWaitSeconds) === 30 &&
    proof.sessionVmRemoved === true &&
    proof.sessionDiskRemoved === true
  );
  if (!proofOk) return { done:true, ok:false, error:'Isolated desktop canary did not satisfy the headless ephemeral Hyper-V proof contract.' };
  if (device.status !== 'online') return { done:false, reason:'device_not_online_yet' };
  if (String(device.agentVersion || '') !== expectedVersion) return { done:false, reason:'agent_version_drift' };
  if (device.capabilities?.isolatedDesktopCanary !== true) return { done:false, reason:'desktop_canary_capability_not_projected' };
  if (device.capabilities?.isolatedDesktop === true) {
    return { done:true, ok:false, error:'Isolated desktop execution became active from canary proof alone; guest execution proof is still required.' };
  }
  if (time(device.lastSeenAt) < Math.max(time(issuedAt), time(command.completedAt))) {
    return { done:false, reason:'post_desktop_canary_heartbeat_not_fresh_yet' };
  }

  return {
    done:true, ok:true,
    summary:{
      expectedVersion,
      status:device.status,
      lastSeenAt:device.lastSeenAt,
      commandCompletedAt:command.completedAt || null,
      verified:true,
      isolatedDesktopExecutionStillFailClosed:true,
      proof:{
        backend:proof.backend,
        sessionType:proof.sessionType,
        baseVmGeneration:Number(proof.baseVmGeneration || 0),
        baseDiskPathSha256:String(proof.baseDiskPathSha256 || ''),
        headless:true,
        networkAttached:false,
        sharedInteractiveDesktop:false,
        clipboardShared:false,
        userInputInjection:false,
        credentialCollection:false,
        ephemeralDifferencingDisk:true,
        baseDiskWriteForbidden:true,
        secureBootRequested:proof.secureBootRequested === true,
        vmReachedRunning:true,
        boundedStartWaitSeconds:30,
        sessionVmRemoved:true,
        sessionDiskRemoved:true,
        checkedAt:proof.checkedAt || null,
      },
    },
  };
}

export function evaluateDesktopGuestCanary({ device, commandId, issuedAt, expectedVersion }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command = commandFor(device, commandId);
  if (!command) return { done:false, reason:'command_not_visible' };
  if (['failed','cancelled'].includes(command.status)) {
    return { done:true, ok:false, error:`Native isolated guest canary failed: ${String(command.result?.message || command.status).slice(0, 500)}` };
  }
  if (command.status !== 'succeeded') return { done:false, reason:command.status || 'pending' };

  const proof = command.result?.desktopGuestCanary || {};
  const hashOk = value => /^[a-f0-9]{64}$/.test(String(value || ''));
  const proofOk = (
    proof.ok === true &&
    proof.mode === 'isolated-desktop-guest-runtime-canary' &&
    proof.provider === 'ekodi-native-remote-computer' &&
    proof.routingPolicy === 'EKODI-VIRTUALIZATION-ROUTING-001' &&
    proof.backendPolicy === 'EKODI-ISOLATED-DESKTOP-BACKEND-001' &&
    String(proof.agentVersion || '') === expectedVersion &&
    String(proof.guestAgentVersion || '') === '1.1.0' &&
    proof.backend === 'hyper-v-ekodi-base' &&
    proof.sessionType === 'vm' &&
    proof.taskType === 'guest.runtime.probe' &&
    hashOk(proof.receiptSha256) &&
    proof.executedAsSystem === true &&
    proof.noNetworkAdapter === true &&
    proof.noActiveNetwork === true &&
    proof.interactiveDesktopUsed === false &&
    proof.sharedInteractiveDesktop === false &&
    proof.clipboardShared === false &&
    proof.userInputInjection === false &&
    proof.credentialCollection === false &&
    proof.hostProfileMounted === false &&
    proof.mutationScope === 'ephemeral-guest-only' &&
    proof.vmReachedRunning === true &&
    proof.heartbeatObserved === true &&
    proof.networkAttached === false &&
    proof.ephemeralDifferencingDisk === true &&
    proof.baseDiskWriteForbidden === true &&
    proof.sessionVmRemoved === true &&
    proof.sessionDiskRemoved === true
  );
  if (!proofOk) return { done:true, ok:false, error:'Isolated guest canary did not satisfy the credentialless offline task/receipt proof contract.' };
  if (device.status !== 'online') return { done:false, reason:'device_not_online_yet' };
  if (String(device.agentVersion || '') !== expectedVersion) return { done:false, reason:'agent_version_drift' };
  if (device.capabilities?.isolatedDesktopGuestCanary !== true) return { done:false, reason:'desktop_guest_canary_capability_not_projected' };
  if (device.capabilities?.isolatedDesktop === true) {
    return { done:true, ok:false, error:'Isolated desktop execution became active from guest canary proof alone; interactive guest execution proof is still required.' };
  }
  if (time(device.lastSeenAt) < Math.max(time(issuedAt), time(command.completedAt))) {
    return { done:false, reason:'post_desktop_guest_canary_heartbeat_not_fresh_yet' };
  }

  return {
    done:true, ok:true,
    summary:{
      expectedVersion,
      status:device.status,
      lastSeenAt:device.lastSeenAt,
      commandCompletedAt:command.completedAt || null,
      verified:true,
      isolatedDesktopExecutionStillFailClosed:true,
      proof:{
        guestAgentVersion:String(proof.guestAgentVersion || ''),
        taskType:String(proof.taskType || ''),
        receiptSha256:String(proof.receiptSha256 || ''),
        executedAsSystem:true,
        guestSessionId:Number(proof.guestSessionId || 0),
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
        checkedAt:proof.checkedAt || null,
      },
    },
  };
}

export function evaluateDesktopUiCanary({ device, commandId, issuedAt, expectedVersion }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command = commandFor(device, commandId);
  if (!command) return { done:false, reason:'command_not_visible' };
  if (['failed','cancelled'].includes(command.status)) {
    return { done:true, ok:false, error:`Native isolated UI canary failed: ${String(command.result?.message || command.status).slice(0, 500)}` };
  }
  if (command.status !== 'succeeded') return { done:false, reason:command.status || 'pending' };

  const proof = command.result?.desktopUiCanary || {};
  const hashOk = value => /^[a-f0-9]{64}$/.test(String(value || ''));
  const proofOk = (
    proof.ok === true &&
    proof.mode === 'isolated-desktop-guest-ui-canary' &&
    proof.provider === 'ekodi-native-remote-computer' &&
    proof.routingPolicy === 'EKODI-VIRTUALIZATION-ROUTING-001' &&
    proof.backendPolicy === 'EKODI-ISOLATED-DESKTOP-BACKEND-001' &&
    String(proof.agentVersion || '') === expectedVersion &&
    String(proof.guestAgentVersion || '') === '1.1.0' &&
    proof.backend === 'hyper-v-ekodi-base' &&
    proof.sessionType === 'vm' &&
    proof.taskType === 'guest.ui.probe' &&
    hashOk(proof.receiptSha256) &&
    proof.executedAsSystem === true &&
    proof.noNetworkAdapter === true &&
    proof.noActiveNetwork === true &&
    proof.guestUiSurfaceUsed === true &&
    proof.hostInteractiveDesktopUsed === false &&
    proof.sharedInteractiveDesktop === false &&
    proof.semanticUiAutomation === true &&
    proof.lowLevelInputInjection === false &&
    proof.clipboardShared === false &&
    proof.credentialCollection === false &&
    proof.hostProfileMounted === false &&
    proof.syntheticUiOnly === true &&
    proof.windowHandleObserved === true &&
    proof.windowFound === true &&
    proof.buttonFound === true &&
    proof.invokePatternAvailable === true &&
    proof.controlInvoked === true &&
    proof.resultCode === 'EKODI_UI_OK' &&
    proof.windowClosed === true &&
    proof.mutationScope === 'ephemeral-guest-ui-only' &&
    proof.vmReachedRunning === true &&
    proof.heartbeatObserved === true &&
    proof.networkAttached === false &&
    proof.ephemeralDifferencingDisk === true &&
    proof.baseDiskWriteForbidden === true &&
    proof.sessionVmRemoved === true &&
    proof.sessionDiskRemoved === true
  );
  if (!proofOk) return { done:true, ok:false, error:'Isolated UI canary did not satisfy the semantic, networkless, host-independent UI proof contract.' };
  if (device.status !== 'online') return { done:false, reason:'device_not_online_yet' };
  if (String(device.agentVersion || '') !== expectedVersion) return { done:false, reason:'agent_version_drift' };
  if (device.capabilities?.isolatedDesktopUiCanary !== true) return { done:false, reason:'desktop_ui_canary_capability_not_projected' };
  if (device.capabilities?.isolatedDesktop === true) {
    return { done:true, ok:false, error:'General isolated desktop execution became active from UI canary proof alone.' };
  }
  if (time(device.lastSeenAt) < Math.max(time(issuedAt), time(command.completedAt))) {
    return { done:false, reason:'post_desktop_ui_canary_heartbeat_not_fresh_yet' };
  }

  return {
    done:true, ok:true,
    summary:{
      expectedVersion,
      status:device.status,
      lastSeenAt:device.lastSeenAt,
      commandCompletedAt:command.completedAt || null,
      verified:true,
      generalDesktopExecutionStillFailClosed:true,
      proof:{
        guestAgentVersion:String(proof.guestAgentVersion || ''),
        taskType:String(proof.taskType || ''),
        receiptSha256:String(proof.receiptSha256 || ''),
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
        checkedAt:proof.checkedAt || null,
      },
    },
  };
}

export function evaluateDesktopSessionCanary({ device, commandId, issuedAt, expectedVersion }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command = commandFor(device, commandId);
  if (!command) return { done:false, reason:'command_not_visible' };
  if (['failed','cancelled'].includes(command.status)) {
    return { done:true, ok:false, error:`Native bounded session canary failed: ${String(command.result?.message || command.status).slice(0,500)}` };
  }
  if (command.status !== 'succeeded') return { done:false, reason:command.status || 'pending' };

  const proof=command.result?.desktopSessionCanary||{};
  const hashOk=value=>/^[a-f0-9]{64}$/.test(String(value||''));
  const proofOk=(
    proof.ok===true &&
    proof.mode==='isolated-desktop-session-canary' &&
    proof.provider==='ekodi-native-remote-computer' &&
    proof.routingPolicy==='EKODI-VIRTUALIZATION-ROUTING-001' &&
    proof.backendPolicy==='EKODI-ISOLATED-DESKTOP-BACKEND-001' &&
    String(proof.agentVersion||'')===expectedVersion &&
    String(proof.guestAgentVersion||'')==='1.2.0' &&
    proof.executorVersion==='bounded-v1' &&
    proof.backend==='hyper-v-ekodi-base' &&
    proof.sessionType==='vm' &&
    proof.taskType==='guest.session.execute' &&
    proof.operation==='ui.text.roundtrip' &&
    hashOk(proof.receiptSha256) &&
    hashOk(proof.inputSha256) &&
    proof.inputSha256===proof.outputSha256 &&
    Number(proof.textLength)>0 &&
    proof.executedAsSystem===true &&
    proof.noNetworkAdapter===true &&
    proof.noActiveNetwork===true &&
    proof.hostInteractiveDesktopUsed===false &&
    proof.sharedInteractiveDesktop===false &&
    proof.semanticUiAutomation===true &&
    proof.lowLevelInputInjection===false &&
    proof.clipboardShared===false &&
    proof.credentialCollection===false &&
    proof.hostProfileMounted===false &&
    proof.valuePatternAvailable===true &&
    proof.invokePatternAvailable===true &&
    proof.valueSet===true &&
    proof.controlInvoked===true &&
    proof.roundTripMatched===true &&
    proof.resultCode==='EKODI_SESSION_OK' &&
    proof.windowClosed===true &&
    proof.mutationScope==='ephemeral-guest-session-only' &&
    proof.vmReachedRunning===true &&
    proof.heartbeatObserved===true &&
    proof.networkAttached===false &&
    proof.ephemeralDifferencingDisk===true &&
    proof.baseDiskWriteForbidden===true &&
    proof.sessionVmRemoved===true &&
    proof.sessionDiskRemoved===true
  );
  if(!proofOk) return {done:true,ok:false,error:'Bounded isolated session canary did not satisfy the semantic round-trip proof contract.'};
  if(device.status!=='online') return {done:false,reason:'device_not_online_yet'};
  if(String(device.agentVersion||'')!==expectedVersion) return {done:false,reason:'agent_version_drift'};
  if(device.capabilities?.isolatedDesktopSessionCanary!==true) return {done:false,reason:'session_canary_capability_not_projected'};
  if(device.capabilities?.isolatedDesktop!==true) return {done:false,reason:'bounded_isolated_desktop_capability_not_projected'};
  if(time(device.lastSeenAt)<Math.max(time(issuedAt),time(command.completedAt))) return {done:false,reason:'post_session_canary_heartbeat_not_fresh_yet'};

  return {done:true,ok:true,summary:{
    expectedVersion,status:device.status,lastSeenAt:device.lastSeenAt,commandCompletedAt:command.completedAt||null,
    verified:true,boundedIsolatedDesktopCapabilityProjected:true,
    proof:{
      executorVersion:'bounded-v1',operation:'ui.text.roundtrip',receiptSha256:String(proof.receiptSha256||''),
      inputSha256:String(proof.inputSha256||''),outputSha256:String(proof.outputSha256||''),textLength:Number(proof.textLength||0),
      executedAsSystem:true,noNetworkAdapter:true,noActiveNetwork:true,hostInteractiveDesktopUsed:false,sharedInteractiveDesktop:false,
      semanticUiAutomation:true,lowLevelInputInjection:false,clipboardShared:false,credentialCollection:false,hostProfileMounted:false,
      valuePatternAvailable:true,invokePatternAvailable:true,valueSet:true,controlInvoked:true,roundTripMatched:true,resultCode:'EKODI_SESSION_OK',
      windowClosed:true,mutationScope:'ephemeral-guest-session-only',vmReachedRunning:true,heartbeatObserved:true,networkAttached:false,
      ephemeralDifferencingDisk:true,baseDiskWriteForbidden:true,sessionVmRemoved:true,sessionDiskRemoved:true,checkedAt:proof.checkedAt||null
    }
  }};
}

export function evaluateDesktopSessionExecute({ device, commandId, issuedAt, expectedVersion, expectedText }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command=commandFor(device,commandId);
  if(!command) return {done:false,reason:'command_not_visible'};
  if(['failed','cancelled'].includes(command.status)){
    return {done:true,ok:false,error:`Native bounded session execution failed: ${String(command.result?.message||command.status).slice(0,500)}`};
  }
  if(command.status!=='succeeded') return {done:false,reason:command.status||'pending'};

  const proof=command.result?.desktopSession||{};
  const expectedHash=sha256(expectedText);
  const hashOk=value=>/^[a-f0-9]{64}$/.test(String(value||''));
  const proofOk=(
    proof.ok===true &&
    proof.mode==='isolated-desktop-session-execution' &&
    proof.provider==='ekodi-native-remote-computer' &&
    proof.routingPolicy==='EKODI-VIRTUALIZATION-ROUTING-001' &&
    proof.backendPolicy==='EKODI-ISOLATED-DESKTOP-BACKEND-001' &&
    String(proof.agentVersion||'')===expectedVersion &&
    String(proof.guestAgentVersion||'')==='1.2.0' &&
    proof.executorVersion==='bounded-v1' &&
    proof.backend==='hyper-v-ekodi-base' &&
    proof.sessionType==='vm' &&
    proof.taskType==='guest.session.execute' &&
    proof.operation==='ui.text.roundtrip' &&
    hashOk(proof.receiptSha256) &&
    proof.inputSha256===expectedHash &&
    proof.outputSha256===expectedHash &&
    Number(proof.textLength)===String(expectedText).length &&
    proof.executedAsSystem===true &&
    proof.noNetworkAdapter===true &&
    proof.noActiveNetwork===true &&
    proof.hostInteractiveDesktopUsed===false &&
    proof.sharedInteractiveDesktop===false &&
    proof.semanticUiAutomation===true &&
    proof.lowLevelInputInjection===false &&
    proof.clipboardShared===false &&
    proof.credentialCollection===false &&
    proof.hostProfileMounted===false &&
    proof.valuePatternAvailable===true &&
    proof.invokePatternAvailable===true &&
    proof.valueSet===true &&
    proof.controlInvoked===true &&
    proof.roundTripMatched===true &&
    proof.resultCode==='EKODI_SESSION_OK' &&
    proof.windowClosed===true &&
    proof.mutationScope==='ephemeral-guest-session-only' &&
    proof.vmReachedRunning===true &&
    proof.heartbeatObserved===true &&
    proof.networkAttached===false &&
    proof.ephemeralDifferencingDisk===true &&
    proof.baseDiskWriteForbidden===true &&
    proof.sessionVmRemoved===true &&
    proof.sessionDiskRemoved===true
  );
  if(!proofOk) return {done:true,ok:false,error:'Bounded isolated session execution did not satisfy the expected semantic round-trip and cleanup contract.'};
  if(device.status!=='online') return {done:false,reason:'device_not_online_yet'};
  if(String(device.agentVersion||'')!==expectedVersion) return {done:false,reason:'agent_version_drift'};
  if(device.capabilities?.isolatedDesktop!==true) return {done:false,reason:'bounded_isolated_desktop_capability_not_projected'};
  if(time(device.lastSeenAt)<Math.max(time(issuedAt),time(command.completedAt))) return {done:false,reason:'post_session_execution_heartbeat_not_fresh_yet'};

  return {done:true,ok:true,summary:{
    expectedVersion,status:device.status,lastSeenAt:device.lastSeenAt,commandCompletedAt:command.completedAt||null,
    verified:true,boundedSessionExecutorReady:true,
    proof:{
      executorVersion:'bounded-v1',operation:'ui.text.roundtrip',receiptSha256:String(proof.receiptSha256||''),
      inputSha256:expectedHash,outputSha256:expectedHash,textLength:String(expectedText).length,
      rawInputReturned:false,roundTripMatched:true,resultCode:'EKODI_SESSION_OK',semanticUiAutomation:true,lowLevelInputInjection:false,
      hostInteractiveDesktopUsed:false,clipboardShared:false,credentialCollection:false,networkAttached:false,
      sessionVmRemoved:true,sessionDiskRemoved:true,checkedAt:proof.checkedAt||null
    }
  }};
}

async function requestJson(token, pathname, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('authorization', `Bearer ${token}`);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${API_BASE}${pathname}`, { ...init, headers, redirect:'manual' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data.code || data.error || `HTTP_${response.status}`;
    throw new Error(`${pathname} failed: HTTP ${response.status} ${String(code).slice(0, 240)}`);
  }
  return data;
}

async function listDevices(token) {
  const data = await requestJson(token, DEVICES_PATH);
  return Array.isArray(data.devices) ? data.devices : [];
}

async function waitForTarget(token, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = await listDevices(token);
    const target = chooseLiveWindowsAgent(last);
    if (target) return target;
    await sleep(pollMs);
  }
  const counts = {};
  for (const device of last) counts[device.status || 'unknown'] = (counts[device.status || 'unknown'] || 0) + 1;
  throw new Error(`No online enrolled Windows PC was available: ${JSON.stringify({total:last.length,statusCounts:counts})}`);
}

async function issueCommand(token, deviceId, type, payload = undefined) {
  const data = await requestJson(token, `${DEVICES_PATH}/${encodeURIComponent(deviceId)}/commands`, {
    method:'POST',
    body:JSON.stringify({ type, confirmed:true, ...(payload ? { payload } : {}) }),
  });
  const command = data.command || {};
  if (!command.id || command.type !== type || command.status !== 'queued') {
    throw new Error(`${type} was not queued with the expected contract.`);
  }
  return command;
}

async function waitForEvaluation(token, deviceId, timeoutMs, pollMs, evaluator) {
  const deadline = Date.now() + timeoutMs;
  let lastState = { done:false, reason:'not_polled' };
  while (Date.now() < deadline) {
    const devices = await listDevices(token);
    const current = devices.find(item => item.id === deviceId) || null;
    lastState = evaluator(current);
    if (lastState.done) {
      if (!lastState.ok) throw new Error(lastState.error);
      return lastState.summary;
    }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for real-device verification: ${lastState.reason || 'unknown'}`);
}

async function run() {
  const token = String(process.env.E2E_ADMIN_TOKEN || '').trim();
  if (!token) throw new Error('E2E_ADMIN_TOKEN is required.');

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sourcePath = path.join(repoRoot, 'tools', 'ekodi-device-agent', 'windows', 'ekodi-device-agent.ps1');
  const expectedVersion = parseAgentVersion(fs.readFileSync(sourcePath, 'utf8'));
  const targetWaitMs = Number(process.env.DEVICE_TARGET_WAIT_MS || DEFAULT_TARGET_WAIT_MS);
  const commandWaitMs = Number(process.env.DEVICE_COMMAND_WAIT_MS || DEFAULT_COMMAND_WAIT_MS);
  const pollMs = Number(process.env.DEVICE_VERIFY_POLL_MS || DEFAULT_POLL_MS);

  const target = await waitForTarget(token, targetWaitMs, pollMs);
  const initialLastSeenAt = target.lastSeenAt;

  const updateCommand = await issueCommand(token, target.id, SELF_UPDATE);
  const updateVerification = await waitForEvaluation(
    token, target.id, commandWaitMs, pollMs,
    device => evaluateSelfUpdate({device, commandId:updateCommand.id, issuedAt:updateCommand.issuedAt, expectedVersion}),
  );

  const canaryCommand = await issueCommand(token, target.id, BROWSER_CANARY);
  const canaryVerification = await waitForEvaluation(
    token, target.id, commandWaitMs, pollMs,
    device => evaluateBrowserCanary({device, commandId:canaryCommand.id, issuedAt:canaryCommand.issuedAt, expectedVersion}),
  );

  const browserCommand = await issueCommand(token, target.id, BROWSER_EXECUTE, { path:'/', deviceProfile:'desktop' });
  const browserVerification = await waitForEvaluation(
    token, target.id, commandWaitMs, pollMs,
    device => evaluateBrowserWorker({device, commandId:browserCommand.id, issuedAt:browserCommand.issuedAt, expectedVersion}),
  );

  const desktopProbeCommand = await issueCommand(token, target.id, DESKTOP_PROBE);
  const desktopProbeVerification = await waitForEvaluation(
    token, target.id, commandWaitMs, pollMs,
    device => evaluateDesktopProbe({device, commandId:desktopProbeCommand.id, issuedAt:desktopProbeCommand.issuedAt, expectedVersion}),
  );

  let desktopCanaryCommand = null;
  let desktopCanaryVerification = {
    verified:false,
    skipped:true,
    reason:desktopProbeVerification.proof?.gapReason || 'headless_backend_not_ready',
  };
  if (desktopProbeVerification.proof?.headlessBackendReady === true) {
    desktopCanaryCommand = await issueCommand(token, target.id, DESKTOP_CANARY);
    desktopCanaryVerification = await waitForEvaluation(
      token, target.id, commandWaitMs, pollMs,
      device => evaluateDesktopCanary({device, commandId:desktopCanaryCommand.id, issuedAt:desktopCanaryCommand.issuedAt, expectedVersion}),
    );
  }

  let desktopGuestCanaryCommand = null;
  let desktopGuestCanaryVerification = {
    verified:false,
    skipped:true,
    reason:desktopCanaryVerification.verified === true ? 'guest-canary-not-run' : 'hyperv-canary-not-verified',
  };
  if (desktopCanaryVerification.verified === true) {
    desktopGuestCanaryCommand = await issueCommand(token, target.id, DESKTOP_GUEST_CANARY);
    desktopGuestCanaryVerification = await waitForEvaluation(
      token, target.id, commandWaitMs, pollMs,
      device => evaluateDesktopGuestCanary({device, commandId:desktopGuestCanaryCommand.id, issuedAt:desktopGuestCanaryCommand.issuedAt, expectedVersion}),
    );
  }

  let desktopUiCanaryCommand = null;
  let desktopUiCanaryVerification = {
    verified:false,
    skipped:true,
    reason:desktopGuestCanaryVerification.verified === true ? 'ui-canary-not-run' : 'guest-runtime-canary-not-verified',
  };
  if (desktopGuestCanaryVerification.verified === true) {
    desktopUiCanaryCommand = await issueCommand(token, target.id, DESKTOP_UI_CANARY);
    desktopUiCanaryVerification = await waitForEvaluation(
      token, target.id, commandWaitMs, pollMs,
      device => evaluateDesktopUiCanary({device, commandId:desktopUiCanaryCommand.id, issuedAt:desktopUiCanaryCommand.issuedAt, expectedVersion}),
    );
  }

  let desktopSessionCanaryCommand=null;
  let desktopSessionCanaryVerification={verified:false,skipped:true,reason:desktopUiCanaryVerification.verified===true?'session-canary-not-run':'ui-canary-not-verified'};
  if(desktopUiCanaryVerification.verified===true){
    desktopSessionCanaryCommand=await issueCommand(token,target.id,DESKTOP_SESSION_CANARY);
    desktopSessionCanaryVerification=await waitForEvaluation(
      token,target.id,commandWaitMs,pollMs,
      device=>evaluateDesktopSessionCanary({device,commandId:desktopSessionCanaryCommand.id,issuedAt:desktopSessionCanaryCommand.issuedAt,expectedVersion}),
    );
  }

  const sessionVerificationText='EKODI_SESSION_VERIFY_20260924';
  let desktopSessionCommand=null;
  let desktopSessionVerification={verified:false,skipped:true,reason:desktopSessionCanaryVerification.verified===true?'session-execution-not-run':'session-canary-not-verified'};
  if(desktopSessionCanaryVerification.verified===true){
    desktopSessionCommand=await issueCommand(token,target.id,DESKTOP_SESSION_EXECUTE,{operation:'ui.text.roundtrip',text:sessionVerificationText});
    desktopSessionVerification=await waitForEvaluation(
      token,target.id,commandWaitMs,pollMs,
      device=>evaluateDesktopSessionExecute({device,commandId:desktopSessionCommand.id,issuedAt:desktopSessionCommand.issuedAt,expectedVersion,expectedText:sessionVerificationText}),
    );
  }

  const summary = {
    ok:true,
    verifiedAt:new Date().toISOString(),
    target:{ reference:'real-enrolled-windows-agent', initialLastSeenAt },
    update:{ commandType:SELF_UPDATE, issuedAt:updateCommand.issuedAt, verification:updateVerification },
    backgroundBrowserCanary:{ commandType:BROWSER_CANARY, issuedAt:canaryCommand.issuedAt, verification:canaryVerification },
    backgroundBrowserWorker:{ commandType:BROWSER_EXECUTE, issuedAt:browserCommand.issuedAt, verification:browserVerification },
    isolatedDesktopProbe:{ commandType:DESKTOP_PROBE, issuedAt:desktopProbeCommand.issuedAt, verification:desktopProbeVerification },
    isolatedDesktopCanary:{ commandType:DESKTOP_CANARY, issuedAt:desktopCanaryCommand?.issuedAt || null, verification:desktopCanaryVerification },
    isolatedDesktopGuestCanary:{ commandType:DESKTOP_GUEST_CANARY, issuedAt:desktopGuestCanaryCommand?.issuedAt || null, verification:desktopGuestCanaryVerification },
    isolatedDesktopUiCanary:{ commandType:DESKTOP_UI_CANARY, issuedAt:desktopUiCanaryCommand?.issuedAt || null, verification:desktopUiCanaryVerification },
    isolatedDesktopSessionCanary:{ commandType:DESKTOP_SESSION_CANARY, issuedAt:desktopSessionCanaryCommand?.issuedAt || null, verification:desktopSessionCanaryVerification },
    isolatedDesktopSession:{ commandType:DESKTOP_SESSION_EXECUTE, issuedAt:desktopSessionCommand?.issuedAt || null, verification:desktopSessionVerification },
    cutover:{
      preVerification:{browserWorkerActivated:false},
      browserWorkerActivated:true,
      nativeBrowserOperationServiceReady:true,
      nativeServiceReady:desktopSessionVerification.verified === true,
      nativeRemoteComputerFullyReady:false,
      boundedSessionExecutorReady:desktopSessionVerification.verified === true,
      isolatedDesktopCanaryVerified:desktopCanaryVerification.verified === true,
      isolatedDesktopGuestCanaryVerified:desktopGuestCanaryVerification.verified === true,
      isolatedDesktopUiCanaryVerified:desktopUiCanaryVerification.verified === true,
      isolatedDesktopSessionCanaryVerified:desktopSessionCanaryVerification.verified === true,
      isolatedDesktopReady:desktopSessionCanaryVerification.verified === true,
      reason:desktopSessionVerification.verified === true
        ? 'native-bounded-isolated-session-executor-v1-verified'
        : (desktopSessionCanaryVerification.verified === true
          ? 'native-session-canary-verified-bounded-execution-proof-pending'
          : (desktopUiCanaryVerification.verified === true
            ? 'native-isolated-ui-verified-session-canary-pending'
            : (desktopGuestCanaryVerification.verified === true
              ? 'native-guest-runtime-verified-ui-proof-pending'
              : (desktopCanaryVerification.verified === true ? 'native-hyperv-canary-verified-guest-execution-pending' : 'native-browser-runtime-verified-isolated-desktop-pending'))))
    },
  };
  const artifactDir = path.join(repoRoot, 'artifacts');
  fs.mkdirSync(artifactDir, { recursive:true });
  fs.writeFileSync(path.join(artifactDir, 'device-agent-production-verification.json'), JSON.stringify(summary, null, 2));
  console.log(`[EKODI] Real Device Agent ${expectedVersion} verification completed; available native browser, guest-runtime, semantic-UI, session-canary and bounded-v1 session stages were verified. Unbounded desktop execution remains forbidden.`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    console.error(`[EKODI][DEVICE-LIVE-VERIFY] ${error.message}`);
    process.exitCode = 1;
  });
}
