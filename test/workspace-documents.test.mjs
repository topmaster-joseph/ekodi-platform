import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleWorkspaceDocuments, latestDocumentIds, safeSourceUrl, shareDays, magicMatches, isWorkspaceDocumentsPath, canonicalTenant, tenantAdminPath } from '../workspace-documents-api.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MIGRATION = 'migrations/202611091100_workspace_documents.sql';
const IDENTITY = 'migrations/202611091130_workspace_documents_identity.sql';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(read(MIGRATION));
  db.exec("CREATE TABLE customer_tenants (slug TEXT, name TEXT, status TEXT); INSERT INTO customer_tenants VALUES ('ekodimission','에코디선교회','active'),('cgma','청계면상인회','active'),('ekodi-biz','에코디비즈','active'),('ekodi-lab','에코디연구소','active'),('jadam','자담치킨 목포대점','active'),('ekodi-church','에코디교회','active');");
  db.exec("CREATE TABLE church_documents (id TEXT PRIMARY KEY,bundle TEXT,bundle_url TEXT,title TEXT,category TEXT,doc_year TEXT,gdoc_url TEXT,hwpx_url TEXT,note TEXT,sort_order INTEGER,status TEXT,created_by TEXT,created_at TEXT,updated_at TEXT);");
  db.exec(read(IDENTITY));
  const stmt = (sql, binds = []) => ({
    bind: (...b) => stmt(sql, b),
    first: async () => db.prepare(sql).get(...binds) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...binds) }),
    run: async () => { const r = db.prepare(sql).run(...binds); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: sql => stmt(sql), raw: db };
}
function r2() {
  const map = new Map();
  return { map, put: async (k, v) => { map.set(k, new Uint8Array(v)); }, get: async k => map.has(k) ? { body: map.get(k) } : null, delete: async k => { map.delete(k); } };
}
const allow = tenant => async (_req, _env, { tenantSlug }) => tenantSlug === tenant ? { ok: true, scope: 'tenant', email: 'admin@ekodi.kr' } : { ok: false, status: 403 };
const WRITE = { origin: 'https://ekodi.kr', 'x-ekodi-doc-request': '1' };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

async function call(env, path, init = {}, tenant = 'ekodimission') {
  return handleWorkspaceDocuments(new Request('https://ekodi.kr' + path, init), env, { resolveAuthority: allow(tenant) });
}

test('helpers: latest per type+holder, https-only links, bounded share days, magic bytes, path match', () => {
  const rows = [
    { id: 'a', doc_type: '통장사본', holder: 'A', issued_on: '2026-01-01', created_at: '1' },
    { id: 'b', doc_type: '통장사본', holder: 'A', issued_on: '2026-11-09', created_at: '1' },
    { id: 'c', doc_type: '통장사본', holder: 'B', issued_on: '2025-01-01', created_at: '1' },
  ];
  assert.deepEqual([...latestDocumentIds(rows)].sort(), ['b', 'c']);
  assert.equal(safeSourceUrl('http://x.kr/a'), '');
  assert.equal(safeSourceUrl('javascript:alert(1)'), '');
  assert.equal(safeSourceUrl('https://drive.google.com/file/d/x/view'), 'https://drive.google.com/file/d/x/view');
  assert.equal(shareDays(0), 7); assert.equal(shareDays(99), 30); assert.equal(shareDays(3), 3);
  assert.equal(magicMatches(JPEG.buffer, 'image/jpeg'), true);
  assert.equal(magicMatches(JPEG.buffer, 'application/pdf'), false);
  assert.equal(isWorkspaceDocumentsPath('/api/workspace-documents/cgma'), true);
  assert.equal(isWorkspaceDocumentsPath('/api/workspace-documentsx'), false);
});

test('seeded bank copies are tenant-isolated and searchable, without account numbers in the repo', async () => {
  const env = { DB: d1(), WORKSPACE_DOCUMENT_FILES: r2() };
  const mission = await (await call(env, '/api/workspace-documents/ekodimission?q=통장사본')).json();
  assert.equal(mission.documents.every(d => d.type === '통장사본'), true);
  assert.equal(mission.documents.length, 1);
  assert.equal(mission.documents[0].holder, '에코디선교회');
  assert.equal(mission.documents[0].latest, true);
  const cgma = await (await call(env, '/api/workspace-documents/cgma?q=신한', {}, 'cgma')).json();
  assert.equal(cgma.documents.length, 1);
  assert.equal(cgma.documents[0].holder, '청계면상인회');
  // 다른 사이트 권한으로는 열 수 없다.
  assert.equal((await call(env, '/api/workspace-documents/cgma', {}, 'ekodimission')).status, 403);
  assert.doesNotMatch(read(MIGRATION), /\d{3}-\d{3}-\d{6}/);
});

test('upload → download → share → shared open → unshare → archive, with full event history', async () => {
  const env = { DB: d1(), WORKSPACE_DOCUMENT_FILES: r2() };
  const form = new FormData();
  form.set('type', '고유번호증'); form.set('holder', '에코디선교회');
  form.set('file', new File([JPEG], 'id.jpg', { type: 'image/jpeg' }));
  assert.equal((await call(env, '/api/workspace-documents/ekodimission', { method: 'POST', body: form })).status, 403, 'cross-site write without headers is refused');
  const created = await call(env, '/api/workspace-documents/ekodimission', { method: 'POST', body: form, headers: WRITE });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.ok([...env.WORKSPACE_DOCUMENT_FILES.map.keys()][0].startsWith('workspace/ekodimission/documents/'));

  const file = await call(env, `/api/workspace-documents/ekodimission/${id}/file`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('cache-control'), /no-store/);
  assert.equal((await call(env, `/api/workspace-documents/cgma/${id}/file`, {}, 'cgma')).status, 404, 'tenant isolation on file');

  const share = await (await call(env, `/api/workspace-documents/ekodimission/${id}/share`, { method: 'POST', headers: { ...WRITE, 'content-type': 'application/json' }, body: JSON.stringify({ days: 2 }) })).json();
  assert.equal(share.days, 2);
  const token = share.url.split('/shared/')[1];
  const opened = await handleWorkspaceDocuments(new Request(share.url), env, { resolveAuthority: async () => ({ ok: false, status: 401 }) });
  assert.equal(opened.status, 200, 'share link works without login');
  assert.equal(env.DB.raw.prepare('SELECT count(*) n FROM workspace_document_shares WHERE token_hash=?').get(token).n, 0, 'raw token is never stored');

  await call(env, `/api/workspace-documents/ekodimission/${id}/unshare`, { method: 'POST', headers: WRITE });
  const revoked = await handleWorkspaceDocuments(new Request(share.url), env);
  assert.equal(revoked.status, 404);

  const events = await (await call(env, `/api/workspace-documents/ekodimission/${id}/events`)).json();
  assert.deepEqual(events.events.map(e => e.action).sort(), ['download', 'share', 'shared-open', 'unshare', 'upload'].sort());

  assert.equal((await call(env, `/api/workspace-documents/ekodimission/${id}/archive`, { method: 'POST', headers: WRITE })).status, 200);
  const list = await (await call(env, '/api/workspace-documents/ekodimission?type=고유번호증')).json();
  assert.equal(list.documents.length, 0);
});

test('expired share links do not open; bad input is rejected', async () => {
  const env = { DB: d1(), WORKSPACE_DOCUMENT_FILES: r2() };
  const id = 'wdoc-6f1c2a4e-0b7d-4c55-9a51-20261109a001';
  const share = await (await call(env, `/api/workspace-documents/ekodimission/${id}/share`, { method: 'POST', headers: WRITE })).json();
  env.DB.raw.exec("UPDATE workspace_document_shares SET expires_at='2000-01-01T00:00:00Z'");
  assert.equal((await handleWorkspaceDocuments(new Request(share.url), env)).status, 404);
  assert.equal((await handleWorkspaceDocuments(new Request('https://ekodi.kr/api/workspace-documents/shared/short'), env)).status, 404);
  const bad = new FormData(); bad.set('type', '통장사본'); bad.set('file', new File([new Uint8Array([1, 2, 3, 4])], 'x.pdf', { type: 'application/pdf' }));
  assert.equal((await call(env, '/api/workspace-documents/ekodimission', { method: 'POST', body: bad, headers: WRITE })).status, 415);
  const empty = new FormData(); empty.set('type', '통장사본');
  assert.equal((await call(env, '/api/workspace-documents/ekodimission', { method: 'POST', body: empty, headers: WRITE })).status, 400);
});

test('wiring: route, private R2 binding, admin menu on every workspace site', () => {
  assert.match(read('customer-entry-worker.js'), /isWorkspaceDocumentsPath\(path\)/);
  assert.match(read('wrangler.api.toml'), /binding = "WORKSPACE_DOCUMENT_FILES"\nbucket_name = "ekodi-storage"/);
  const page = read('workspace-admin-page.js');
  assert.match(page, /documents:TENANT_ADMIN_CAPABILITIES\.access/);
  assert.match(page, /\['finance','재무'\],\['documents','문서함'\]/);
  assert.match(page, /if\(section==='documents'\)return documentsAdmin\(\)/);
  assert.match(page, /\/api\/workspace-documents\//);
  assert.match(page, /\/api\/workspace-documents\/overview/);
  assert.match(page, /params\.get\('view'\)==='overview'/);
});

test('identity seed: representative ID and resumes per site, no ID numbers, ID shares capped at one day', async () => {
  const env = { DB: d1(), WORKSPACE_DOCUMENT_FILES: r2() };
  for (const site of ['ekodimission', 'cgma', 'ekodi-biz', 'ekodi-lab']) {
    const list = await (await call(env, `/api/workspace-documents/${site}`, {}, site)).json();
    const types = list.documents.map(d => d.type);
    assert.ok(types.includes('신분증') && types.includes('이력서'), site);
    assert.equal(list.documents.filter(d => d.type === '이력서' && d.latest).length, 1, 'only newest resume is latest');
  }
  assert.doesNotMatch(read(IDENTITY), /\d{6}-\d{7}/, 'no resident registration numbers');
  assert.equal(env.DB.raw.prepare("SELECT count(*) n FROM church_documents WHERE bundle='대표자(담임목사) 서류'").get().n, 3);
  const idDoc = env.DB.raw.prepare("SELECT id FROM workspace_documents WHERE tenant_slug='cgma' AND doc_type='신분증'").get().id;
  const share = await (await call(env, `/api/workspace-documents/cgma/${idDoc}/share`, { method: 'POST', headers: { ...WRITE, 'content-type': 'application/json' }, body: JSON.stringify({ days: 30 }) }, 'cgma')).json();
  assert.equal(share.days, 1);
  assert.equal(shareDays(30, '신분증'), 1);
});

test('admin path aliases map to canonical tenant slugs', async () => {
  assert.equal(canonicalTenant('ekodibiz'), 'ekodi-biz');
  assert.equal(tenantAdminPath('ekodi-biz'), '/ekodibiz/admin/documents');
  assert.equal(tenantAdminPath('cgma'), '/cgma/admin/documents');
  assert.equal(tenantAdminPath('ekodi-church'), '/ekodichurch/admin');
  const env = { DB: d1(), WORKSPACE_DOCUMENT_FILES: r2() };
  const res = await call(env, '/api/workspace-documents/ekodibiz', {}, 'ekodi-biz');
  assert.equal(res.status, 200);
  assert.ok((await res.json()).documents.some(d => d.type === '사업자등록증'));
});

test('super admin overview: platform only, per-site completeness without file links', async () => {
  const env = { DB: d1(), WORKSPACE_DOCUMENT_FILES: r2() };
  const denied = await handleWorkspaceDocuments(new Request('https://ekodi.kr/api/workspace-documents/overview'), env, { resolveAuthority: async () => ({ ok: true, scope: 'tenant', email: 'a@x' }) });
  assert.equal(denied.status, 403);
  const res = await handleWorkspaceDocuments(new Request('https://ekodi.kr/api/workspace-documents/overview'), env, { resolveAuthority: async () => ({ ok: true, scope: 'platform', email: 'joseph@ekodi.kr' }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  const mission = body.sites.find(s => s.slug === 'ekodimission');
  assert.deepEqual(mission.required, { bank: true, registration: false, id: true, resume: true });
  assert.equal(body.sites.find(s => s.slug === 'ekodi-biz').required.registration, true);
  assert.equal(body.sites.find(s => s.slug === 'ekodi-church').separateArchive.documents, 3);
  assert.doesNotMatch(JSON.stringify(body), /drive\.google\.com|docs\.google\.com/, 'overview carries no file links');
});
