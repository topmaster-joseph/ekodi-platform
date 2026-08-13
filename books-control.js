import authWorker from './auth-worker.js';

const PUBLIC_PREFIX = '/api/books/public';
const ADMIN_PREFIX = '/api/books/admin';
const VALID_INQUIRY_STATUS = new Set(['new', 'reviewing', 'quoted', 'contracted', 'closed']);
const VALID_PRICING_MODELS = new Set(['fixed', 'from', 'quote']);
const VALID_STAGES = new Set(['MANUSCRIPT', 'EDITING', 'DESIGN', 'EPUB', 'ISBN', 'REVIEW', 'READY', 'PUBLISHED', 'ARCHIVED']);

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

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function session(request, env) {
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
  const row = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first();
  return row?.id || null;
}

async function audit(env, email, action, resource, detail = '') {
  const id = await adminId(env, email);
  await env.DB.prepare(`INSERT INTO audit_logs (admin_id, action, resource, detail, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .bind(id, action, resource, clean(detail, 500), new Date().toISOString()).run();
}

function serviceRow(row) {
  return {
    code: row.code,
    category: row.category,
    name: row.name,
    description: row.description,
    pricingModel: row.pricing_model,
    unitLabel: row.unit_label,
    priceKrw: Number(row.price_krw || 0),
    comparePriceKrw: Number(row.compare_price_krw || 0),
    included: parseJson(row.included_json, []),
    note: row.note,
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 0),
    updatedAt: row.updated_at,
  };
}

function publicationRow(row) {
  return {
    id: row.id,
    catalogNo: row.catalog_no,
    title: row.title,
    subtitle: row.subtitle,
    author: row.author,
    series: row.series,
    seriesNumber: row.series_number,
    publicationType: row.publication_type,
    status: row.status,
    stage: row.stage,
    editorialField: row.editorial_field,
    languageLabel: row.language_label,
    format: parseJson(row.format_json, ['EPUB 3']),
    edition: row.edition,
    abstract: row.abstract,
    citation: row.citation,
    coverImage: row.cover_image,
    detailUrl: row.detail_url,
    identifiers: {
      googleBooks: row.google_books_id,
      isbnEbook: row.isbn_ebook,
      amazonAsin: row.amazon_asin,
    },
    distribution: parseJson(row.distribution_json, {}),
    links: parseJson(row.links_json, {}),
    priceKrw: Number(row.price_krw || 0),
    isPublic: Boolean(row.is_public),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function services(env, enabledOnly = false) {
  const sql = `SELECT * FROM books_service_catalog ${enabledOnly ? 'WHERE enabled = 1' : ''} ORDER BY category, sort_order, name`;
  const rows = await env.DB.prepare(sql).all();
  return rows.results.map(serviceRow);
}

async function features(env) {
  const rows = await env.DB.prepare('SELECT * FROM books_feature_flags ORDER BY feature_key').all();
  return rows.results.map(row => ({
    key: row.feature_key,
    label: row.label,
    description: row.description,
    enabled: Boolean(row.enabled),
    updatedAt: row.updated_at,
  }));
}

async function publications(env, publicOnly = false) {
  const sql = `SELECT * FROM books_publications ${publicOnly ? 'WHERE is_public = 1' : ''} ORDER BY sort_order, updated_at DESC`;
  const rows = await env.DB.prepare(sql).all();
  return rows.results.map(publicationRow);
}

async function inquiries(env, limit = 100) {
  const rows = await env.DB.prepare(`SELECT * FROM books_inquiries ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
  return rows.results.map(row => ({
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
    organization: row.organization,
    inquiryType: row.inquiry_type,
    manuscriptStage: row.manuscript_stage,
    lengthNote: row.length_note,
    desiredChannels: row.desired_channels,
    budgetRange: row.budget_range,
    message: row.message,
    status: row.status,
    assignedTo: row.assigned_to,
    adminNote: row.admin_note,
    updatedAt: row.updated_at,
  }));
}

async function publicConfig(request, env) {
  const [serviceList, featureList] = await Promise.all([services(env, true), features(env)]);
  return json({
    publisher: 'EKODI BOOKS',
    currency: 'KRW',
    pricingPolicy: {
      principle: '필요한 기능만 선택할 수 있고, 상위 패키지는 묶음 할인으로 단가를 낮춥니다.',
      passThroughCosts: '플랫폼·공식기관·인쇄·외주 등 제3자 실비는 별도 고지 후 진행합니다.',
      ownership: '저자·권리자가 플랫폼 계정과 저작권을 유지하는 것을 기본으로 합니다.',
    },
    services: serviceList,
    features: Object.fromEntries(featureList.map(item => [item.key, item.enabled])),
    updatedAt: new Date().toISOString(),
  }, 200, request, env);
}

async function publicPublications(request, env) {
  return json({ publisher: 'EKODI BOOKS', books: await publications(env, true) }, 200, request, env);
}

async function createInquiry(request, env) {
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return json({ error: '신청 내용을 확인해 주세요.' }, 400, request, env);
  const name = clean(body.name, 80);
  const email = clean(body.email, 160).toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: '이름과 이메일을 정확히 입력해 주세요.' }, 400, request, env);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO books_inquiries
    (created_at, name, email, phone, organization, inquiry_type, manuscript_stage, length_note,
     desired_channels, budget_range, message, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`)
    .bind(
      now, name, email, clean(body.phone, 50), clean(body.organization, 120), clean(body.inquiryType, 50) || 'consultation',
      clean(body.manuscriptStage, 80), clean(body.lengthNote, 120), clean(body.desiredChannels, 300),
      clean(body.budgetRange, 80), clean(body.message, 3000), now
    ).run();
  return json({ ok: true, inquiryId: result.meta?.last_row_id || null, status: 'new' }, 201, request, env);
}

async function adminOverview(request, env) {
  const [bookList, inquiryList, serviceList, featureList] = await Promise.all([
    publications(env), inquiries(env), services(env), features(env),
  ]);
  const counts = {
    publications: bookList.length,
    publicPublications: bookList.filter(book => book.isPublic).length,
    inProduction: bookList.filter(book => !['PUBLISHED', 'ARCHIVED'].includes(book.stage)).length,
    newInquiries: inquiryList.filter(item => item.status === 'new').length,
    openInquiries: inquiryList.filter(item => !['closed'].includes(item.status)).length,
    enabledServices: serviceList.filter(item => item.enabled).length,
  };
  return json({ counts, publications: bookList, inquiries: inquiryList, services: serviceList, features: featureList }, 200, request, env);
}

async function updateService(request, env, sessionData, code) {
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return json({ error: '서비스 설정 형식을 확인해 주세요.' }, 400, request, env);
  const current = await env.DB.prepare('SELECT * FROM books_service_catalog WHERE code = ?').bind(code).first();
  if (!current) return json({ error: '등록된 출판 서비스가 아닙니다.' }, 404, request, env);
  const pricingModel = clean(body.pricingModel ?? current.pricing_model, 20);
  if (!VALID_PRICING_MODELS.has(pricingModel)) return json({ error: 'pricingModel 값이 올바르지 않습니다.' }, 400, request, env);
  const priceKrw = Math.max(0, Math.trunc(Number(body.priceKrw ?? current.price_krw) || 0));
  const comparePriceKrw = Math.max(0, Math.trunc(Number(body.comparePriceKrw ?? current.compare_price_krw) || 0));
  const enabled = body.enabled === undefined ? Boolean(current.enabled) : Boolean(body.enabled);
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE books_service_catalog SET pricing_model = ?, price_krw = ?, compare_price_krw = ?, enabled = ?, note = ?, updated_at = ? WHERE code = ?`)
    .bind(pricingModel, priceKrw, comparePriceKrw, enabled ? 1 : 0, clean(body.note ?? current.note, 500), now, code).run();
  await audit(env, sessionData.email, 'books.service.update', code, JSON.stringify({ priceKrw, comparePriceKrw, enabled }));
  return json({ service: serviceRow(await env.DB.prepare('SELECT * FROM books_service_catalog WHERE code = ?').bind(code).first()) }, 200, request, env);
}

async function updateFeature(request, env, sessionData, key) {
  const body = await readBody(request);
  const current = await env.DB.prepare('SELECT * FROM books_feature_flags WHERE feature_key = ?').bind(key).first();
  if (!current) return json({ error: '등록된 기능이 아닙니다.' }, 404, request, env);
  const enabled = body?.enabled === undefined ? Boolean(current.enabled) : Boolean(body.enabled);
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE books_feature_flags SET enabled = ?, updated_at = ? WHERE feature_key = ?')
    .bind(enabled ? 1 : 0, now, key).run();
  await audit(env, sessionData.email, 'books.feature.update', key, JSON.stringify({ enabled }));
  return json({ ok: true, key, enabled }, 200, request, env);
}

async function updateInquiry(request, env, sessionData, id) {
  const body = await readBody(request);
  const current = await env.DB.prepare('SELECT * FROM books_inquiries WHERE id = ?').bind(id).first();
  if (!current) return json({ error: '상담 신청을 찾을 수 없습니다.' }, 404, request, env);
  const status = clean(body?.status ?? current.status, 30);
  if (!VALID_INQUIRY_STATUS.has(status)) return json({ error: '상담 상태 값이 올바르지 않습니다.' }, 400, request, env);
  const now = new Date().toISOString();
  await env.DB.prepare('UPDATE books_inquiries SET status = ?, assigned_to = ?, admin_note = ?, updated_at = ? WHERE id = ?')
    .bind(status, clean(body?.assignedTo ?? current.assigned_to, 120), clean(body?.adminNote ?? current.admin_note, 1000), now, id).run();
  await audit(env, sessionData.email, 'books.inquiry.update', String(id), JSON.stringify({ status }));
  return json({ ok: true, id, status }, 200, request, env);
}

function publicationPayload(body, current = {}) {
  const now = new Date().toISOString();
  const id = clean(body.id ?? current.id, 80).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
  const stage = clean(body.stage ?? current.stage ?? 'MANUSCRIPT', 30).toUpperCase();
  if (!id || !clean(body.title ?? current.title, 200)) throw new Error('도서 ID와 제목은 필수입니다.');
  if (!VALID_STAGES.has(stage)) throw new Error('출판 단계 값이 올바르지 않습니다.');
  const formats = Array.isArray(body.format) ? body.format.map(value => clean(value, 50)).filter(Boolean).slice(0, 10) : parseJson(current.format_json, ['EPUB 3']);
  const distribution = body.distribution && typeof body.distribution === 'object' ? body.distribution : parseJson(current.distribution_json, {});
  const links = body.links && typeof body.links === 'object' ? body.links : parseJson(current.links_json, {});
  return {
    id,
    catalogNo: clean(body.catalogNo ?? current.catalog_no, 80),
    title: clean(body.title ?? current.title, 200),
    subtitle: clean(body.subtitle ?? current.subtitle, 240),
    author: clean(body.author ?? current.author, 160),
    series: clean(body.series ?? current.series ?? 'EKODI ORIGINAL', 160),
    seriesNumber: body.seriesNumber === '' || body.seriesNumber === null ? null : Math.max(0, Math.trunc(Number(body.seriesNumber ?? current.series_number) || 0)),
    publicationType: clean(body.publicationType ?? current.publication_type ?? 'MONOGRAPH', 160),
    status: clean(body.status ?? current.status ?? 'DRAFT', 100),
    stage,
    editorialField: clean(body.editorialField ?? current.editorial_field ?? 'Ecclesia', 80),
    languageLabel: clean(body.languageLabel ?? current.language_label ?? '한국어', 180),
    formatJson: JSON.stringify(formats.length ? formats : ['EPUB 3']),
    edition: clean(body.edition ?? current.edition, 160),
    abstract: clean(body.abstract ?? current.abstract, 4000),
    citation: clean(body.citation ?? current.citation, 1000),
    coverImage: clean(body.coverImage ?? current.cover_image, 500),
    detailUrl: clean(body.detailUrl ?? current.detail_url, 500),
    googleBooksId: clean(body.identifiers?.googleBooks ?? current.google_books_id, 120),
    isbnEbook: clean(body.identifiers?.isbnEbook ?? current.isbn_ebook, 80),
    amazonAsin: clean(body.identifiers?.amazonAsin ?? current.amazon_asin, 80),
    distributionJson: JSON.stringify(distribution),
    linksJson: JSON.stringify(links),
    priceKrw: Math.max(0, Math.trunc(Number(body.priceKrw ?? current.price_krw) || 0)),
    isPublic: body.isPublic === undefined ? Boolean(current.is_public) : Boolean(body.isPublic),
    sortOrder: Math.trunc(Number(body.sortOrder ?? current.sort_order) || 100),
    now,
  };
}

async function createPublication(request, env, sessionData) {
  const body = await readBody(request);
  if (!body || typeof body !== 'object') return json({ error: '도서 정보를 확인해 주세요.' }, 400, request, env);
  let p;
  try { p = publicationPayload(body); } catch (error) { return json({ error: error.message }, 400, request, env); }
  if (await env.DB.prepare('SELECT id FROM books_publications WHERE id = ?').bind(p.id).first()) return json({ error: '이미 사용 중인 도서 ID입니다.' }, 409, request, env);
  const updatedBy = await adminId(env, sessionData.email);
  await env.DB.prepare(`INSERT INTO books_publications
    (id, catalog_no, title, subtitle, author, series, series_number, publication_type, status, stage, editorial_field,
     language_label, format_json, edition, abstract, citation, cover_image, detail_url, google_books_id, isbn_ebook,
     amazon_asin, distribution_json, links_json, price_krw, is_public, sort_order, created_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(p.id, p.catalogNo, p.title, p.subtitle, p.author, p.series, p.seriesNumber, p.publicationType, p.status, p.stage,
      p.editorialField, p.languageLabel, p.formatJson, p.edition, p.abstract, p.citation, p.coverImage, p.detailUrl,
      p.googleBooksId, p.isbnEbook, p.amazonAsin, p.distributionJson, p.linksJson, p.priceKrw, p.isPublic ? 1 : 0,
      p.sortOrder, p.now, p.now, updatedBy).run();
  await audit(env, sessionData.email, 'books.publication.create', p.id, p.title);
  return json({ publication: publicationRow(await env.DB.prepare('SELECT * FROM books_publications WHERE id = ?').bind(p.id).first()) }, 201, request, env);
}

async function updatePublication(request, env, sessionData, id) {
  const current = await env.DB.prepare('SELECT * FROM books_publications WHERE id = ?').bind(id).first();
  if (!current) return json({ error: '도서를 찾을 수 없습니다.' }, 404, request, env);
  const body = await readBody(request);
  let p;
  try { p = publicationPayload({ ...body, id }, current); } catch (error) { return json({ error: error.message }, 400, request, env); }
  const updatedBy = await adminId(env, sessionData.email);
  await env.DB.prepare(`UPDATE books_publications SET catalog_no=?, title=?, subtitle=?, author=?, series=?, series_number=?,
    publication_type=?, status=?, stage=?, editorial_field=?, language_label=?, format_json=?, edition=?, abstract=?, citation=?,
    cover_image=?, detail_url=?, google_books_id=?, isbn_ebook=?, amazon_asin=?, distribution_json=?, links_json=?, price_krw=?,
    is_public=?, sort_order=?, updated_at=?, updated_by=? WHERE id=?`)
    .bind(p.catalogNo, p.title, p.subtitle, p.author, p.series, p.seriesNumber, p.publicationType, p.status, p.stage,
      p.editorialField, p.languageLabel, p.formatJson, p.edition, p.abstract, p.citation, p.coverImage, p.detailUrl,
      p.googleBooksId, p.isbnEbook, p.amazonAsin, p.distributionJson, p.linksJson, p.priceKrw, p.isPublic ? 1 : 0,
      p.sortOrder, p.now, updatedBy, id).run();
  await audit(env, sessionData.email, 'books.publication.update', id, JSON.stringify({ title: p.title, stage: p.stage, isPublic: p.isPublic }));
  return json({ publication: publicationRow(await env.DB.prepare('SELECT * FROM books_publications WHERE id = ?').bind(id).first()) }, 200, request, env);
}

async function deletePublication(request, env, sessionData, id) {
  const current = await env.DB.prepare('SELECT title FROM books_publications WHERE id = ?').bind(id).first();
  if (!current) return json({ error: '도서를 찾을 수 없습니다.' }, 404, request, env);
  await env.DB.prepare('DELETE FROM books_publications WHERE id = ?').bind(id).run();
  await audit(env, sessionData.email, 'books.publication.delete', id, current.title);
  return json({ ok: true, id }, 200, request, env);
}

export async function handleBooksRequest(request, env) {
  if (!env.DB) return json({ error: 'Books 데이터베이스 연결이 설정되지 않았습니다.' }, 503, request, env);
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'GET' && path === `${PUBLIC_PREFIX}/config`) return publicConfig(request, env);
  if (request.method === 'GET' && path === `${PUBLIC_PREFIX}/publications`) return publicPublications(request, env);
  if (request.method === 'POST' && path === '/api/books/inquiries') return createInquiry(request, env);

  if (!path.startsWith(ADMIN_PREFIX)) return null;
  const auth = await session(request, env);
  if (!auth.data) return auth.response;

  if (request.method === 'GET' && path === `${ADMIN_PREFIX}/overview`) return adminOverview(request, env);
  if (request.method === 'POST' && path === `${ADMIN_PREFIX}/publications`) return createPublication(request, env, auth.data);

  let match = path.match(/^\/api\/books\/admin\/services\/([a-z0-9-]+)$/);
  if (match && request.method === 'PUT') return updateService(request, env, auth.data, match[1]);
  match = path.match(/^\/api\/books\/admin\/features\/([a-z0-9_-]+)$/);
  if (match && request.method === 'PUT') return updateFeature(request, env, auth.data, match[1]);
  match = path.match(/^\/api\/books\/admin\/inquiries\/(\d+)$/);
  if (match && request.method === 'PUT') return updateInquiry(request, env, auth.data, Number(match[1]));
  match = path.match(/^\/api\/books\/admin\/publications\/([a-z0-9-]+)$/);
  if (match && request.method === 'PUT') return updatePublication(request, env, auth.data, match[1]);
  if (match && request.method === 'DELETE') return deletePublication(request, env, auth.data, match[1]);

  return json({ error: 'Books API endpoint not found' }, 404, request, env);
}
