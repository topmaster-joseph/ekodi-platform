const PREFIX = '/api/church/admin/reports';
const VALID_STATUS = new Set(['DRAFT', 'AI_DRAFT', 'REVIEW', 'APPROVED', 'SENT']);
const REPORT_MONTHS = new Set([2, 4, 6, 8, 10, 12]);
const CENTRAL_SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
const CENTRAL_PUBLISHABLE_KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
const CHURCH_PASTOR_API = 'https://renzehysxirjilvdxacv.supabase.co/functions/v1/church-pastor-api';
const WRITE_ROLES = new Set(['senior_pastor','pastor','staff']);
const APPROVE_ROLES = new Set(['senior_pastor','pastor']);

function clean(value, max = 12000) { return String(value ?? '').trim().slice(0, max); }
function json(data, status = 200, request, env) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  const origin = request?.headers.get('origin') || '';
  const allowed = String(env?.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
  return new Response(JSON.stringify(data), { status, headers });
}
function preflight(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env?.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const headers = new Headers({
    'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (origin && allowed.includes(origin)) { headers.set('access-control-allow-origin', origin); headers.set('vary', 'Origin'); }
  return new Response(null, { status: 204, headers });
}
async function readBody(request) { try { return await request.json(); } catch { return null; } }
function bearer(request) {
  const value = String(request.headers.get('authorization') || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}
async function session(request, env) {
  const token = bearer(request);
  if (!token || token.length > 8192) return { response: json({ error: '목회자 인증이 필요합니다.' }, 401, request, env) };
  const identityResponse = await fetch(`${CENTRAL_SUPABASE_URL}/auth/v1/user`, { headers: { apikey: CENTRAL_PUBLISHABLE_KEY, authorization: `Bearer ${token}` }, cache: 'no-store' });
  const identity = identityResponse.ok ? await identityResponse.json().catch(() => null) : null;
  if (!identity?.id || !identity?.email || !identity?.email_confirmed_at) return { response: json({ error: '목회자 인증을 확인할 수 없습니다.' }, 401, request, env) };
  const staffUrl = new URL(CHURCH_PASTOR_API); staffUrl.searchParams.set('table', 'church_staff'); staffUrl.searchParams.set('user_id', `eq.${identity.id}`); staffUrl.searchParams.set('limit', '1');
  const staffResponse = await fetch(staffUrl.toString(), { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, cache: 'no-store' });
  const staffRows = staffResponse.ok ? await staffResponse.json().catch(() => []) : [];
  const staff = staffRows?.[0] || null;
  if (!staff) return { response: json({ error: '에코디교회 목회자 운영권한이 필요합니다.' }, staffResponse.status === 401 ? 401 : 403, request, env) };
  return { data: { email: String(identity.email).toLowerCase(), userId: String(identity.id), role: String(staff.role || ''), displayName: staff.display_name || '' } };
}
function roleAllowed(data, roles) { return Boolean(data?.role && roles.has(data.role)); }
async function audit(env, email, action, resource, detail = '') {
  await env.DB.prepare('INSERT INTO church_report_audit_logs (actor_email, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(clean(email, 320), action, resource, clean(detail, 500), new Date().toISOString()).run();
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
  const title = `에코디교회 ${year}년 ${month}월 사역보고`;
  await env.DB.prepare(`INSERT OR IGNORE INTO church_ministry_reports
    (id, report_year, report_month, activity_from, activity_to, plan_from, plan_to, title)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(p.id, year, month, p.activityFrom, p.activityTo, p.planFrom, p.planTo, title).run();
  return p.id;
}
function parseSnapshot(value) {
  try {
    const data = JSON.parse(value || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}
function reportRow(row, includeSnapshot = false) {
  const report = {
    id: row.id, year: Number(row.report_year), month: Number(row.report_month), activityFrom: row.activity_from, activityTo: row.activity_to,
    planFrom: row.plan_from, planTo: row.plan_to, title: row.title, activities: row.activities_text, outcomes: row.outcomes_text,
    evaluation: row.evaluation_text, plans: row.plans_text, requests: row.requests_text, prayers: row.prayers_text, sourceNotes: row.source_notes,
    body: row.body_text, aiMode: row.ai_mode, status: row.status, approvedAt: row.approved_at, sentAt: row.sent_at,
    gmailMessageId: row.gmail_message_id, sendError: row.send_error, createdAt: row.created_at, updatedAt: row.updated_at,
    sourceStatus: row.source_status || 'not_loaded', sourceCount: Number(row.source_count || 0),
    sourceRefreshedAt: row.source_refreshed_at || '', sourceError: row.source_error || '',
  };
  if (includeSnapshot) report.sourceSnapshot = parseSnapshot(row.source_snapshot_json);
  return report;
}
async function settings(env) {
  const row = await env.DB.prepare('SELECT * FROM church_report_settings WHERE id = 1').first();
  return {
    recipientEmail: row?.recipient_email || '', ccEmail: row?.cc_email || '', senderName: row?.sender_name || '에코디교회',
    dueDay: Number(row?.due_day || 0), autoSendAfterApproval: row ? Boolean(row.auto_send_after_approval) : true,
  };
}
function mailConfigured(env) {
  return Boolean(clean(env.GMAIL_CLIENT_ID, 500) && clean(env.GMAIL_CLIENT_SECRET, 500) && clean(env.GMAIL_REFRESH_TOKEN, 2000));
}
function aiConfigured(env) { return Boolean(clean(env.OPENAI_API_KEY, 300)); }
function sourceEndpoint() { return CHURCH_PASTOR_API; }
async function overview(request, env, sessionData) {
  const upcoming = nextReportPeriod();
  await ensureReport(env, upcoming.year, upcoming.month);
  const [rows, config] = await Promise.all([
    env.DB.prepare('SELECT * FROM church_ministry_reports ORDER BY report_year DESC, report_month DESC LIMIT 36').all(), settings(env),
  ]);
  const reports = rows.results.map(row => reportRow(row));
  return json({ reports, settings: config, upcoming, capabilities: { ai: aiConfigured(env), gmail: mailConfigured(env), sources: true, role: sessionData.role, canWrite: roleAllowed(sessionData, WRITE_ROLES), canApprove: roleAllowed(sessionData, APPROVE_ROLES) } }, 200, request, env);
}
async function updateSettings(request, env, sessionData) {
  const body = await readBody(request); if (!body) return json({ error: '설정 정보를 확인해 주세요.' }, 400, request, env);
  const recipient = clean(body.recipientEmail, 500); const cc = clean(body.ccEmail, 1000); const sender = clean(body.senderName, 160) || '에코디교회';
  const dueDay = Math.max(0, Math.min(28, Math.trunc(Number(body.dueDay) || 0))); const auto = body.autoSendAfterApproval !== false;
  const who = sessionData.userId; const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE church_report_settings SET recipient_email=?, cc_email=?, sender_name=?, due_day=?, auto_send_after_approval=?, updated_at=?, updated_by=? WHERE id=1`)
    .bind(recipient, cc, sender, dueDay, auto ? 1 : 0, now, who).run();
  await audit(env, sessionData.email, 'church.report.settings.update', 'church', JSON.stringify({ recipient, dueDay, auto }));
  return json({ ok: true, settings: await settings(env) }, 200, request, env);
}
async function getReport(env, id, includeSnapshot = false) {
  const row = await env.DB.prepare('SELECT * FROM church_ministry_reports WHERE id = ?').bind(id).first();
  return row ? reportRow(row, includeSnapshot) : null;
}
async function saveReport(request, env, sessionData, id) {
  const current = await getReport(env, id); if (!current) return json({ error: '사역보고를 찾을 수 없습니다.' }, 404, request, env);
  if (current.status === 'SENT') return json({ error: '이미 발송된 보고서는 수정할 수 없습니다.' }, 409, request, env);
  const body = await readBody(request); if (!body) return json({ error: '사역보고 내용을 확인해 주세요.' }, 400, request, env);
  const who = sessionData.userId; const now = new Date().toISOString();
  const fields = ['title','activities','outcomes','evaluation','plans','requests','prayers','sourceNotes','body'];
  const values = Object.fromEntries(fields.map(k => [k, clean(body[k] ?? current[k], k === 'title' ? 300 : 20000)]));
  const nextStatus = VALID_STATUS.has(body.status) && body.status !== 'SENT' ? body.status : current.status;
  await env.DB.prepare(`UPDATE church_ministry_reports SET title=?, activities_text=?, outcomes_text=?, evaluation_text=?, plans_text=?, requests_text=?, prayers_text=?, source_notes=?, body_text=?, status=?, send_error='', updated_at=?, updated_by=? WHERE id=?`)
    .bind(values.title, values.activities, values.outcomes, values.evaluation, values.plans, values.requests, values.prayers, values.sourceNotes, values.body, nextStatus, now, who, id).run();
  await audit(env, sessionData.email, 'church.report.update', id, JSON.stringify({ status: nextStatus }));
  return json({ ok: true, report: await getReport(env, id) }, 200, request, env);
}

function compactSourceSnapshot(data) {
  const snapshot = {
    period: data?.period || {}, generatedAt: clean(data?.generatedAt, 80), source: clean(data?.source, 120),
    counts: data?.counts && typeof data.counts === 'object' ? data.counts : {},
    activityTypeCounts: data?.activityTypeCounts && typeof data.activityTypeCounts === 'object' ? data.activityTypeCounts : {},
    membershipCounts: data?.membershipCounts && typeof data.membershipCounts === 'object' ? data.membershipCounts : {},
    privacy: data?.privacy && typeof data.privacy === 'object' ? data.privacy : {},
    ongoingCircles: Array.isArray(data?.ongoingCircles) ? data.ongoingCircles.slice(0, 40) : [],
    items: Array.isArray(data?.items) ? data.items.slice(0, 240) : [],
  };
  let encoded = JSON.stringify(snapshot);
  if (encoded.length > 80000) {
    snapshot.items = snapshot.items.slice(0, 100);
    encoded = JSON.stringify(snapshot);
  }
  return { snapshot, encoded: encoded.slice(0, 80000) };
}
async function churchApi(request, table, params = {}, prefer = '') {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('목회자 인증 토큰이 없어 교회 원자료를 동기화할 수 없습니다.');
  const endpoint = new URL(CHURCH_PASTOR_API); endpoint.searchParams.set('table', table);
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, String(value));
  const headers = { authorization, accept: 'application/json', 'user-agent': 'EKODI-Church-Reports/1.0' }; if (prefer) headers.prefer = prefer;
  const response = await fetch(endpoint.toString(), { headers, cache: 'no-store', redirect: 'error' });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data?.error ? `교회 원자료 동기화 실패: ${data.error}` : `교회 원자료 동기화 실패 (${response.status})`);
  return { data, count: Number((response.headers.get('content-range') || '/0').split('/').pop() || 0) };
}
function within(date, from, to) { const value = clean(date, 10); return Boolean(value && value >= from && value <= to); }
async function collectChurchSources(request, env, report) {
  const [servicesResult, eventsResult, membersResult] = await Promise.all([
    churchApi(request, 'church_services', { order: 'service_date.desc', limit: 200 }),
    churchApi(request, 'church_events', { order: 'event_date.desc', limit: 200 }),
    churchApi(request, 'church_members', { limit: 1 }, 'count=exact'),
  ]);
  const services = (servicesResult.data || []).filter(item => within(item.service_date, report.activityFrom, report.activityTo));
  const events = (eventsResult.data || []).filter(item => within(item.event_date, report.activityFrom, report.activityTo));
  const items = [
    ...services.map(item => ({ date: item.service_date, label: '예배·말씀', title: item.title || '예배', summary: [item.scripture, item.sermon_title, item.preacher].filter(Boolean).join(' · ') })),
    ...events.map(item => ({ date: item.event_date, label: '교회 일정', title: item.title || '일정', summary: [item.category, item.location, item.status].filter(Boolean).join(' · ') })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return compactSourceSnapshot({
    period: { from: report.activityFrom, to: report.activityTo }, generatedAt: new Date().toISOString(), source: 'EKODI Church pastor operations',
    counts: { services: services.length, events: events.length, members: membersResult.count, items: items.length },
    activityTypeCounts: { worship: services.length, events: events.length }, membershipCounts: { active: membersResult.count },
    privacy: { careDetailsExcluded: true, memberDetailsExcluded: true, note: '사역보고 원자료에는 교인 개인 연락처와 돌봄 상세를 포함하지 않습니다.' }, ongoingCircles: [], items,
  });
}
async function markSourceError(env, id, message) {
  await env.DB.prepare(`UPDATE church_ministry_reports SET source_status='error', source_error=?, updated_at=? WHERE id=?`)
    .bind(clean(message, 1000), new Date().toISOString(), id).run();
}
async function syncSources(request, env, sessionData, id) {
  const report = await getReport(env, id, true);
  if (!report) throw new Error('사역보고를 찾을 수 없습니다.');
  if (report.status === 'SENT') throw new Error('이미 발송된 보고서는 원자료를 다시 동기화할 수 없습니다.');
  try {
    const { snapshot, encoded } = await collectChurchSources(request, env, report);
    const now = new Date().toISOString();
    const count = Math.max(0, Math.trunc(Number(snapshot?.counts?.items ?? snapshot?.items?.length ?? 0)));
    const who = sessionData.userId;
    await env.DB.prepare(`UPDATE church_ministry_reports SET source_snapshot_json=?, source_refreshed_at=?, source_status='ready', source_count=?, source_error='', updated_at=?, updated_by=? WHERE id=?`)
      .bind(encoded, now, count, now, who, id).run();
    await audit(env, sessionData.email, 'church.report.sources.refresh', id, JSON.stringify({ count }));
    return await getReport(env, id, true);
  } catch (error) {
    await markSourceError(env, id, error.message || '원자료 동기화 실패');
    await audit(env, sessionData.email, 'church.report.sources.error', id, clean(error.message, 300));
    throw error;
  }
}
async function sourceDetails(request, env, id) {
  const report = await getReport(env, id, true);
  if (!report) return json({ error: '사역보고를 찾을 수 없습니다.' }, 404, request, env);
  return json({
    id: report.id,
    sourceStatus: report.sourceStatus,
    sourceCount: report.sourceCount,
    sourceRefreshedAt: report.sourceRefreshedAt,
    sourceError: report.sourceError,
    source: report.sourceSnapshot || {},
  }, 200, request, env);
}
async function refreshSources(request, env, sessionData, id) {
  try {
    const report = await syncSources(request, env, sessionData, id);
    return json({
      ok: true,
      report: await getReport(env, id),
      source: report.sourceSnapshot || {},
    }, 200, request, env);
  } catch (error) {
    const report = await getReport(env, id);
    const status = error.message?.includes('찾을 수') ? 404 : error.message?.includes('이미 발송') ? 409 : 502;
    return json({ error: error.message, report }, status, request, env);
  }
}
function sourceItemText(item) {
  const date = clean(item?.date, 10);
  const label = clean(item?.label || item?.type || item?.kind, 100);
  const subject = clean(item?.title || item?.circle, 180);
  const body = item?.body && typeof item.body === 'object' ? item.body : {};
  const detail = clean(item?.summary || body.summary || body.public_summary || body.text || body.result || body.note || body.prayer_request || body.prayer, 900);
  return [date, label, subject, detail].filter(Boolean).join(' · ');
}
function sourceActivityText(snapshot) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const lines = items.map(sourceItemText).filter(Boolean).slice(0, 36);
  return lines.length ? lines.map(line => `- ${line}`).join('\n') : '';
}
function sourceOutcomeText(snapshot) {
  const c = snapshot?.counts || {};
  const values = [
    ['예배·말씀', c.services], ['교회 일정', c.events], ['등록 교인', c.members], ['원자료', c.items],
  ].filter(([, value]) => Number.isFinite(Number(value)));
  return values.length ? `자동수집 요약: ${values.map(([label, value]) => `${label} ${Number(value)}건`).join(', ')}` : '';
}
function sourcePrayerText(snapshot) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const prayers = items.filter(item => /prayer|기도/i.test(`${item?.type || ''} ${item?.label || ''}`)).map(item => {
    const body = item?.body && typeof item.body === 'object' ? item.body : {};
    return clean(body.prayer_request || body.prayer || body.summary || body.text || item?.summary, 1000);
  }).filter(Boolean).slice(0, 12);
  return prayers.length ? prayers.map(text => `- ${text}`).join('\n') : '';
}
function fallbackBody(report) {
  const section = (title, text) => `${title}\n${clean(text, 20000) || '- 확인 및 입력 필요'}`;
  const snapshot = report.sourceSnapshot || {};
  return [
    report.title,
    `보고기간: ${report.activityFrom} ~ ${report.activityTo}`,
    '', section('1. 지난 2개월 주요 사역', report.activities || sourceActivityText(snapshot) || report.sourceNotes),
    '', section('2. 참여·성과·변화', report.outcomes || sourceOutcomeText(snapshot)),
    '', section('3. 감사와 평가', report.evaluation),
    '', `향후 계획기간: ${report.planFrom} ~ ${report.planTo}`,
    section('4. 향후 2개월 계획', report.plans),
    '', section('5. 협조 요청', report.requests),
    '', section('6. 기도제목', report.prayers || sourcePrayerText(snapshot)),
  ].join('\n');
}
function extractOutputText(data) {
  return (data?.output || []).flatMap(item => item?.content || []).filter(part => part?.type === 'output_text').map(part => part.text || '').join('\n').trim();
}
function aiSourceFacts(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return {};
  return {
    period: snapshot.period || {}, counts: snapshot.counts || {}, activityTypeCounts: snapshot.activityTypeCounts || {},
    membershipCounts: snapshot.membershipCounts || {}, ongoingCircles: Array.isArray(snapshot.ongoingCircles) ? snapshot.ongoingCircles.slice(0, 25) : [],
    items: Array.isArray(snapshot.items) ? snapshot.items.slice(0, 120) : [],
  };
}
async function generateWithOpenAI(env, report) {
  if (!aiConfigured(env)) return null;
  const facts = {
    manual: { activities: report.activities, outcomes: report.outcomes, evaluation: report.evaluation, plans: report.plans, requests: report.requests, prayers: report.prayers, sourceNotes: report.sourceNotes },
    recordedSources: aiSourceFacts(report.sourceSnapshot),
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: clean(env.OPENAI_MODEL, 120) || 'gpt-5',
      instructions: 'You draft concise Korean ministry reports for EKODI Church. Use only supplied facts. Never invent names, counts, dates, outcomes, plans, or prayer requests. recordedSources are verified historical church worship and event records. Future plans must come from manual.plans. Member contact details and pastoral-care details are excluded from the evidence by design. If evidence is missing, write 확인 필요. Keep the tone factual, pastoral, and suitable for ministry reporting.',
      input: `보고서: ${report.title}\n활동기간 ${report.activityFrom}~${report.activityTo}\n계획기간 ${report.planFrom}~${report.planTo}\n\n자료(JSON):\n${JSON.stringify(facts)}\n\n다음 순서로 작성: 1. 지난 2개월 주요 사역 2. 참여·성과·변화 3. 감사와 평가 4. 향후 2개월 계획 5. 협조 요청 6. 기도제목.`,
    }),
  });
  if (!response.ok) throw new Error(`AI 생성 실패 (${response.status})`);
  const data = await response.json(); return extractOutputText(data) || null;
}
async function generateDraft(request, env, sessionData, id) {
  let report = await getReport(env, id, true); if (!report) return json({ error: '사역보고를 찾을 수 없습니다.' }, 404, request, env);
  if (report.status === 'SENT') return json({ error: '이미 발송된 보고서입니다.' }, 409, request, env);
  let sourceSynced = false;
  try { report = await syncSources(request, env, sessionData, id); sourceSynced = true; }
  catch (error) { console.warn('Church report source fallback', error); report = await getReport(env, id, true) || report; }
  let body; let mode = 'smart-template';
  try { body = await generateWithOpenAI(env, report); if (body) mode = 'openai'; } catch (error) { console.warn('Church report AI fallback', error); }
  if (!body) body = fallbackBody(report);
  const who = sessionData.userId; const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE church_ministry_reports SET body_text=?, ai_mode=?, status='AI_DRAFT', send_error='', updated_at=?, updated_by=? WHERE id=?`)
    .bind(body, mode, now, who, id).run();
  await audit(env, sessionData.email, 'church.report.ai_draft', id, JSON.stringify({ mode, sourceSynced, sourceCount: report.sourceCount || 0 }));
  return json({ ok: true, aiMode: mode, sourceSynced, sourceCount: report.sourceCount || 0, report: await getReport(env, id) }, 200, request, env);
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
  if (!config.recipientEmail) throw new Error('보고 수신 이메일을 먼저 설정해 주세요.');
  const token = await gmailAccessToken(env);
  const subject = `[에코디교회] ${report.year}년 ${report.month}월 사역보고`;
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
  await env.DB.prepare('UPDATE church_ministry_reports SET send_error=?, updated_at=? WHERE id=?').bind(clean(message, 1000), new Date().toISOString(), id).run();
}
async function sendApproved(env, id, actorEmail = 'system') {
  const report = await getReport(env, id, true); if (!report || report.status !== 'APPROVED' || report.sentAt) return { skipped: true };
  const config = await settings(env);
  try {
    const messageId = await sendGmail(env, config, report); const now = new Date().toISOString();
    await env.DB.prepare(`UPDATE church_ministry_reports SET status='SENT', sent_at=?, gmail_message_id=?, send_error='', updated_at=? WHERE id=?`)
      .bind(now, messageId, now, id).run();
    if (actorEmail !== 'system') await audit(env, actorEmail, 'church.report.sent', id, messageId);
    return { sent: true, messageId };
  } catch (error) { await markSendError(env, id, error.message); return { sent: false, error: error.message }; }
}
async function approve(request, env, sessionData, id) {
  const report = await getReport(env, id); if (!report) return json({ error: '사역보고를 찾을 수 없습니다.' }, 404, request, env);
  if (!clean(report.body, 10)) return json({ error: '최종 보고서 본문을 확인한 뒤 승인해 주세요.' }, 400, request, env);
  const who = sessionData.userId; const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE church_ministry_reports SET status='APPROVED', approved_at=?, approved_by=?, send_error='', updated_at=?, updated_by=? WHERE id=?`)
    .bind(now, who, now, who, id).run();
  await audit(env, sessionData.email, 'church.report.approve', id, 'approved');
  const config = await settings(env); const delivery = config.autoSendAfterApproval ? await sendApproved(env, id, sessionData.email) : { skipped: true };
  return json({ ok: true, delivery, report: await getReport(env, id) }, 200, request, env);
}
async function sendNow(request, env, sessionData, id) {
  const report = await getReport(env, id); if (!report) return json({ error: '사역보고를 찾을 수 없습니다.' }, 404, request, env);
  if (report.status !== 'APPROVED') return json({ error: '승인된 보고서만 발송할 수 있습니다.' }, 409, request, env);
  const delivery = await sendApproved(env, id, sessionData.email);
  return delivery.sent ? json({ ok: true, delivery, report: await getReport(env, id) }, 200, request, env) : json({ error: delivery.error, report: await getReport(env, id) }, 503, request, env);
}
export async function runChurchReportSchedule(env) {
  const upcoming = nextReportPeriod(); await ensureReport(env, upcoming.year, upcoming.month);
  if (!mailConfigured(env)) return;
  const config = await settings(env); if (!config.autoSendAfterApproval) return;
  const rows = await env.DB.prepare("SELECT id FROM church_ministry_reports WHERE status='APPROVED' AND sent_at='' ORDER BY report_year, report_month LIMIT 10").all();
  for (const row of rows.results) await sendApproved(env, row.id, 'system');
}
export async function handleChurchReportsRequest(request, env) {
  const url = new URL(request.url); const path = url.pathname; if (!path.startsWith(PREFIX)) return null;
  if (request.method === 'OPTIONS') return preflight(request, env);
  const auth = await session(request, env); if (auth.response) return auth.response; const sessionData = auth.data || {};
  if (!sessionData.email) return json({ error: '목회자 인증이 필요합니다.' }, 401, request, env);
  if (request.method === 'GET' && path === PREFIX) return overview(request, env, sessionData);
  if (request.method === 'PUT' && path === `${PREFIX}/settings`) { if (!roleAllowed(sessionData, WRITE_ROLES)) return json({ error: '사역보고 설정 수정 권한이 없습니다.' }, 403, request, env); return updateSettings(request, env, sessionData); }
  if (request.method === 'POST' && path === `${PREFIX}/ensure`) {
    if (!roleAllowed(sessionData, WRITE_ROLES)) return json({ error: '사역보고 생성 권한이 없습니다.' }, 403, request, env);
    const body = await readBody(request); const year = Number(body?.year); const month = Number(body?.month);
    if (!year || !REPORT_MONTHS.has(month)) return json({ error: '연도와 보고월을 확인해 주세요.' }, 400, request, env);
    const id = await ensureReport(env, year, month); await audit(env, sessionData.email, 'church.report.ensure', id, 'created-or-existing');
    return json({ ok: true, report: await getReport(env, id) }, 200, request, env);
  }
  const sourcesMatch = path.match(/^\/api\/church\/admin\/reports\/(\d{4}-(?:02|04|06|08|10|12))\/sources(?:\/(refresh))?$/);
  if (sourcesMatch) {
    const [, id, action] = sourcesMatch;
    if (!action && request.method === 'GET') return sourceDetails(request, env, id);
    if (action === 'refresh' && request.method === 'POST') { if (!roleAllowed(sessionData, WRITE_ROLES)) return json({ error: '원자료 동기화 권한이 없습니다.' }, 403, request, env); return refreshSources(request, env, sessionData, id); }
  }
  const match = path.match(/^\/api\/church\/admin\/reports\/(\d{4}-(?:02|04|06|08|10|12))(?:\/(generate|approve|send))?$/);
  if (match) {
    const [, id, action] = match;
    if (!action && request.method === 'PUT') { if (!roleAllowed(sessionData, WRITE_ROLES)) return json({ error: '사역보고 수정 권한이 없습니다.' }, 403, request, env); return saveReport(request, env, sessionData, id); }
    if (action === 'generate' && request.method === 'POST') { if (!roleAllowed(sessionData, WRITE_ROLES)) return json({ error: 'AI 초안 생성 권한이 없습니다.' }, 403, request, env); return generateDraft(request, env, sessionData, id); }
    if (action === 'approve' && request.method === 'POST') { if (!roleAllowed(sessionData, APPROVE_ROLES)) return json({ error: '사역보고 승인 권한이 없습니다.' }, 403, request, env); return approve(request, env, sessionData, id); }
    if (action === 'send' && request.method === 'POST') { if (!roleAllowed(sessionData, APPROVE_ROLES)) return json({ error: '사역보고 발송 권한이 없습니다.' }, 403, request, env); return sendNow(request, env, sessionData, id); }
  }
  return json({ error: '에코디교회 사역보고 API 경로를 찾을 수 없습니다.' }, 404, request, env);
}
