import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://ekodi.kr';
const DEVICES_PATH = '/api/control/devices';
const SELF_UPDATE = 'agent.self_update';
const BROWSER_CANARY = 'computer.browser.canary';
const DEFAULT_TARGET_WAIT_MS = 120_000;
const DEFAULT_COMMAND_WAIT_MS = 240_000;
const DEFAULT_POLL_MS = 5_000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const time = value => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

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
  if (device.capabilities?.backgroundBrowser === true) {
    return { done:true, ok:false, error:'Browser execution capability became active before the full Browser Worker was verified.' };
  }
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
      browserExecutionStillFailClosed:true,
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

async function issueCommand(token, deviceId, type) {
  const data = await requestJson(token, `${DEVICES_PATH}/${encodeURIComponent(deviceId)}/commands`, {
    method:'POST',
    body:JSON.stringify({ type, confirmed:true }),
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

  const summary = {
    ok:true,
    verifiedAt:new Date().toISOString(),
    target:{ reference:'real-enrolled-windows-agent', initialLastSeenAt },
    update:{ commandType:SELF_UPDATE, issuedAt:updateCommand.issuedAt, verification:updateVerification },
    backgroundBrowserCanary:{ commandType:BROWSER_CANARY, issuedAt:canaryCommand.issuedAt, verification:canaryVerification },
    cutover:{ browserWorkerActivated:false, nativeServiceReady:false, reason:'canary_only_full_browser_worker_not_yet_verified' },
  };
  const artifactDir = path.join(repoRoot, 'artifacts');
  fs.mkdirSync(artifactDir, { recursive:true });
  fs.writeFileSync(path.join(artifactDir, 'device-agent-production-verification.json'), JSON.stringify(summary, null, 2));
  console.log(`[EKODI] Real Device Agent ${expectedVersion} + background-browser canary verification passed; browser execution remains fail-closed.`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    console.error(`[EKODI][DEVICE-LIVE-VERIFY] ${error.message}`);
    process.exitCode = 1;
  });
}
