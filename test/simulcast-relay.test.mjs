import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  SIMULCAST_RELAY_COMMANDS, SIMULCAST_RELAY_FFMPEG, SIMULCAST_RELAY_INGEST,
  sanitizeSimulcastRelayPayload, redactSimulcastRelayPayload, summarizeSimulcastRelayResult, isSimulcastRelayCommand,
} from '../simulcast-relay-policy.js';
import { handleLiveInterpretation } from '../live-interpretation-control.js';
import { realtimeTenant } from '../realtime-tenant-registry.js';
import { evaluateRealtimeRequest } from '../src/realtime/entitlement.mjs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const agent = read('tools/ekodi-device-agent/windows/ekodi-device-agent.ps1');
const deviceControl = read('device-control.js');

test('relay payloads: only six ops, safe destinations, keys redacted after claim', () => {
  const add = sanitizeSimulcastRelayPayload({ op: 'add', destination: { id: 'relay_0123456789abcdef01234567', label: 'YouTube', url: 'rtmps://a.rtmps.youtube.com/live2', key: 'abcd-efgh-ijkl-mnop' } });
  assert.equal(add.destination.key, 'abcd-efgh-ijkl-mnop');
  const red = redactSimulcastRelayPayload(add);
  assert.equal(red.destination.key, undefined); assert.equal(red.destination.keyHint, '••••mnop'); assert.equal(red.redacted, true);
  assert.equal(JSON.stringify(red).includes('abcd-efgh'), false);
  assert.throws(() => sanitizeSimulcastRelayPayload({ op: 'exec' }), /OP_INVALID/);
  for (const url of ['http://a.rtmps.youtube.com/live2', 'rtmp://127.0.0.1/live', 'rtmp://192.168.0.5/live', 'rtmp://u:p@x.example.com/live', 'rtmp://x.example.com/a|b'])
    assert.throws(() => sanitizeSimulcastRelayPayload({ op: 'add', destination: { id: 'relay_0123456789abcdef01234567', url, key: 'k1234' } }), /URL_INVALID/, url);
  assert.throws(() => sanitizeSimulcastRelayPayload({ op: 'add', destination: { id: 'relay_0123456789abcdef01234567', url: 'rtmp://a.rtmp.youtube.com/live2', key: 'bad key"' } }), /KEY_INVALID/);
  assert.throws(() => sanitizeSimulcastRelayPayload({ op: 'remove', destinationId: '../x' }), /DESTINATION_ID_INVALID/);
  assert.deepEqual(sanitizeSimulcastRelayPayload({ op: 'arm' }), { policy: 'EKODI-SIMULCAST-RELAY-001', op: 'arm' });
  const sum = summarizeSimulcastRelayResult({ installed: true, armed: true, running: false, destinations: [{ id: 'relay_x', label: 'FB', host: 'live-api-s.facebook.com', keyHint: '••••1234', key: 'SECRET' }] });
  assert.equal(JSON.stringify(sum).includes('SECRET'), false); assert.equal(sum.ingest, SIMULCAST_RELAY_INGEST.full);
  assert.equal(isSimulcastRelayCommand('simulcast.relay.configure'), true); assert.equal(isSimulcastRelayCommand('power.normal'), false);
});

test('device control: relay commands registered, only via the live route, redacted on claim', () => {
  assert.match(deviceControl, /\[SIMULCAST_RELAY_COMMANDS\.configure\]: \{ risk: 'privileged', payload: 'simulcast-relay' \}/);
  assert.match(deviceControl, /if \(policy\.payload === 'simulcast-relay'\) return sanitizeSimulcastRelayPayload/);
  assert.match(deviceControl, /DEVICE_RELAY_ROUTE_REQUIRED/);
  assert.match(deviceControl, /command\.command_type === SIMULCAST_RELAY_COMMANDS\.configure[\s\S]{0,260}redactSimulcastRelayPayload/);
});

test('Windows agent: pinned ffmpeg, DPAPI store, fixed arguments, supervised relay', () => {
  assert.match(agent, /\$AgentVersion = '2\.6\.1'/);
  assert.ok(agent.includes(`$SimulcastFfmpegSource = '${SIMULCAST_RELAY_FFMPEG.source}'`));
  assert.ok(agent.includes(`$SimulcastTarballSha256 = '${SIMULCAST_RELAY_FFMPEG.tarballSha256.toUpperCase()}'`));
  assert.ok(agent.includes(`$SimulcastFfmpegSha256 = '${SIMULCAST_RELAY_FFMPEG.exeSha256.toUpperCase()}'`));
  for (const type of Object.values(SIMULCAST_RELAY_COMMANDS)) assert.ok(agent.includes(`'${type}' {`), type);
  assert.match(agent, /simulcastRelay = \$true/);
  assert.match(agent, /try \{ Reconcile-EkodiSimulcastRelay \} catch \{ \}/);
  assert.match(agent, /Protect-LocalSecret \$json/);
  assert.match(agent, /\[f=flv:onfail=ignore\]/);
  assert.match(agent, /-listen 1 -i ' \+ \$SimulcastIngest/);
  assert.match(agent, /\$SimulcastIngest = 'rtmp:\/\/127\.0\.0\.1:1935\/live\/ekodi'/);
  const relayBlock = agent.slice(agent.indexOf('EKODI-SIMULCAST-RELAY-001'), agent.indexOf('function Install-EkodiLocalAI'));
  assert.doesNotMatch(relayBlock, /Invoke-Expression|\biex\b|\$Payload\.(command|args|binary)/i);
  assert.match(relayBlock, /Replace\(\[string\]\$d\.key, '\*\*\*\*'\)/, 'log tail redacts keys');
});

test('pinned hashes match the npm registry artifact when it is cached locally', () => {
  const cached = process.env.EKODI_FFMPEG_TGZ;
  if (!cached || !fs.existsSync(cached)) return;
  const hash = createHash('sha256').update(fs.readFileSync(cached)).digest('hex');
  assert.equal(hash, SIMULCAST_RELAY_FFMPEG.tarballSha256);
});

function d1() {
  const db = new DatabaseSync(':memory:');
  for (const m of ['0083_realtime_communication_core.sql', '202610250500_live_interpretation_simulcast.sql', '202610250930_live_simulcast_relay.sql'])
    db.exec(fs.readFileSync(new URL(`../migrations/${m}`, import.meta.url), 'utf8'));
  db.exec(`CREATE TABLE device_registry (id TEXT PRIMARY KEY,label TEXT NOT NULL,platform TEXT NOT NULL,hostname TEXT NOT NULL DEFAULT '',os_version TEXT NOT NULL DEFAULT '',agent_version TEXT NOT NULL DEFAULT '',token_hash TEXT NOT NULL UNIQUE,capabilities_json TEXT NOT NULL DEFAULT '{}',settings_json TEXT NOT NULL DEFAULT '{}',last_seen_at TEXT,enrolled_at TEXT NOT NULL,revoked_at TEXT);
    CREATE TABLE device_commands (id TEXT PRIMARY KEY,device_id TEXT NOT NULL,command_type TEXT NOT NULL,payload_json TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'queued',issued_at TEXT NOT NULL,issued_by INTEGER,claimed_at TEXT,completed_at TEXT,result_json TEXT NOT NULL DEFAULT '{}');`);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO device_registry VALUES ('dev_church','방송PC','windows','CHURCH-PC','Windows 11','2.6.1','h1','{"simulcastRelay":true}','{}',?,?,NULL)`).run(now, now);
  const st = (sql, args = []) => ({ bind: (...v) => st(sql, v), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }) });
  return { raw: db, prepare: sql => st(sql), batch: async l => l };
}
const json = (_r, _e, data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
function harness({ superAdmin = true, role = 'owner' } = {}) {
  const env = { DB: d1() };
  const deps = { json, realtimeTenant, evaluate: evaluateRealtimeRequest, subjectOf: i => i.id,
    tenantAdminAccess: async () => ({ identity: { id: 'u1', platformAdminRole: superAdmin ? 'super_admin' : undefined }, role, tier: 'organization', allowed: ['owner', 'admin'].includes(role) }) };
  const call = async (method, path, payload) => {
    const url = new URL(`https://ekodi.kr${path}`);
    const res = await handleLiveInterpretation(new Request(url, { method }), env, url, payload ?? null, deps);
    return { status: res.status, data: await res.json() };
  };
  return { env, call };
}

test('EKODI relay end-to-end in the Control API: bind, add channels, arm, keys never at rest', async () => {
  const h = harness();
  const empty = await h.call('GET', '/api/realtime/relay?tenant=ekodichurch');
  assert.equal(empty.data.binding, null); assert.equal(empty.data.canBind, true); assert.equal(empty.data.ingest.full, 'rtmp://127.0.0.1:1935/live/ekodi');
  assert.equal((await h.call('POST', '/api/realtime/relay/arm', { tenant: 'ekodichurch' })).status, 409, 'arm needs a bound PC');
  const devices = await h.call('GET', '/api/realtime/relay/devices?tenant=ekodichurch');
  assert.deepEqual(devices.data.devices.map(d => [d.id, d.relayCapable, d.online]), [['dev_church', true, true]]);
  assert.equal((await h.call('POST', '/api/realtime/relay/bind', { tenant: 'ekodichurch', deviceId: 'dev_church' })).status, 200);
  const yt = await h.call('POST', '/api/realtime/relay/destinations', { tenant: 'ekodichurch', platform: 'youtube', streamKey: 'yt-abcd-1234', label: '에코디교회 YouTube' });
  assert.equal(yt.status, 201); assert.equal(yt.data.destination.keyHint, '••••1234');
  const fb = await h.call('POST', '/api/realtime/relay/destinations', { tenant: 'ekodichurch', platform: 'facebook', streamKey: 'FB-1234567890?s_bl=1&s_psm=1' });
  assert.equal(fb.status, 201);
  assert.equal((await h.call('POST', '/api/realtime/relay/destinations', { tenant: 'ekodichurch', platform: 'youtube', url: 'rtmp://evil.example.com/x', streamKey: 'k1234' })).status, 400);
  const arm = await h.call('POST', '/api/realtime/relay/arm', { tenant: 'ekodichurch' });
  assert.equal(arm.status, 202); assert.equal(arm.data.armed, true);
  const cmds = h.env.DB.raw.prepare(`SELECT command_type,payload_json FROM device_commands ORDER BY issued_at,rowid`).all();
  assert.deepEqual(cmds.map(c => [c.command_type, JSON.parse(c.payload_json).op]), [['simulcast.relay.configure', 'add'], ['simulcast.relay.configure', 'add'], ['simulcast.relay.configure', 'arm']]);
  assert.equal(JSON.parse(cmds[0].payload_json).destination.url, 'rtmps://a.rtmps.youtube.com/live2');
  // Keys only in the transient command payload (redacted on claim), never in relay tables or audit.
  const rest = JSON.stringify([...h.env.DB.raw.prepare('SELECT * FROM live_relay_destinations').all(), ...h.env.DB.raw.prepare('SELECT * FROM realtime_audit_log').all()]);
  assert.equal(rest.includes('yt-abcd-1234'), false); assert.equal(rest.includes('FB-1234567890'), false);
  const state = await h.call('GET', '/api/realtime/relay?tenant=church');
  assert.equal(state.data.binding.armed, true); assert.equal(state.data.destinations.length, 2); assert.equal(state.data.pendingCommands, 3);
  const off = await h.call('POST', `/api/realtime/relay/destinations/${fb.data.destination.id}`, { tenant: 'ekodichurch', enabled: false });
  assert.equal(off.data.enabled, false);
  const del = await h.call('DELETE', `/api/realtime/relay/destinations/${yt.data.destination.id}?tenant=ekodichurch`, { tenant: 'ekodichurch' });
  assert.equal(del.status, 200);
  assert.equal(h.env.DB.raw.prepare('SELECT COUNT(*) n FROM live_relay_destinations').get().n, 1);
  h.env.DB.raw.prepare(`UPDATE device_commands SET status='completed',completed_at=?,result_json=? WHERE command_type='simulcast.relay.configure'`).run(new Date().toISOString(), JSON.stringify({ simulcastRelay: { installed: true, armed: true, running: true, destinations: [{ id: 'relay_a', label: 'FB', host: 'live-api-s.facebook.com', keyHint: '••••psm=1', key: 'LEAK' }] } }));
  const after = await h.call('GET', '/api/realtime/relay?tenant=ekodichurch');
  assert.equal(after.data.lastResult.relay.running, true); assert.equal(JSON.stringify(after.data).includes('LEAK'), false);
  const other = await h.call('GET', '/api/realtime/relay?tenant=ekodimission');
  assert.equal(other.data.binding, null, 'bindings are per tenant');
});

test('only a platform super admin can bind a PC; tenant hosts can operate a bound PC', async () => {
  const h = harness({ superAdmin: false });
  assert.equal((await h.call('POST', '/api/realtime/relay/bind', { tenant: 'ekodichurch', deviceId: 'dev_church' })).status, 403);
  assert.equal((await h.call('GET', '/api/realtime/relay/devices?tenant=ekodichurch')).status, 403);
  const viewer = harness({ role: 'member' });
  assert.equal((await viewer.call('GET', '/api/realtime/relay?tenant=ekodichurch')).status, 403);
});
