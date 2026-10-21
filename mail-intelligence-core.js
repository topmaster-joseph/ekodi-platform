const DEFAULT_QUERY = 'newer_than:2d -in:spam -in:trash';
const GITHUB_SENDER = /notifications@github\.com|github-actions\[bot\]/i;
const SYSTEM_WORDS = /(github|deploy|deployment|production|build|dns|cloudflare|worker|pages|api gateway|배포|운영|서버|장애|오류|실패)/i;
const SECURITY_WORDS = /(security|password|recovery|unauthorized|suspicious|2fa|mfa|login|account|보안|비밀번호|계정\s*복구|의심|로그인|인증|침해)/i;
const BUSINESS_WORDS = /(rfq|quote|quotation|order|invoice|payment|customer|client|contract|delivery|purchase|견적|주문|결제|세금|계산서|고객|거래처|계약|납기|배송|구매)/i;
const MINISTRY_WORDS = /(church|seminary|course|syllabus|classroom|academic|ministry|교회|선교|신학교|강의|수업|클래스룸|학사|목회)/i;
const URGENT_WORDS = /(urgent|immediate|critical|action required|deadline|suspend|suspended|blocked|failed|failure|breach|긴급|즉시|조치\s*필요|마감|정지|차단|실패|침해)/i;
const ACTION_WORDS = /(please|need to|action required|confirm|verify|reply|respond|submit|complete|renew|pay|확인\s*부탁|확인해|회신|답변|제출|완료|갱신|납부|결제|조치)/i;
const SUCCESS_WORDS = /(production verified|success|successful|completed|passed|정상\s*완료|배포\s*완료|검증\s*완료)/i;

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clip(value = '', max = 320) {
  const text = clean(value);
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function normalizeSubject(subject = '') {
  return clean(subject)
    .replace(/^((re|fw|fwd):\s*)+/i, '')
    .replace(/\b[0-9a-f]{7,40}\b/gi, '<commit>')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function header(headers, name) {
  const match = (headers || []).find(item => String(item?.name || '').toLowerCase() === name.toLowerCase());
  return clean(match?.value || '');
}

function base64UrlDecode(data = '') {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bytes = Uint8Array.from(atob(normalized), c => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal:false }).decode(bytes);
  } catch {
    return '';
  }
}

function stripHtml(html = '') {
  return clean(String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'"));
}

function bodyTextFromPart(part) {
  if (!part) return '';
  const mime = String(part.mimeType || '').toLowerCase();
  if (part.body?.data && (mime === 'text/plain' || mime === 'text/html')) {
    const decoded = base64UrlDecode(part.body.data);
    return mime === 'text/html' ? stripHtml(decoded) : clean(decoded);
  }
  const children = Array.isArray(part.parts) ? part.parts.map(bodyTextFromPart).filter(Boolean) : [];
  const plain = children.find(Boolean);
  return plain || '';
}

export function parseGmailMessage(message) {
  const headers = message?.payload?.headers || [];
  const body = bodyTextFromPart(message?.payload);
  return {
    gmailId: clean(message?.id),
    threadId: clean(message?.threadId),
    historyId: clean(message?.historyId),
    internalDate: Number(message?.internalDate || 0),
    receivedAt: Number(message?.internalDate || 0) ? new Date(Number(message.internalDate)).toISOString() : null,
    from: header(headers, 'From'),
    to: header(headers, 'To'),
    cc: header(headers, 'Cc'),
    subject: header(headers, 'Subject') || '(제목 없음)',
    messageId: header(headers, 'Message-ID'),
    snippet: clip(message?.snippet || '', 600),
    body: clip(body || message?.snippet || '', 6000),
  };
}

function ekodiAddresses(env = {}) {
  return String(env.MAIL_EKODI_ADDRESSES || 'admin@ekodibiz.kr,joseph@ekodibiz.kr,topmaster.joseph@gmail.com')
    .split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
}

export function isEkodiRelated(mail, env = {}) {
  const haystack = `${mail.from} ${mail.to} ${mail.cc} ${mail.subject} ${mail.snippet} ${mail.body}`.toLowerCase();
  if (/(ekodi|ekodibiz\.kr|topmaster-joseph\/ekodi-platform)/i.test(haystack)) return true;
  if (ekodiAddresses(env).some(address => haystack.includes(address))) return true;
  if (/(cloudflare|google workspace|github)/i.test(haystack) && /(ekodi|ekodibiz)/i.test(haystack)) return true;
  return false;
}

function classifyCategory(text) {
  if (SECURITY_WORDS.test(text)) return 'finance_security';
  if (BUSINESS_WORDS.test(text)) return 'business';
  if (MINISTRY_WORDS.test(text)) return 'ministry';
  if (SYSTEM_WORDS.test(text)) return 'system';
  return 'people_org';
}

function derivePriority(text, category) {
  if (SECURITY_WORDS.test(text) && URGENT_WORDS.test(text)) return 0;
  if (URGENT_WORDS.test(text)) return 1;
  if (category === 'finance_security' || ACTION_WORDS.test(text)) return 1;
  if (category === 'business' || category === 'system' || category === 'ministry') return 2;
  return 3;
}

function deriveAction(text, category) {
  if (!ACTION_WORDS.test(text) && !URGENT_WORDS.test(text)) return { required:false, text:'' };
  if (category === 'finance_security') return { required:true, text:'계정·보안 또는 결제 상태를 확인하고 필요한 조치를 처리하세요.' };
  if (category === 'business') return { required:true, text:'거래·고객 요청의 조건과 기한을 확인한 뒤 회신 또는 처리하세요.' };
  if (category === 'system') return { required:true, text:'실서비스 영향 여부를 확인하고 장애·배포 상태를 조치하세요.' };
  if (category === 'ministry') return { required:true, text:'기관·사역 요청의 일정과 제출·회신 필요 여부를 확인하세요.' };
  return { required:true, text:'메일의 요청사항과 기한을 확인하고 필요한 답변 또는 처리를 진행하세요.' };
}

function deriveSuppression(mail, text) {
  if (!GITHUB_SENDER.test(mail.from)) return { suppressed:false, reason:'' };
  if (SUCCESS_WORDS.test(text)) return { suppressed:true, reason:'github_success_noise' };
  if (!URGENT_WORDS.test(text) && !/production not verified|failure|failed|error/i.test(text)) {
    return { suppressed:true, reason:'github_general_noise' };
  }
  return { suppressed:false, reason:'' };
}

function statusSignature(mail, text) {
  let state = 'normal';
  if (/production not verified/i.test(text)) state = 'production_not_verified';
  else if (/production verified/i.test(text)) state = 'production_verified';
  else if (/failed|failure|실패/i.test(text)) state = 'failed';
  else if (/security|보안|breach|침해/i.test(text)) state = 'security';
  const issue = mail.subject.match(/#(\d+)/)?.[1] || '';
  return `${GITHUB_SENDER.test(mail.from) ? 'github' : 'mail'}:${issue || normalizeSubject(mail.subject)}:${state}`;
}

export function analyzeMail(mail, env = {}) {
  const text = clean(`${mail.subject} ${mail.snippet} ${mail.body}`);
  const category = classifyCategory(text);
  const priority = derivePriority(text, category);
  const action = deriveAction(text, category);
  const suppression = deriveSuppression(mail, text);
  const subjectSummary = clip(mail.subject, 120);
  const detail = clip(mail.body || mail.snippet, 260);
  return {
    related: isEkodiRelated(mail, env),
    category,
    priority,
    priorityLabel: ['긴급','중요','관찰','참고'][priority] || '참고',
    actionRequired: action.required,
    actionText: action.text,
    summary: detail ? `${subjectSummary} · ${detail}` : subjectSummary,
    suppressed: suppression.suppressed,
    suppressionReason: suppression.reason,
    statusSignature: statusSignature(mail, text),
    dedupeKey: GITHUB_SENDER.test(mail.from) ? statusSignature(mail, text) : `gmail:${mail.gmailId}`,
  };
}

export function shouldNotify(analysis) {
  if (!analysis?.related || analysis.suppressed) return false;
  return analysis.priority <= 1 || analysis.actionRequired;
}

function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function accessToken(env) {
  const required = ['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN'];
  const missing = required.filter(key => !String(env[key] || '').trim());
  if (missing.length) throw new Error(`GMAIL_NOT_CONNECTED:${missing.join(',')}`);
  const body = new URLSearchParams({
    client_id: env.GMAIL_CLIENT_ID,
    client_secret: env.GMAIL_CLIENT_SECRET,
    refresh_token: env.GMAIL_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error(`GMAIL_TOKEN_ERROR:${response.status}:${payload.error || 'unknown'}`);
  return payload.access_token;
}

async function gmailFetch(token, path, init = {}) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers:{ authorization:`Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`GMAIL_API_ERROR:${response.status}:${clip(await response.text(), 300)}`);
  return response.status === 204 ? null : response.json();
}

async function listMessages(token, env) {
  const query = String(env.MAIL_GMAIL_QUERY || DEFAULT_QUERY);
  const max = Math.max(1, Math.min(50, Number(env.MAIL_BATCH_SIZE || 30)));
  const data = await gmailFetch(token, `/messages?q=${encodeURIComponent(query)}&maxResults=${max}`);
  return Array.isArray(data?.messages) ? data.messages : [];
}

async function getMessage(token, id) {
  return gmailFetch(token, `/messages/${encodeURIComponent(id)}?format=full`);
}

async function sendMail(token, to, subject, body) {
  const raw = [
    `To: ${to}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    '',
    body,
  ].join('\r\n');
  return gmailFetch(token, '/messages/send', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({ raw:base64UrlEncode(raw) }),
  });
}

async function stateGet(env, key) {
  return env.DB?.prepare('SELECT value, updated_at FROM mail_intelligence_state WHERE key = ?').bind(key).first() || null;
}

async function stateSet(env, key, value) {
  if (!env.DB) return;
  await env.DB.prepare(`INSERT INTO mail_intelligence_state (key,value,updated_at) VALUES (?,?,datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`).bind(key, String(value)).run();
}

async function upsertMail(env, mail, analysis) {
  if (!env.DB) return;
  await env.DB.prepare(`INSERT INTO mail_intelligence_messages
    (gmail_id,thread_id,received_at,sender,recipients_json,subject,snippet,summary,category,priority,action_required,action_text,suppressed,suppression_reason,status_signature,dedupe_key,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))
    ON CONFLICT(gmail_id) DO UPDATE SET summary=excluded.summary,category=excluded.category,priority=excluded.priority,
      action_required=excluded.action_required,action_text=excluded.action_text,suppressed=excluded.suppressed,
      suppression_reason=excluded.suppression_reason,status_signature=excluded.status_signature,dedupe_key=excluded.dedupe_key,updated_at=datetime('now')`)
    .bind(mail.gmailId, mail.threadId, mail.receivedAt, mail.from, JSON.stringify({to:mail.to,cc:mail.cc}), mail.subject, mail.snippet,
      analysis.summary, analysis.category, analysis.priority, analysis.actionRequired ? 1 : 0, analysis.actionText,
      analysis.suppressed ? 1 : 0, analysis.suppressionReason, analysis.statusSignature, analysis.dedupeKey).run();
}

async function notificationAllowed(env, mail, analysis) {
  if (!shouldNotify(analysis)) return false;
  if (!env.DB) return true;
  const row = await env.DB.prepare('SELECT notified_at FROM mail_intelligence_messages WHERE gmail_id = ?').bind(mail.gmailId).first();
  if (row?.notified_at) return false;
  if (analysis.dedupeKey.startsWith('github:')) {
    const state = await stateGet(env, `notify:${analysis.dedupeKey}`);
    if (state?.updated_at) {
      const age = Date.now() - Date.parse(state.updated_at);
      if (Number.isFinite(age) && age < 6 * 60 * 60 * 1000) return false;
    }
  }
  return true;
}

async function markNotified(env, mail, analysis) {
  if (!env.DB) return;
  await env.DB.prepare("UPDATE mail_intelligence_messages SET notified_at=datetime('now'), updated_at=datetime('now') WHERE gmail_id = ?").bind(mail.gmailId).run();
  await stateSet(env, `notify:${analysis.dedupeKey}`, mail.gmailId);
}

function alertBody(mail, analysis) {
  return [
    'EKODI Mail Intelligence',
    '',
    `중요도: ${analysis.priorityLabel}`,
    `분류: ${analysis.category}`,
    `발신: ${mail.from || '-'}`,
    `제목: ${mail.subject}`,
    `수신시각: ${mail.receivedAt || '-'}`,
    '',
    `요약: ${analysis.summary}`,
    analysis.actionRequired ? `필요 조치: ${analysis.actionText}` : '필요 조치: 없음',
    '',
    '반복 GitHub 정상 로그는 자동으로 묶어 억제됩니다.',
  ].join('\n');
}

function kstParts(now = new Date()) {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0,10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

async function maybeDailyDigest(env, token, now = new Date()) {
  if (!env.DB || String(env.MAIL_DAILY_DIGEST || 'true').toLowerCase() === 'false') return { sent:false };
  const kst = kstParts(now);
  const digestHour = Number(env.MAIL_DIGEST_HOUR_KST || 8);
  if (kst.hour !== digestHour) return { sent:false };
  const state = await stateGet(env, 'daily_digest_date');
  if (state?.value === kst.date) return { sent:false };
  const rows = await env.DB.prepare(`SELECT priority,category,sender,subject,summary,action_required,action_text,received_at
    FROM mail_intelligence_messages WHERE datetime(received_at) >= datetime('now','-1 day') AND suppressed=0 ORDER BY priority ASC, received_at DESC LIMIT 25`).all();
  const items = rows.results || [];
  if (!items.length) { await stateSet(env, 'daily_digest_date', kst.date); return { sent:false, empty:true }; }
  const lines = items.map((row, i) => `${i+1}. [${['긴급','중요','관찰','참고'][Number(row.priority)] || '참고'}] ${row.subject}\n   ${clip(row.summary, 180)}${row.action_required ? `\n   조치: ${row.action_text}` : ''}`);
  const to = String(env.MAIL_ALERT_TO || env.ADMIN_EMAIL || '').trim();
  if (!to) return { sent:false, reason:'missing_alert_recipient' };
  await sendMail(token, to, `[에코디 메일] ${kst.date} 운영 요약`, `지난 24시간 에코디 관련 메일 요약입니다.\n\n${lines.join('\n\n')}`);
  await stateSet(env, 'daily_digest_date', kst.date);
  return { sent:true, count:items.length };
}

export async function runMailIntelligence(env, options = {}) {
  const startedAt = new Date().toISOString();
  if (!env.DB) return { ok:false, status:'database_unavailable', startedAt };
  let token;
  try { token = await accessToken(env); }
  catch (error) {
    const message = String(error?.message || error);
    await stateSet(env, 'last_run', JSON.stringify({ status:'waiting_connection', message, at:startedAt }));
    return { ok:false, status:'waiting_connection', message, startedAt };
  }

  const ids = await listMessages(token, env);
  let processed = 0, relevant = 0, notified = 0, suppressed = 0;
  for (const item of ids) {
    if (!item?.id) continue;
    const exists = await env.DB.prepare('SELECT gmail_id, notified_at FROM mail_intelligence_messages WHERE gmail_id = ?').bind(item.id).first();
    if (exists?.gmail_id && !options.force) continue;
    const mail = parseGmailMessage(await getMessage(token, item.id));
    const analysis = analyzeMail(mail, env);
    processed += 1;
    if (!analysis.related) continue;
    relevant += 1;
    if (analysis.suppressed) suppressed += 1;
    await upsertMail(env, mail, analysis);
    if (await notificationAllowed(env, mail, analysis)) {
      const to = String(env.MAIL_ALERT_TO || env.ADMIN_EMAIL || '').trim();
      if (to) {
        await sendMail(token, to, `[에코디 메일][${analysis.priorityLabel}] ${clip(mail.subject, 90)}`, alertBody(mail, analysis));
        await markNotified(env, mail, analysis);
        notified += 1;
      }
    }
  }
  const digest = await maybeDailyDigest(env, token, options.now || new Date());
  const result = { ok:true, status:'active', startedAt, finishedAt:new Date().toISOString(), scanned:ids.length, processed, relevant, notified, suppressed, digest };
  await stateSet(env, 'last_run', JSON.stringify(result));
  return result;
}

export async function mailSummary(env, limit = 25) {
  if (!env.DB) return { status:'database_unavailable', messages:[] };
  const state = await stateGet(env, 'last_run');
  const rows = await env.DB.prepare(`SELECT gmail_id,thread_id,received_at,sender,subject,summary,category,priority,action_required,action_text,suppressed,suppression_reason,notified_at,created_at
    FROM mail_intelligence_messages ORDER BY received_at DESC LIMIT ?`).bind(Math.max(1, Math.min(100, Number(limit) || 25))).all();
  let lastRun = null;
  try { lastRun = state?.value ? JSON.parse(state.value) : null; } catch { lastRun = null; }
  return {
    schemaVersion:1,
    connection: String(env.GMAIL_REFRESH_TOKEN || '') ? 'configured' : 'waiting_connection',
    lastRun,
    messages:(rows.results || []).map(row => ({
      gmailId:row.gmail_id, threadId:row.thread_id, receivedAt:row.received_at, sender:row.sender, subject:row.subject,
      summary:row.summary, category:row.category, priority:Number(row.priority), actionRequired:Boolean(row.action_required),
      actionText:row.action_text || '', suppressed:Boolean(row.suppressed), suppressionReason:row.suppression_reason || '', notifiedAt:row.notified_at,
    })),
  };
}
