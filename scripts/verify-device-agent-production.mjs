import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://ekodi.kr';
const DEVICES_PATH = '/api/control/devices';
const SELF_UPDATE = 'agent.self_update';
const DEFAULT_TARGET_WAIT_MS = 120_000;
const DEFAULT_COMMAND_WAIT_MS = 210_000;
const DEFAULT_POLL_MS = 5_000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function parseAgentVersion(source) {
  const match = String(source || '').match(/\$AgentVersion\s*=\s*'([^']+)'/);
  if (!match) throw new Error('Device Agent source version marker is missing.');
  return match[1];
}

function time(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
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

export function evaluateVerification({ device, commandId, issuedAt, expectedVersion }) {
  if (!device) return { done:false, reason:'device_missing' };
  const command = (device.recentCommands || []).find(item => item.id === commandId);
  if (!command) return { done:false, reason:'command_not_visible' };

  if (command.status === 'failed' || command.status === 'cancelled') {
    const detail = String(command.result?.message || command.status || 'unknown failure').slice(0, 500);
    return { done:true, ok:false, error:`Device Agent self-update failed: ${detail}` };
  }
  if (command.status !== 'succeeded') return { done:false, reason:command.status || 'pending' };

  const message = String(command.result?.message || '');
  if (!message.includes(expectedVersion) || !message.includes('트랜잭션')) {
    return { done:true, ok:false, error:`Self-update result did not prove transactional promotion to ${expectedVersion}.` };
  }
  if (device.status !== 'online') {
    return { done:true, ok:false, error:`Device left online state after self-update: ${device.status || 'unknown'}` };
  }
  if (time(device.lastSeenAt) < time(issuedAt)) {
    return { done:false, reason:'heartbeat_not_fresh_yet' };
  }
  return {
    done:true,
    ok:true,
    summary:{
      expectedVersion,
      reportedAgentVersion:String(device.agentVersion || ''),
      status:device.status,
      lastSeenAt:device.lastSeenAt,
      commandCompletedAt:command.completedAt || null,
      heartbeatAfterIssue:true,
      transactionalResult:true,
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

function deviceInventorySummary(devices) {
  const counts = {};
  for (const device of devices) {
    const key = String(device.status || 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return { total:devices.length, statusCounts:counts };
}

async function waitForTarget(token, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = await listDevices(token);
    const target = chooseLiveWindowsAgent(last);
    if (target) return { target, devices:last };
    await sleep(pollMs);
  }
  throw new Error(`No online enrolled Windows PC was available for real-device verification: ${JSON.stringify(deviceInventorySummary(last))}`);
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

  const { target } = await waitForTarget(token, targetWaitMs, pollMs);
  const initialLastSeenAt = target.lastSeenAt;
  const issue = await requestJson(token, `${DEVICES_PATH}/${encodeURIComponent(target.id)}/commands`, {
    method:'POST',
    body:JSON.stringify({ type:SELF_UPDATE, confirmed:true }),
  });
  const command = issue.command || {};
  if (!command.id || command.type !== SELF_UPDATE || command.status !== 'queued') {
    throw new Error('Device Agent self-update command was not queued with the expected contract.');
  }

  const deadline = Date.now() + commandWaitMs;
  let lastState = { done:false, reason:'not_polled' };
  while (Date.now() < deadline) {
    const devices = await listDevices(token);
    const current = devices.find(item => item.id === target.id) || null;
    lastState = evaluateVerification({
      device:current,
      commandId:command.id,
      issuedAt:command.issuedAt,
      expectedVersion,
    });
    if (lastState.done) {
      if (!lastState.ok) throw new Error(lastState.error);
      const summary = {
        ok:true,
        verifiedAt:new Date().toISOString(),
        target:{
          reference:'real-enrolled-windows-agent',
          initialLastSeenAt,
        },
        command:{
          type:SELF_UPDATE,
          issuedAt:command.issuedAt,
        },
        verification:lastState.summary,
      };
      const artifactDir = path.join(repoRoot, 'artifacts');
      fs.mkdirSync(artifactDir, { recursive:true });
      fs.writeFileSync(path.join(artifactDir, 'device-agent-production-verification.json'), JSON.stringify(summary, null, 2));
      console.log(`[EKODI] Real Windows Device Agent verification passed: transactional self-update ${expectedVersion}, fresh heartbeat, admin online.`);
      return;
    }
    await sleep(pollMs);
  }
  throw new Error(`Timed out waiting for Device Agent self-update + heartbeat verification: ${lastState.reason || 'unknown'}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  run().catch(error => {
    console.error(`[EKODI][DEVICE-LIVE-VERIFY] ${error.message}`);
    process.exitCode = 1;
  });
}
