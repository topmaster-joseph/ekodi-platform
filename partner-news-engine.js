export const PARTNER_NEWS_CONTRACT = Object.freeze({
  version: 1,
  scope: 'tenant-service',
  defaultState: 'DRAFT',
  publicState: 'PUBLISHED',
  states: Object.freeze(['DRAFT','REVIEW','PUBLISHED','ARCHIVED']),
  privateFirst: true,
  destructiveDelete: false,
  adapterBoundary: 'authenticate + canWrite + canPublish',
});

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}
function domainError(message, status = 400, code = 'PARTNER_NEWS_INVALID') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}
function safeKey(value, label) {
  const key = clean(value, 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(key)) throw domainError(`${label} 형식을 확인해 주세요.`);
  return key;
}
function httpsUrl(value, label) {
  const raw = clean(value, 1200);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') throw new Error('https only');
    return url.toString();
  } catch {
    throw domainError(`${label}은 HTTPS 주소여야 합니다.`);
  }
}
function dateOnly(value) {
  const raw = clean(value, 10);
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw + 'T00:00:00Z'))) {
    throw domainError('게시일은 YYYY-MM-DD 형식이어야 합니다.');
  }
  return raw;
}
function boundedInt(value, min, max) {
  const n = Math.trunc(Number(value) || 0);
  return Math.max(min, Math.min(max, n));
}
function actorText(actor) {
  return clean(actor?.email || actor?.userId || actor || 'system', 320) || 'system';
}
function itemId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `pn_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizePartnerNewsScope(input = {}) {
  return {
    tenantSlug: safeKey(input.tenantSlug || input.tenant || '', 'tenant'),
    serviceKey: safeKey(input.serviceKey || input.service || '', 'service'),
  };
}

export function sanitizePartnerNewsInput(input = {}, current = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const fallback = current && typeof current === 'object' ? current : {};
  return {
    partnerName: clean(source.partnerName ?? fallback.partnerName, 160),
    partnerType: clean(source.partnerType ?? fallback.partnerType ?? 'organization', 80) || 'organization',
    title: clean(source.title ?? fallback.title, 180),
    summary: clean(source.summary ?? fallback.summary, 800),
    body: clean(source.body ?? fallback.body, 12000),
    sourceLabel: clean(source.sourceLabel ?? fallback.sourceLabel, 120),
    sourceUrl: httpsUrl(source.sourceUrl ?? fallback.sourceUrl, '출처'),
    imageUrl: httpsUrl(source.imageUrl ?? fallback.imageUrl, '이미지'),
    publishedOn: dateOnly(source.publishedOn ?? fallback.publishedOn),
    featured: Boolean(source.featured ?? fallback.featured),
    sortOrder: boundedInt(source.sortOrder ?? fallback.sortOrder, -1000, 1000),
  };
}

export function partnerNewsRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantSlug: row.tenant_slug,
    serviceKey: row.service_key,
    partnerName: row.partner_name,
    partnerType: row.partner_type,
    title: row.title,
    summary: row.summary_text,
    body: row.body_text,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url,
    imageUrl: row.image_url,
    publishedOn: row.published_on,
    status: row.status,
    featured: Boolean(row.featured),
    sortOrder: Number(row.sort_order || 0),
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

async function audit(db, scope, id, actor, action, detail = '') {
  await db.prepare(`INSERT INTO partner_news_audit_logs
    (tenant_slug, service_key, item_id, actor, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(scope.tenantSlug, scope.serviceKey, clean(id, 100), actorText(actor), clean(action, 120), clean(detail, 1000), new Date().toISOString()).run();
}

export async function listPublicPartnerNews(db, scopeInput, limit = 12) {
  const scope = normalizePartnerNewsScope(scopeInput);
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(Number(limit) || 12)));
  const rows = await db.prepare(`SELECT * FROM partner_news_items
    WHERE tenant_slug = ? AND service_key = ? AND status = 'PUBLISHED' AND published_at <> ''
    ORDER BY featured DESC, sort_order DESC,
      COALESCE(NULLIF(published_on,''), substr(published_at,1,10)) DESC,
      published_at DESC
    LIMIT ?`).bind(scope.tenantSlug, scope.serviceKey, safeLimit).all();
  return (rows.results || []).map(partnerNewsRow);
}

export async function listAdminPartnerNews(db, scopeInput, limit = 100) {
  const scope = normalizePartnerNewsScope(scopeInput);
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(Number(limit) || 100)));
  const rows = await db.prepare(`SELECT * FROM partner_news_items
    WHERE tenant_slug = ? AND service_key = ?
    ORDER BY CASE status WHEN 'REVIEW' THEN 0 WHEN 'DRAFT' THEN 1 WHEN 'PUBLISHED' THEN 2 ELSE 3 END,
      updated_at DESC LIMIT ?`).bind(scope.tenantSlug, scope.serviceKey, safeLimit).all();
  return (rows.results || []).map(partnerNewsRow);
}

export async function getPartnerNewsItem(db, scopeInput, id) {
  const scope = normalizePartnerNewsScope(scopeInput);
  const row = await db.prepare(`SELECT * FROM partner_news_items
    WHERE id = ? AND tenant_slug = ? AND service_key = ?`)
    .bind(clean(id, 100), scope.tenantSlug, scope.serviceKey).first();
  return partnerNewsRow(row);
}

export async function createPartnerNewsItem(db, scopeInput, input, actor) {
  const scope = normalizePartnerNewsScope(scopeInput);
  const item = sanitizePartnerNewsInput(input);
  if (!item.partnerName) throw domainError('협력 기관/단체 이름이 필요합니다.');
  if (!item.title) throw domainError('소식 제목이 필요합니다.');
  const id = itemId();
  const now = new Date().toISOString();
  const who = actorText(actor);
  await db.prepare(`INSERT INTO partner_news_items
    (id, tenant_slug, service_key, partner_name, partner_type, title, summary_text, body_text,
     source_label, source_url, image_url, published_on, status, featured, sort_order,
     created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`)
    .bind(id, scope.tenantSlug, scope.serviceKey, item.partnerName, item.partnerType, item.title, item.summary,
      item.body, item.sourceLabel, item.sourceUrl, item.imageUrl, item.publishedOn, item.featured ? 1 : 0,
      item.sortOrder, now, who, now, who).run();
  await audit(db, scope, id, actor, 'partner_news.create', JSON.stringify({ status:'DRAFT' }));
  return getPartnerNewsItem(db, scope, id);
}

export async function updatePartnerNewsItem(db, scopeInput, id, input, actor) {
  const scope = normalizePartnerNewsScope(scopeInput);
  const current = await getPartnerNewsItem(db, scope, id);
  if (!current) throw domainError('협력 소식을 찾을 수 없습니다.', 404, 'PARTNER_NEWS_NOT_FOUND');
  if (['PUBLISHED','ARCHIVED'].includes(current.status)) {
    throw domainError('공개 또는 보관된 소식은 바로 수정할 수 없습니다. 먼저 초안으로 되돌려 주세요.', 409, 'PARTNER_NEWS_LOCKED');
  }
  const item = sanitizePartnerNewsInput(input, current);
  if (!item.partnerName || !item.title) throw domainError('협력 기관/단체와 제목이 필요합니다.');
  const now = new Date().toISOString();
  const who = actorText(actor);
  await db.prepare(`UPDATE partner_news_items SET
    partner_name=?, partner_type=?, title=?, summary_text=?, body_text=?, source_label=?, source_url=?,
    image_url=?, published_on=?, featured=?, sort_order=?, updated_at=?, updated_by=?
    WHERE id=? AND tenant_slug=? AND service_key=?`)
    .bind(item.partnerName, item.partnerType, item.title, item.summary, item.body, item.sourceLabel,
      item.sourceUrl, item.imageUrl, item.publishedOn, item.featured ? 1 : 0, item.sortOrder,
      now, who, clean(id,100), scope.tenantSlug, scope.serviceKey).run();
  await audit(db, scope, id, actor, 'partner_news.update', JSON.stringify({ status:current.status }));
  return getPartnerNewsItem(db, scope, id);
}

export async function transitionPartnerNewsItem(db, scopeInput, id, action, actor) {
  const scope = normalizePartnerNewsScope(scopeInput);
  const current = await getPartnerNewsItem(db, scope, id);
  if (!current) throw domainError('협력 소식을 찾을 수 없습니다.', 404, 'PARTNER_NEWS_NOT_FOUND');
  const act = clean(action, 40).toLowerCase();
  const now = new Date().toISOString();
  const who = actorText(actor);
  let next = current.status;
  let sql = '';
  let bindings = [];
  if (act === 'review') {
    if (current.status !== 'DRAFT') throw domainError('초안만 검토 상태로 보낼 수 있습니다.', 409);
    next = 'REVIEW';
    sql = `UPDATE partner_news_items SET status='REVIEW', reviewed_at=?, reviewed_by=?, updated_at=?, updated_by=?
      WHERE id=? AND tenant_slug=? AND service_key=?`;
    bindings = [now, who, now, who, id, scope.tenantSlug, scope.serviceKey];
  } else if (act === 'publish') {
    if (!['DRAFT','REVIEW'].includes(current.status)) throw domainError('초안 또는 검토 상태만 공개할 수 있습니다.', 409);
    if (!current.partnerName || !current.title) throw domainError('공개 전에 협력 기관/단체와 제목을 확인해 주세요.');
    next = 'PUBLISHED';
    sql = `UPDATE partner_news_items SET status='PUBLISHED', published_at=?, published_by=?, archived_at='',
      updated_at=?, updated_by=? WHERE id=? AND tenant_slug=? AND service_key=?`;
    bindings = [now, who, now, who, id, scope.tenantSlug, scope.serviceKey];
  } else if (act === 'archive') {
    if (current.status !== 'PUBLISHED') throw domainError('공개된 소식만 보관 처리할 수 있습니다.', 409);
    next = 'ARCHIVED';
    sql = `UPDATE partner_news_items SET status='ARCHIVED', archived_at=?, updated_at=?, updated_by=?
      WHERE id=? AND tenant_slug=? AND service_key=?`;
    bindings = [now, now, who, id, scope.tenantSlug, scope.serviceKey];
  } else if (act === 'reopen') {
    if (!['REVIEW','PUBLISHED','ARCHIVED'].includes(current.status)) throw domainError('되돌릴 수 없는 상태입니다.', 409);
    next = 'DRAFT';
    sql = `UPDATE partner_news_items SET status='DRAFT', published_at='', published_by='', archived_at='',
      updated_at=?, updated_by=? WHERE id=? AND tenant_slug=? AND service_key=?`;
    bindings = [now, who, id, scope.tenantSlug, scope.serviceKey];
  } else {
    throw domainError('지원하지 않는 상태 변경입니다.');
  }
  await db.prepare(sql).bind(...bindings).run();
  await audit(db, scope, id, actor, `partner_news.${act}`, JSON.stringify({ from:current.status, to:next }));
  return getPartnerNewsItem(db, scope, id);
}
