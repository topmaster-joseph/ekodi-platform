#!/usr/bin/env node
/**
 * EKODI first-party isolated Browser Connector.
 * One-shot, read-only diagnostics for the EKODI and EKODI GitHub surfaces.
 * Never attaches to a user's existing browser, reuses an account profile,
 * requests credentials, or opens a remote debugging service on the LAN.
 *
 * Node 22+; Chrome / Edge / Chromium required; no third-party cloud service.
 */
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = 'topmaster-joseph/ekodi-platform';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function normalizeConnectionRequest(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('BROWSER_REQUEST_INVALID');
  if (input.mode === 'runtime-canary') return Object.freeze({ mode: 'runtime-canary', target: 'about:blank' });
  if (input.mode === 'github-pr') {
    const n = Number(input.pr);
    if (!Number.isSafeInteger(n) || n < 1 || n > 999999 || String(input.pr) !== String(n))
      throw new Error('BROWSER_PR_NUMBER_INVALID');
    return Object.freeze({ mode: 'github-pr', pr: n, target: 'https://github.com/' + REPO + '/pull/' + n });
  }
  if (input.mode === 'ekodi-site') {
    const page = String(input.path || '/');
    if (!/^\/(?:singles(?:\/[a-z0-9_\/-]*)?|admin(?:\/[a-z0-9_\/-]*)?)?$/i.test(page))
      throw new Error('BROWSER_PATH_FORBIDDEN');
    return Object.freeze({ mode: 'ekodi-site', target: 'https://ekodi.kr' + page });
  }
  throw new Error('BROWSER_MODE_FORBIDDEN');
}

export function allowedDocumentUrl(value, mode) {
  if (mode === 'runtime-canary') return value === 'about:blank';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
    if (mode === 'github-pr') return url.hostname === 'github.com' &&
      (url.pathname === '/' + REPO || url.pathname.startsWith('/' + REPO + '/'));
    if (mode === 'ekodi-site') return url.hostname === 'ekodi.kr' &&
      (/^\/(?:singles(?:\/|$)|admin(?:\/|$))/.test(url.pathname) || url.pathname === '/');
    return false;
  } catch { return false; }
}

export function safeEvidenceUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.origin + url.pathname : url.protocol;
  } catch { return ''; }
}

export function classifyPage({ url = '', title = '', heading = '', status = null } = {}, mode = '') {
  const safeUrl = safeEvidenceUrl(url);
  const authRequired = /\/(?:login|session|signup)(?:\/|$)/i.test(new URL(url, 'https://github.com').pathname);
  return Object.freeze({
    ok: !authRequired && (status === null || status < 400),
    outcome: authRequired ? 'AUTH_REQUIRED' : status !== null && status >= 400 ? 'HTTP_ERROR' : 'OBSERVED',
    mode, url: safeUrl, title: String(title).slice(0,180), heading: String(heading).slice(0,160),
    httpStatus: status, authRequired, interactiveLoginOpened: false,
    isolatedProfile: true, existingProfileReused: false,
    clipboardShared: false, foregroundInput: false, mutationsAllowed: false,
  });
}

export function browserPaths(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const pf = env.ProgramFiles || 'C:\\Program Files';
    const pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return [
      path.win32.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
      path.win32.join(pf, 'Google/Chrome/Application/chrome.exe'),
      path.win32.join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
      path.win32.join(pf86, 'Google/Chrome/Application/chrome.exe'),
    ];
  }
  return ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
}

async function selectBrowser(candidates) {
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* next */ }
  }
  throw new Error('BROWSER_EXECUTABLE_NOT_FOUND');
}

async function endpointFor(profile, child, deadline) {
  while (Date.now() < deadline) {
    if (child.spawnError) throw new Error('BROWSER_SPAWN_FAILED');
    if (child.exitCode !== null) throw new Error('BROWSER_PROCESS_EXITED');
    try {
      const [port, socket] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      if (/^\d+$/.test(port) && socket?.startsWith('/devtools/browser/'))
        return 'ws://127.0.0.1:' + port + socket;
    } catch { /* browser still starting */ }
    await delay(100);
  }
  throw new Error('BROWSER_START_TIMEOUT');
}

function openCdp(endpoint, deadline) {
  const socket = new WebSocket(endpoint);
  const pending = new Map();
  let nextId = 0;
  let requestGuardError = null;
  let status = null;
  const opened = new Promise((resolve, reject) => {
    const ms = Math.max(100, deadline - Date.now());
    const timer = setTimeout(() => reject(new Error('BROWSER_SOCKET_TIMEOUT')), ms);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('BROWSER_SOCKET_ERROR')); }, { once: true });
  });
  function send(method, params = {}, sessionId) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('BROWSER_CDP_TIMEOUT')); },
        Math.max(100, deadline - Date.now()));
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  socket.addEventListener('message', event => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id && pending.has(message.id)) {
      const slot = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(slot.timer);
      message.error ? slot.reject(new Error('BROWSER_CDP_COMMAND_FAILED')) : slot.resolve(message.result);
      return;
    }
    if (message.method === 'Network.responseReceived' && message.params?.type === 'Document')
      status = Number(message.params?.response?.status) || null;
    if (message.method !== 'Fetch.requestPaused') return;
    const item = message.params || {};
    const method = String(item.request?.method || '').toUpperCase();
    const document = item.resourceType === 'Document';
    const safe = (!document || allowedDocumentUrl(item.request?.url || '', taskMode)) &&
      ['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (!safe) requestGuardError = document && /https:\/\/github\.com\/(?:login|session|signup)(?:\/|\?|$)/i.test(item.request?.url || '')
      ? 'AUTH_REQUIRED' : document ? 'BROWSER_DOCUMENT_ORIGIN_BLOCKED' : 'BROWSER_MUTATION_BLOCKED';
    void send(safe ? 'Fetch.continueRequest' : 'Fetch.failRequest',
      safe ? { requestId: item.requestId } : { requestId: item.requestId, errorReason: 'BlockedByClient' },
      message.sessionId).catch(() => {});
  });
  let taskMode = 'runtime-canary';
  return { socket, opened, send, setMode: value => { taskMode = value; },
    getStatus: () => status, getGuardError: () => requestGuardError,
    close: () => {
      try { socket.close(); } catch {}
      for (const slot of pending.values()) { clearTimeout(slot.timer); slot.reject(new Error('BROWSER_CLOSED')); }
      pending.clear();
    },
  };
}

export async function runBrowserConnection(raw, { candidates = browserPaths(), timeoutMs = 20000 } = {}) {
  const task = normalizeConnectionRequest(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 2000 || timeoutMs > 30000) throw new Error('BROWSER_TIMEOUT_INVALID');
  const browser = await selectBrowser(candidates);
  const profile = await mkdtemp(path.join(tmpdir(), 'ekodi-owned-browser-'));
  let child, cdp;
  const deadline = Date.now() + timeoutMs;
  try {
    child = spawn(browser, ['--headless=new', '--disable-gpu', '--disable-extensions',
      '--disable-sync', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
    child.once('error', () => { child.spawnError = true; });
    cdp = openCdp(await endpointFor(profile, child, deadline), deadline);
    cdp.setMode(task.mode);
    await cdp.opened;
    const target = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] }, sessionId);
    if (task.mode !== 'runtime-canary') await cdp.send('Page.navigate', { url: task.target }, sessionId);
    let page = null;
    while (Date.now() < deadline) {
      const result = await cdp.send('Runtime.evaluate', {
        expression: '({url:location.href,title:document.title,heading:(document.querySelector("h1")?.innerText||""),ready:document.readyState})',
        returnByValue: true,
      }, sessionId);
      page = result?.result?.value;
      if (cdp.getGuardError()) {
        if (cdp.getGuardError() === 'AUTH_REQUIRED') return {
          ...classifyPage({ url: 'https://github.com/login' }, task.mode),
          provider: 'ekodi-owned-chromium-cdp', browser: path.basename(browser),
          domObserved: false, profileLifetime: 'one-shot'
        };
        throw new Error(cdp.getGuardError());
      }
      if (page && page.ready === 'complete' &&
          (task.mode === 'runtime-canary' || page.url !== 'about:blank')) break;
      await delay(200);
    }
    if (!page || page.ready !== 'complete') throw new Error('BROWSER_DOM_TIMEOUT');
    if (!allowedDocumentUrl(page.url, task.mode)) throw new Error('BROWSER_DOCUMENT_ORIGIN_BLOCKED');
    if (cdp.getGuardError()) throw new Error(cdp.getGuardError());
    return { ...classifyPage({ ...page, status: cdp.getStatus() }, task.mode),
      provider: 'ekodi-owned-chromium-cdp', browser: path.basename(browser),
      domObserved: true, profileLifetime: 'one-shot' };
  } finally {
    cdp?.close();
    if (child && child.exitCode === null) { try { child.kill(); } catch {} }
    await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 }).catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  const [mode, value] = process.argv.slice(2);
  const request = mode === '--canary' ? { mode: 'runtime-canary' } :
    mode === '--pr' ? { mode: 'github-pr', pr: value } :
    mode === '--site' ? { mode: 'ekodi-site', path: value } : { mode: 'forbidden' };
  runBrowserConnection(request).then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.ok ? 0 : 2;
  }).catch(error => {
    const code = /^BROWSER_[A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'BROWSER_FAILED';
    process.stderr.write(JSON.stringify({ ok: false, code }) + '\n');
    process.exitCode = 1;
  });
}
