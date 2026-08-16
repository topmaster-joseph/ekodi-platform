import authWorker from './auth-worker.js';

const PREFIX = '/api/books/admin/cloud-publishing';
const RUNNER_PREFIX = `${PREFIX}/runner`;
const JOB_STATUSES = new Set([
  'draft', 'ready', 'bootstrap_required', 'awaiting_feed_setup', 'queued',
  'processing', 'awaiting_google', 'published', 'failed', 'cancelled',
]);
const RUNNER_STATUSES = new Set(['processing', 'awaiting_google', 'published', 'failed']);
const FEED_STATUSES = new Set(['setup_required', 'requested', 'active', 'paused']);
const TRANSPORTS = new Set(['google_content_fetch', 'partner_center_bootstrap']);
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

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

function cleanDriveId(value) {
  const text = clean(value, 200);
  return !text || DRIVE_ID.test(text) ? text : null;
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

function driveFolderUrl(id) {
  return id ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}` : '';
}

function channelRow(row) {
  return {
    channelCode: row.channel_code,
    sourceProvider: row.source_provider,
    transport: row.transport,
    feedStatus: row.feed_status,
    collectionCode: row.collection_code,
    feedEndpoint: row.feed_endpoint,
    driveRootFolderId: row.drive_root_folder_id,
    driveReadyFolderId: row.drive_ready_folder_id,
    driveProcessingFolderId: row.drive_processing_folder_id,
    drivePublishedFolderId: row.drive_published_folder_id,
    driveFailedFolderId: row.drive_failed_folder_id,
    driveRootUrl: driveFolderUrl(row.drive_root_folder_id),
    driveReadyUrl: driveFolderUrl(row.drive_ready_folder_id),
    note: row.note,
    updatedAt: row.updated_at,
  };
}

function sourceRow(row) {
  if (!row) return null;
  return {
    publicationId: row.publication_id,
    sourceProvider: row.source_provider,
    driveFolderId: row.drive_folder_id,
    driveFolderUrl: driveFolderUrl(row.drive_folder_id),
    driveEpubFileId: row.drive_epub_file_id,
    driveCoverFileId: row.drive_cover_file_id,
    metadataFileId: row.metadata_file_id,
    registrationFileId: row.registration_file_id,
    jobDocumentFileId: row.job_document_file_id,
    assetsReady: Boolean(row.drive_folder_id && row.drive_epub_file_id && row.drive_cover_file_id),
    note: row.note,
    updatedAt: row.updated_at,
  };
}

function jobRow(row) {
  return {
    id: Number(row.id),
    publicationId: row.publication_id,
    publicationTitle: row.publication_title || '',
    channelCode: row.channel_code,
    status: row.status,
    sourceProvider: row.source_provider,
    transport: row.transport,
    identifierType: row.identifier_type,
    identifierValue: row.identifier_value,
    driveFolderId: row.drive_folder_id,
    driveFolderUrl: driveFolderUrl(row.drive_folder_id),
    driveEpubFileId: row.drive_epub_file_id,
    driveCoverFileId: row.drive_cover_file_id,
    metadataFileId: row.metadata_file_id,
    collectionCode: row.collection_code,
    feedEpubPath: row.feed_epub_path,
    feedCoverPath: row.feed_cover_path,
    sourceStatus: row.source_status,
    resultExternalId: row.result_external_id,
    resultProductUrl: row.result_product_url,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function publicationRow(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    stage: row.stage,
    priceKrw: Number(row.price_krw || 0),
    isbnEbook: row.isbn_ebook || '',
    googleBooksId: row.google_books_id || '',
  };
}

async function overview(request, env) {
  const [channelsResult, publicationsResult, sourcesResult, jobsResult] = await Promise.all([
    env.DB.prepare('SELECT * FROM books_cloud_publish_channels ORDER BY channel_code').all(),
    env.DB.prepare(`SELECT id, title, author, stage, price_krw, isbn_ebook, google_books_id
      FROM books_publications ORDER BY sort_order, title`).all(),
    env.DB.prepare('SELECT * FROM books_cloud_publish_sources ORDER BY updated_at DESC').all(),
    env.DB.prepare(`SELECT j.*, p.title AS publication_title
      FROM books_cloud_publish_jobs j
      LEFT JOIN books_publications p ON p.id = j.publication_id
      ORDER BY j.id DESC LIMIT 100`).all(),
  ]);
  const channels = channelsResult.results.map(channelRow);
  const publications = publicationsResult.results.map(publicationRow);
  const sources = sourcesResult.results.map(sourceRow);
  const jobs = jobsResult.results.map(jobRow);
  const counts = {
    jobs: jobs.length,
    queued: jobs.filter(job => ['queued', 'processing', 'awaiting_google'].includes(job.status)).length,
    published: jobs.filter(job => job.status === 'published').length,
    blocked: jobs.filter(job => ['bootstrap_required', 'awaiting_feed_setup', 'failed'].includes(job.status)).length,
  };
  return json({
    channels,
    publications,
    sources,
    jobs,
    counts,
    policy: {
      sourceOfTruth: 'google_drive',
      preferredTransport: 'google_content_fetch',
      noFixedPcRequired: true,
      ggkeyBootstrapRequired: true,
      finalStateRequiresVerifiedResult: true,
    },
  }, 200, request, env);
}

async function updateChannel(request, env, sessionData, channelCode) {
  const current = await env.DB.prepare('SELECT * FROM books_cloud_publish_channels WHERE channel_code = ?').bind(channelCode).first();
  if (!current) return json({ error: '클라우드 출판 채널을 찾을 수 없습니다.' }, 404, request, env);
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return json({ error: '채널 설정을 확인해 주세요.' }, 400, request, env);

  const feedStatus = clean(body.feedStatus ?? current.feed_status, 40);
  const transport = clean(body.transport ?? current.transport, 60);
  if (!FEED_STATUSES.has(feedStatus)) return json({ error: '피드 상태가 올바르지 않습니다.' }, 400, request, env);
  if (!TRANSPORTS.has(transport)) return json({ error: '클라우드 전송 방식이 올바르지 않습니다.' }, 400, request, env);
  const feedEndpointInput = body.feedEndpoint === undefined ? current.feed_endpoint : body.feedEndpoint;
  const feedEndpoint = safeUrl(feedEndpointInput);
  if (feedEndpointInput && !feedEndpoint) return json({ error: '피드 URL을 확인해 주세요.' }, 400, request, env);
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);

  const values = {
    collectionCode: clean(body.collectionCode ?? current.collection_code, 80),
    root: cleanDriveId(body.driveRootFolderId ?? current.drive_root_folder_id),
    ready: cleanDriveId(body.driveReadyFolderId ?? current.drive_ready_folder_id),
    processing: cleanDriveId(body.driveProcessingFolderId ?? current.drive_processing_folder_id),
    published: cleanDriveId(body.drivePublishedFolderId ?? current.drive_published_folder_id),
    failed: cleanDriveId(body.driveFailedFolderId ?? current.drive_failed_folder_id),
  };
  if ([values.root, values.ready, values.processing, values.published, values.failed].some(value => value === null)) {
    return json({ error: 'Google Drive 폴더 ID를 확인해 주세요.' }, 400, request, env);
  }

  await env.DB.prepare(`UPDATE books_cloud_publish_channels SET
    transport=?, feed_status=?, collection_code=?, feed_endpoint=?, drive_root_folder_id=?,
    drive_ready_folder_id=?, drive_processing_folder_id=?, drive_published_folder_id=?,
    drive_failed_folder_id=?, note=?, updated_at=?, updated_by=? WHERE channel_code=?`)
    .bind(transport, feedStatus, values.collectionCode, feedEndpoint, values.root, values.ready,
      values.processing, values.published, values.failed, clean(body.note ?? current.note, 1000), now, who, channelCode).run();
  await audit(env, sessionData.email, 'books.cloud.channel.update', channelCode, JSON.stringify({ feedStatus, transport, collectionCode: values.collectionCode }));
  return json({ channel: channelRow(await env.DB.prepare('SELECT * FROM books_cloud_publish_channels WHERE channel_code = ?').bind(channelCode).first()) }, 200, request, env);
}

async function updateSource(request, env, sessionData, publicationId) {
  const publication = await env.DB.prepare('SELECT id FROM books_publications WHERE id = ?').bind(publicationId).first();
  if (!publication) return json({ error: '출판물을 찾을 수 없습니다.' }, 404, request, env);
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return json({ error: 'Drive 출판 원본 정보를 확인해 주세요.' }, 400, request, env);
  const fields = {
    folder: cleanDriveId(body.driveFolderId),
    epub: cleanDriveId(body.driveEpubFileId),
    cover: cleanDriveId(body.driveCoverFileId),
    metadata: cleanDriveId(body.metadataFileId),
    registration: cleanDriveId(body.registrationFileId),
    jobDocument: cleanDriveId(body.jobDocumentFileId),
  };
  if (Object.values(fields).some(value => value === null)) return json({ error: 'Google Drive 파일 또는 폴더 ID를 확인해 주세요.' }, 400, request, env);
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);
  await env.DB.prepare(`INSERT INTO books_cloud_publish_sources
    (publication_id, source_provider, drive_folder_id, drive_epub_file_id, drive_cover_file_id,
     metadata_file_id, registration_file_id, job_document_file_id, note, created_at, updated_at, updated_by)
    VALUES (?, 'google_drive', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(publication_id) DO UPDATE SET
      drive_folder_id=excluded.drive_folder_id,
      drive_epub_file_id=excluded.drive_epub_file_id,
      drive_cover_file_id=excluded.drive_cover_file_id,
      metadata_file_id=excluded.metadata_file_id,
      registration_file_id=excluded.registration_file_id,
      job_document_file_id=excluded.job_document_file_id,
      note=excluded.note,
      updated_at=excluded.updated_at,
      updated_by=excluded.updated_by`)
    .bind(publicationId, fields.folder || '', fields.epub || '', fields.cover || '', fields.metadata || '',
      fields.registration || '', fields.jobDocument || '', clean(body.note, 1000), now, now, who).run();
  await audit(env, sessionData.email, 'books.cloud.source.update', publicationId, JSON.stringify({ assetsReady: Boolean(fields.folder && fields.epub && fields.cover) }));
  return json({ source: sourceRow(await env.DB.prepare('SELECT * FROM books_cloud_publish_sources WHERE publication_id = ?').bind(publicationId).first()) }, 200, request, env);
}

function deriveIdentifier(publication) {
  const isbn = clean(publication?.isbn_ebook, 40).replace(/[^0-9Xx]/g, '');
  if (isbn) return { type: 'isbn', value: isbn };
  const googleId = clean(publication?.google_books_id, 160);
  if (googleId) return { type: 'ggkey', value: googleId };
  return { type: 'ggkey_pending', value: '' };
}

function feedPaths(identifier, collectionCode) {
  if (identifier.type !== 'isbn' || !identifier.value || !collectionCode) return { epub: '', cover: '' };
  return {
    epub: `ebooks/${collectionCode}/${identifier.value}.epub`,
    cover: `ebooks/${collectionCode}/${identifier.value}_frontcover.jpg`,
  };
}

async function createJob(request, env, sessionData) {
  const body = await readBody(request);
  const publicationId = clean(body?.publicationId, 100);
  const channelCode = clean(body?.channelCode || 'google-play-books', 80);
  if (!publicationId) return json({ error: '출판물을 선택해 주세요.' }, 400, request, env);
  const [publication, source, channel] = await Promise.all([
    env.DB.prepare('SELECT * FROM books_publications WHERE id = ?').bind(publicationId).first(),
    env.DB.prepare('SELECT * FROM books_cloud_publish_sources WHERE publication_id = ?').bind(publicationId).first(),
    env.DB.prepare('SELECT * FROM books_cloud_publish_channels WHERE channel_code = ?').bind(channelCode).first(),
  ]);
  if (!publication) return json({ error: '출판물을 찾을 수 없습니다.' }, 404, request, env);
  if (!channel) return json({ error: '클라우드 출판 채널을 찾을 수 없습니다.' }, 404, request, env);
  if (!source?.drive_folder_id) return json({ error: 'Google Drive READY 원본 폴더를 먼저 연결해 주세요.' }, 409, request, env);

  const identifier = deriveIdentifier(publication);
  const assetsReady = Boolean(source.drive_epub_file_id && source.drive_cover_file_id);
  const paths = feedPaths(identifier, channel.collection_code);
  let status = 'draft';
  let sourceStatus = assetsReady ? 'drive_assets_ready' : 'drive_assets_missing';
  let transport = channel.transport || 'google_content_fetch';
  if (assetsReady && identifier.type === 'isbn') status = 'ready';
  if (identifier.type !== 'isbn') {
    status = assetsReady ? 'bootstrap_required' : 'draft';
    sourceStatus = assetsReady ? 'ggkey_partner_bootstrap_required' : 'drive_assets_missing';
    transport = 'partner_center_bootstrap';
  }
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);
  const result = await env.DB.prepare(`INSERT INTO books_cloud_publish_jobs
    (publication_id, channel_code, status, source_provider, transport, identifier_type, identifier_value,
     drive_folder_id, drive_epub_file_id, drive_cover_file_id, metadata_file_id, collection_code,
     feed_epub_path, feed_cover_path, source_status, requested_at, created_at, updated_at, requested_by, updated_by)
    VALUES (?, ?, ?, 'google_drive', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(publicationId, channelCode, status, transport, identifier.type, identifier.value,
      source.drive_folder_id, source.drive_epub_file_id, source.drive_cover_file_id, source.metadata_file_id,
      channel.collection_code, paths.epub, paths.cover, sourceStatus, now, now, now, who, who).run();
  const id = Number(result.meta?.last_row_id || 0);
  await audit(env, sessionData.email, 'books.cloud.job.create', `${publicationId}:${channelCode}`, JSON.stringify({ id, status, identifierType: identifier.type, assetsReady }));
  const row = await env.DB.prepare(`SELECT j.*, p.title AS publication_title FROM books_cloud_publish_jobs j
    LEFT JOIN books_publications p ON p.id=j.publication_id WHERE j.id=?`).bind(id).first();
  return json({ job: jobRow(row) }, 201, request, env);
}

async function refreshJobSnapshot(env, job, who) {
  const [publication, source, channel] = await Promise.all([
    env.DB.prepare('SELECT * FROM books_publications WHERE id = ?').bind(job.publication_id).first(),
    env.DB.prepare('SELECT * FROM books_cloud_publish_sources WHERE publication_id = ?').bind(job.publication_id).first(),
    env.DB.prepare('SELECT * FROM books_cloud_publish_channels WHERE channel_code = ?').bind(job.channel_code).first(),
  ]);
  const identifier = deriveIdentifier(publication);
  const paths = feedPaths(identifier, channel?.collection_code || '');
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE books_cloud_publish_jobs SET
    identifier_type=?, identifier_value=?, drive_folder_id=?, drive_epub_file_id=?, drive_cover_file_id=?,
    metadata_file_id=?, collection_code=?, feed_epub_path=?, feed_cover_path=?, updated_at=?, updated_by=? WHERE id=?`)
    .bind(identifier.type, identifier.value, source?.drive_folder_id || '', source?.drive_epub_file_id || '',
      source?.drive_cover_file_id || '', source?.metadata_file_id || '', channel?.collection_code || '',
      paths.epub, paths.cover, now, who, job.id).run();
  return { publication, source, channel, identifier, paths, now };
}

async function queueJob(request, env, sessionData, id) {
  const job = await env.DB.prepare('SELECT * FROM books_cloud_publish_jobs WHERE id = ?').bind(id).first();
  if (!job) return json({ error: '클라우드 출판 작업을 찾을 수 없습니다.' }, 404, request, env);
  if (['published', 'cancelled'].includes(job.status)) return json({ error: '이미 종료된 출판 작업입니다.' }, 409, request, env);
  const who = await adminId(env, sessionData.email);
  const snapshot = await refreshJobSnapshot(env, job, who);
  if (!snapshot.source?.drive_epub_file_id || !snapshot.source?.drive_cover_file_id) {
    await env.DB.prepare(`UPDATE books_cloud_publish_jobs SET status='draft', source_status='drive_assets_missing', updated_at=?, updated_by=? WHERE id=?`)
      .bind(snapshot.now, who, id).run();
    return json({ error: 'Drive READY 폴더에 최종 EPUB과 표지 파일 연결이 필요합니다.', code: 'DRIVE_ASSETS_MISSING' }, 409, request, env);
  }

  let status = 'queued';
  let sourceStatus = 'cloud_queue_approved';
  let message = '클라우드 출판 작업을 큐에 등록했습니다.';
  if (snapshot.identifier.type !== 'isbn') {
    status = 'bootstrap_required';
    sourceStatus = 'ggkey_partner_bootstrap_required';
    message = '출판 지시는 접수했지만 ISBN이 없어 Google Partner Center의 최초 도서 생성이 필요합니다. GGKEY 생성 후에는 클라우드 상태관리로 이어집니다.';
  } else if (!snapshot.channel || snapshot.channel.feed_status !== 'active' || !snapshot.channel.collection_code) {
    status = 'awaiting_feed_setup';
    sourceStatus = 'google_feed_onboarding_required';
    message = '출판 지시는 접수했습니다. Google 자동 콘텐츠 가져오기 피드가 활성화되면 자동 전송됩니다.';
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE books_cloud_publish_jobs SET status=?, transport=?, source_status=?, approved_at=?,
    queued_at=?, error_code='', error_message='', updated_at=?, approved_by=?, updated_by=? WHERE id=?`)
    .bind(status, snapshot.identifier.type === 'isbn' ? 'google_content_fetch' : 'partner_center_bootstrap', sourceStatus,
      now, status === 'queued' ? now : '', now, who, who, id).run();
  await audit(env, sessionData.email, 'books.cloud.job.queue', String(id), JSON.stringify({ status, identifierType: snapshot.identifier.type }));
  const row = await env.DB.prepare(`SELECT j.*, p.title AS publication_title FROM books_cloud_publish_jobs j
    LEFT JOIN books_publications p ON p.id=j.publication_id WHERE j.id=?`).bind(id).first();
  return json({ job: jobRow(row), message }, 202, request, env);
}

async function cancelJob(request, env, sessionData, id) {
  const job = await env.DB.prepare('SELECT * FROM books_cloud_publish_jobs WHERE id = ?').bind(id).first();
  if (!job) return json({ error: '클라우드 출판 작업을 찾을 수 없습니다.' }, 404, request, env);
  if (job.status === 'published') return json({ error: '게시 완료 작업은 취소할 수 없습니다.' }, 409, request, env);
  const now = new Date().toISOString();
  const who = await adminId(env, sessionData.email);
  await env.DB.prepare(`UPDATE books_cloud_publish_jobs SET status='cancelled', completed_at=?, updated_at=?, updated_by=? WHERE id=?`)
    .bind(now, now, who, id).run();
  await audit(env, sessionData.email, 'books.cloud.job.cancel', String(id), job.publication_id);
  return json({ ok: true, id, status: 'cancelled' }, 200, request, env);
}

function runnerAuthorized(request, env) {
  const expected = clean(env.BOOKS_PUBLISH_RUNNER_TOKEN, 500);
  const supplied = clean((request.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''), 500);
  return Boolean(expected && supplied && expected === supplied);
}

async function runnerNext(request, env) {
  if (!runnerAuthorized(request, env)) return json({ error: 'Cloud publisher runner authentication required.' }, 401, request, env);
  const row = await env.DB.prepare(`SELECT j.*, p.title AS publication_title FROM books_cloud_publish_jobs j
    LEFT JOIN books_publications p ON p.id=j.publication_id
    WHERE j.status='queued' ORDER BY j.queued_at, j.id LIMIT 1`).first();
  return json({ job: row ? jobRow(row) : null }, 200, request, env);
}

async function syncDistributionPublished(env, job, body, now) {
  const externalId = clean(body.externalId || job.identifier_value, 160);
  const productUrl = safeUrl(body.productUrl) || '';
  const date = now.slice(0, 10);
  await env.DB.prepare(`INSERT INTO books_distribution_status
    (publication_id, channel_code, status, external_id, product_url, submitted_at, published_at,
     last_checked_at, note, source_status, assignee, due_at, checklist_json, sync_mode, synced_at,
     created_at, updated_at, updated_by)
    VALUES (?, ?, 'published', ?, ?, ?, ?, ?, ?, 'cloud_publisher_verified', '', '', ?, 'api', ?, ?, ?, NULL)
    ON CONFLICT(publication_id, channel_code) DO UPDATE SET
      status='published', external_id=excluded.external_id, product_url=excluded.product_url,
      published_at=excluded.published_at, last_checked_at=excluded.last_checked_at,
      note=excluded.note, source_status=excluded.source_status, checklist_json=excluded.checklist_json,
      sync_mode='api', synced_at=excluded.synced_at, updated_at=excluded.updated_at`)
    .bind(job.publication_id, job.channel_code, externalId, productUrl, job.queued_at ? job.queued_at.slice(0, 10) : date,
      date, date, clean(body.note, 1200), JSON.stringify({ metadata: true, files: true, identifiers: true, pricing: true, rights: true, submitted: true }),
      date, now, now).run();
}

async function runnerUpdate(request, env, id) {
  if (!runnerAuthorized(request, env)) return json({ error: 'Cloud publisher runner authentication required.' }, 401, request, env);
  const job = await env.DB.prepare('SELECT * FROM books_cloud_publish_jobs WHERE id = ?').bind(id).first();
  if (!job) return json({ error: 'Cloud publishing job not found.' }, 404, request, env);
  const body = await readBody(request);
  const status = clean(body?.status, 40);
  if (!RUNNER_STATUSES.has(status)) return json({ error: 'Runner status is not allowed.' }, 400, request, env);
  const now = new Date().toISOString();
  const externalId = clean(body?.externalId, 160);
  const productUrlInput = body?.productUrl || '';
  const productUrl = safeUrl(productUrlInput);
  if (productUrlInput && !productUrl) return json({ error: 'Runner product URL is invalid.' }, 400, request, env);
  const startedAt = job.started_at || (status === 'processing' ? now : '');
  const completedAt = ['published', 'failed'].includes(status) ? now : '';
  await env.DB.prepare(`UPDATE books_cloud_publish_jobs SET status=?, started_at=?, completed_at=?,
    result_external_id=?, result_product_url=?, error_code=?, error_message=?, source_status=?, updated_at=? WHERE id=?`)
    .bind(status, startedAt, completedAt, externalId || job.result_external_id, productUrl || job.result_product_url,
      status === 'failed' ? clean(body?.errorCode, 120) : '', status === 'failed' ? clean(body?.errorMessage, 1000) : '',
      clean(body?.sourceStatus || `runner_${status}`, 200), now, id).run();
  if (status === 'published') await syncDistributionPublished(env, job, body || {}, now);
  const row = await env.DB.prepare(`SELECT j.*, p.title AS publication_title FROM books_cloud_publish_jobs j
    LEFT JOIN books_publications p ON p.id=j.publication_id WHERE j.id=?`).bind(id).first();
  return json({ job: jobRow(row) }, 200, request, env);
}

export async function handleBooksCloudPublishingRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith(PREFIX)) return null;

  if (path === `${RUNNER_PREFIX}/next` && request.method === 'GET') return runnerNext(request, env);
  const runnerMatch = path.match(/^\/api\/books\/admin\/cloud-publishing\/runner\/jobs\/(\d+)\/status$/);
  if (runnerMatch && request.method === 'POST') return runnerUpdate(request, env, Number(runnerMatch[1]));

  const auth = await session(request, env);
  if (!auth.response.ok) return auth.response;
  const sessionData = auth.data || {};
  if (!sessionData.email) return json({ error: '관리자 인증이 필요합니다.' }, 401, request, env);

  if (request.method === 'GET' && path === PREFIX) return overview(request, env);
  if (request.method === 'POST' && path === `${PREFIX}/jobs`) return createJob(request, env, sessionData);

  const channelMatch = path.match(/^\/api\/books\/admin\/cloud-publishing\/channels\/([^/]+)$/);
  if (channelMatch && request.method === 'PUT') return updateChannel(request, env, sessionData, decodeURIComponent(channelMatch[1]));

  const sourceMatch = path.match(/^\/api\/books\/admin\/cloud-publishing\/sources\/([^/]+)$/);
  if (sourceMatch && request.method === 'PUT') return updateSource(request, env, sessionData, decodeURIComponent(sourceMatch[1]));

  const queueMatch = path.match(/^\/api\/books\/admin\/cloud-publishing\/jobs\/(\d+)\/queue$/);
  if (queueMatch && request.method === 'POST') return queueJob(request, env, sessionData, Number(queueMatch[1]));

  const cancelMatch = path.match(/^\/api\/books\/admin\/cloud-publishing\/jobs\/(\d+)\/cancel$/);
  if (cancelMatch && request.method === 'POST') return cancelJob(request, env, sessionData, Number(cancelMatch[1]));

  return json({ error: 'Books cloud publishing API 경로를 찾을 수 없습니다.' }, 404, request, env);
}

export { JOB_STATUSES, FEED_STATUSES, TRANSPORTS };
