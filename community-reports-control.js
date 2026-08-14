import authWorker from './auth-worker.js';

const PREFIX = '/api/community/admin/reports';
const VALID_STATUS = new Set(['DRAFT', 'AI_DRAFT', 'REVIEW', 'APPROVED', 'SENT']);
const REPORT_MONTHS = new Set([2, 4, 6, 8, 10, 12]);

function clean(value, max = 12000) { return String(value ?? '').trim().slice(0, max); }
function json(data, status = 200, request, env) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  const origin = request?.headers.get('origin') || '';
  const allowed = String(env?.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
  return new Response(JSON.stringify(data), { status, headers });
}
async function readBody(request) { try { return await request.json(); } catch { return null; } }
async function session(request, env) {
  const url = new URL(request.url); url.pathname = '/api/session'; url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  return response.ok ? { response, data: await response.clone().json() } : { response };
}
async function adminId(env, email) { return (await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first())?.id || null; }
async function audit(env, email, action, resource, detail = '') {
  const id = await adminId(env, email);
  await env.DB.prepare('INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, action, resource, clean(detail, 500), new Date().toISOString()).run();
}
function yyyyMmDd(year, month, day) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function lastDay(year, month) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function addMonths(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
function periodFor(year, reportMonth) {
  const activityStart = addMonths(year, reportMonth, -1);
  const planStart = addMonths(year, reportMonth, 1);
  const planEnd = addMonths(year, reportMonth, 2);
  return {
    id: `${year}-${String(reportMonth).padStart(2, '0')}`,
    activityFrom: yyyyMmDd(activityStart.year, activityStart.month, 1),
    activityTo: yyyyMmDd(year, reportMonth, lastDay(year, reportMonth)),
    planFrom: yyyyMmDd(planStart.year, planStart.month, 1),
    planTo: yyyyMmDd(planEnd.year, planEnd.month, lastDay(planEnd.year, planEnd.month)),
  };
}
function nextReportPeriod(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  let year = kst.getUTCFullYear(); let month = kst.getUTCMonth() + 1;
  if (month % 2 === 1) month += 1;
  if (month > 12) { month = 2; year += 1; }
  return { year, month, ...periodFor(year, month) };
}
async function ensureReport(env, year, month) {
  if (!REPORT_MONTHS.has(month)) throw new Error('사역보고 월은 2·4·6·8·10·12월이어야 합니다.');
  const p = periodFor(year, month);
  const title = `EKODI Community ${year}년 ${month}월 사역보고`;
  await env.DB.prepare(`INSERT OR IGNORE INTO community_ministry_reports
    (id, report_year, report_month, activity_from, activity_to, plan_from, plan_to, title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(p.id, year, month, p.activityFrom, p.activityTo, p.planFrom, p.planTo, title).run();
  return p.id;
}
function reportRow(row) {
  return {
    id: row.id, year: Number(row.report_year), month: Number(row.report_month), activityFrom: row.activity_from, activityTo: row.activity_to,
    planFrom: row.plan_from, planTo: row.plan_to, title: row.title, activities: row.activities_text, outcomes: row.outcomes_text,
    evaluation: row.evaluation_text, plans: row.plans_text, requests: row.requests_text, prayers: row.prayers_text, sourceNotes: row.source_notes,
    body: row.body_text, aiMode: row.ai_mode, status: row.status, approvedAt: row.approved_at, sentAt: row.sent_at,
    gmailMessageId: row.gmail_message_id, sendError: row.send_error, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
async function settings(env) {
  const row = await env.DB.prepare('SELECT * FROM community_report_settings WHERE id = 1').first();
  return {
    recipientEmail: row?.recipient_email || '', ccEmail: row?.cc_email || '', senderName: row?.sender_name || 'EKODI Community',
    dueDay: Number(row?.due_day || 0), autoSendAfterApproval: row ? Boolean(row.auto_send_after_approval) : true,
  };
}
function mailConfigured(env) {
  return Boolean(clean(env.GMAIL_CLIENT_ID, 500) && clean(env.GMAIL_CLIENT_SECRET, 500) && clean(env.GMAIL_REFRESH_TOKEN, 2000));
}
function aiConfigured(env) { return Boolean(clean(env.OPENAI_API_KEY, 300)); }
async function overview(request, env) {
  const upcoming = nextReportPeriod();
  await ensureReport(env, upcoming.year, upcoming.month);
  const [rows, config] = await Promise.all([
    env.DB.prepare('SELECT * FROM community_ministry_reports ORDER BY report_year DESC, report_month DESC LIMIT 36').all(), settings(env),
  ]);
  const reports = rows.results.map(reportRow);
  return json({ reports, settings: config, upcoming, capabilities: { ai: aiConfigured(env), gmail: mailConfigured(env) } }, 200, request, env);
}
async function updateSettings(request, env, sessionData) {
  const body = await readBody(request); if (!body) return json({ error: '설정 정보를 확인해 주세요.' }, 400, request, env);
  const recipient = clean(body.recipientEmail, 500); const cc = clean(body.ccEmail, 1000); const sender = clean(body.senderName, 160) || 'EKODI Community';
  const dueDay = Math.max(0, Math.min(28, Math.trunc(Number(body.dueDay) || 0))); const auto = body.autoSendAfterApproval !== false;
  const who = await adminId(env, sessionData.email); const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE community_report_settings SET recipient_email=?, cc_email=?, sender_name=?, due_day=?, auto_send_after_approval=?, updated_at=?, updated_by=? WHERE id=1`)
    .bind(recipient, cc, sender, dueDay, auto ? 1 : 0, now, who).run();
  await audit(env, sessionData.email, 'community.report.settings.update', 'community', JSON.stringify({ recipient, dueDay, auto }));
  return json({ ok: true, settings: await settings(env) }, 200, request, env);
}
async function getReport(env, id) { const row = await env.DB.prepare('SELECT * FROM community_ministry_reports WHERE id = ?').bind(id).first(); return row ? reportRow(row) : null; }
async function saveReport(request, env, sessionData, id) {
  const current = await getReport(env, id); if (!current) return json({ error: '사역보고를 찾을 수 없습니다.' }, 404, request, env);
  if (current.status === 'SENT') return json({ error: '이미 발송된 보고서는 수정할 수 없습니다.' }, 409, request, env);
  const body = await readBody(request); if (!body) return json({ error: '사역보고 내용을 확인해 주세요.' }, 400, request, env);
  const who = await adminId(env, sessionData.email); const now = new Date().toISOString();
  const fields = ['title','activities','outcomes','evaluation','plans','requests','prayers','sourceNotes','body'];
  const values = Object.fromEntries(fields.map(k => [k, clean(body[k] ?? current[k], k === 'title' ? 300 : 20000)]));
  const nextStatus = VALID_STATUS.has(body.status) && body.status !== 'SENT' ? body.status : current.status;
  await env.DB.prepare(`UPDATE community_ministry_reports SET title=?, activities_text=?, outcomes_text=?, evaluation_text=?, plans_text=?, requests_text=?, prayers_text=?, source_notes=?, body_text=?, status=?, send_error='', updated_at=?, updated_by=? WHERE id=?`)
    .bind(values.title, values.activities, values.outcomes, values.evaluation, values.plans, values.requests, values.prayers, values.sourceNotes, values.body, nextStatus, now, who, id).run();
  await audit(env, sessionData.email, 'community.report.update', id, JSON.stringify({ status: nextStatus }));
  return json({ ok: true, report: await getReport(env, id) }, 200, request, env);
}
function fallbackBody(report) {
  const section = (title, text) => `${title}\n${clean(text, 20000) || '- 확인 및 입력 필요'}`;
  return [
    report.title,
    `보고기간: ${report.activityFrom} ~ ${report.activityTo}`,
    '', section('1. 지난 2개월 주요 사역', report.activities || report.sourceNotes),
    '', section('2. 참여·성과·변화', report.outcomes),
    '', section('3. 감사와 평가', report.evaluation),
    '', `향후 계획기간: ${report.planFrom} ~ ${report.planTo}`,
    section('4. 향후 2개월 계획', report.plans),
    '', section('5. 본부 협조 요청', report.requests),
    '', section('6. 기도제목', report.prayers),
  ].join('\n');
}
function extractOutputText(data) {
  return (data?.output || []).flatMap(item => item?.content || []).filter(part => part?.type === 'output_text').map(part => part.text || '').join('\n').trim();
}
async function generateWithOpenAI(env, report) {
  if (!aiConfigured(env)) return null;
  const facts = { activities: report.activities, outcomes: report.outcomes, evaluation: report.evaluation, plans: report.plans, requests: report.requests, prayers: report.prayers, sourceNotes: report.sourceNotes };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: clean(env.OPENAI_MODEL, 120) || 'gpt-5',
      instructions: 'You draft concise Korean ministry reports for EKODI Community. Use only supplied facts. Never invent names, counts, dates, outcomes, or prayer requests. If evidence is missing, write 확인 필요. Keep the tone factual, pastoral, and suitable for headquarters reporting.',
      input: `보고서: ${report.title}\n활동기간 ${report.activityFrom}~${report.activityTo}\n계획기간 ${report.planFrom}~${report.planTo}\n\n자료(JSON):\n${JSON.stringify(facts)}\n\n다음 순서로 작성: 1. 지난 2개월 주요 사역 2. 참여·성과·변화 3. 감사와 평가 4. 향후 2개월 계획 5. 본부 협조 요청 6. 기도제목.`,
    }),
  });
  if (!response.ok) throw new Error(`AI 생성 실패 (${response.status})`);
  const data = await response.json(); return extractOutputText(data) || null;
}
async function generateDraft(request, env, sessionData, id) {
  const report = await getReport(env, id); if (!report) return json({ error: '사역보고를 찾을 수 없습니다.' }, 404, request, env);
  if (report.status === 'SENT') return json({ error: '이미 발송된 보고서입니다.' }, 409, request, env);
  let body; let mode = 'smart-template';
  try { body = await generateWithOpenAI(env, report); if (body) mode = 'openai'; } catch (error) { console.warn('Community report AI fallback', error); }
  if (!body) body = fallbackBody(report);
  const who = await adminId(env, sessionData.email); const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE community_ministry_reports SET body_text=?, ai_mode=?, status='AI_DRAFT', send_error='', updated_at=?, updated_by=? WHERE id=?`)
    .bind(body, mode, now, who, id).run();
  await audit(env, sessionData.email, 'community.report.ai_draft', id, mode);
  return json({ ok: true, aiMode: mode, report: await getReport(env, id) }, 200, request, env);
}
function utf8Base64Url(value) {
  const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function encodedHeader(value) {
  const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}
async function gmailAccessToken(env) {
  const body = new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const data = await response.json(); if (!response.ok || !data.access_token) throw new Error('Gmail 인증 토큰을 갱신하지 못했습니다.'); return data.access_token;
}
async function sendGmail(env, config, report) {
  if (!mailConfigured(env)) throw new Error('Gmail 자동발송 연결이 아직 설정되지 않았습니다.');
  if (!config.recipientEmail) throw new Error('본부 수신 이메일을 먼저 설정해 주세요.');
  const token = await gmailAccessToken(env);
  const subject = `[EKODI Community] ${report.year}년 ${report.month}월 사역보고`;
  const headers = [
    `To: ${config.recipientEmail}`,
    config.ccEmail ? `Cc: ${config.ccEmail}` : '',
    `Subject: ${encodedHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '', report.body || fallbackBody(report),
  ].filter((line, index) => line !== '' || index >= 6).join('\r\n');
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw: utf8Base64Url(headers) }),
  });
  const data = await response.json(); if (!response.ok || !data.id) throw new Error(data?.error?.message || `Gmail 발송 실패 (${response.status})`); return data.id;
}
async function markSendError(env, id, message) {
  await env.DB.prepare('UPDATE community_ministry_reports SET send_error=?, updated_at=? WHERE id=?').bind(clean(message, 1000), new Date().toISOString(), id).run();
}
async function sendApproved(env, id, actorEmail = 'system') {
  const report = await getReport(env, id); if (!report || report.status !== 'APPROVED' || report.sentAt) return { skipped: true };
  const config = await settings(env);
  try {
    const messageId = await sendGmail(env, config, report); const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE community_ministry_reports SET status='SENT', sent_at=?, gmail_message_id=?, send_error='', updated_at=? WHERE id=?`)
      .bind(now, messageId, now, id).run();
    if (actorEmail !== 'system') await audit(env, actorEmail, 'community.report.sent', id, messageId);
    return { sent: true, messageId };
  } catch (error) { await markSendError(env, id, error.message); return { sent: false, error: error.message }; }
}
async function approve(request, env, sessionData, id) {
  const report = await getReport(env, id); if (!report) return json({ error: '사역보고를 찾을 수 없습니다.' }, 404, request, env);
  if (!clean(report.body, 10)) return json({ error: '최종 보고서 본문을 확인한 뒤 승인해 주세요.' }, 400, request, env);
  const who = await adminId(env, sessionData.email); const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE community_ministry_reports SET status='APPROVED', approved_at=?, approved_by=?, send_error='', updated_at=?, updated_by=? WHERE id=?`)
    .bind(now, who, now, who, id).run();
  await audit(env, sessionData.email, 'community.report.approve', id, 'approved');
  const config = await settings(env); const delivery = config.autoSendAfterApproval ? await sendApproved(env, id, sessionData.email) : { skipped: true };
  return json({ ok: true, delivery, report: await getReport(env, id) }, 200, request, env);
}
async function sendNow(request, env, sessionData, id) {
  const report = await getReport(env, id); if (!report) return json({ error: '사역보고를 찾을 수 없습니다.' }, 404, request, env);
  if (report.status !== 'APPROVED') return json({ error: '승인된 보고서만 발송할 수 있습니다.' }, 409, request, env);
  const delivery = await sendApproved(env, id, sessionData.email);
  return delivery.sent ? json({ ok: true, delivery, report: await getReport(env, id) }, 200, request, env) : json({ error: delivery.error, report: await getReport(env, id) }, 503, request, env);
}
export async function runCommunityReportSchedule(env) {
  const upcoming = nextReportPeriod(); await ensureReport(env, upcoming.year, upcoming.month);
  if (!mailConfigured(env)) return;
  const config = await settings(env); if (!config.autoSendAfterApproval) return;
  const rows = await env.DB.prepare("SELECT id FROM community_ministry_reports WHERE status='APPROVED' AND sent_at='' ORDER BY report_year, report_month LIMIT 10").all();
  for (const row of rows.results) await sendApproved(env, row.id, 'system');
}
export async function handleCommunityReportsRequest(request, env) {
  const url = new URL(request.url); const path = url.pathname; if (!path.startsWith(PREFIX)) return null;
  const auth = await session(request, env); if (!auth.response.ok) return auth.response; const sessionData = auth.data || {};
  if (!sessionData.email) return json({ error: '관리자 인증이 필요합니다.' }, 401, request, env);
  if (request.method === 'GET' && path === PREFIX) return overview(request, env);
  if (request.method === 'PUT' && path === `${PREFIX}/settings`) return updateSettings(request, env, sessionData);
  if (request.method === 'POST' && path === `${PREFIX}/ensure`) {
    const body = await readBody(request); const year = Number(body?.year); const month = Number(body?.month);
    if (!year || !REPORT_MONTHS.has(month)) return json({ error: '연도와 보고월을 확인해 주세요.' }, 400, request, env);
    const id = await ensureReport(env, year, month); await audit(env, sessionData.email, 'community.report.ensure', id, 'created-or-existing');
    return json({ ok: true, report: await getReport(env, id) }, 200, request, env);
  }
  const match = path.match(/^\/api\/community\/admin\/reports\/(\d{4}-(?:02|04|06|08|10|12))(?:\/(generate|approve|send))?$/);
  if (match) {
    const [, id, action] = match;
    if (!action && request.method === 'PUT') return saveReport(request, env, sessionData, id);
    if (action === 'generate' && request.method === 'POST') return generateDraft(request, env, sessionData, id);
    if (action === 'approve' && request.method === 'POST') return approve(request, env, sessionData, id);
    if (action === 'send' && request.method === 'POST') return sendNow(request, env, sessionData, id);
  }
  return json({ error: 'Community ministry reports API 경로를 찾을 수 없습니다.' }, 404, request, env);
}
