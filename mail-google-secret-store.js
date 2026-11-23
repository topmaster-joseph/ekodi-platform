// EKODI-MAIL-GOOGLE-SECRET-MOBILE-001 (2026-11-12 운영자 요청: PC 없이 모바일로 Gmail 연결 설정)
// Google OAuth 클라이언트 보안 비밀번호를 운영자가 메일 관리 화면에서 붙여넣으면, 기존 메일 토큰과 같은
// MAIL_CREDENTIAL_KEY(AES-GCM)로 암호화해 D1에 보관한다. Worker secret(MAIL_GOOGLE_CLIENT_SECRET)이 있으면 그것이 우선.
// - 평문은 응답·로그·감사기록에 남기지 않는다(감사에는 지문(앞 7자 'GOCSPX-' 제외 해시 일부)만).
// - 저장·삭제는 운영자 계정(OPERATOR_PUSH_EMAILS)만.
import { encryptMailCredential, decryptMailCredential, mailCredentialReady } from './mail-credential-vault.js';

const KEY = 'google_client_secret';
export const GOOGLE_SECRET_PATTERN = /^GOCSPX-[A-Za-z0-9_-]{20,64}$/;
let cache = { at: 0, value: null };
const TTL = 60_000;

export async function ensureMailSettingsSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS mail_platform_settings (
    setting_key TEXT PRIMARY KEY, credential_ciphertext TEXT NOT NULL, credential_iv TEXT NOT NULL,
    fingerprint TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL)`).run();
}

async function fingerprint(secret) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)));
  return [...d.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function storedGoogleSecretStatus(env) {
  if (String(env.MAIL_GOOGLE_CLIENT_SECRET || '').trim()) return { configured: true, source: 'worker-secret' };
  if (!env?.DB) return { configured: false, source: 'none' };
  await ensureMailSettingsSchema(env.DB);
  const row = await env.DB.prepare('SELECT fingerprint,updated_at,updated_by FROM mail_platform_settings WHERE setting_key=?').bind(KEY).first();
  return row ? { configured: true, source: 'stored', fingerprint: row.fingerprint, updatedAt: row.updated_at, updatedBy: row.updated_by } : { configured: false, source: 'none' };
}

export async function saveGoogleSecret(env, secret, actorEmail, now = new Date().toISOString()) {
  const value = String(secret || '').trim();
  if (!GOOGLE_SECRET_PATTERN.test(value)) throw Object.assign(new Error('Google 클라이언트 보안 비밀번호 형식(GOCSPX-…)이 아닙니다.'), { code: 'INVALID_GOOGLE_SECRET', status: 400 });
  if (!mailCredentialReady(env)) throw Object.assign(new Error('메일 암호화 키가 준비되지 않았습니다.'), { code: 'MAIL_CREDENTIAL_KEY_MISSING', status: 503 });
  await ensureMailSettingsSchema(env.DB);
  const sealed = await encryptMailCredential(env, { secret: value });
  const fp = await fingerprint(value);
  await env.DB.prepare(`INSERT INTO mail_platform_settings (setting_key,credential_ciphertext,credential_iv,fingerprint,updated_at,updated_by) VALUES (?,?,?,?,?,?)
    ON CONFLICT(setting_key) DO UPDATE SET credential_ciphertext=excluded.credential_ciphertext,credential_iv=excluded.credential_iv,fingerprint=excluded.fingerprint,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
    .bind(KEY, sealed.ciphertext, sealed.iv, fp, now, String(actorEmail || '')).run();
  cache = { at: 0, value: null };
  return { configured: true, source: 'stored', fingerprint: fp, updatedAt: now };
}

export async function clearGoogleSecret(env) {
  await ensureMailSettingsSchema(env.DB);
  await env.DB.prepare('DELETE FROM mail_platform_settings WHERE setting_key=?').bind(KEY).run();
  cache = { at: 0, value: null };
}

/** Worker secret 이 없으면 암호화 보관된 값을 붙인 env 를 돌려준다(바인딩은 프로토타입으로 그대로). */
export async function withStoredGoogleSecret(env) {
  if (!env || String(env.MAIL_GOOGLE_CLIENT_SECRET || '').trim() || !env.DB || !mailCredentialReady(env)) return env;
  let secret = Date.now() - cache.at < TTL ? cache.value : null;
  if (!secret) {
    try {
      await ensureMailSettingsSchema(env.DB);
      const row = await env.DB.prepare('SELECT credential_ciphertext,credential_iv FROM mail_platform_settings WHERE setting_key=?').bind(KEY).first();
      secret = row ? String((await decryptMailCredential(env, row))?.secret || '') : '';
    } catch { secret = ''; }
    cache = { at: Date.now(), value: secret || null };
  }
  return secret ? Object.create(env, { MAIL_GOOGLE_CLIENT_SECRET: { value: secret, enumerable: false } }) : env;
}

export function resetGoogleSecretCacheForTests() { cache = { at: 0, value: null }; }
