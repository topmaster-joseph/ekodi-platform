import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  INTERACTIVE_AUTH_COMMANDS,
  INTERACTIVE_AUTH_POLICY_ID,
  assessInteractiveAuthReceipt,
  projectInteractiveAuthStatus,
  projectInteractiveAuthVerification,
  sanitizeInteractiveAuthPayload,
  sanitizeInteractiveAuthSettings,
} from '../interactive-auth-session.js';
import { handleDeviceControl } from '../device-control.js';

const SID = 'ias_0f8fad5b-d9cb-469f-a165-70867728950e';
const invariants = {
  credentialsReturned: false, cookiesExported: false, storageStateExported: false, passwordFieldRead: false,
  screenCaptured: false, clipboardShared: false, hostInputInjection: false, activeUserProfileReused: false,
};

test('start payload fixes every privacy property server-side and ignores request overrides', () => {
  const payload = sanitizeInteractiveAuthPayload(INTERACTIVE_AUTH_COMMANDS.start, {
    service: 'factchat-mokpo', userWillSignInPersonally: true, ttlMinutes: 999,
    entryUrl: 'https://evil.example/login', credentialRelay: true, headed: false, activeUserProfileReuse: true,
  }, { now: Date.parse('2026-10-21T09:00:00Z'), randomUUID: () => SID.slice(4) });
  assert.equal(payload.sessionId, SID);
  assert.equal(payload.entryUrl, 'https://mokpo.factchat.bot/dashboard/chat/40882');
  assert.equal(payload.ttlMinutes, 60);
  assert.equal(payload.expiresAt, '2026-10-21T10:00:00.000Z');
  assert.equal(payload.credentialRelay, false);
  assert.equal(payload.cookieExport, false);
  assert.equal(payload.headed, true);
  assert.equal(payload.localConsentRequired, true);
  assert.equal(payload.activeUserProfileReuse, false);
  assert.deepEqual(payload.forbiddenBrowsers, ['opera']);
});

test('start rejects unregistered services and missing personal sign-in acknowledgement', () => {
  assert.throws(() => sanitizeInteractiveAuthPayload(INTERACTIVE_AUTH_COMMANDS.start, { service: 'evil', userWillSignInPersonally: true }), /SERVICE_INVALID/);
  assert.throws(() => sanitizeInteractiveAuthPayload(INTERACTIVE_AUTH_COMMANDS.start, { service: '__proto__', userWillSignInPersonally: true }), /SERVICE_INVALID/);
  assert.throws(() => sanitizeInteractiveAuthPayload(INTERACTIVE_AUTH_COMMANDS.start, { service: 'factchat-mokpo' }), /PERSONAL_SIGNIN_REQUIRED/);
  const short = sanitizeInteractiveAuthPayload(INTERACTIVE_AUTH_COMMANDS.start, { service: 'factchat-mokpo', userWillSignInPersonally: true, ttlMinutes: 1 });
  assert.equal(short.ttlMinutes, 5);
});

test('verify is read-only by construction and requires a well-formed session id', () => {
  const v = sanitizeInteractiveAuthPayload(INTERACTIVE_AUTH_COMMANDS.verify, { sessionId: SID, service: 'factchat-mokpo', readOnlyAcknowledged: true, mutation: true, uploads: true });
  assert.equal(v.mutation, false);
  assert.equal(v.uploads, false);
  assert.equal(v.creditConsumingActions, false);
  assert.equal(v.cookieRead, false);
  assert.throws(() => sanitizeInteractiveAuthPayload(INTERACTIVE_AUTH_COMMANDS.verify, { sessionId: SID, service: 'factchat-mokpo' }), /READONLY_ACK/);
  assert.throws(() => sanitizeInteractiveAuthPayload(INTERACTIVE_AUTH_COMMANDS.verify, { sessionId: "ias_x' OR 1=1", service: 'factchat-mokpo', readOnlyAcknowledged: true }), /SESSION_ID_INVALID/);
  assert.equal(sanitizeInteractiveAuthPayload(INTERACTIVE_AUTH_COMMANDS.close, {}).sessionId, 'any');
});

test('status projection keeps host names only and drops cookies, URLs and tokens', () => {
  const projected = projectInteractiveAuthStatus({
    sessionId: SID, service: 'factchat-mokpo', state: 'authenticated', browser: 'msedge',
    currentHost: 'mokpo.factchat.bot', pageClass: 'authenticated',
    observedHosts: ['mokpo.factchat.bot', 'accounts.google.com', 'https://x.example/?token=abc', 'bad host'],
    cookie: 'SESSION=secret', currentUrl: 'https://mokpo.factchat.bot/dashboard?code=secret', password: 'p',
    expiresAt: '2026-10-21T10:00:00Z',
  });
  assert.deepEqual(projected.observedHosts, ['mokpo.factchat.bot', 'accounts.google.com']);
  assert.doesNotMatch(JSON.stringify(projected), /secret|SESSION=|token=|"p"/);
  assert.equal(projectInteractiveAuthStatus({ sessionId: 'nope', service: 'factchat-mokpo' }), null);
  assert.equal(projectInteractiveAuthStatus({ sessionId: SID, service: 'factchat-mokpo', state: 'hacked' }).state, 'failed');
});

test('verification projection never claims execution and masks personal data in usage lines', () => {
  const v = projectInteractiveAuthVerification({
    sessionId: SID, service: 'factchat-mokpo', pageOrigin: 'https://mokpo.factchat.bot', authenticated: true, menuLabelCount: 42,
    features: [{ id: 'meeting-notes', menuVisible: true, executionVerified: true }, { id: 'unknown', menuVisible: true }],
    usageLines: ['잔여 크레딧 12,000 · 담당 kim@mokpo.ac.kr 010-1234-5678', '오늘의 채팅 제목: 비밀 회의'],
  });
  assert.equal(v.features.length, 1);
  assert.equal(v.features[0].executionVerified, false);
  assert.equal(v.features[0].status, 'menu_visible_execution_unverified');
  assert.deepEqual(v.usageLines, ['잔여 크레딧 12,000 · 담당 [email] [phone]']);
  assert.equal(projectInteractiveAuthVerification({ sessionId: SID, service: 'factchat-mokpo', pageOrigin: 'https://evil.example' }).pageOrigin, '');
});

test('receipts that weaken any invariant are rejected; close must prove profile deletion', () => {
  const status = { sessionId: SID, service: 'factchat-mokpo', state: 'closed', profileRemoved: true };
  assert.equal(assessInteractiveAuthReceipt(INTERACTIVE_AUTH_COMMANDS.start, { interactiveAuth: { ...invariants, status } }).outcome, 'valid');
  for (const key of Object.keys(invariants)) {
    assert.equal(assessInteractiveAuthReceipt(INTERACTIVE_AUTH_COMMANDS.start, { interactiveAuth: { ...invariants, [key]: true, status } }).outcome, 'invalid', key);
  }
  assert.equal(assessInteractiveAuthReceipt(INTERACTIVE_AUTH_COMMANDS.close, { interactiveAuth: { ...invariants, status, profileRemoved: false } }).outcome, 'invalid');
  assert.equal(assessInteractiveAuthReceipt(INTERACTIVE_AUTH_COMMANDS.verify, { interactiveAuth: { ...invariants, status } }).outcome, 'invalid');
  assert.equal(assessInteractiveAuthReceipt(INTERACTIVE_AUTH_COMMANDS.start, {}).outcome, 'invalid');
});

test('heartbeat settings projection strips anything not allowlisted', () => {
  const s = sanitizeInteractiveAuthSettings({ health: { ok: 1 }, interactiveAuthSession: { sessionId: SID, service: 'factchat-mokpo', state: 'login_required', cookies: ['a=b'] } });
  assert.equal(s.health.ok, 1);
  assert.equal(s.interactiveAuthSession.state, 'login_required');
  assert.equal('cookies' in s.interactiveAuthSession, false);
  assert.equal('interactiveAuthSession' in sanitizeInteractiveAuthSettings({ interactiveAuthSession: { sessionId: 'x' } }), false);
  assert.equal(sanitizeInteractiveAuthSettings(null), null);
});

// ---------------------------------------------------------------------------
// Integration: real Control API handler over a D1-compatible SQLite adapter.
// ---------------------------------------------------------------------------
function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...next) => stmt(sql, next),
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
  });
  return {
    prepare: sql => stmt(sql),
    async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
    async exec(sql) { db.exec(sql); return {}; },
  };
}
const sha = v => createHash('sha256').update(v).digest('hex');

function setup({ role = 'super_admin', capability = true, lastSeen = new Date().toISOString() } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE admins (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL DEFAULT '', password_salt TEXT NOT NULL DEFAULT '', password_iterations INTEGER, birth_hash TEXT NOT NULL DEFAULT '', birth_salt TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'super_admin', created_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, action TEXT NOT NULL, resource TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);`);
  db.prepare('INSERT INTO admins (email, role) VALUES (?, ?)').run('owner@example.org', role);
  db.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?, 1, ?)').run(sha('admin-token-0123456789abcdef'), '2099-01-01T00:00:00.000Z');
  const env = { DB: d1(db), ALLOWED_ORIGINS: 'https://ekodi.kr' };
  return { db, env, async enroll() {
    await handleDeviceControl(new Request('https://ekodi.kr/api/control/devices', { headers: { authorization: 'Bearer admin-token-0123456789abcdef' } }), env);
    db.prepare(`INSERT INTO device_registry (id, label, platform, hostname, os_version, agent_version, token_hash, capabilities_json, settings_json, diagnostics_json, profile_name, last_seen_at, enrolled_at, enrolled_by)
      VALUES ('dev_1','PC','windows','USER4','Windows','2.5.7',?, ?, '{}', '{}', '', ?, ?, 1)`)
      .run(sha('device-token-abcdef0123456789'), JSON.stringify({ interactiveAuthSession: capability }), lastSeen, lastSeen);
  } };
}
const admin = (env, path, body) => handleDeviceControl(new Request(`https://ekodi.kr${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { authorization: 'Bearer admin-token-0123456789abcdef', 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}), env);
const agent = (env, path, body) => handleDeviceControl(new Request(`https://ekodi.kr${path}`, {
  method: body ? 'POST' : 'GET',
  headers: { authorization: 'Bearer device-token-abcdef0123456789', 'x-ekodi-device-id': 'dev_1', 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
}), env);

test('integration: super admin starts a session, agent receives the fixed payload, valid receipt is projected', async () => {
  const t = setup(); await t.enroll();
  const unconfirmed = await admin(t.env, '/api/control/devices/dev_1/commands', { type: INTERACTIVE_AUTH_COMMANDS.start, payload: { service: 'factchat-mokpo', userWillSignInPersonally: true } });
  assert.equal(unconfirmed.status, 409);
  const res = await admin(t.env, '/api/control/devices/dev_1/commands', { type: INTERACTIVE_AUTH_COMMANDS.start, confirmed: true,
    payload: { service: 'factchat-mokpo', userWillSignInPersonally: true, entryUrl: 'https://evil.example' } });
  assert.equal(res.status, 202);
  const issued = (await res.json()).command;
  assert.match(issued.sessionId, /^ias_/);
  const next = await (await agent(t.env, '/api/device-agent/commands/next')).json();
  assert.equal(next.command.type, INTERACTIVE_AUTH_COMMANDS.start);
  assert.equal(next.command.payload.entryUrl, 'https://mokpo.factchat.bot/dashboard/chat/40882');
  assert.equal(next.command.payload.policyId, INTERACTIVE_AUTH_POLICY_ID);
  const done = await agent(t.env, `/api/device-agent/commands/${next.command.id}/result`, { success: true, result: {
    message: 'opened', interactiveAuth: { ...invariants, status: { sessionId: issued.sessionId, service: 'factchat-mokpo', state: 'login_required', cookie: 'x=y' } },
    settings: { interactiveAuthSession: { sessionId: issued.sessionId, service: 'factchat-mokpo', state: 'login_required', token: 'zzz' } },
  } });
  assert.equal((await done.json()).status, 'succeeded');
  const list = await (await admin(t.env, '/api/control/devices')).json();
  const device = list.devices.find(d => d.id === 'dev_1');
  assert.equal(device.settings.interactiveAuthSession.state, 'login_required');
  const cmd = device.recentCommands.find(c => c.type === INTERACTIVE_AUTH_COMMANDS.start);
  assert.equal(cmd.result.interactiveAuth.valid, true);
  assert.doesNotMatch(JSON.stringify(list), /x=y|zzz/);
  const auditRow = t.db.prepare("SELECT detail FROM audit_logs WHERE action='device.command.issue'").get();
  assert.match(auditRow.detail, new RegExp(`session=${issued.sessionId}`));
});

test('integration: a receipt that claims cookie export is stored as failed', async () => {
  const t = setup(); await t.enroll();
  await admin(t.env, '/api/control/devices/dev_1/commands', { type: INTERACTIVE_AUTH_COMMANDS.start, confirmed: true, payload: { service: 'factchat-mokpo', userWillSignInPersonally: true } });
  const next = await (await agent(t.env, '/api/device-agent/commands/next')).json();
  const done = await agent(t.env, `/api/device-agent/commands/${next.command.id}/result`, { success: true, result: { interactiveAuth: { ...invariants, cookiesExported: true } } });
  assert.equal((await done.json()).status, 'failed');
});

test('integration: non-super admins, offline PCs, old agents and auto-jobs are refused', async () => {
  const body = { type: INTERACTIVE_AUTH_COMMANDS.start, confirmed: true, payload: { service: 'factchat-mokpo', userWillSignInPersonally: true } };
  const a = setup({ role: 'admin' }); await a.enroll();
  assert.equal((await admin(a.env, '/api/control/devices/dev_1/commands', body)).status, 403);
  // A non-super admin can still end a session.
  assert.equal((await admin(a.env, '/api/control/devices/dev_1/commands', { type: INTERACTIVE_AUTH_COMMANDS.close, payload: {} })).status, 202);
  const b = setup({ capability: false }); await b.enroll();
  assert.equal((await (await admin(b.env, '/api/control/devices/dev_1/commands', body)).json()).code, 'INTERACTIVE_AUTH_AGENT_UPGRADE_REQUIRED');
  const c = setup({ lastSeen: '2026-01-01T00:00:00.000Z' }); await c.enroll();
  assert.equal((await (await admin(c.env, '/api/control/devices/dev_1/commands', body)).json()).code, 'INTERACTIVE_AUTH_DEVICE_OFFLINE');
  const d = setup(); await d.enroll();
  assert.equal((await (await admin(d.env, '/api/control/devices/jobs', { ...body, targetGroup: 'general' })).json()).code, 'INTERACTIVE_AUTH_JOB_FORBIDDEN');
  const e = setup(); await e.enroll();
  const unauth = await handleDeviceControl(new Request('https://ekodi.kr/api/control/devices/dev_1/commands', { method: 'POST', body: JSON.stringify(body) }), e.env);
  assert.equal(unauth.status, 401);
});

test('admin UI exposes the session panel without rendering credential fields', () => {
  const ui = readFileSync(new URL('../device-control-admin.js', import.meta.url), 'utf8');
  assert.match(ui, /function externalAuthPanel\(device\)/);
  assert.match(ui, /computer\.auth_session\.close/);
  assert.doesNotMatch(ui.slice(ui.indexOf('function externalAuthPanel')), /type=["']?password|input\.type\s*=\s*'password'/);
});
