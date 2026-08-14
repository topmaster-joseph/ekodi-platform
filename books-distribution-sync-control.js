import authWorker from './auth-worker.js';

const PREFIX = '/api/books/admin/distribution/sync';
const INTERNAL_STATUSES = new Set(['not_started', 'preparing', 'submitted', 'reviewing', 'action_required', 'approved', 'published', 'paused', 'rejected']);
const INTERNAL_LABELS = new Map([
  ['미등록', 'not_started'], ['등록 준비', 'preparing'], ['등록준비', 'preparing'], ['등록 제출', 'submitted'], ['등록제출', 'submitted'],
  ['심사중', 'reviewing'], ['심사 중', 'reviewing'], ['조치 필요', 'action_required'], ['조치필요', 'action_required'],
  ['승인', 'approved'], ['판매중', 'published'], ['판매 중', 'published'], ['판매중지', 'paused'], ['판매 중지', 'paused'], ['반려', 'rejected'],
]);

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

function normalize(value) {
  return clean(value, 500).toLowerCase().replace(/\s+/g, ' ').trim();
}

function mapGoogleStatus(value) {
  const status = normalize(value);
  if (!status) return '';
  if (status.includes('live on google play') || (status.includes('google play') && (status.includes('판매 중') || status.includes('판매중') || status.includes('라이브')))) return 'published';
  if (status.includes('pre-order on google play') || status.includes('예약판매') || status.includes('예약 판매')) return 'approved';
  if (status.includes('live on google books') || (status.includes('google books') && status.includes('라이브'))) return 'approved';
  if (status.includes('needs approval') || status.includes('승인 필요') || status.includes('승인필요')) return 'preparing';
  if (status.includes('needs action') || status.includes('조치 필요') || status.includes('조치필요')) return 'action_required';
  if (status.includes('in process') || status.includes('처리 중') || status.includes('처리중') || status === 'unknown' || status === '알 수 없음') return 'reviewing';
  if (status.includes('deactivated') || status.includes('비활성')) return 'paused';
  if (status.includes("account isn't approved") || status.includes('account is not approved') || status.includes('계정') && status.includes('승인') && status.includes('않')) return 'action_required';
  return '';
}

function mapInternalStatus(value) {
  const raw = clean(value, 80);
  if (!raw) return '';
  if (INTERNAL_STATUSES.has(raw)) return raw;
  const lower = raw.toLowerCase().replace(/[ -]+/g, '_');
  if (INTERNAL_STATUSES.has(lower)) return lower;
  return INTERNAL_LABELS.get(raw) || '';
}

function identifierKeys(value) {
  const text = clean(value, 180);
  if (!text) return [];
  const stripped = text.replace(/^(isbn|ggkey|asin|id)\s*:\s*/i, '').trim();
  const compact = stripped.replace(/[\s-]+/g, '').toUpperCase();
  return [...new Set([text.toLowerCase(), stripped.toLowerCase(), compact.toLowerCase()].filter(Boolean))];
}

async function publicationIndex(env) {
  const rows = await env.DB.prepare(`SELECT id, catalog_no, isbn_ebook, google_books_id, amazon_asin FROM books_publications`).all();
  const index = new Map();
  for (const row of rows.results) {
    for (const value of [row.id, row.catalog_no, row.isbn_ebook, row.google_books_id, row.amazon_asin]) {
      for (const key of identifierKeys(value)) if (!index.has(key)) index.set(key, row);
    }
  }
  return index;
}

function findPublication(index, identifier) {
  for (const key of identifierKeys(identifier)) {
    const row = index.get(key);
    if (row) return row;
  }
  return null;
}

async function syncOverview(request, env) {
  const [batches, items] = await Promise.all([
    env.DB.prepare(`SELECT b.*, c.name AS channel_name
      FROM books_distribution_sync_batches b
      LEFT JOIN books_distribution_channels c ON c.code = b.channel_code
      ORDER BY b.created_at DESC, b.id DESC LIMIT 20`).all(),
    env.DB.prepare(`SELECT publication_id, channel_code, platform_status, sync_source, sync_updated_at
      FROM books_distribution_status
      WHERE platform_status <> '' OR sync_updated_at <> ''
      ORDER BY sync_updated_at DESC, id DESC`).all(),
  ]);
  return json({
    batches: batches.results.map(row => ({
      id: Number(row.id), channelCode: row.channel_code, channelName: row.channel_name || row.channel_code,
      sourceType: row.source_type, fileName: row.source_filename, rowCount: Number(row.row_count || 0),
      matchedCount: Number(row.matched_count || 0), updatedCount: Number(row.updated_count || 0),
      skippedCount: Number(row.skipped_count || 0), errorCount: Number(row.error_count || 0), createdAt: row.created_at,
    })),
    items: items.results.map(row => ({
      publicationId: row.publication_id, channelCode: row.channel_code, platformStatus: row.platform_status,
      syncSource: row.sync_source, syncUpdatedAt: row.sync_updated_at,
    })),
  }, 200, request, env);
}

async function importRows(request, env, sessionData, channelCode, sourceType) {
  const channel = await env.DB.prepare('SELECT code, name FROM books_distribution_channels WHERE code = ? AND enabled = 1').bind(channelCode).first();
  if (!channel) return json({ error: '배포 채널을 찾을 수 없습니다.' }, 404, request, env);

  const body = await readBody(request);
  if (!body || !Array.isArray(body.rows)) return json({ error: '가져올 상태 행을 확인해 주세요.' }, 400, request, env);
  if (!body.rows.length) return json({ error: '가져올 상태 행이 없습니다.' }, 400, request, env);
  if (body.rows.length > 5000) return json({ error: '한 번에 최대 5,000행까지 가져올 수 있습니다.' }, 400, request, env);

  const index = await publicationIndex(env);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const who = await adminId(env, sessionData.email);
  const statements = [];
  const unmatched = [];
  const unmapped = [];
  let matchedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < body.rows.length; i += 1) {
    const row = body.rows[i] || {};
    const identifier = clean(row.identifier, 180);
    const platformStatus = clean(row.platformStatus ?? row.status, 240);
    if (!identifier) { errorCount += 1; continue; }
    const publication = findPublication(index, identifier);
    if (!publication) {
      unmatched.push(identifier);
      skippedCount += 1;
      continue;
    }
    matchedCount += 1;

    let status = sourceType === 'google_spreadsheet' ? mapGoogleStatus(platformStatus) : mapInternalStatus(row.status);
    if (!status && sourceType !== 'google_spreadsheet') status = mapGoogleStatus(platformStatus);
    if (!status) {
      unmapped.push(platformStatus || '(빈 상태)');
      skippedCount += 1;
      continue;
    }

    const externalId = clean(row.externalId, 160) || ((/^ggkey\s*:/i.test(identifier) || (channelCode === 'amazon-kdp' && /^[A-Z0-9]{10}$/i.test(identifier))) ? identifier.replace(/^(ggkey|asin)\s*:\s*/i, '') : '');
    const productUrl = safeUrl(row.productUrl);
    const syncSource = sourceType === 'google_spreadsheet' ? 'google-partner-spreadsheet' : 'ekodi-status-csv';
    const displayStatus = platformStatus || clean(row.status, 240);

    statements.push(env.DB.prepare(`INSERT INTO books_distribution_status
      (publication_id, channel_code, status, external_id, product_url, submitted_at, published_at, last_checked_at, note,
       created_at, updated_at, updated_by, platform_status, sync_source, sync_updated_at)
      VALUES (?, ?, ?, ?, ?, '', '', ?, '', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(publication_id, channel_code) DO UPDATE SET
        status=excluded.status,
        external_id=CASE WHEN excluded.external_id <> '' THEN excluded.external_id ELSE books_distribution_status.external_id END,
        product_url=CASE WHEN excluded.product_url <> '' THEN excluded.product_url ELSE books_distribution_status.product_url END,
        last_checked_at=excluded.last_checked_at,
        platform_status=excluded.platform_status,
        sync_source=excluded.sync_source,
        sync_updated_at=excluded.sync_updated_at,
        updated_at=excluded.updated_at,
        updated_by=excluded.updated_by`)
      .bind(publication.id, channelCode, status, externalId, productUrl, today, now, now, who, displayStatus, syncSource, now));
    updatedCount += 1;
  }

  for (let i = 0; i < statements.length; i += 50) {
    await env.DB.batch(statements.slice(i, i + 50));
  }

  const detail = JSON.stringify({ unmatched: [...new Set(unmatched)].slice(0, 30), unmapped: [...new Set(unmapped)].slice(0, 30) });
  const batch = await env.DB.prepare(`INSERT INTO books_distribution_sync_batches
    (channel_code, source_type, source_filename, row_count, matched_count, updated_count, skipped_count, error_count, detail_json, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(channelCode, sourceType, clean(body.fileName, 240), body.rows.length, matchedCount, updatedCount, skippedCount, errorCount, detail, now, who).run();
  const batchId = Number(batch.meta?.last_row_id || 0);
  await audit(env, sessionData.email, 'books.distribution.sync.import', `${channelCode}:${batchId}`, JSON.stringify({ sourceType, rows: body.rows.length, matchedCount, updatedCount, skippedCount, errorCount }));

  return json({
    ok: true, batchId, channelCode, channelName: channel.name, rowCount: body.rows.length,
    matchedCount, updatedCount, skippedCount, errorCount,
    unmatched: [...new Set(unmatched)].slice(0, 30), unmapped: [...new Set(unmapped)].slice(0, 30),
  }, 200, request, env);
}

export async function handleBooksDistributionSyncRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith(PREFIX)) return null;

  const auth = await session(request, env);
  if (!auth.response.ok) return auth.response;
  const sessionData = auth.data || {};
  if (!sessionData.email) return json({ error: '관리자 인증이 필요합니다.' }, 401, request, env);

  if (request.method === 'GET' && path === PREFIX) return syncOverview(request, env);
  if (request.method === 'POST' && path === `${PREFIX}/google-play-books`) {
    return importRows(request, env, sessionData, 'google-play-books', 'google_spreadsheet');
  }

  const manualMatch = path.match(/^\/api\/books\/admin\/distribution\/sync\/status-csv\/([^/]+)$/);
  if (manualMatch && request.method === 'POST') {
    return importRows(request, env, sessionData, decodeURIComponent(manualMatch[1]), 'manual_csv');
  }

  return json({ error: 'Books distribution sync API 경로를 찾을 수 없습니다.' }, 404, request, env);
}
