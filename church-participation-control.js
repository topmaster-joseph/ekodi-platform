import authWorker, { isAllowedOrigin } from './auth-worker.js';

const PUBLIC_PREFIX = '/api/church/participation';
const ADMIN_PREFIX = '/api/church/admin/participation';
const DEFAULT_TENANT = 'ekodi-church';
const VALID_GATHERING_KINDS = new Set(['worship', 'prayer', 'fellowship', 'education', 'mission', 'service', 'other']);
const VALID_CHANNELS = new Set(['onsite', 'online', 'hybrid']);
const VALID_PARTICIPANT_KINDS = new Set(['member', 'guest']);
const PUBLIC_ORIGINS = new Set([
  'https://church.ekodi.kr',
  'https://ekodi.kr',
  'https://www.ekodi.kr',
]);

function clean(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function cors(request, env) {
  const origin = clean(request?.headers.get('origin'), 500);
  const headers = new Headers({
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'Origin',
  });
  if (origin && (PUBLIC_ORIGINS.has(origin) || isAllowedOrigin(origin, env))) {
    headers.set('access-control-allow-origin', origin);
  }
  return headers;
}

function json(data, status, request, env) {
  const headers = cors(request, env);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  return new Response(JSON.stringify(data), { status, headers });
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

function encodeHex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256(value) {
  return encodeHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function isoDate(value) {
  const raw = clean(value, 80);
  if (!raw) return '';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function yyyyMmDd(value) {
  const raw = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

export function normalizeChannel(value) {
  const channel = clean(value, 20).toLowerCase();
  return VALID_CHANNELS.has(channel) ? channel : 'onsite';
}

export function normalizeParticipantKind(value) {
  const kind = clean(value, 20).toLowerCase();
  return VALID_PARTICIPANT_KINDS.has(kind) ? kind : 'guest';
}

function publicBase(env) {
  return clean(env?.CHURCH_PUBLIC_URL, 500).replace(/\/+$/, '') || 'https://ekodi.kr/ekodichurch';
}

function checkInUrl(env, token) {
  return `${publicBase(env)}/checkin.html?g=${encodeURIComponent(token)}`;
}

async function adminSession(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  }), env);
  if (!response.ok) return { response };
  return { response, data: await response.clone().json() };
}

async function adminId(env, email) {
  if (!email) return null;
  return (await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first())?.id || null;
}

async function audit(env, email, action, resource, detail = '') {
  const who = await adminId(env, email);
  await env.DB.prepare('INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(who, action, resource, clean(detail, 900), new Date().toISOString()).run();
}

async function tenantBySlug(env, slug = DEFAULT_TENANT) {
  const tenantSlug = clean(slug, 80).toLowerCase() || DEFAULT_TENANT;
  return env.DB.prepare(`SELECT id, slug, name, domain FROM customer_tenants
    WHERE slug = ? AND status = 'active' LIMIT 1`).bind(tenantSlug).first();
}

function publicGathering(row) {
  return {
    id: row.id,
    title: row.title,
    kind: row.gathering_kind,
    startsAt: row.starts_at,
    endsAt: row.ends_at || '',
    timezone: row.timezone || 'Asia/Seoul',
    location: row.location_label || '',
    status: row.status,
  };
}

async function gatheringByToken(env, token) {
  const raw = clean(token, 180);
  if (raw.length < 24) return null;
  const tokenHash = await sha256(raw);
  return env.DB.prepare(`SELECT id, tenant_id, gathering_kind, title, starts_at, ends_at, timezone, location_label, status
    FROM church_gatherings WHERE checkin_token_hash = ? LIMIT 1`).bind(tokenHash).first();
}

async function publicGatheringLookup(request, env, token) {
  const gathering = await gatheringByToken(env, token);
  if (!gathering) return json({ error: '유효한 모임을 찾을 수 없습니다.', code: 'GATHERING_NOT_FOUND' }, 404, request, env);
  if (gathering.status !== 'open') return json({ error: '현재 체크인이 열려 있지 않습니다.', code: 'CHECKIN_CLOSED' }, 409, request, env);
  return json({ gathering: publicGathering(gathering), privacy: { storesTokenHashOnly: true, spiritualScoring: false } }, 200, request, env);
}

async function publicCheckIn(request, env) {
  const body = await readBody(request);
  if (!body) return json({ error: '체크인 정보를 확인해 주세요.' }, 400, request, env);
  const token = clean(body.token, 180);
  const displayName = clean(body.displayName, 80);
  const visitorKey = clean(body.visitorKey, 180);
  if (!displayName || displayName.length < 2) return json({ error: '이름을 입력해 주세요.' }, 400, request, env);
  if (visitorKey.length < 16) return json({ error: '이 기기의 참여 식별값을 확인할 수 없습니다.' }, 400, request, env);

  const gathering = await gatheringByToken(env, token);
  if (!gathering) return json({ error: '유효한 모임을 찾을 수 없습니다.', code: 'GATHERING_NOT_FOUND' }, 404, request, env);
  if (gathering.status !== 'open') return json({ error: '현재 체크인이 열려 있지 않습니다.', code: 'CHECKIN_CLOSED' }, 409, request, env);

  const now = new Date().toISOString();
  const subjectHash = await sha256(`${gathering.tenant_id}:${visitorKey}`);
  const participantKind = normalizeParticipantKind(body.participantKind);
  const channel = normalizeChannel(body.channel);
  let participant = await env.DB.prepare(`SELECT id, participant_kind FROM church_participants
    WHERE tenant_id = ? AND subject_hash = ? LIMIT 1`).bind(gathering.tenant_id, subjectHash).first();

  if (!participant) {
    const participantId = id('person');
    await env.DB.prepare(`INSERT INTO church_participants
      (id, tenant_id, display_name, participant_kind, subject_hash, first_seen_at, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(participantId, gathering.tenant_id, displayName, participantKind, subjectHash, now, now, now, now).run();
    participant = { id: participantId, participant_kind: participantKind };
  } else {
    await env.DB.prepare(`UPDATE church_participants
      SET display_name = ?, participant_kind = ?, last_seen_at = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?`)
      .bind(displayName, participantKind, now, now, participant.id, gathering.tenant_id).run();
  }

  const existing = await env.DB.prepare(`SELECT id, checked_in_at FROM church_attendance
    WHERE tenant_id = ? AND gathering_id = ? AND participant_id = ? LIMIT 1`)
    .bind(gathering.tenant_id, gathering.id, participant.id).first();
  if (existing) {
    return json({
      ok: true,
      duplicate: true,
      checkedInAt: existing.checked_in_at,
      gathering: publicGathering(gathering),
      message: '이미 참여가 기록되어 있습니다.',
    }, 200, request, env);
  }

  const attendanceId = id('attendance');
  await env.DB.prepare(`INSERT INTO church_attendance
    (id, tenant_id, gathering_id, participant_id, channel, source, checked_in_at, created_at)
    VALUES (?, ?, ?, ?, ?, 'self', ?, ?)`)
    .bind(attendanceId, gathering.tenant_id, gathering.id, participant.id, channel, now, now).run();

  return json({
    ok: true,
    duplicate: false,
    checkedInAt: now,
    gathering: publicGathering(gathering),
    message: '함께하신 참여가 기록되었습니다.',
  }, 201, request, env);
}

async function adminOverview(request, env, tenant) {
  const url = new URL(request.url);
  const days = Math.max(7, Math.min(365, Math.trunc(Number(url.searchParams.get('days')) || 90)));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [summary, recent] = await Promise.all([
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM church_gatherings WHERE tenant_id = ? AND starts_at >= ?) AS gatherings,
      (SELECT COUNT(*) FROM church_attendance WHERE tenant_id = ? AND checked_in_at >= ?) AS checkins,
      (SELECT COUNT(DISTINCT participant_id) FROM church_attendance WHERE tenant_id = ? AND checked_in_at >= ?) AS people,
      (SELECT COUNT(*) FROM church_participants WHERE tenant_id = ? AND participant_kind = 'guest' AND first_seen_at >= ?) AS new_guests`)
      .bind(tenant.id, since, tenant.id, since, tenant.id, since, tenant.id, since).first(),
    env.DB.prepare(`SELECT g.id, g.gathering_kind, g.title, g.starts_at, g.ends_at, g.timezone, g.location_label, g.status,
      COUNT(a.id) AS checkins,
      COUNT(DISTINCT a.participant_id) AS people
      FROM church_gatherings g
      LEFT JOIN church_attendance a ON a.gathering_id = g.id AND a.tenant_id = g.tenant_id
      WHERE g.tenant_id = ?
      GROUP BY g.id
      ORDER BY g.starts_at DESC
      LIMIT 20`).bind(tenant.id).all(),
  ]);
  return json({
    tenant: { slug: tenant.slug, name: tenant.name },
    periodDays: days,
    summary: {
      gatherings: Number(summary?.gatherings || 0),
      checkins: Number(summary?.checkins || 0),
      people: Number(summary?.people || 0),
      newGuests: Number(summary?.new_guests || 0),
    },
    gatherings: (recent.results || []).map(row => ({
      ...publicGathering(row),
      checkins: Number(row.checkins || 0),
      people: Number(row.people || 0),
    })),
    policy: { spiritualScoring: false, careRequiresHumanReview: true },
  }, 200, request, env);
}

async function createGathering(request, env, sessionData, tenant) {
  const body = await readBody(request);
  if (!body) return json({ error: '모임 정보를 확인해 주세요.' }, 400, request, env);
  const title = clean(body.title, 160);
  const kind = clean(body.kind, 30).toLowerCase() || 'worship';
  const startsAt = isoDate(body.startsAt);
  const endsAt = body.endsAt ? isoDate(body.endsAt) : '';
  if (!title || !startsAt) return json({ error: '모임 이름과 시작 시간을 입력해 주세요.' }, 400, request, env);
  if (!VALID_GATHERING_KINDS.has(kind)) return json({ error: '지원하지 않는 모임 유형입니다.' }, 400, request, env);
  if (endsAt && new Date(endsAt) < new Date(startsAt)) return json({ error: '종료 시간은 시작 시간 이후여야 합니다.' }, 400, request, env);

  const gatheringId = id('gathering');
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);
  await env.DB.prepare(`INSERT INTO church_gatherings
    (id, tenant_id, gathering_kind, title, starts_at, ends_at, timezone, location_label, checkin_token_hash, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`)
    .bind(gatheringId, tenant.id, kind, title, startsAt, endsAt, clean(body.timezone, 80) || 'Asia/Seoul', clean(body.location, 160), tokenHash, who, now, now).run();
  await audit(env, sessionData.email, 'church.gathering.create', gatheringId, JSON.stringify({ tenant: tenant.slug, kind, startsAt }));
  return json({
    ok: true,
    gathering: { id: gatheringId, title, kind, startsAt, endsAt, status: 'open' },
    checkIn: { url: checkInUrl(env, token), token, qrPayload: checkInUrl(env, token), tokenReturnedOnce: true },
  }, 201, request, env);
}

async function rotateGatheringToken(request, env, sessionData, tenant, gatheringId) {
  const gathering = await env.DB.prepare('SELECT id, status FROM church_gatherings WHERE id = ? AND tenant_id = ? LIMIT 1')
    .bind(gatheringId, tenant.id).first();
  if (!gathering) return json({ error: '모임을 찾을 수 없습니다.' }, 404, request, env);
  if (gathering.status === 'cancelled') return json({ error: '취소된 모임의 체크인 주소는 갱신할 수 없습니다.' }, 409, request, env);
  const token = randomToken();
  const tokenHash = await sha256(token);
  await env.DB.prepare('UPDATE church_gatherings SET checkin_token_hash = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
    .bind(tokenHash, new Date().toISOString(), gatheringId, tenant.id).run();
  await audit(env, sessionData.email, 'church.gathering.token.rotate', gatheringId, tenant.slug);
  return json({ ok: true, checkIn: { url: checkInUrl(env, token), token, qrPayload: checkInUrl(env, token), tokenReturnedOnce: true } }, 200, request, env);
}

async function updateGatheringStatus(request, env, sessionData, tenant, gatheringId) {
  const body = await readBody(request);
  const status = clean(body?.status, 20).toLowerCase();
  if (!['open', 'closed', 'cancelled'].includes(status)) return json({ error: '모임 상태를 확인해 주세요.' }, 400, request, env);
  const result = await env.DB.prepare('UPDATE church_gatherings SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?')
    .bind(status, new Date().toISOString(), gatheringId, tenant.id).run();
  if (!result.meta?.changes) return json({ error: '모임을 찾을 수 없습니다.' }, 404, request, env);
  await audit(env, sessionData.email, 'church.gathering.status', gatheringId, JSON.stringify({ status, tenant: tenant.slug }));
  return json({ ok: true, id: gatheringId, status }, 200, request, env);
}

async function gatheringDetail(request, env, tenant, gatheringId) {
  const gathering = await env.DB.prepare(`SELECT id, gathering_kind, title, starts_at, ends_at, timezone, location_label, status
    FROM church_gatherings WHERE id = ? AND tenant_id = ? LIMIT 1`).bind(gatheringId, tenant.id).first();
  if (!gathering) return json({ error: '모임을 찾을 수 없습니다.' }, 404, request, env);
  const rows = await env.DB.prepare(`SELECT a.id, a.channel, a.source, a.checked_in_at,
      p.id AS participant_id, p.display_name, p.participant_kind
    FROM church_attendance a
    JOIN church_participants p ON p.id = a.participant_id AND p.tenant_id = a.tenant_id
    WHERE a.tenant_id = ? AND a.gathering_id = ?
    ORDER BY a.checked_in_at ASC`).bind(tenant.id, gatheringId).all();
  return json({ gathering: publicGathering(gathering), attendance: rows.results || [] }, 200, request, env);
}

export function careReviewPolicy(days = 21) {
  return Object.freeze({
    gapDays: Math.max(7, Math.min(180, Math.trunc(Number(days) || 21))),
    minRecordedParticipations: 2,
    humanReviewRequired: true,
    spiritualScoring: false,
    automaticOutreach: false,
    reasonLabel: '참여 기록 공백',
  });
}

async function careCandidates(request, env, sessionData, tenant) {
  const url = new URL(request.url);
  const policy = careReviewPolicy(url.searchParams.get('days'));
  const cutoff = new Date(Date.now() - policy.gapDays * 86400000).toISOString();
  const rows = await env.DB.prepare(`SELECT p.id, p.display_name, COUNT(a.id) AS participation_count, MAX(a.checked_in_at) AS last_participation_at
    FROM church_participants p
    JOIN church_attendance a ON a.participant_id = p.id AND a.tenant_id = p.tenant_id
    WHERE p.tenant_id = ? AND p.participant_kind = 'member' AND p.status = 'active'
    GROUP BY p.id, p.display_name
    HAVING COUNT(a.id) >= ? AND MAX(a.checked_in_at) < ?
    ORDER BY MAX(a.checked_in_at) ASC
    LIMIT 100`).bind(tenant.id, policy.minRecordedParticipations, cutoff).all();
  await audit(env, sessionData.email, 'church.care.review.list', tenant.slug, JSON.stringify({ gapDays: policy.gapDays, count: rows.results?.length || 0 }));
  return json({
    policy,
    candidates: (rows.results || []).map(row => ({
      participantId: row.id,
      displayName: row.display_name,
      participationCount: Number(row.participation_count || 0),
      lastParticipationAt: row.last_participation_at,
      reason: policy.reasonLabel,
      humanReviewRequired: true,
    })),
  }, 200, request, env);
}

async function reportSource(request, env, tenant) {
  const url = new URL(request.url);
  const from = yyyyMmDd(url.searchParams.get('from'));
  const to = yyyyMmDd(url.searchParams.get('to'));
  if (!from || !to || from > to) return json({ error: '보고 기간을 YYYY-MM-DD 형식으로 확인해 주세요.' }, 400, request, env);
  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;
  const [summary, channels, kinds] = await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(DISTINCT g.id) AS gatherings,
      COUNT(a.id) AS checkins,
      COUNT(DISTINCT a.participant_id) AS people,
      COUNT(DISTINCT CASE WHEN p.participant_kind = 'guest' THEN p.id END) AS guests,
      COUNT(DISTINCT CASE WHEN p.participant_kind = 'member' THEN p.id END) AS members
      FROM church_gatherings g
      LEFT JOIN church_attendance a ON a.gathering_id = g.id AND a.tenant_id = g.tenant_id
      LEFT JOIN church_participants p ON p.id = a.participant_id AND p.tenant_id = a.tenant_id
      WHERE g.tenant_id = ? AND g.starts_at >= ? AND g.starts_at <= ? AND g.status <> 'cancelled'`)
      .bind(tenant.id, fromIso, toIso).first(),
    env.DB.prepare(`SELECT a.channel, COUNT(*) AS count FROM church_attendance a
      JOIN church_gatherings g ON g.id = a.gathering_id AND g.tenant_id = a.tenant_id
      WHERE a.tenant_id = ? AND g.starts_at >= ? AND g.starts_at <= ? AND g.status <> 'cancelled'
      GROUP BY a.channel`).bind(tenant.id, fromIso, toIso).all(),
    env.DB.prepare(`SELECT g.gathering_kind AS kind, COUNT(DISTINCT g.id) AS gatherings, COUNT(a.id) AS checkins
      FROM church_gatherings g
      LEFT JOIN church_attendance a ON a.gathering_id = g.id AND a.tenant_id = g.tenant_id
      WHERE g.tenant_id = ? AND g.starts_at >= ? AND g.starts_at <= ? AND g.status <> 'cancelled'
      GROUP BY g.gathering_kind`).bind(tenant.id, fromIso, toIso).all(),
  ]);
  return json({
    source: 'ekodi.church.participation.v1',
    tenant: tenant.slug,
    period: { from, to },
    counts: {
      gatherings: Number(summary?.gatherings || 0),
      checkins: Number(summary?.checkins || 0),
      people: Number(summary?.people || 0),
      members: Number(summary?.members || 0),
      guests: Number(summary?.guests || 0),
    },
    channels: Object.fromEntries((channels.results || []).map(row => [row.channel, Number(row.count || 0)])),
    gatheringKinds: Object.fromEntries((kinds.results || []).map(row => [row.kind, { gatherings: Number(row.gatherings || 0), checkins: Number(row.checkins || 0) }])),
    privacy: { containsNames: false, spiritualScoring: false },
  }, 200, request, env);
}

async function handleAdmin(request, env) {
  const auth = await adminSession(request, env);
  if (!auth.data) return auth.response;
  const url = new URL(request.url);
  const path = url.pathname;
  const bodyTenant = request.method === 'POST' && path === `${ADMIN_PREFIX}/gatherings`
    ? clean((await request.clone().json().catch(() => ({})))?.tenantSlug, 80)
    : '';
  const tenant = await tenantBySlug(env, bodyTenant || url.searchParams.get('tenant') || DEFAULT_TENANT);
  if (!tenant) return json({ error: '활성 운영공간을 찾을 수 없습니다.' }, 404, request, env);

  if (request.method === 'GET' && path === `${ADMIN_PREFIX}/overview`) return adminOverview(request, env, tenant);
  if (request.method === 'POST' && path === `${ADMIN_PREFIX}/gatherings`) return createGathering(request, env, auth.data, tenant);
  if (request.method === 'GET' && path === `${ADMIN_PREFIX}/care-candidates`) return careCandidates(request, env, auth.data, tenant);
  if (request.method === 'GET' && path === `${ADMIN_PREFIX}/report-source`) return reportSource(request, env, tenant);

  const detail = path.match(/^\/api\/church\/admin\/participation\/gatherings\/([a-zA-Z0-9_-]+)$/);
  if (detail && request.method === 'GET') return gatheringDetail(request, env, tenant, detail[1]);
  if (detail && request.method === 'PUT') return updateGatheringStatus(request, env, auth.data, tenant, detail[1]);

  const rotate = path.match(/^\/api\/church\/admin\/participation\/gatherings\/([a-zA-Z0-9_-]+)\/token$/);
  if (rotate && request.method === 'POST') return rotateGatheringToken(request, env, auth.data, tenant, rotate[1]);

  return json({ error: 'Church Participation 관리자 API를 찾을 수 없습니다.' }, 404, request, env);
}

export async function handleChurchParticipation(request, env) {
  if (!env.DB) return json({ error: '데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith(PUBLIC_PREFIX) && !path.startsWith(ADMIN_PREFIX)) return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
  if (path.startsWith(ADMIN_PREFIX)) return handleAdmin(request, env);

  const gathering = path.match(/^\/api\/church\/participation\/gatherings\/([^/]+)$/);
  if (gathering && request.method === 'GET') return publicGatheringLookup(request, env, decodeURIComponent(gathering[1]));
  if (request.method === 'POST' && path === `${PUBLIC_PREFIX}/check-ins`) return publicCheckIn(request, env);
  return json({ error: 'Church Participation API를 찾을 수 없습니다.' }, 404, request, env);
}
