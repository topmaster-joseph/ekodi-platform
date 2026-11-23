// JOURNAL-EDITOR-ALERTS-20261113 — 에코디저널 편집부 알림함.
//
// 알림 원칙(최고관리자 결정, 2026-11-13: "너무 자주 아니게")
// - 최고관리자 화면: 새 건수만 조용히 표시(소리·푸시 없음).
// - 하루 한 번 요약 메일: 오후 6시(KST) 이후 첫 처리 때, 그날 쌓인 독자 편지·투고를 한 통으로. 없으면 보내지 않음.
// - 바로 가는 메일은 두 가지뿐: 원고 파일이 붙은 투고(원고 전달 자체), 에코디언 에세이 게재 24시간 전 알림.
// - 독자 편지 본문은 요약 메일로 보낸 뒤 DB에서 지운다(최소 보관).

export const DIGEST_HOUR_KST = 18;
const KINDS = new Set(['letter', 'submission', 'essay']);
const clean = (v, n = 200) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n);
const kstNow = (ms = Date.now()) => new Date(ms + 9 * 3600_000);
export const kstDate = (ms = Date.now()) => kstNow(ms).toISOString().slice(0, 10);

export async function ensureJournalInbox(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS journal_editor_inbox (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
      sender_name TEXT, sender_email TEXT, detail TEXT, message TEXT, link TEXT, received_at TEXT NOT NULL, seen_at TEXT, digest_at TEXT)`),
    db.prepare('CREATE INDEX IF NOT EXISTS journal_editor_inbox_received ON journal_editor_inbox(received_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS journal_editor_digests (digest_date TEXT PRIMARY KEY, started_at TEXT NOT NULL, sent_count INTEGER)'),
  ]);
}

/** 접수 기록. DB가 없거나 실패하면 false — 호출 쪽은 즉시 메일로 대신한다. */
export async function recordJournalInbox(env, item) {
  if (!env?.DB?.prepare || !KINDS.has(item?.kind)) return false;
  try {
    await ensureJournalInbox(env.DB);
    await env.DB.prepare(`INSERT INTO journal_editor_inbox (id,kind,title,sender_name,sender_email,detail,message,link,received_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), item.kind, clean(item.title, 180) || '(제목 없음)', clean(item.senderName, 80),
      clean(item.senderEmail, 254), clean(item.detail, 300), item.message ? clean(item.message, 4000) : null, clean(item.link, 500),
      new Date(item.at || Date.now()).toISOString()).run();
    return true;
  } catch (error) {
    console.error('journal inbox record failed', String(error?.message || error).slice(0, 120));
    return false;
  }
}

export function digestText(rows, date) {
  const letters = rows.filter((r) => r.kind === 'letter');
  const subs = rows.filter((r) => r.kind === 'submission');
  const lines = [`에코디저널 하루 요약 · ${date}`, '', `독자 편지 ${letters.length}건 · 원고 투고 ${subs.length}건`, ''];
  if (subs.length) {
    lines.push('■ 원고 투고(원고 파일은 접수 때 보낸 메일에 첨부되어 있습니다)');
    for (const r of subs) lines.push(`- ${r.title} — ${r.sender_name || '-'} <${r.sender_email || '-'}> ${r.detail ? `(${r.detail})` : ''}`);
    lines.push('');
  }
  if (letters.length) {
    lines.push('■ 독자 편지(답장은 각 이메일로)');
    for (const r of letters) {
      lines.push('', `· ${r.title}`, `  보낸 이: ${r.sender_name || '-'} <${r.sender_email || '-'}>`, `  글 주소: ${r.link || '-'}`, '', String(r.message || '').split('\n').map((l) => `  ${l}`).join('\n'));
    }
    lines.push('');
  }
  lines.push('관리 화면: https://ekodi.kr/admin (오른쪽 위 「저널 새 소식」)');
  return lines.join('\n');
}

let lastCheck = 0;
/** 라우터 요청 처리 중 waitUntil로 호출. 18시(KST) 이후 하루 한 번만, 쌓인 것이 있을 때만 보낸다. */
export async function maybeSendJournalDigest(env, { now = Date.now(), send } = {}) {
  if (!env?.DB?.prepare || typeof send !== 'function') return { sent: false, reason: 'unavailable' };
  if (now - lastCheck < 5 * 60_000) return { sent: false, reason: 'throttled' };
  lastCheck = now;
  if (kstNow(now).getUTCHours() < DIGEST_HOUR_KST) return { sent: false, reason: 'before_hour' };
  const date = kstDate(now);
  await ensureJournalInbox(env.DB);
  const pending = (await env.DB.prepare("SELECT * FROM journal_editor_inbox WHERE digest_at IS NULL AND kind IN ('letter','submission') ORDER BY received_at LIMIT 200").all()).results || [];
  if (!pending.length) return { sent: false, reason: 'nothing' };
  const claim = await env.DB.prepare('INSERT OR IGNORE INTO journal_editor_digests (digest_date, started_at) VALUES (?, ?)').bind(date, new Date(now).toISOString()).run();
  if (!Number(claim?.meta?.changes || 0)) return { sent: false, reason: 'already_sent_today' };
  try {
    await send({ subject: `[에코디저널] 하루 요약 · 편지 ${pending.filter((r) => r.kind === 'letter').length} · 투고 ${pending.filter((r) => r.kind === 'submission').length}`, body: digestText(pending, date) });
  } catch (error) {
    await env.DB.prepare('DELETE FROM journal_editor_digests WHERE digest_date=?').bind(date).run();   // 다음 처리 때 다시 시도
    throw error;
  }
  const at = new Date(now).toISOString();
  for (const r of pending) await env.DB.prepare('UPDATE journal_editor_inbox SET digest_at=?, message=NULL WHERE id=?').bind(at, r.id).run();
  await env.DB.prepare('UPDATE journal_editor_digests SET sent_count=? WHERE digest_date=?').bind(pending.length, date).run();
  return { sent: true, count: pending.length };
}
export function __resetDigestThrottleForTests() { lastCheck = 0; }

/** 최고관리자: GET 새 소식(건수·최근 목록), POST {action:'seen'} 모두 확인. */
export async function journalInboxSummary(db) {
  await ensureJournalInbox(db);
  const counts = (await db.prepare("SELECT kind, COUNT(*) AS n FROM journal_editor_inbox WHERE seen_at IS NULL GROUP BY kind").all()).results || [];
  const items = (await db.prepare('SELECT id, kind, title, sender_name, detail, link, received_at, seen_at FROM journal_editor_inbox ORDER BY received_at DESC LIMIT 30').all()).results || [];
  const byKind = Object.fromEntries(counts.map((c) => [c.kind, Number(c.n)]));
  return { ok: true, newCount: counts.reduce((sum, c) => sum + Number(c.n), 0), byKind, items };
}
export async function markJournalInboxSeen(db, now = Date.now()) {
  await ensureJournalInbox(db);
  const r = await db.prepare('UPDATE journal_editor_inbox SET seen_at=? WHERE seen_at IS NULL').bind(new Date(now).toISOString()).run();
  return { ok: true, changed: Number(r?.meta?.changes || 0) };
}
