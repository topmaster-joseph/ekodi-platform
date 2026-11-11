// EKODI-OPERATOR-PUSH-001 (2026-11-11): 운영자 전용 웹 푸시 채널.
// Gmail OAuth 비밀키 없이도 운영 알림이 휴대폰에 오도록, 이미 있는 에코디 웹 푸시(VAPID)를 쓴다.
// - 등록은 로그인한 운영자 계정(OPERATOR_PUSH_EMAILS)만 가능. 공개 주제(topic) 구독과 분리된 비공개 채널.
// - 공개 웹 푸시 전체 스위치(NOTIFICATIONS_SEND_ENABLED)는 건드리지 않는다. VAPID 키만 있으면 동작.
// - 알림 내용에 구매자 개인정보를 넣지 않는다(OperatorNotifier 가 이미 차단).
import { approvedPushEndpoint, sendWebPush } from './notification-webpush.js';

const DEFAULT_OPERATOR_EMAILS = 'topmaster.joseph@gmail.com,joseph@ekodi.kr';

export function operatorPushEmails(env = {}) {
  return String(env.OPERATOR_PUSH_EMAILS || DEFAULT_OPERATOR_EMAILS).split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}

export function operatorPushReady(env = {}) {
  try {
    const jwk = JSON.parse(String(env.NOTIFICATION_VAPID_PRIVATE_JWK || '{}'));
    return Boolean(String(env.NOTIFICATION_VAPID_PUBLIC_KEY || '')) && jwk.kty === 'EC' && jwk.crv === 'P-256';
  } catch { return false; }
}

export async function ensureOperatorPushSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS operator_push_devices (
    id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth_secret TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_sent_at TEXT, last_status INTEGER, disabled_at TEXT)`).run();
}

export function validOperatorSubscription(sub) {
  return Boolean(sub && typeof sub === 'object' && approvedPushEndpoint(String(sub.endpoint || ''))
    && /^[-_A-Za-z0-9]{80,100}$/.test(String(sub.keys?.p256dh || '')) && /^[-_A-Za-z0-9]{16,32}$/.test(String(sub.keys?.auth || '')));
}

export async function registerOperatorDevice(db, email, sub, now = new Date().toISOString()) {
  await ensureOperatorPushSchema(db);
  await db.prepare(`INSERT INTO operator_push_devices (id,owner_email,endpoint,p256dh,auth_secret,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET owner_email=excluded.owner_email,p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,updated_at=excluded.updated_at,disabled_at=NULL`)
    .bind(crypto.randomUUID(), email, sub.endpoint, sub.keys.p256dh, sub.keys.auth, now, now).run();
}

export async function operatorDeviceCount(db, email) {
  await ensureOperatorPushSchema(db);
  const row = await db.prepare('SELECT COUNT(*) n FROM operator_push_devices WHERE owner_email=? AND disabled_at IS NULL').bind(email).first();
  return Number(row?.n || 0);
}

/** 모든 운영자 기기로 발송. 만료(404/410) 기기는 비활성화. */
export async function sendOperatorPush(env, { title, body, targetPath }, deps = {}) {
  if (!operatorPushReady(env)) return { ok: false, code: 'OPERATOR_PUSH_NOT_CONFIGURED', sent: 0 };
  if (!env?.DB) return { ok: false, code: 'DB_UNAVAILABLE', sent: 0 };
  await ensureOperatorPushSchema(env.DB);
  const rows = (await env.DB.prepare('SELECT * FROM operator_push_devices WHERE disabled_at IS NULL').all()).results || [];
  if (!rows.length) return { ok: false, code: 'OPERATOR_PUSH_NO_DEVICE', sent: 0 };
  const send = deps.sendWebPush || sendWebPush;
  let sent = 0;
  const now = new Date().toISOString();
  for (const row of rows) {
    let status = 0;
    try { const r = await send(row, { title: String(title).slice(0, 100), body: String(body).slice(0, 240), targetPath, service: 'operator' }, env, deps.transport); status = r.status; if (r.ok) sent += 1; } catch { status = -1; }
    await env.DB.prepare(`UPDATE operator_push_devices SET last_sent_at=?, last_status=?${status === 404 || status === 410 ? ', disabled_at=?' : ''} WHERE id=?`)
      .bind(...(status === 404 || status === 410 ? [now, status, now, row.id] : [now, status, row.id])).run();
  }
  return sent ? { ok: true, sent } : { ok: false, code: 'OPERATOR_PUSH_FAILED', sent: 0 };
}
