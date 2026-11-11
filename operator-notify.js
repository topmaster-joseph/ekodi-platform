// EKODI-OPERATOR-NOTIFY-001 (2026-11-11 운영자 지시)
// 내부 자동 운영(주문·발주·결제 오류 등)의 진행상황을 운영자에게 메시지(Gmail)로 알린다.
// - 공개 인터넷 경로가 없다. Mall 등 내부 Worker 가 서비스 바인딩의 named entrypoint(RPC)로만 호출한다.
// - 발신 계정은 EKODI Mail 에 Gmail 발송 권한으로 연결된 계정만 쓴다. 연결 전에는 보내지 않고 이유를 돌려준다.
// - 구매자 개인정보는 받지도 보내지도 않는다(호출 측이 넣으면 차단한다).
import { WorkerEntrypoint } from 'cloudflare:workers';
import { googleAccessForAccount } from './mail-control.js';
import { hasGoogleSendScope, sendGoogleMailMessage } from './mail-google-adapter.js';
import { sendOperatorPush } from './operator-push.js';

export const OPERATOR_NOTIFY_SOURCES = Object.freeze(['mall']);
const DEFAULT_SENDER = 'ekodibiz@gmail.com';
const DEFAULT_RECIPIENTS = 'topmaster.joseph@gmail.com';
const PII_PATTERN = /(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4})|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/;

const clean = (value, max = 300) => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (value) => String(value || '').split(',').map((v) => v.trim().toLowerCase()).filter((v) => /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(v));

export function operatorNotifyConfig(env = {}) {
  return {
    sender: (list(env.OPERATOR_NOTIFY_SENDER)[0]) || DEFAULT_SENDER,
    recipients: list(env.OPERATOR_NOTIFY_RECIPIENTS).length ? list(env.OPERATOR_NOTIFY_RECIPIENTS) : list(DEFAULT_RECIPIENTS),
    enabled: String(env.OPERATOR_NOTIFY_ENABLED ?? 'true').toLowerCase() !== 'false'
  };
}

/** 입력 검증·정리. 개인정보(전화번호·이메일)가 섞이면 거부한다. */
export function normalizeNotice(input = {}) {
  const source = clean(input.source, 20).toLowerCase();
  if (!OPERATOR_NOTIFY_SOURCES.includes(source)) return { error: 'SOURCE_NOT_ALLOWED' };
  const subject = clean(input.subject, 120);
  const lines = (Array.isArray(input.lines) ? input.lines : []).slice(0, 30).map((line) => clean(line, 300)).filter(Boolean);
  const link = /^https:\/\/ekodi\.kr\//.test(String(input.link || '')) ? clean(input.link, 300) : '';
  if (!subject || !lines.length) return { error: 'EMPTY_NOTICE' };
  if ([subject, ...lines].some((v) => PII_PATTERN.test(v))) return { error: 'PII_REJECTED' };
  return { source, subject, lines, link };
}

/** RFC 2047 encoded-word: 한글 제목이 메일 앱에서 깨지지 않게 한다. */
export function encodeHeaderWord(text) {
  const bytes = new TextEncoder().encode(String(text));
  let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

export function renderNotice(notice) {
  const body = [...notice.lines.map((line) => `• ${line}`)];
  if (notice.link) body.push('', `바로가기: ${notice.link}`);
  body.push('', '— 에코디 자동 운영 알림 (구매자 개인정보는 위 링크에서 로그인 후 확인)');
  return { subject: encodeHeaderWord(`[에코디] ${notice.subject}`), body: body.join('\n') };
}

/** Gmail 발송 채널. deps 로 DB 조회·토큰·발송을 바꿔 끼울 수 있다(테스트). */
export async function sendOperatorMail(env, notice, deps = {}) {
  const config = operatorNotifyConfig(env);
  if (!env?.DB) return { ok: false, code: 'DB_UNAVAILABLE' };
  const account = await env.DB.prepare(`SELECT * FROM mail_accounts WHERE provider='gmail' AND lower(email_address)=? AND connection_status='connected' AND enabled=1 ORDER BY updated_at DESC LIMIT 1`)
    .bind(config.sender).first().catch(() => null);
  if (!account) return { ok: false, code: 'SENDER_NOT_CONNECTED', sender: config.sender };
  const access = await (deps.googleAccess || googleAccessForAccount)(env, env.DB, account).catch((error) => ({ error }));
  if (access.error) return { ok: false, code: clean(access.error.code || 'SENDER_AUTH_FAILED', 60) };
  if (!(deps.hasSendScope || hasGoogleSendScope)(access.scopes)) return { ok: false, code: 'SENDER_SEND_SCOPE_REQUIRED', sender: config.sender };
  const { subject, body } = renderNotice(notice);
  const sent = await (deps.send || sendGoogleMailMessage)(access.accessToken, { to: config.recipients.join(','), cc: '', bcc: '', subject, body }).catch((error) => ({ error }));
  if (sent?.error) return { ok: false, code: clean(sent.error.code || 'SEND_FAILED', 60) };
  return { ok: true, id: sent?.id || null };
}

const WAITING = new Set(['SENDER_NOT_CONNECTED', 'SENDER_SEND_SCOPE_REQUIRED', 'MAIL_GOOGLE_NOT_CONFIGURED', 'OPERATOR_PUSH_NO_DEVICE', 'OPERATOR_PUSH_NOT_CONFIGURED']);

/** 실제 발송: 운영자 웹 푸시(휴대폰) + Gmail. 하나라도 성공하면 ok. */
export async function sendOperatorNotice(env, input, deps = {}) {
  const config = operatorNotifyConfig(env);
  if (!config.enabled) return { ok: false, code: 'NOTIFY_DISABLED' };
  const notice = normalizeNotice(input);
  if (notice.error) return { ok: false, code: notice.error };
  const targetPath = notice.link ? new URL(notice.link).pathname : '/';
  const push = await (deps.push || sendOperatorPush)(env, { title: `[에코디] ${notice.subject}`, body: notice.lines.slice(0, 3).join(' · '), targetPath }, deps).catch(() => ({ ok: false, code: 'OPERATOR_PUSH_FAILED' }));
  const mail = await sendOperatorMail(env, notice, deps).catch(() => ({ ok: false, code: 'SEND_FAILED' }));
  if (push.ok || mail.ok) return { ok: true, push: Boolean(push.ok), mail: Boolean(mail.ok), id: mail.id || null };
  if (WAITING.has(push.code) && WAITING.has(mail.code)) return { ok: false, code: 'NO_OPERATOR_CHANNEL', push: push.code, mail: mail.code };
  return { ok: false, code: WAITING.has(mail.code) ? push.code : mail.code, push: push.code, mail: mail.code };
}

/** 서비스 바인딩 전용 RPC. 공개 fetch 경로는 없다. */
export class OperatorNotifier extends WorkerEntrypoint {
  async fetch() { return new Response('Not found', { status: 404 }); }
  async notify(input = {}) { return sendOperatorNotice(this.env, input); }
  async status() {
    const config = operatorNotifyConfig(this.env);
    const row = this.env?.DB ? await this.env.DB.prepare(`SELECT connection_status FROM mail_accounts WHERE provider='gmail' AND lower(email_address)=? ORDER BY updated_at DESC LIMIT 1`).bind(config.sender).first().catch(() => null) : null;
    return { enabled: config.enabled, sender: config.sender, senderStatus: row?.connection_status || 'not_registered', recipientCount: config.recipients.length };
  }
}
