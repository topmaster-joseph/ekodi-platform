import authWorker from './auth-worker.js';

const PREFIX = '/api/books/admin/distribution';
const IMPORT_LIMIT = 500;
const ACCOUNT_STATUSES = new Set(['unknown', 'not_registered', 'registration_pending', 'active', 'action_required', 'suspended']);
const BOOK_STATUSES = new Set(['not_started', 'preparing', 'submitted', 'reviewing', 'action_required', 'approved', 'published', 'paused', 'rejected']);
const SYNC_MODES = new Set(['manual', 'csv', 'api']);
const CHECKLIST_KEYS = ['metadata', 'files', 'identifiers', 'pricing', 'rights', 'submitted'];

function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : '';
}

function json(data, status = 200, request, env) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  const origin = request ? allowedOrigin(request, env) : '';
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function validDate(value) {
  const text = clean(value, 10);
  return !text || /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function safeUrl(value) {
  const text = clean(value, 1000);
  if (!text) return '';
  try {
    const url = new URL(text);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function normalizeChecklist(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(CHECKLIST_KEYS.map(key => [key, Boolean(input[key])]));
}

function parseChecklist(value) {
  try { return normalizeChecklist(JSON.parse(value || '{}')); } catch { return normalizeChecklist({}); }
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function session(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, data: await response.clone().json() };
}

async function adminId(env, email) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first();
  return row?.id || null;
}

async function audit(env, email, action, resource, detail = '') {
  const id = await adminId(env, email);
  await env.DB.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, clean(detail, 500), new Date().toISOString()).run();
}

function channelRow(row) {
  return {
    code: row.code,
    name: row.name,
    scope: row.scope,
    portalUrl: row.portal_url,
    onboardingUrl: row.onboarding_url,
    helpUrl: row.help_url,
    accountStatus: row.account_status,
    accountNote: row.account_note,
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at,
  };
}

function statusRow(row) {
  return {
    id: Number(row.id),
    publicationId: row.publication_id,
    channelCode: row.channel_code,
    status: row.status,
    externalId: row.external_id,
    productUrl: row.product_url,
    submittedAt: row.submitted_at,
    publishedAt: row.published_at,
    lastCheckedAt: row.last_checked_at,
    note: row.note,
    sourceStatus: row.source_status || '',
    assignee: row.assignee || '',
    dueAt: row.due_at || '',
    checklist: parseChecklist(row.checklist_json),
    syncMode: row.sync_mode || 'manual',
    syncedAt: row.synced_at || '',
    updatedAt: row.updated_at,
  };
}

async function overview(request, env) {
  const [channelsResult, publicationsResult, statusesResult] = await Promise.all([
    env.DB.prepare('SELECT * FROM books_distribution_channels WHERE enabled = 1 ORDER BY sort_order, name').all(),
    env.DB.prepare(`SELECT id, catalog_no, title, author, stage, status, google_books_id, isbn_ebook, amazon_asin
      FROM books_publications ORDER BY sort_order, title`).all(),
    env.DB.prepare('SELECT * FROM books_distribution_status ORDER BY updated_at DESC, id DESC').all(),
  ]);

  const channels = channelsResult.results.map(channelRow);
  const publications = publicationsResult.results.map(row => ({
    id: row.id,
    catalogNo: row.catalog_no,
    title: row.title,
    author: row.author,
    stage: row.stage,
    status: row.status,
    identifiers: {
      googleBooks: row.google_books_id || '',
      isbnEbook: row.isbn_ebook || '',
      amazonAsin: row.amazon_asin || '',
    },
  }));
  const statuses = statusesResult.results.map(statusRow);

  const counts = {
    channels: channels.length,
    activeAccounts: channels.filter(channel => channel.accountStatus === 'active').length,
    published: statuses.filter(item => item.status === 'published').length,
    reviewing: statuses.filter(item => ['submitted', 'reviewing', 'approved'].includes(item.status)).length,
    actionRequired: statuses.filter(item => ['action_required', 'rejected'].includes(item.status)).length,
    tracked: statuses.filter(item => item.status !== 'not_started').length,
  };

  return json({ channels, publications, statuses, counts, checklistKeys: CHECKLIST_KEYS, importLimit: IMPORT_LIMIT }, 200, request, env);
}

async function updateChannel(request, env, sessionData, code) {
  const channel = await env.DB.prepare('SELECT * FROM books_distribution_channels WHERE code = ?').bind(code).first();
  if (!channel) return json({ error: '배포 채널을 찾을 수 없습니다.' }, 404, request, env);
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return json({ error: '채널 정보를 확인해 주세요.' }, 400, request, env);

  const accountStatus = clean(body.accountStatus ?? channel.account_status, 40);
  if (!ACCOUNT_STATUSES.has(accountStatus)) return json({ error: '계정 상태가 올바르지 않습니다.' }, 400, request, env);
  const accountNote = clean(body.accountNote ?? channel.account_note, 1000);
  const portalUrl = body.portalUrl === undefined ? channel.portal_url : safeUrl(body.portalUrl);
  const onboardingUrl = body.onboardingUrl === undefined ? channel.onboarding_url : safeUrl(body.onboardingUrl);
  const helpUrl = body.helpUrl === undefined ? channel.help_url : safeUrl(body.helpUrl);
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);

  await env.DB.prepare(`UPDATE books_distribution_channels SET
    account_status=?, account_note=?, portal_url=?, onboarding_url=?, help_url=?, updated_at=?, updated_by=?
    WHERE code=?`)
    .bind(accountStatus, accountNote, portalUrl, onboardingUrl, helpUrl, now, who, code).run();
  await audit(env, sessionData.email, 'books.distribution.channel.update', code, JSON.stringify({ accountStatus }));
  return json({ ok: true }, 200, request, env);
}

async function upsertStatus(request, env, sessionData, publicationId, channelCode) {
  const [publication, channel, current] = await Promise.all([
    env.DB.prepare('SELECT id FROM books_publications WHERE id = ?').bind(publicationId).first(),
    env.DB.prepare('SELECT code FROM books_distribution_channels WHERE code = ? AND enabled = 1').bind(channelCode).first(),
    env.DB.prepare('SELECT * FROM books_distribution_status WHERE publication_id = ? AND channel_code = ?').bind(publicationId, channelCode).first(),
  ]);
  if (!publication) return json({ error: '출판물을 찾을 수 없습니다.' }, 404, request, env);
  if (!channel) return json({ error: '배포 채널을 찾을 수 없습니다.' }, 404, request, env);

  const body = await readBody(request);
  if (!body || typeof body !== 'object') return json({ error: '배포 상태 정보를 확인해 주세요.' }, 400, request, env);
  const status = clean(body.status ?? current?.status ?? 'not_started', 40);
  if (!BOOK_STATUSES.has(status)) return json({ error: '배포 상태가 올바르지 않습니다.' }, 400, request, env);
  const submittedAt = validDate(body.submittedAt ?? current?.submitted_at ?? '');
  const publishedAt = validDate(body.publishedAt ?? current?.published_at ?? '');
  const lastCheckedAt = validDate(body.lastCheckedAt ?? current?.last_checked_at ?? '');
  const dueAt = validDate(body.dueAt ?? current?.due_at ?? '');
  const syncedAt = validDate(body.syncedAt ?? current?.synced_at ?? '');
  if ([submittedAt, publishedAt, lastCheckedAt, dueAt, syncedAt].some(value => value === null)) {
    return json({ error: '날짜는 YYYY-MM-DD 형식으로 입력해 주세요.' }, 400, request, env);
  }
  const externalId = clean(body.externalId ?? current?.external_id, 160);
  const suppliedProductUrl = body.productUrl === undefined ? current?.product_url || '' : body.productUrl;
  const productUrl = safeUrl(suppliedProductUrl);
  if (suppliedProductUrl && !productUrl) return json({ error: '판매 페이지 URL을 확인해 주세요.' }, 400, request, env);
  const note = clean(body.note ?? current?.note, 1200);
  const sourceStatus = clean(body.sourceStatus ?? current?.source_status, 200);
  const assignee = clean(body.assignee ?? current?.assignee, 120);
  const checklist = normalizeChecklist(body.checklist ?? parseChecklist(current?.checklist_json));
  const syncMode = clean(body.syncMode ?? current?.sync_mode ?? 'manual', 20) || 'manual';
  if (!SYNC_MODES.has(syncMode)) return json({ error: '동기화 방식이 올바르지 않습니다.' }, 400, request, env);
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);

  await env.DB.prepare(`INSERT INTO books_distribution_status
    (publication_id, channel_code, status, external_id, product_url, submitted_at, published_at, last_checked_at, note,
     source_status, assignee, due_at, checklist_json, sync_mode, synced_at, created_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(publication_id, channel_code) DO UPDATE SET
      status=excluded.status,
      external_id=excluded.external_id,
      product_url=excluded.product_url,
      submitted_at=excluded.submitted_at,
      published_at=excluded.published_at,
      last_checked_at=excluded.last_checked_at,
      note=excluded.note,
      source_status=excluded.source_status,
      assignee=excluded.assignee,
      due_at=excluded.due_at,
      checklist_json=excluded.checklist_json,
      sync_mode=excluded.sync_mode,
      synced_at=excluded.synced_at,
      updated_at=excluded.updated_at,
      updated_by=excluded.updated_by`)
    .bind(publicationId, channelCode, status, externalId, productUrl, submittedAt || '', publishedAt || '', lastCheckedAt || '', note,
      sourceStatus, assignee, dueAt || '', JSON.stringify(checklist), syncMode, syncedAt || '', now, now, who).run();
  await audit(env, sessionData.email, 'books.distribution.status.update', `${publicationId}:${channelCode}`, JSON.stringify({ status, externalId, assignee, dueAt, syncMode }));
  return json({ ok: true }, 200, request, env);
}

function importValue(row, key, currentValue = '') {
  return Object.prototype.hasOwnProperty.call(row, key) ? row[key] : currentValue;
}

async function importStatuses(request, env, sessionData) {
  const body = await readBody(request);
  const rows = body?.rows;
  if (!Array.isArray(rows) || !rows.length) return json({ error: '가져올 배포 행이 없습니다.' }, 400, request, env);
  if (rows.length > IMPORT_LIMIT) return json({ error: `한 번에 최대 ${IMPORT_LIMIT}행까지 가져올 수 있습니다.` }, 413, request, env);

  const [publicationsResult, channelsResult, currentResult] = await Promise.all([
    env.DB.prepare('SELECT id FROM books_publications').all(),
    env.DB.prepare('SELECT code FROM books_distribution_channels WHERE enabled = 1').all(),
    env.DB.prepare('SELECT * FROM books_distribution_status').all(),
  ]);
  const publicationIds = new Set(publicationsResult.results.map(row => row.id));
  const channelCodes = new Set(channelsResult.results.map(row => row.code));
  const currentMap = new Map(currentResult.results.map(row => [`${row.publication_id}:${row.channel_code}`, row]));
  const errors = [];
  const normalized = [];
  const defaultSyncDate = today();

  rows.forEach((input, index) => {
    const row = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const line = index + 2;
    const publicationId = clean(row.publicationId, 80);
    const channelCode = clean(row.channelCode, 80);
    const current = currentMap.get(`${publicationId}:${channelCode}`) || {};
    const status = clean(importValue(row, 'status', current.status || 'not_started'), 40);
    if (!publicationIds.has(publicationId)) errors.push({ line, field: 'publication_id', message: `출판물을 찾을 수 없습니다: ${publicationId || '(blank)'}` });
    if (!channelCodes.has(channelCode)) errors.push({ line, field: 'channel_code', message: `배포 채널을 찾을 수 없습니다: ${channelCode || '(blank)'}` });
    if (!BOOK_STATUSES.has(status)) errors.push({ line, field: 'status', message: `지원하지 않는 상태입니다: ${status || '(blank)'}` });

    const submittedAt = validDate(importValue(row, 'submittedAt', current.submitted_at || ''));
    const publishedAt = validDate(importValue(row, 'publishedAt', current.published_at || ''));
    const syncedAt = validDate(importValue(row, 'syncedAt', defaultSyncDate));
    const lastCheckedAt = validDate(importValue(row, 'lastCheckedAt', syncedAt || current.last_checked_at || ''));
    const dueAt = validDate(importValue(row, 'dueAt', current.due_at || ''));
    for (const [field, value] of [['submitted_at', submittedAt], ['published_at', publishedAt], ['last_checked_at', lastCheckedAt], ['due_at', dueAt], ['synced_at', syncedAt]]) {
      if (value === null) errors.push({ line, field, message: '날짜는 YYYY-MM-DD 형식이어야 합니다.' });
    }

    const suppliedProductUrl = importValue(row, 'productUrl', current.product_url || '');
    const productUrl = safeUrl(suppliedProductUrl);
    if (suppliedProductUrl && !productUrl) errors.push({ line, field: 'product_url', message: 'http/https 판매 URL을 확인해 주세요.' });

    normalized.push({
      publicationId,
      channelCode,
      status,
      externalId: clean(importValue(row, 'externalId', current.external_id || ''), 160),
      productUrl,
      submittedAt: submittedAt || '',
      publishedAt: publishedAt || '',
      lastCheckedAt: lastCheckedAt || '',
      note: clean(importValue(row, 'note', current.note || ''), 1200),
      sourceStatus: clean(importValue(row, 'sourceStatus', current.source_status || ''), 200),
      assignee: clean(importValue(row, 'assignee', current.assignee || ''), 120),
      dueAt: dueAt || '',
      checklist: Object.prototype.hasOwnProperty.call(row, 'checklist') ? normalizeChecklist(row.checklist) : parseChecklist(current.checklist_json),
      syncMode: 'csv',
      syncedAt: syncedAt || defaultSyncDate,
    });
  });

  const duplicateKeys = new Set();
  const seen = new Set();
  normalized.forEach((row, index) => {
    const key = `${row.publicationId}:${row.channelCode}`;
    if (seen.has(key)) duplicateKeys.add(key);
    seen.add(key);
    if (duplicateKeys.has(key)) errors.push({ line: index + 2, field: 'publication_id/channel_code', message: `파일 안에 중복 행이 있습니다: ${key}` });
  });

  if (errors.length) return json({ error: '배포 가져오기 검증에 실패했습니다. 데이터는 저장되지 않았습니다.', errors: errors.slice(0, 100), errorCount: errors.length }, 400, request, env);

  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);
  const statement = env.DB.prepare(`INSERT INTO books_distribution_status
    (publication_id, channel_code, status, external_id, product_url, submitted_at, published_at, last_checked_at, note,
     source_status, assignee, due_at, checklist_json, sync_mode, synced_at, created_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(publication_id, channel_code) DO UPDATE SET
      status=excluded.status,
      external_id=excluded.external_id,
      product_url=excluded.product_url,
      submitted_at=excluded.submitted_at,
      published_at=excluded.published_at,
      last_checked_at=excluded.last_checked_at,
      note=excluded.note,
      source_status=excluded.source_status,
      assignee=excluded.assignee,
      due_at=excluded.due_at,
      checklist_json=excluded.checklist_json,
      sync_mode=excluded.sync_mode,
      synced_at=excluded.synced_at,
      updated_at=excluded.updated_at,
      updated_by=excluded.updated_by`);
  await env.DB.batch(normalized.map(row => statement.bind(
    row.publicationId, row.channelCode, row.status, row.externalId, row.productUrl, row.submittedAt, row.publishedAt,
    row.lastCheckedAt, row.note, row.sourceStatus, row.assignee, row.dueAt, JSON.stringify(row.checklist), row.syncMode,
    row.syncedAt, now, now, who,
  )));
  await audit(env, sessionData.email, 'books.distribution.import.csv', `rows:${normalized.length}`, JSON.stringify({ rows: normalized.length, channels: [...new Set(normalized.map(row => row.channelCode))] }));
  return json({ ok: true, imported: normalized.length, syncMode: 'csv', syncedAt: defaultSyncDate }, 200, request, env);
}

async function resetStatus(request, env, sessionData, publicationId, channelCode) {
  await env.DB.prepare('DELETE FROM books_distribution_status WHERE publication_id = ? AND channel_code = ?')
    .bind(publicationId, channelCode).run();
  await audit(env, sessionData.email, 'books.distribution.status.reset', `${publicationId}:${channelCode}`, 'reset');
  return json({ ok: true }, 200, request, env);
}

export async function handleBooksDistributionRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith(PREFIX)) return null;

  const auth = await session(request, env);
  if (!auth.response.ok) return auth.response;
  const sessionData = auth.data || {};
  if (!sessionData.email) return json({ error: '관리자 인증이 필요합니다.' }, 401, request, env);

  if (request.method === 'GET' && path === PREFIX) return overview(request, env);
  if (request.method === 'POST' && path === `${PREFIX}/import`) return importStatuses(request, env, sessionData);

  const channelMatch = path.match(/^\/api\/books\/admin\/distribution\/channels\/([^/]+)$/);
  if (channelMatch && request.method === 'PUT') return updateChannel(request, env, sessionData, decodeURIComponent(channelMatch[1]));

  const statusMatch = path.match(/^\/api\/books\/admin\/distribution\/status\/([^/]+)\/([^/]+)$/);
  if (statusMatch) {
    const publicationId = decodeURIComponent(statusMatch[1]);
    const channelCode = decodeURIComponent(statusMatch[2]);
    if (request.method === 'PUT') return upsertStatus(request, env, sessionData, publicationId, channelCode);
    if (request.method === 'DELETE') return resetStatus(request, env, sessionData, publicationId, channelCode);
  }

  return json({ error: 'Books distribution API 경로를 찾을 수 없습니다.' }, 404, request, env);
}
