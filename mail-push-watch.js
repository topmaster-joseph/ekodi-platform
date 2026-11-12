// EKODI-MAIL-PUSH-ALL-001 (2026-11-13 운영자 지시: 최고관리자에게 기본적으로 모든 메일에 대해 휴대폰 알림)
// 10분 주기로 EKODI Mail 에 연결된 모든 Gmail 계정의 받은편지함 새 메일을 확인해 운영자(최고관리자) 휴대폰으로 알린다.
// - 처음 보는 계정은 현재 메일을 '본 것'으로만 기록하고 알리지 않는다(과거 메일 폭탄 방지).
// - 알림에는 계정·보낸이·제목만. 본문은 넣지 않는다. 계정당 1회 실행 최대 5건, 나머지는 "외 N건"으로 묶음.
// - 끄기: OPERATOR_MAIL_PUSH_ENABLED="false".
import { googleAccessForAccount } from './mail-control.js';
import { hasGoogleReadScope, listGoogleMailMessages } from './mail-google-adapter.js';
import { sendOperatorPush, operatorPushReady } from './operator-push.js';

const SEEN_LIMIT = 100;
const PER_RUN = 5;

export async function ensureMailPushSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS mail_push_cursor (account_id INTEGER PRIMARY KEY, seen_ids TEXT NOT NULL DEFAULT '[]', checked_at TEXT, last_error TEXT NOT NULL DEFAULT '')`).run();
}

export function senderName(from) {
  const s = String(from || '').trim();
  const m = s.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m ? m[1] : s.replace(/<.*?>/g, '')).trim().slice(0, 40) || '알 수 없음';
}

/** 새로 들어온 메일만 골라낸다(처음이면 기록만). */
export function pickNew(messages, seenIds, firstRun) {
  const seen = new Set(seenIds);
  const fresh = firstRun ? [] : messages.filter((m) => m?.id && !seen.has(m.id));
  const nextSeen = [...new Set([...messages.map((m) => m.id).filter(Boolean), ...seenIds])].slice(0, SEEN_LIMIT);
  return { fresh, nextSeen };
}

export function buildMailPush(account, fresh) {
  const label = account.display_name || account.email_address;
  const shown = fresh.slice(0, PER_RUN);
  const more = fresh.length - shown.length;
  const first = shown[0];
  return {
    title: fresh.length === 1 ? `새 메일 · ${label}` : `새 메일 ${fresh.length}건 · ${label}`,
    body: shown.map((m) => `${senderName(m.from)} — ${String(m.subject || '(제목 없음)').slice(0, 60)}`).join('\n') + (more > 0 ? `\n외 ${more}건` : ''),
    targetPath: `/?account=${encodeURIComponent(account.id)}${first?.id && fresh.length === 1 ? `&message=${encodeURIComponent(first.id)}` : ''}`,
  };
}

export async function runMailPushWatch(env, deps = {}) {
  if (String(env.OPERATOR_MAIL_PUSH_ENABLED ?? 'true').toLowerCase() === 'false') return { skipped: 'disabled' };
  if (!env?.DB || !operatorPushReady(env)) return { skipped: 'not-ready' };
  await ensureMailPushSchema(env.DB);
  const accounts = (await env.DB.prepare(`SELECT a.* FROM mail_accounts a JOIN mail_credentials c ON c.account_id=a.id
    WHERE a.provider='gmail' AND a.connection_status='connected' AND a.enabled=1 ORDER BY a.id LIMIT 20`).all().catch(() => ({ results: [] }))).results || [];
  const out = { accounts: accounts.length, notified: 0, errors: 0 };
  for (const account of accounts) {
    const cursor = await env.DB.prepare('SELECT seen_ids FROM mail_push_cursor WHERE account_id=?').bind(account.id).first();
    const now = new Date().toISOString();
    try {
      const access = await (deps.googleAccess || googleAccessForAccount)(env, env.DB, account);
      if (!(deps.hasRead || hasGoogleReadScope)(access.scopes)) continue;
      const { messages } = await (deps.list || listGoogleMailMessages)(access.accessToken, { maxResults: 20 });
      const seenIds = cursor ? JSON.parse(cursor.seen_ids || '[]') : [];
      const { fresh, nextSeen } = pickNew(messages || [], seenIds, !cursor);
      if (fresh.length) {
        const r = await (deps.push || sendOperatorPush)(env, buildMailPush(account, fresh));
        if (r?.ok) out.notified += fresh.length;
      }
      await env.DB.prepare(`INSERT INTO mail_push_cursor (account_id,seen_ids,checked_at,last_error) VALUES (?,?,?,'')
        ON CONFLICT(account_id) DO UPDATE SET seen_ids=excluded.seen_ids,checked_at=excluded.checked_at,last_error=''`).bind(account.id, JSON.stringify(nextSeen), now).run();
    } catch (error) {
      out.errors += 1;
      // 커서가 없을 때는 만들지 않는다: 빈 커서가 생기면 다음 성공 실행에서 기존 메일 전체를 '새 메일'로 알리게 된다.
      if (cursor) await env.DB.prepare('UPDATE mail_push_cursor SET checked_at=?,last_error=? WHERE account_id=?').bind(now, String(error?.code || 'CHECK_FAILED').slice(0, 60), account.id).run().catch(() => {});
    }
  }
  return out;
}
