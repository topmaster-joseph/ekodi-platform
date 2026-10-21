import authWorker from './auth-worker.js';

const PREFIX = '/api/books/admin/governance';
const RELEASE_ACTIONS = new Set(['publish', 'unpublish']);
const PUBLIC_STAGES = new Set(['READY', 'PUBLISHED']);

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
function safeHttpUrl(value) {
  const text = clean(value, 1200);
  if (!text) return '';
  try {
    const url = new URL(text);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}
async function readBody(request) { try { return await request.json(); } catch { return null; } }

async function session(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const response = await authWorker.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }), env);
  if (!response.ok) return { response };
  return { response, data: await response.clone().json() };
}

async function adminId(env, email) {
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email=?').bind(email).first();
  return row?.id || null;
}

async function audit(env, email, action, resource, detail = '') {
  const id = await adminId(env, email);
  await env.DB.prepare('INSERT INTO audit_logs (admin_id, action, resource, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, action, resource, clean(detail, 1000), new Date().toISOString()).run();
}

async function releaseContext(env, publicationId) {
  const publication = await env.DB.prepare(`SELECT id, catalog_no, title, subtitle, author, series, publication_type, status, stage,
      editorial_field, language_label, edition, abstract, citation, cover_image, detail_url, google_books_id, isbn_ebook,
      amazon_asin, distribution_json, links_json, price_krw, is_public, created_at, updated_at
    FROM books_publications WHERE id=?`).bind(publicationId).first();
  if (!publication) return null;

  const [editionsResult, assetsResult, distributionResult] = await Promise.all([
    env.DB.prepare(`SELECT * FROM books_editions WHERE publication_id=?
      ORDER BY CASE status WHEN 'released' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, updated_at DESC, created_at DESC`).bind(publicationId).all(),
    env.DB.prepare(`SELECT * FROM books_publication_assets WHERE publication_id=? ORDER BY updated_at DESC, created_at DESC`).bind(publicationId).all(),
    env.DB.prepare(`SELECT d.*, c.name AS channel_name
      FROM books_distribution_status d
      LEFT JOIN books_distribution_channels c ON c.code=d.channel_code
      WHERE d.publication_id=? ORDER BY c.sort_order, d.channel_code`).bind(publicationId).all(),
  ]);

  const editions = editionsResult.results.map(row => ({
    id: row.id, publicationId: row.publication_id, editionLabel: row.edition_label, versionLabel: row.version_label,
    status: row.status, releaseDate: row.release_date, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  const assets = assetsResult.results.map(row => ({
    id: row.id, publicationId: row.publication_id, editionId: row.edition_id || '', assetType: row.asset_type,
    filename: row.filename, mimeType: row.mime_type, sizeBytes: Number(row.size_bytes || 0), checksumSha256: row.checksum_sha256,
    storageRef: row.storage_ref, sourceUrl: row.source_url, versionLabel: row.version_label, status: row.status,
    note: row.note, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  const distribution = distributionResult.results.map(row => ({
    channelCode: row.channel_code, channelName: row.channel_name || row.channel_code, status: row.status,
    sourceStatus: row.source_status || '', externalId: row.external_id, productUrl: row.product_url,
    submittedAt: row.submitted_at, publishedAt: row.published_at, lastCheckedAt: row.last_checked_at,
    syncMode: row.sync_mode || 'manual', syncedAt: row.synced_at || '', note: row.note,
  }));

  const releasedEdition = editions.find(edition => edition.status === 'released') || null;
  const currentAssets = releasedEdition
    ? assets.filter(asset => asset.editionId === releasedEdition.id && asset.status === 'current')
    : [];
  const cover = currentAssets.find(asset => asset.assetType === 'cover') || null;
  const content = currentAssets.filter(asset => ['epub', 'pdf'].includes(asset.assetType));
  const critical = [cover, ...content].filter(Boolean);
  const publicCover = safeHttpUrl(publication.cover_image) || safeHttpUrl(cover?.sourceUrl);
  const identifier = clean(publication.isbn_ebook) || clean(publication.google_books_id) || clean(publication.amazon_asin) || clean(publication.catalog_no);

  const checks = [
    { code: 'stage', label: 'Production Stage', required: true, pass: PUBLIC_STAGES.has(clean(publication.stage).toUpperCase()), detail: publication.stage || 'READY 단계 필요' },
    { code: 'title', label: 'Title', required: true, pass: Boolean(clean(publication.title)), detail: publication.title || '도서명 누락' },
    { code: 'author', label: 'Author', required: true, pass: Boolean(clean(publication.author)), detail: publication.author || '저자 누락' },
    { code: 'abstract', label: 'Abstract', required: true, pass: Boolean(clean(publication.abstract)), detail: publication.abstract ? '등록됨' : '소개/초록 누락' },
    { code: 'citation', label: 'Citation', required: true, pass: Boolean(clean(publication.citation)), detail: publication.citation ? '등록됨' : '인용정보 누락' },
    { code: 'identifier', label: 'Identifier', required: true, pass: Boolean(identifier), detail: identifier || 'ISBN/Google ID/ASIN/Catalog No 필요' },
    { code: 'edition', label: 'Released Edition', required: true, pass: Boolean(releasedEdition), detail: releasedEdition?.versionLabel || 'Released 에디션 없음' },
    { code: 'cover', label: 'Public Cover', required: true, pass: Boolean(cover && publicCover), detail: publicCover || (cover ? '표지 Source URL 필요' : '현재 표지 자산 없음') },
    { code: 'content', label: 'EPUB/PDF', required: true, pass: content.length > 0, detail: content.map(asset => asset.filename).join(', ') || '현재 EPUB/PDF 자산 없음' },
    { code: 'integrity', label: 'SHA-256', required: true, pass: critical.length > 0 && critical.every(asset => Boolean(asset.checksumSha256)), detail: critical.length && critical.every(asset => Boolean(asset.checksumSha256)) ? '무결성 해시 확인' : '표지/본문 SHA-256 누락' },
    { code: 'storage', label: 'Storage', required: true, pass: critical.length > 0 && critical.every(asset => Boolean(asset.storageRef || asset.sourceUrl)), detail: critical.length && critical.every(asset => Boolean(asset.storageRef || asset.sourceUrl)) ? '보관 참조 확인' : '표지/본문 보관 참조 누락' },
    { code: 'distribution', label: 'Distribution Tracking', required: false, pass: distribution.some(item => item.status !== 'not_started'), detail: `${distribution.filter(item => item.status === 'published').length} live / ${distribution.filter(item => item.status !== 'not_started').length} tracked` },
  ];
  const requiredFailures = checks.filter(check => check.required && !check.pass);
  const warnings = checks.filter(check => !check.required && !check.pass);

  return {
    publication: {
      id: publication.id,
      catalogNo: publication.catalog_no,
      title: publication.title,
      subtitle: publication.subtitle,
      author: publication.author,
      series: publication.series,
      publicationType: publication.publication_type,
      status: publication.status,
      stage: publication.stage,
      editorialField: publication.editorial_field,
      languageLabel: publication.language_label,
      edition: publication.edition,
      abstract: publication.abstract,
      citation: publication.citation,
      coverImage: publication.cover_image,
      detailUrl: publication.detail_url,
      googleBooksId: publication.google_books_id,
      isbnEbook: publication.isbn_ebook,
      amazonAsin: publication.amazon_asin,
      priceKrw: Number(publication.price_krw || 0),
      isPublic: Boolean(publication.is_public),
      createdAt: publication.created_at,
      updatedAt: publication.updated_at,
    },
    editions,
    assets,
    distribution,
    releasedEdition,
    publicCover,
    readiness: {
      ready: requiredFailures.length === 0,
      requiredFailures: requiredFailures.length,
      warnings: warnings.length,
      checks,
    },
  };
}

async function financeContext(env, publicationId) {
  const [summary, transactions] = await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN transaction_type='sale' THEN amount_krw ELSE 0 END) AS sales,
      SUM(CASE WHEN transaction_type='refund' THEN amount_krw ELSE 0 END) AS refunds,
      SUM(CASE WHEN transaction_type IN ('channel_fee','production_cost','marketing_cost','royalty','tax','other_expense') THEN amount_krw ELSE 0 END) AS costs,
      SUM(CASE WHEN transaction_type='sale' THEN quantity WHEN transaction_type='refund' THEN -quantity ELSE 0 END) AS units
      FROM books_finance_transactions WHERE publication_id=?`).bind(publicationId).first(),
    env.DB.prepare(`SELECT id, occurred_on, channel_code, transaction_type, quantity, amount_krw, settlement_status, source, note, created_at
      FROM books_finance_transactions WHERE publication_id=? ORDER BY occurred_on DESC, id DESC LIMIT 60`).bind(publicationId).all(),
  ]);
  const sales = Number(summary?.sales || 0);
  const refunds = Number(summary?.refunds || 0);
  const costs = Number(summary?.costs || 0);
  return {
    summary: { salesKrw: sales, refundsKrw: refunds, costsKrw: costs, operatingKrw: sales - refunds - costs, units: Number(summary?.units || 0) },
    transactions: transactions.results.map(row => ({
      id: Number(row.id), occurredOn: row.occurred_on, channelCode: row.channel_code, transactionType: row.transaction_type,
      quantity: Number(row.quantity || 0), amountKrw: Number(row.amount_krw || 0), settlementStatus: row.settlement_status,
      source: row.source, note: row.note, createdAt: row.created_at,
    })),
  };
}

async function rightsContext(env, publicationId) {
  const [rights, royalties] = await Promise.all([
    env.DB.prepare(`SELECT r.*, h.display_name AS holder_name FROM books_publication_rights r
      JOIN books_rightsholders h ON h.id=r.rightsholder_id WHERE r.publication_id=? ORDER BY r.status='active' DESC, r.id`).bind(publicationId).all(),
    env.DB.prepare(`SELECT s.id AS statement_id, s.statement_no, s.rightsholder_id, s.period_from, s.period_to, s.status AS statement_status,
      s.royalty_amount_krw AS statement_royalty_krw, s.paid_at, s.created_at AS statement_created_at,
      l.id AS line_id, l.channel_code, l.role, l.basis_amount_krw, l.royalty_amount_krw,
      h.display_name AS holder_name
      FROM books_royalty_statement_lines l
      JOIN books_royalty_statements s ON s.id=l.statement_id
      JOIN books_rightsholders h ON h.id=s.rightsholder_id
      WHERE l.publication_id=? ORDER BY s.period_to DESC, s.id DESC, l.id`).bind(publicationId).all(),
  ]);
  return {
    rights: rights.results.map(row => ({
      id: Number(row.id), rightsholderId: row.rightsholder_id, rightsholderName: row.holder_name,
      role: row.role, royaltyBasis: row.royalty_basis, royaltyRateBps: Number(row.royalty_rate_bps || 0),
      fixedPerUnitKrw: Number(row.fixed_per_unit_krw || 0), territory: row.territory, exclusive: Boolean(row.exclusive),
      effectiveFrom: row.effective_from, effectiveTo: row.effective_to, contractRef: row.contract_ref, status: row.status,
    })),
    royalties: royalties.results.map(row => ({
      statementId: Number(row.statement_id), statementNo: row.statement_no, rightsholderId: row.rightsholder_id,
      rightsholderName: row.holder_name, periodFrom: row.period_from, periodTo: row.period_to,
      statementStatus: row.statement_status, statementRoyaltyKrw: Number(row.statement_royalty_krw || 0), paidAt: row.paid_at,
      lineId: Number(row.line_id), channelCode: row.channel_code, role: row.role,
      basisAmountKrw: Number(row.basis_amount_krw || 0), royaltyAmountKrw: Number(row.royalty_amount_krw || 0),
      createdAt: row.statement_created_at,
    })),
  };
}

async function governanceEvents(env, publicationId) {
  const [releaseEvents, auditEvents] = await Promise.all([
    env.DB.prepare(`SELECT e.*, a.email AS actor_email FROM books_release_events e
      LEFT JOIN admins a ON a.id=e.created_by WHERE e.publication_id=? ORDER BY e.created_at DESC, e.id DESC LIMIT 100`).bind(publicationId).all(),
    env.DB.prepare(`SELECT l.action, l.resource, l.detail, l.created_at, a.email AS actor_email
      FROM audit_logs l LEFT JOIN admins a ON a.id=l.admin_id
      WHERE l.resource=? OR l.resource LIKE ? OR l.detail LIKE ?
      ORDER BY l.created_at DESC LIMIT 120`).bind(publicationId, `${publicationId}:%`, `%${publicationId}%`).all(),
  ]);
  return {
    releaseEvents: releaseEvents.results.map(row => ({
      id: Number(row.id), publicationId: row.publication_id, editionId: row.edition_id || '', action: row.action,
      publicState: row.public_state, readiness: (() => { try { return JSON.parse(row.readiness_json || '{}'); } catch { return {}; } })(),
      note: row.note, actorEmail: row.actor_email || '', createdAt: row.created_at,
    })),
    auditEvents: auditEvents.results.map(row => ({ action: row.action, resource: row.resource, detail: row.detail, actorEmail: row.actor_email || '', createdAt: row.created_at })),
  };
}

function buildTimeline(context, finance, rights, events) {
  const items = [];
  for (const event of events.releaseEvents) items.push({ kind: 'release', title: event.action === 'publish' ? 'Public Catalog Published' : 'Public Catalog Unpublished', detail: event.note || event.publicState, at: event.createdAt, actor: event.actorEmail });
  for (const edition of context.editions) items.push({ kind: 'edition', title: `Edition ${edition.versionLabel} · ${edition.status}`, detail: edition.editionLabel || edition.note || '', at: edition.updatedAt || edition.createdAt, actor: '' });
  for (const asset of context.assets.slice(0, 80)) items.push({ kind: 'asset', title: `${asset.assetType.toUpperCase()} · ${asset.filename}`, detail: `${asset.status}${asset.checksumSha256 ? ' · SHA-256' : ''}`, at: asset.updatedAt || asset.createdAt, actor: '' });
  for (const item of context.distribution) if (item.status !== 'not_started') items.push({ kind: 'distribution', title: `${item.channelName} · ${item.status}`, detail: item.sourceStatus || item.externalId || item.note || '', at: item.syncedAt || item.lastCheckedAt || item.publishedAt || item.submittedAt || '', actor: '' });
  for (const tx of finance.transactions.slice(0, 40)) items.push({ kind: 'finance', title: `${tx.channelCode} · ${tx.transactionType}`, detail: `${tx.amountKrw.toLocaleString('ko-KR')}원 · ${tx.settlementStatus}`, at: tx.occurredOn || tx.createdAt, actor: '' });
  for (const rule of rights.rights) items.push({ kind: 'rights', title: `${rule.rightsholderName} · ${rule.role}`, detail: `${rule.royaltyBasis} · ${rule.status}`, at: rule.effectiveFrom || '', actor: '' });
  for (const royalty of rights.royalties.slice(0, 40)) items.push({ kind: 'royalty', title: `${royalty.statementNo} · ${royalty.statementStatus}`, detail: `${royalty.rightsholderName} · ${royalty.royaltyAmountKrw.toLocaleString('ko-KR')}원`, at: royalty.createdAt || royalty.periodTo, actor: '' });
  for (const event of events.auditEvents.slice(0, 60)) items.push({ kind: 'audit', title: event.action, detail: clean(event.detail, 240), at: event.createdAt, actor: event.actorEmail });
  return items.filter(item => item.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 180);
}

async function detail(request, env, publicationId) {
  const context = await releaseContext(env, publicationId);
  if (!context) return json({ error: '출판물을 찾을 수 없습니다.' }, 404, request, env);
  const [finance, rights, events] = await Promise.all([
    financeContext(env, publicationId),
    rightsContext(env, publicationId),
    governanceEvents(env, publicationId),
  ]);
  const timeline = buildTimeline(context, finance, rights, events);
  return json({ ...context, finance, rights, releaseEvents: events.releaseEvents, auditEvents: events.auditEvents, timeline }, 200, request, env);
}

async function overview(request, env) {
  const rows = await env.DB.prepare(`SELECT id, title, author, stage, is_public, updated_at FROM books_publications ORDER BY sort_order, title`).all();
  const publications = [];
  for (const row of rows.results) {
    const context = await releaseContext(env, row.id);
    if (!context) continue;
    publications.push({
      id: context.publication.id,
      title: context.publication.title,
      author: context.publication.author,
      stage: context.publication.stage,
      isPublic: context.publication.isPublic,
      releasedEditionId: context.releasedEdition?.id || '',
      releasedVersion: context.releasedEdition?.versionLabel || '',
      releaseReady: context.readiness.ready,
      requiredFailures: context.readiness.requiredFailures,
      warnings: context.readiness.warnings,
      publishedPlacements: context.distribution.filter(item => item.status === 'published').length,
      trackedPlacements: context.distribution.filter(item => item.status !== 'not_started').length,
      updatedAt: context.publication.updatedAt,
    });
  }
  return json({
    publications,
    metrics: {
      total: publications.length,
      public: publications.filter(item => item.isPublic).length,
      readyPrivate: publications.filter(item => item.releaseReady && !item.isPublic).length,
      blocked: publications.filter(item => !item.releaseReady).length,
      publishedPlacements: publications.reduce((sum, item) => sum + item.publishedPlacements, 0),
    },
  }, 200, request, env);
}

async function changePublicState(request, env, auth, publicationId, action) {
  if (!RELEASE_ACTIONS.has(action)) return json({ error: '지원하지 않는 공개 상태 작업입니다.' }, 400, request, env);
  const context = await releaseContext(env, publicationId);
  if (!context) return json({ error: '출판물을 찾을 수 없습니다.' }, 404, request, env);
  const input = await readBody(request);
  const note = clean(input?.note, 1200);
  const now = new Date().toISOString();
  const who = await adminId(env, auth.email);

  if (action === 'publish') {
    if (!context.readiness.ready) return json({ error: 'Public Release Gate 필수항목을 충족하지 못했습니다.', readiness: context.readiness }, 409, request, env);
    const coverImage = context.publication.coverImage || context.publicCover;
    const snapshot = JSON.stringify({ ...context.readiness, releasedEditionId: context.releasedEdition?.id || '', releasedVersion: context.releasedEdition?.versionLabel || '', publicCover: coverImage, checkedAt: now });
    await env.DB.batch([
      env.DB.prepare(`UPDATE books_publications SET is_public=1, stage='PUBLISHED', cover_image=?, updated_at=?, updated_by=? WHERE id=?`)
        .bind(coverImage, now, who, publicationId),
      env.DB.prepare(`INSERT INTO books_release_events (publication_id, edition_id, action, public_state, readiness_json, note, created_at, created_by)
        VALUES (?, ?, 'publish', 'public', ?, ?, ?, ?)`)
        .bind(publicationId, context.releasedEdition?.id || null, snapshot, note, now, who),
    ]);
    await audit(env, auth.email, 'books.governance.publish', publicationId, JSON.stringify({ editionId: context.releasedEdition?.id || '', version: context.releasedEdition?.versionLabel || '', warnings: context.readiness.warnings }));
    return json({ ok: true, publicationId, isPublic: true, stage: 'PUBLISHED', readiness: context.readiness }, 200, request, env);
  }

  if (!context.publication.isPublic) return json({ ok: true, publicationId, isPublic: false, unchanged: true }, 200, request, env);
  const snapshot = JSON.stringify({ previousStage: context.publication.stage, checkedAt: now });
  await env.DB.batch([
    env.DB.prepare('UPDATE books_publications SET is_public=0, updated_at=?, updated_by=? WHERE id=?').bind(now, who, publicationId),
    env.DB.prepare(`INSERT INTO books_release_events (publication_id, edition_id, action, public_state, readiness_json, note, created_at, created_by)
      VALUES (?, ?, 'unpublish', 'private', ?, ?, ?, ?)`)
      .bind(publicationId, context.releasedEdition?.id || null, snapshot, note, now, who),
  ]);
  await audit(env, auth.email, 'books.governance.unpublish', publicationId, note || 'private');
  return json({ ok: true, publicationId, isPublic: false }, 200, request, env);
}

export async function handleBooksGovernanceRequest(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(PREFIX)) return null;
  if (!env.DB) return json({ error: 'Books 데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const authResult = await session(request, env);
  if (!authResult.response.ok) return authResult.response;
  const auth = authResult.data || {};
  if (!auth.email) return json({ error: '관리자 인증이 필요합니다.' }, 401, request, env);

  if (request.method === 'GET' && path === PREFIX) return overview(request, env);

  let match = path.match(/^\/api\/books\/admin\/governance\/([^/]+)\/export$/);
  if (match && request.method === 'GET') {
    const publicationId = decodeURIComponent(match[1]);
    const response = await detail(request, env, publicationId);
    if (!response.ok) return response;
    const data = await response.json();
    return json({ exportVersion: 'ekodi-books-publication-record-v1', exportedAt: new Date().toISOString(), ...data }, 200, request, env);
  }

  match = path.match(/^\/api\/books\/admin\/governance\/([^/]+)\/(publish|unpublish)$/);
  if (match && request.method === 'POST') return changePublicState(request, env, auth, decodeURIComponent(match[1]), match[2]);

  match = path.match(/^\/api\/books\/admin\/governance\/([^/]+)$/);
  if (match && request.method === 'GET') return detail(request, env, decodeURIComponent(match[1]));

  return json({ error: 'Books governance API endpoint not found' }, 404, request, env);
}
