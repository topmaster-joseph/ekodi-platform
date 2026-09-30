import http from 'node:http';
import dgram from 'node:dgram';
import crypto from 'node:crypto';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8789);
const SECRET = String(process.env.REMOTE_POWER_SHARED_SECRET || '').trim();
const MAX_SKEW_SECONDS = 60;
const COOLDOWN_MS = 15000;
const lastWakeAt = new Map();

function loadDevices() {
  try {
    const parsed = JSON.parse(process.env.REMOTE_POWER_DEVICES_JSON || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

const DEVICES = loadDevices();

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function normalizeMac(value) {
  const hex = String(value || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
  return /^[0-9a-f]{12}$/.test(hex) ? hex : null;
}

function magicPacket(mac) {
  const normalized = normalizeMac(mac);
  if (!normalized) throw new Error('invalid mac');
  const macBytes = Buffer.from(normalized, 'hex');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => macBytes)]);
}

function safeEqualHex(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(String(left || '')) || !/^[0-9a-f]{64}$/i.test(String(right || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function verifyRequest(rawBody, timestamp, signature) {
  if (!SECRET) return false;
  const numericTimestamp = Number(timestamp);
  if (!Number.isFinite(numericTimestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - numericTimestamp) > MAX_SKEW_SECONDS) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  return safeEqualHex(expected, signature);
}

function sendWake(device) {
  return new Promise((resolve, reject) => {
    const packet = magicPacket(device.mac);
    const broadcast = String(device.broadcast || '255.255.255.255');
    const port = Number(device.port || 9);
    const socket = dgram.createSocket('udp4');
    const finish = error => {
      try { socket.close(); } catch {}
      error ? reject(error) : resolve();
    };
    socket.once('error', finish);
    socket.bind(() => {
      try { socket.setBroadcast(true); } catch (error) { finish(error); return; }
      socket.send(packet, port, broadcast, error => finish(error || null));
    });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'ekodi-remote-power-relay', configuredDevices: Object.keys(DEVICES).length });
    return;
  }
  if (req.method !== 'POST' || url.pathname !== '/wake') {
    json(res, 404, { error: 'not found' });
    return;
  }

  let rawBody = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    rawBody += chunk;
    if (rawBody.length > 8192) req.destroy();
  });
  req.on('end', async () => {
    const timestamp = String(req.headers['x-ekodi-timestamp'] || '');
    const signature = String(req.headers['x-ekodi-signature'] || '');
    if (!verifyRequest(rawBody, timestamp, signature)) {
      json(res, 401, { error: 'invalid signature', code: 'INVALID_SIGNATURE' });
      return;
    }
    let body = null;
    try { body = JSON.parse(rawBody); } catch {}
    const deviceId = String(body?.deviceId || '').trim().toLowerCase();
    const device = DEVICES[deviceId];
    if (!device) {
      json(res, 404, { error: 'unknown device', code: 'UNKNOWN_DEVICE' });
      return;
    }
    const previous = lastWakeAt.get(deviceId) || 0;
    if (Date.now() - previous < COOLDOWN_MS) {
      json(res, 429, { error: 'wake request cooldown', code: 'WAKE_COOLDOWN' });
      return;
    }
    try {
      await sendWake(device);
      lastWakeAt.set(deviceId, Date.now());
      json(res, 202, { ok: true, deviceId, status: 'wake_sent' });
    } catch {
      json(res, 500, { error: 'wake packet failed', code: 'WAKE_PACKET_FAILED' });
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`EKODI remote power relay listening on http://${HOST}:${PORT}`);
});
