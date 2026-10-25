// EKODI-SIMULCAST-RELAY-001 — EKODI-owned, zero-cost multichannel simulcast.
//
// The broadcast PC runs the EKODI Device Agent. OBS (or any encoder) on that PC
// sends RTMP to rtmp://127.0.0.1:1935/live/ekodi; the agent supervises a pinned
// ffmpeg that copies the program, without re-encoding, to every enabled
// destination (YouTube, Facebook, Instagram Live, other RTMP/RTMPS) through the
// tee muxer, so one failing channel never stops the others.
//
// Destination stream keys travel once, inside a single configure command, and
// are stored on the PC only (Windows DPAPI). The cloud keeps a masked hint and
// redacts the command payload as soon as the agent claims it.

export const SIMULCAST_RELAY_POLICY_ID = 'EKODI-SIMULCAST-RELAY-001';
export const SIMULCAST_RELAY_CAPABILITY = 'simulcastRelay';
export const SIMULCAST_RELAY_COMMANDS = Object.freeze({
  install: 'simulcast.relay.install',
  configure: 'simulcast.relay.configure',
  status: 'simulcast.relay.status',
});
export const SIMULCAST_RELAY_INGEST = Object.freeze({
  url: 'rtmp://127.0.0.1:1935/live',
  streamKey: 'ekodi',
  full: 'rtmp://127.0.0.1:1935/live/ekodi',
});
// Pinned binary: @ffmpeg-installer/win32-x64@4.1.0 from the npm registry
// (FFmpeg 4.1, GnuTLS enabled → rtmps). Both the tarball and ffmpeg.exe are
// verified by SHA-256 on the PC before first use.
export const SIMULCAST_RELAY_FFMPEG = Object.freeze({
  source: 'https://registry.npmjs.org/@ffmpeg-installer/win32-x64/-/win32-x64-4.1.0.tgz',
  tarballSha256: '2aa313be3585994d710197bc4196f5fcbb6a1469be1013b24d200e45d773592f',
  exeSha256: 'c8abc49e7be62dde8e12972af373959e0076a7b8dc8040eb45978e0608f8781e',
  version: '4.1.0',
});
export const SIMULCAST_RELAY_MAX_DESTINATIONS = 10;
const OPS = new Set(['add', 'remove', 'enable', 'disable', 'arm', 'disarm']);
const KEY_PATTERN = /^[A-Za-z0-9_\-.=?&~:%+]{4,256}$/;

export function isSimulcastRelayCommand(type) {
  return Object.values(SIMULCAST_RELAY_COMMANDS).includes(String(type || ''));
}

function clean(value, max = 200) { return String(value ?? '').trim().slice(0, max); }

// Validates one configure operation. A destination must already have passed
// the platform host allowlist (validateSimulcastDestination) in the Control API.
export function sanitizeSimulcastRelayPayload(raw = {}) {
  const op = clean(raw.op, 12);
  if (!OPS.has(op)) throw new Error('SIMULCAST_RELAY_OP_INVALID');
  const out = { policy: SIMULCAST_RELAY_POLICY_ID, op };
  if (op === 'add') {
    const d = raw.destination || {};
    const id = clean(d.id, 64);
    if (!/^relay_[a-f0-9]{16,40}$/.test(id)) throw new Error('SIMULCAST_RELAY_DESTINATION_ID_INVALID');
    let url;
    try { url = new URL(clean(d.url, 300)); } catch { throw new Error('SIMULCAST_RELAY_URL_INVALID'); }
    if (!['rtmp:', 'rtmps:'].includes(url.protocol) || url.username || url.password) throw new Error('SIMULCAST_RELAY_URL_INVALID');
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(url.hostname) || /^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) throw new Error('SIMULCAST_RELAY_URL_INVALID');
    if (/[|[\]"'\s]/.test(url.toString())) throw new Error('SIMULCAST_RELAY_URL_INVALID');
    const key = String(d.key ?? '').trim();
    if (!KEY_PATTERN.test(key)) throw new Error('SIMULCAST_RELAY_KEY_INVALID');
    out.destination = { id, label: clean(d.label, 60) || url.hostname, url: url.toString(), key };
  } else if (['remove', 'enable', 'disable'].includes(op)) {
    const id = clean(raw.destinationId, 64);
    if (!/^relay_[a-f0-9]{16,40}$/.test(id)) throw new Error('SIMULCAST_RELAY_DESTINATION_ID_INVALID');
    out.destinationId = id;
  }
  return out;
}

// What stays in D1 after the agent claims a configure command.
export function redactSimulcastRelayPayload(payload = {}) {
  if (!payload?.destination) return payload;
  const key = String(payload.destination.key || '');
  return { ...payload, destination: { ...payload.destination, key: undefined, keyHint: key.length > 4 ? `••••${key.slice(-4)}` : '••••' }, redacted: true };
}

export function summarizeSimulcastRelayResult(result = {}) {
  return {
    installed: Boolean(result.installed),
    armed: Boolean(result.armed),
    running: Boolean(result.running),
    ingest: SIMULCAST_RELAY_INGEST.full,
    destinations: Array.isArray(result.destinations) ? result.destinations.slice(0, SIMULCAST_RELAY_MAX_DESTINATIONS).map(d => ({
      id: clean(d.id, 64), label: clean(d.label, 60), host: clean(d.host, 120), keyHint: clean(d.keyHint, 12), enabled: d.enabled !== false,
    })) : [],
    lastError: clean(result.lastError, 300) || null,
    ffmpegVersion: clean(result.ffmpegVersion, 20) || null,
  };
}
