import authWorker from './auth-worker.js';

const PREFIX = '/api/books/admin/assets';
const EDITION_STATUSES = new Set(['draft', 'released', 'superseded', 'withdrawn']);
const ASSET_TYPES = new Set(['manuscript', 'epub', 'pdf', 'cover', 'print_master', 'sample', 'metadata', 'other']);
const ASSET_STATUSES = new Set(['current', 'superseded', 'archived']);
const CRITICAL_TYPES = new Set(['epub', 'pdf', 'cover']);

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

function clean(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : min;
}
function validDate(value) {
  const text = clean(value, 10);
  return !text || /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}
function safeUrl(value) {
  const text = clean(value, 1000);
  if (!text) return '';
  try {
    const url = new URL(text);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}
function checksum(value) {
  const text = clean(value, 64).toLowerCase();
  return !text || /^[a-f0-9]{64}$/.test(text) ? text : null;
}
async function readBody(request) { try { return await request.json(); } catch { return null; } }

async function session(request, env) {
  const url = new URL(request.url); url.pathname = '/api/session'; url.search = '';
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
  await env.DB.prepare('INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, action, resource, clean(detail, 800), new Date().toISOString()).run();
}

function editionRow(row) {
  return {
    id: row.id,
    publicationId: row.publication_id,
    editionLabel: row.edition_label,
    versionLabel: row.version_label,
    status: row.status,
    releaseDate: row.release_date,
    isbnEbookSnapshot: row.isbn_ebook_snapshot,
    isbnPrintSnapshot: row.isbn_print_snapshot,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function assetRow(row) {
  return {
    id: row.id,
    publicationId: row.publication_id,
    editionId: row.edition_id || '',
    assetType: row.asset_type,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    checksumSha256: row.checksum_sha256,
    storageRef: row.storage_ref,
    sourceUrl: row.source_url,
    versionLabel: row.version_label,
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function preflight(publication, edition, assets, distribution = {}) {
  const current = assets.filter(asset => asset.status === 'current' && asset.editionId === edition.id);
  const cover = current.find(asset => asset.assetType === 'cover');
  const content = current.filter(asset => ['epub', 'pdf'].includes(asset.assetType));
  const critical = [cover, ...content].filter(Boolean);
  const checks = [
    { code: 'title', label: 'Title', required: true, pass: Boolean(clean(publication.title)), detail: publication.title || '도서명 누락' },
    { code: 'author', label: 'Author', required: true, pass: Boolean(clean(publication.author)), detail: publication.author || '저자 누락' },
    { code: 'edition', label: 'Edition Version', required: true, pass: Boolean(clean(edition.versionLabel)), detail: edition.versionLabel || '버전 누락' },
    { code: 'cover', label: 'Cover', required: true, pass: Boolean(cover), detail: cover?.filename || '현재 표지 자산 없음' },
    { code: 'content', label: 'EPUB/PDF', required: true, pass: content.length > 0, detail: content.map(asset => asset.filename).join(', ') || '현재 EPUB/PDF 자산 없음' },
    { code: 'integrity', label: 'SHA-256', required: true, pass: critical.length > 0 && critical.every(asset => Boolean(asset.checksumSha256)), detail: critical.every(asset => Boolean(asset.checksumSha256)) ? '무결성 해시 확인' : '표지/본문 SHA-256 누락' },
    { code: 'storage', label: 'Storage Reference', required: true, pass: critical.length > 0 && critical.every(asset => Boolean(asset.storageRef || asset.sourceUrl)), detail: critical.every(asset => Boolean(asset.storageRef || asset.sourceUrl)) ? '보관 위치 확인' : '표지/본문 보관 참조 누락' },
    { code: 'isbn', label: 'ISBN', required: false, pass: Boolean(publication.isbnEbook), detail: publication.isbnEbook || 'eBook ISBN 미등록' },
    { code: 'abstract', label: 'Abstract', required: false, pass: Boolean(clean(publication.abstract)), detail: publication.abstract ? '등록됨' : '소개/초록 미등록' },
    { code: 'citation', label: 'Citation', required: false, pass: Boolean(clean(publication.citation)), detail: publication.citation ? '등록됨' : '인용정보 미등록' },
    { code: 'distribution', label: 'Distribution', required: false, pass: Number(distribution.tracked || 0) > 0, detail: `${Number(distribution.published || 0)} live / ${Number(distribution.tracked || 0)} tracked` },
  ];
  const requiredFailures = checks.filter(check => check.required && !check.pass);
  const warnings = checks.filter(check => !check.required && !check.pass);
  return {
    ready: requiredFailures.length === 0,
    requiredFailures: requiredFailures.length,
    warnings: warnings.length,
    checks,
  };
}

async function overview(request, env) {
  const [publicationsResult, editionsResult, assetsResult, distributionResult] = await Promise.all([
    env.DB.prepare(`SELECT id, catalog_no, title, author, stage, status, language_label, abstract, citation, isbn_ebook
      FROM books_publications ORDER BY sort_order, title`).all(),
    env.DB.prepare('SELECT * FROM books_editions ORDER BY publication_id, created_at DESC').all(),
    env.DB.prepare('SELECT * FROM books_publication_assets ORDER BY publication_id, created_at DESC').all(),
    env.DB.prepare(`SELECT publication_id,
      SUM(CASE WHEN status <> 'not_started' THEN 1 ELSE 0 END) AS tracked,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published
      FROM books_distribution_status GROUP BY publication_id`).all(),
  ]);
  const editions = editionsResult.results.map(editionRow);
  const assets = assetsResult.results.map(assetRow);
  const distribution = new Map(distributionResult.results.map(row => [row.publication_id, { tracked: Number(row.tracked || 0), published: Number(row.published || 0) }]));
  const publications = publicationsResult.results.map(row => {
    const publication = {
      id: row.id,
      catalogNo: row.catalog_no,
      title: row.title,
      author: row.author,
      stage: row.stage,
      status: row.status,
      languageLabel: row.language_label,
      abstract: row.abstract,
      citation: row.citation,
      isbnEbook: row.isbn_ebook,
    };
    const publicationEditions = editions.filter(edition => edition.publicationId === row.id);
    const currentEdition = publicationEditions.find(edition => edition.status === 'released') || publicationEditions.find(edition => edition.status === 'draft') || null;
    return {
      ...publication,
      editionCount: publicationEditions.length,
      currentEditionId: currentEdition?.id || '',
      currentVersion: currentEdition?.versionLabel || '',
      releaseReadiness: currentEdition ? preflight(publication, currentEdition, assets, distribution.get(row.id) || {}) : { ready: false, requiredFailures: 1, warnings: 0, checks: [{ code: 'edition', label: 'Edition Version', required: true, pass: false, detail: '에디션 없음' }] },
    };
  });
  const editionPreflight = Object.fromEntries(editions.map(edition => {
    const publication = publications.find(item => item.id === edition.publicationId) || {};
    return [edition.id, preflight(publication, edition, assets, distribution.get(edition.publicationId) || {})];
  }));
  const metrics = {
    publications: publications.length,
    editions: editions.length,
    releasedEditions: editions.filter(edition => edition.status === 'released').length,
    currentAssets: assets.filter(asset => asset.status === 'current').length,
    releaseReady: editions.filter(edition => editionPreflight[edition.id]?.ready).length,
    integrityMissing: assets.filter(asset => asset.status === 'current' && CRITICAL_TYPES.has(asset.assetType) && !asset.checksumSha256).length,
  };
  return json({ publications, editions, assets, editionPreflight, metrics, enums: { editionStatuses: [...EDITION_STATUSES], assetTypes: [...ASSET_TYPES], assetStatuses: [...ASSET_STATUSES] } }, 200, request, env);
}

async function publicationExists(env, id) {
  return env.DB.prepare('SELECT id, isbn_ebook FROM books_publications WHERE id=?').bind(id).first();
}
async function editionExists(env, id) {
  return env.DB.prepare('SELECT * FROM books_editions WHERE id=?').bind(id).first();
}

async function createEdition(request, env, auth) {
  const input = await readBody(request);
  const publicationId = clean(input?.publicationId, 80);
  const versionLabel = clean(input?.versionLabel, 80);
  if (!publicationId || !await publicationExists(env, publicationId)) return json({ error: '출판물을 선택해 주세요.' }, 400, request, env);
  if (!versionLabel) return json({ error: '에디션 버전을 입력해 주세요.' }, 400, request, env);
  const id = `edition-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const who = await adminId(env, auth.email);
  try {
    await env.DB.prepare(`INSERT INTO books_editions
      (id, publication_id, edition_label, version_label, status, release_date, isbn_ebook_snapshot, isbn_print_snapshot, note, created_at, updated_at, created_by, updated_by)
      VALUES (?, ?, ?, ?, 'draft', '', '', '', ?, ?, ?, ?, ?)`)
      .bind(id, publicationId, clean(input?.editionLabel, 160), versionLabel, clean(input?.note, 1200), now, now, who, who).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) return json({ error: '같은 출판물에 동일한 버전명이 이미 있습니다.' }, 409, request, env);
    throw error;
  }
  await audit(env, auth.email, 'books.assets.edition.create', id, JSON.stringify({ publicationId, versionLabel }));
  return json({ ok: true, id }, 201, request, env);
}

async function updateEdition(request, env, auth, id) {
  const current = await editionExists(env, id);
  if (!current) return json({ error: '에디션을 찾을 수 없습니다.' }, 404, request, env);
  const input = await readBody(request);
  const versionLabel = clean(input?.versionLabel ?? current.version_label, 80);
  const editionLabel = clean(input?.editionLabel ?? current.edition_label, 160);
  const note = clean(input?.note ?? current.note, 1200);
  if (!versionLabel) return json({ error: '에디션 버전을 입력해 주세요.' }, 400, request, env);
  const requestedStatus = clean(input?.status ?? current.status, 30);
  if (!EDITION_STATUSES.has(requestedStatus)) return json({ error: '에디션 상태가 올바르지 않습니다.' }, 400, request, env);
  if (requestedStatus === 'released' && current.status !== 'released') return json({ error: 'Released 전환은 Release Preflight 버튼을 사용해 주세요.' }, 409, request, env);
  if (current.status === 'released' && requestedStatus === 'draft') return json({ error: 'Released 에디션은 Draft로 되돌릴 수 없습니다. 새 버전을 만드세요.' }, 409, request, env);
  const now = new Date().toISOString();
  const who = await adminId(env, auth.email);
  try {
    await env.DB.prepare('UPDATE books_editions SET edition_label=?, version_label=?, status=?, note=?, updated_at=?, updated_by=? WHERE id=?')
      .bind(editionLabel, versionLabel, requestedStatus, note, now, who, id).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) return json({ error: '같은 출판물에 동일한 버전명이 이미 있습니다.' }, 409, request, env);
    throw error;
  }
  await audit(env, auth.email, 'books.assets.edition.update', id, JSON.stringify({ versionLabel, status: requestedStatus }));
  return json({ ok: true, id }, 200, request, env);
}

async function normalizeAsset(input, env, current = {}) {
  const publicationId = clean(input?.publicationId ?? current.publication_id, 80);
  const editionId = clean(input?.editionId ?? current.edition_id, 120);
  const assetType = clean(input?.assetType ?? current.asset_type, 30);
  const filename = clean(input?.filename ?? current.filename, 300);
  const status = clean(input?.status ?? current.status ?? 'current', 30);
  const sourceRaw = input?.sourceUrl === undefined ? current.source_url || '' : input.sourceUrl;
  const sourceUrl = safeUrl(sourceRaw);
  const hash = checksum(input?.checksumSha256 ?? current.checksum_sha256);
  if (!publicationId || !await publicationExists(env, publicationId)) throw new Error('출판물을 선택해 주세요.');
  if (editionId) {
    const edition = await editionExists(env, editionId);
    if (!edition || edition.publication_id !== publicationId) throw new Error('선택한 에디션이 출판물과 일치하지 않습니다.');
  }
  if (!ASSET_TYPES.has(assetType)) throw new Error('자산 유형이 올바르지 않습니다.');
  if (!ASSET_STATUSES.has(status)) throw new Error('자산 상태가 올바르지 않습니다.');
  if (!filename) throw new Error('파일명을 입력해 주세요.');
  if (sourceRaw && !sourceUrl) throw new Error('원본 URL은 http/https 주소여야 합니다.');
  if (hash === null) throw new Error('SHA-256은 64자리 16진수여야 합니다.');
  return {
    publicationId,
    editionId: editionId || null,
    assetType,
    filename,
    mimeType: clean(input?.mimeType ?? current.mime_type, 160),
    sizeBytes: integer(input?.sizeBytes ?? current.size_bytes, 0, 10_000_000_000),
    checksumSha256: hash || '',
    storageRef: clean(input?.storageRef ?? current.storage_ref, 500),
    sourceUrl,
    versionLabel: clean(input?.versionLabel ?? current.version_label, 120),
    status,
    note: clean(input?.note ?? current.note, 1200),
  };
}

async function saveAsset(env, auth, id, normalized, isCreate) {
  const now = new Date().toISOString();
  const who = await adminId(env, auth.email);
  const ops = [];
  if (normalized.status === 'current') {
    if (normalized.editionId) {
      ops.push(env.DB.prepare(`UPDATE books_publication_assets SET status='superseded', updated_at=?, updated_by=?
        WHERE publication_id=? AND edition_id=? AND asset_type=? AND status='current' AND id<>?`)
        .bind(now, who, normalized.publicationId, normalized.editionId, normalized.assetType, id));
    } else {
      ops.push(env.DB.prepare(`UPDATE books_publication_assets SET status='superseded', updated_at=?, updated_by=?
        WHERE publication_id=? AND edition_id IS NULL AND asset_type=? AND status='current' AND id<>?`)
        .bind(now, who, normalized.publicationId, normalized.assetType, id));
    }
  }
  if (isCreate) {
    ops.push(env.DB.prepare(`INSERT INTO books_publication_assets
      (id, publication_id, edition_id, asset_type, filename, mime_type, size_bytes, checksum_sha256, storage_ref, source_url, version_label, status, note, created_at, updated_at, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, normalized.publicationId, normalized.editionId, normalized.assetType, normalized.filename, normalized.mimeType,
        normalized.sizeBytes, normalized.checksumSha256, normalized.storageRef, normalized.sourceUrl, normalized.versionLabel,
        normalized.status, normalized.note, now, now, who, who));
  } else {
    ops.push(env.DB.prepare(`UPDATE books_publication_assets SET publication_id=?, edition_id=?, asset_type=?, filename=?, mime_type=?, size_bytes=?, checksum_sha256=?, storage_ref=?, source_url=?, version_label=?, status=?, note=?, updated_at=?, updated_by=? WHERE id=?`)
      .bind(normalized.publicationId, normalized.editionId, normalized.assetType, normalized.filename, normalized.mimeType,
        normalized.sizeBytes, normalized.checksumSha256, normalized.storageRef, normalized.sourceUrl, normalized.versionLabel,
        normalized.status, normalized.note, now, who, id));
  }
  await env.DB.batch(ops);
}

async function createAsset(request, env, auth) {
  let normalized;
  try { normalized = await normalizeAsset(await readBody(request), env); } catch (error) { return json({ error: error.message }, 400, request, env); }
  const id = `asset-${crypto.randomUUID()}`;
  await saveAsset(env, auth, id, normalized, true);
  await audit(env, auth.email, 'books.assets.asset.create', id, JSON.stringify({ publicationId: normalized.publicationId, editionId: normalized.editionId, assetType: normalized.assetType, filename: normalized.filename }));
  return json({ ok: true, id }, 201, request, env);
}

async function updateAsset(request, env, auth, id) {
  const current = await env.DB.prepare('SELECT * FROM books_publication_assets WHERE id=?').bind(id).first();
  if (!current) return json({ error: '자산을 찾을 수 없습니다.' }, 404, request, env);
  let normalized;
  try { normalized = await normalizeAsset(await readBody(request), env, current); } catch (error) { return json({ error: error.message }, 400, request, env); }
  await saveAsset(env, auth, id, normalized, false);
  await audit(env, auth.email, 'books.assets.asset.update', id, JSON.stringify({ status: normalized.status, assetType: normalized.assetType, filename: normalized.filename }));
  return json({ ok: true, id }, 200, request, env);
}

async function archiveAsset(request, env, auth, id) {
  const current = await env.DB.prepare('SELECT * FROM books_publication_assets WHERE id=?').bind(id).first();
  if (!current) return json({ error: '자산을 찾을 수 없습니다.' }, 404, request, env);
  const now = new Date().toISOString();
  const who = await adminId(env, auth.email);
  await env.DB.prepare("UPDATE books_publication_assets SET status='archived', updated_at=?, updated_by=? WHERE id=?").bind(now, who, id).run();
  await audit(env, auth.email, 'books.assets.asset.archive', id, current.filename);
  return json({ ok: true, id, status: 'archived' }, 200, request, env);
}

async function editionPreflight(env, edition) {
  const [publication, assetsResult, distribution] = await Promise.all([
    env.DB.prepare('SELECT id, title, author, abstract, citation, isbn_ebook FROM books_publications WHERE id=?').bind(edition.publication_id).first(),
    env.DB.prepare('SELECT * FROM books_publication_assets WHERE publication_id=?').bind(edition.publication_id).all(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status <> 'not_started' THEN 1 ELSE 0 END) AS tracked,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published
      FROM books_distribution_status WHERE publication_id=?`).bind(edition.publication_id).first(),
  ]);
  const normalizedEdition = editionRow(edition);
  return preflight({
    id: publication?.id || '', title: publication?.title || '', author: publication?.author || '', abstract: publication?.abstract || '', citation: publication?.citation || '', isbnEbook: publication?.isbn_ebook || '',
  }, normalizedEdition, assetsResult.results.map(assetRow), { tracked: Number(distribution?.tracked || 0), published: Number(distribution?.published || 0) });
}

async function releaseEdition(request, env, auth, id) {
  const edition = await editionExists(env, id);
  if (!edition) return json({ error: '에디션을 찾을 수 없습니다.' }, 404, request, env);
  if (edition.status === 'withdrawn') return json({ error: 'Withdrawn 에디션은 다시 출시할 수 없습니다. 새 버전을 만드세요.' }, 409, request, env);
  const readiness = await editionPreflight(env, edition);
  if (!readiness.ready) return json({ error: 'Release Preflight 필수항목을 충족하지 못했습니다.', preflight: readiness }, 409, request, env);
  const publication = await publicationExists(env, edition.publication_id);
  const input = await readBody(request);
  const releaseDate = validDate(input?.releaseDate || new Date().toISOString().slice(0, 10));
  if (releaseDate === null) return json({ error: '출시일은 YYYY-MM-DD 형식이어야 합니다.' }, 400, request, env);
  const now = new Date().toISOString();
  const who = await adminId(env, auth.email);
  await env.DB.batch([
    env.DB.prepare("UPDATE books_editions SET status='superseded', updated_at=?, updated_by=? WHERE publication_id=? AND status='released' AND id<>?")
      .bind(now, who, edition.publication_id, id),
    env.DB.prepare("UPDATE books_editions SET status='released', release_date=?, isbn_ebook_snapshot=?, note=?, updated_at=?, updated_by=? WHERE id=?")
      .bind(releaseDate || '', publication?.isbn_ebook || '', clean(input?.note ?? edition.note, 1200), now, who, id),
  ]);
  await audit(env, auth.email, 'books.assets.edition.release', id, JSON.stringify({ publicationId: edition.publication_id, versionLabel: edition.version_label, releaseDate, warnings: readiness.warnings }));
  return json({ ok: true, id, status: 'released', releaseDate, preflight: readiness }, 200, request, env);
}

async function withdrawEdition(request, env, auth, id) {
  const edition = await editionExists(env, id);
  if (!edition) return json({ error: '에디션을 찾을 수 없습니다.' }, 404, request, env);
  if (edition.status !== 'released') return json({ error: '현재 Released 에디션만 Withdraw할 수 있습니다.' }, 409, request, env);
  const input = await readBody(request);
  const reason = clean(input?.note || 'withdrawn', 1200);
  const now = new Date().toISOString();
  const who = await adminId(env, auth.email);
  await env.DB.prepare("UPDATE books_editions SET status='withdrawn', note=?, updated_at=?, updated_by=? WHERE id=?").bind(reason, now, who, id).run();
  await audit(env, auth.email, 'books.assets.edition.withdraw', id, reason);
  return json({ ok: true, id, status: 'withdrawn' }, 200, request, env);
}

export async function handleBooksAssetsRequest(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(PREFIX)) return null;
  if (!env.DB) return json({ error: 'Books 데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const authResult = await session(request, env);
  if (!authResult.response.ok) return authResult.response;
  const auth = authResult.data || {};
  if (!auth.email) return json({ error: '관리자 인증이 필요합니다.' }, 401, request, env);

  if (request.method === 'GET' && path === PREFIX) return overview(request, env);
  if (request.method === 'POST' && path === `${PREFIX}/editions`) return createEdition(request, env, auth);
  if (request.method === 'POST' && path === `${PREFIX}/items`) return createAsset(request, env, auth);

  let match = path.match(/^\/api\/books\/admin\/assets\/editions\/([^/]+)$/);
  if (match && request.method === 'PUT') return updateEdition(request, env, auth, decodeURIComponent(match[1]));
  match = path.match(/^\/api\/books\/admin\/assets\/editions\/([^/]+)\/release$/);
  if (match && request.method === 'POST') return releaseEdition(request, env, auth, decodeURIComponent(match[1]));
  match = path.match(/^\/api\/books\/admin\/assets\/editions\/([^/]+)\/withdraw$/);
  if (match && request.method === 'POST') return withdrawEdition(request, env, auth, decodeURIComponent(match[1]));
  match = path.match(/^\/api\/books\/admin\/assets\/items\/([^/]+)$/);
  if (match && request.method === 'PUT') return updateAsset(request, env, auth, decodeURIComponent(match[1]));
  if (match && request.method === 'DELETE') return archiveAsset(request, env, auth, decodeURIComponent(match[1]));

  return json({ error: 'Books assets API endpoint not found' }, 404, request, env);
}
