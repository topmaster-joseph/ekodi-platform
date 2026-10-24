import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  handleCgmaEdocs, validateDraft, validateStrokes, sniffFileType, nextSignerState, normalizeName, sha256Hex, eventHash,
  EDOC_API_PREFIX, LINK_TTL_MS, DEFAULT_SIGNER_ROLES,
} from '../cgma-edoc-api.js';

const MIGRATION = fs.readFileSync(new URL('../migrations/202610250500_cgma_edocs.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://ekodi.kr';
const T0 = Date.parse('2026-10-25T05:00:00Z');

function d1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(MIGRATION);
  const statement = (sql, params = []) => ({
    bind(...values) { return statement(sql, values); },
    async first() { return sqlite.prepare(sql).get(...params) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...params) }; },
    async run() { const r = sqlite.prepare(sql).run(...params); return { meta: { changes: Number(r.changes) } }; },
  });
  let chain = Promise.resolve();
  const db = {
    sqlite,
    prepare: sql => statement(sql),
    batch(statements) {
      // D1 batches are atomic and serialized; model both.
      const run = chain.then(async () => {
        sqlite.exec('BEGIN');
        try { const out = []; for (const s of statements) out.push(await s.run()); sqlite.exec('COMMIT'); return out; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      });
      chain = run.catch(() => {});
      return run;
    },
  };
  return db;
}
function r2() {
  const store = new Map();
  return { store, async put(key, bytes, opts) { store.set(key, { bytes: new Uint8Array(bytes), opts }); },
    async get(key) { const v = store.get(key); return v ? { body: v.bytes } : null; } };
}
function setup({ scope = 'tenant' } = {}) {
  const env = { DB: d1(), CGMA_EDOC_FILES: r2() };
  let now = T0;
  const options = {
    now: () => now,
    resolveAuthority: async request => {
      const auth = request.headers.get('authorization');
      if (!auth) return { ok: false, status: 401 };
      if (auth === 'Bearer outsider') return { ok: false, status: 403 };
      return { ok: true, scope, email: 'Chair@CGMA.or.kr', role: 'owner' };
    },
  };
  const call = (path, { method = 'GET', body, headers = {}, admin = true, token } = {}) => {
    const h = new Headers(headers);
    if (admin) h.set('authorization', 'Bearer admin');
    if (token) h.set('x-ekodi-sign-token', token);
    if (method !== 'GET') { if (!h.has('x-ekodi-edoc-request')) h.set('x-ekodi-edoc-request', '1'); if (!h.has('origin')) h.set('origin', ORIGIN); }
    let payload = body;
    if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string') { payload = JSON.stringify(body); h.set('content-type', 'application/json'); }
    if (typeof body === 'string' && !h.has('content-type')) h.set('content-type', 'application/json');
    return handleCgmaEdocs(new Request(ORIGIN + EDOC_API_PREFIX + path, { method, headers: h, body: payload }), env, options);
  };
  return { env, call, setNow: value => { now = value; } };
}
const PDF = new Uint8Array([...new TextEncoder().encode('%PDF-1.7\n'), ...new Array(200).fill(65), ...new TextEncoder().encode('\n%%EOF')]);
const sig = (n = 12) => [Array.from({ length: n }, (_, i) => [100 + i * 20, 200 + (i % 3) * 10])];
const tokenOf = link => link.split('#')[1];
const draft = (extra = {}) => ({ title: '청계면상인회 홈페이지 제안서 및 견적서', category: '제안서·견적서', content_kind: 'file',
  signers: [{ role_title: '총무', signer_name: '김총무' }, { role_title: '사무국장', signer_name: '이국장' }, { role_title: '상인회장', signer_name: '정찬균' }], ...extra });

async function startedFileDoc(ctx) {
  const created = await (await ctx.call('', { method: 'POST', body: draft() })).json();
  const up = await ctx.call(`/${created.id}/file`, { method: 'PUT', body: PDF, headers: { 'content-type': 'application/pdf', 'x-ekodi-file-name': encodeURIComponent('제안서.pdf') } });
  assert.equal(up.status, 200);
  const started = await (await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' })).json();
  assert.equal(started.ok, true);
  return { id: created.id, docNo: created.doc_no, links: started.links, sha: await sha256Hex(PDF) };
}
const signBody = (sha, name, extra = {}) => ({ agree: true, signed_name: name, signature: sig(), content_sha256: sha, ...extra });

// ---------- pure validation ----------
test('draft validation enforces title, category, signer chain bounds', () => {
  assert.equal(validateDraft(draft()).ok, true);
  assert.equal(validateDraft(draft({ title: '' })).code, 'TITLE_INVALID');
  assert.equal(validateDraft(draft({ category: '아무거나' })).code, 'CATEGORY_INVALID');
  assert.equal(validateDraft(draft({ signers: [] })).code, 'SIGNERS_INVALID');
  assert.equal(validateDraft(draft({ signers: Array.from({ length: 11 }, () => ({ role_title: 'a', signer_name: 'b' })) })).code, 'SIGNERS_INVALID');
  assert.equal(validateDraft(draft({ signers: [{ role_title: '총무', signer_name: '' }] })).code, 'SIGNER_INVALID');
  assert.equal(validateDraft(draft({ content_kind: 'text', body_text: '' })).code, 'BODY_TEXT_INVALID');
  assert.deepEqual(DEFAULT_SIGNER_ROLES, ['총무', '사무국장', '상인회장']);
});
test('signature strokes must be bounded integer vectors with real content', () => {
  assert.ok(validateStrokes(sig()));
  assert.equal(validateStrokes([]), null);
  assert.equal(validateStrokes([[[1, 1], [2, 2]]]), null, 'too few points');
  assert.equal(validateStrokes([[[1001, 1], ...sig()[0]]]), null, 'x out of range');
  assert.equal(validateStrokes([[[1.5, 1], ...sig()[0]]]), null, 'non-integer');
  assert.equal(validateStrokes('data:image/png;base64,AAAA'), null, 'images are not accepted');
  assert.equal(validateStrokes([Array.from({ length: 6001 }, () => [1, 1])]), null, 'point cap');
});
test('file sniffing requires matching magic bytes', () => {
  assert.deepEqual(sniffFileType(PDF, 'application/pdf'), { mime: 'application/pdf', ext: 'pdf' });
  assert.equal(sniffFileType(new TextEncoder().encode('<html>'), 'application/pdf'), null);
  assert.equal(sniffFileType(PDF, 'text/html'), null);
});
test('sequential state model: only the next signer is activated, last completes', () => {
  const s = [{ seq: 1, status: 'active' }, { seq: 2, status: 'waiting' }, { seq: 3, status: 'waiting' }];
  const a = nextSignerState(s, 1);
  assert.deepEqual(a.signers.map(x => x.status), ['signed', 'active', 'waiting']);
  assert.equal(a.status, 'in_progress');
  const c = nextSignerState([{ seq: 1, status: 'signed' }, { seq: 2, status: 'signed' }, { seq: 3, status: 'active' }], 3);
  assert.equal(c.status, 'completed'); assert.equal(c.isLast, true);
  assert.equal(normalizeName(' 정 찬균 '), normalizeName('정찬균'));
});

// ---------- authority and request boundaries ----------
test('admin endpoints require cgma authority; writes require same-origin intent header', async () => {
  const ctx = setup();
  assert.equal((await ctx.call('', { admin: false })).status, 401);
  assert.equal((await ctx.call('', { headers: { authorization: 'Bearer outsider' }, admin: false })).status, 403);
  assert.equal((await setup({ scope: 'viewer' }).call('')).status, 403);
  assert.equal((await ctx.call('', { method: 'POST', body: draft(), headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await ctx.call('', { method: 'POST', body: draft(), headers: { 'x-ekodi-edoc-request': '0' } })).status, 403);
  assert.equal((await ctx.call('/not-a-doc')).status, 404);
  const list = await (await ctx.call('')).json();
  assert.equal(list.ok, true); assert.deepEqual(list.documents, []);
});

// ---------- the full sequential flow ----------
test('three signers sign strictly left to right; dates are server time; completion is recorded', async () => {
  const ctx = setup();
  const doc = await startedFileDoc(ctx);
  assert.match(doc.docNo, /^CGMA-2026-0001$/);
  assert.deepEqual(doc.links.map(l => l.role_title), ['총무', '사무국장', '상인회장']);
  const [t1, t2, t3] = doc.links.map(l => tokenOf(l.link));
  assert.ok(doc.links.every(l => l.link.startsWith('https://ekodi.kr/cgma/sign/#')));

  // Out of order: 사무국장 and 상인회장 cannot sign first.
  let r = await ctx.call('/sign', { method: 'POST', admin: false, token: t2, body: signBody(doc.sha, '이국장') });
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'SIGN_NOT_YOUR_TURN');
  r = await ctx.call('/sign', { method: 'POST', admin: false, token: t3, body: signBody(doc.sha, '정찬균') });
  assert.equal(r.status, 409);
  const waiting = await (await ctx.call('/sign', { admin: false, token: t2 })).json();
  assert.equal(waiting.can_sign, false); assert.equal(waiting.waiting_for.role_title, '총무');

  // Signer 1 failure cases.
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: t1, body: signBody(doc.sha, '홍길동') })).status, 422);
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: t1, body: signBody('0'.repeat(64), '김총무') })).status, 409);
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: t1, body: signBody(doc.sha, '김총무', { agree: false }) })).status, 400);
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: t1, body: signBody(doc.sha, '김총무', { signature: [[[1, 1]]] }) })).status, 422);
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: 'x'.repeat(43), body: signBody(doc.sha, '김총무') })).status, 401);

  ctx.setNow(T0 + 60_000);
  r = await ctx.call('/sign', { method: 'POST', admin: false, token: t1, body: signBody(doc.sha, ' 김 총무 ') });
  assert.equal(r.status, 200);
  const first = await r.json();
  assert.equal(first.signed_at, new Date(T0 + 60_000).toISOString()); assert.equal(first.completed, false);
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: t1, body: signBody(doc.sha, '김총무') })).status, 409, 'no double signing');
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: t3, body: signBody(doc.sha, '정찬균') })).status, 409, '3rd still waits for 2nd');

  // Content is locked once the request started.
  assert.equal((await ctx.call(`/${doc.id}/file`, { method: 'PUT', body: PDF, headers: { 'content-type': 'application/pdf' } })).status, 409);

  ctx.setNow(T0 + 120_000);
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: t2, body: signBody(doc.sha, '이국장') })).status, 200);
  ctx.setNow(T0 + 180_000);
  const last = await (await ctx.call('/sign', { method: 'POST', admin: false, token: t3, body: signBody(doc.sha, '정찬균') })).json();
  assert.equal(last.completed, true);

  const detail = await (await ctx.call(`/${doc.id}`)).json();
  assert.equal(detail.document.status, 'completed');
  assert.equal(detail.document.completed_at, new Date(T0 + 180_000).toISOString());
  assert.deepEqual(detail.signers.map(s => [s.seq, s.status, s.signed_at]), [
    [1, 'signed', new Date(T0 + 60_000).toISOString()], [2, 'signed', new Date(T0 + 120_000).toISOString()], [3, 'signed', new Date(T0 + 180_000).toISOString()]]);
  assert.ok(detail.signers.every(s => !s.link && s.signature.length && s.signed_content_sha256 === doc.sha));
  assert.deepEqual(detail.events.map(e => e.action), ['created', 'file_uploaded', 'started', 'signed', 'signed', 'signed', 'completed']);
  assert.equal(detail.chain_valid, true);

  // Signers keep read access to the completed record (certificate), but cannot sign again.
  const view = await (await ctx.call('/sign', { admin: false, token: t1 })).json();
  assert.equal(view.document.status, 'completed'); assert.equal(view.can_sign, false); assert.equal(view.signers[2].signature.length, 1);
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: t3, body: signBody(doc.sha, '정찬균') })).status, 409);
  assert.equal((await ctx.call(`/${doc.id}/cancel`, { method: 'POST', body: { reason: '테스트' } })).status, 409, 'completed cannot be cancelled');

  // Tampering with any event breaks the hash chain.
  ctx.env.DB.sqlite.prepare("UPDATE cgma_edoc_events SET detail_json='{\"seq\":2}' WHERE action='signed' AND detail_json LIKE '%이국장%'").run();
  assert.equal((await (await ctx.call(`/${doc.id}`)).json()).chain_valid, false);
});

test('concurrent submissions by the active signer: exactly one succeeds', async () => {
  const ctx = setup();
  const doc = await startedFileDoc(ctx);
  const t1 = tokenOf(doc.links[0].link);
  const results = await Promise.all([1, 2, 3].map(() => ctx.call('/sign', { method: 'POST', admin: false, token: t1, body: signBody(doc.sha, '김총무') })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409, 409]);
  const rows = ctx.env.DB.sqlite.prepare("SELECT COUNT(*) AS n FROM cgma_edoc_events WHERE action='signed'").get();
  assert.equal(Number(rows.n), 1);
  const active = ctx.env.DB.sqlite.prepare("SELECT seq FROM cgma_edoc_signers WHERE status='active'").all();
  assert.deepEqual(active.map(r => r.seq), [2]);
});

test('file is served to the signer and admin with its fingerprint; storage holds the exact bytes', async () => {
  const ctx = setup();
  const doc = await startedFileDoc(ctx);
  const r = await ctx.call('/sign/file', { admin: false, token: tokenOf(doc.links[2].link) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-ekodi-content-sha256'), doc.sha);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PDF);
  const admin = await ctx.call(`/${doc.id}/file`);
  assert.equal(admin.status, 200);
  const [key] = [...ctx.env.CGMA_EDOC_FILES.store.keys()];
  assert.match(key, new RegExp(`^cgma/edocs/${doc.id}/original-[0-9a-f]{16}\\.pdf$`));
});

test('link reissue invalidates the old link; expired links cannot sign', async () => {
  const ctx = setup();
  const doc = await startedFileDoc(ctx);
  const old = tokenOf(doc.links[0].link);
  const re = await (await ctx.call(`/${doc.id}/signers/1/reissue`, { method: 'POST', body: '{}' })).json();
  assert.equal(re.ok, true);
  assert.equal((await ctx.call('/sign', { admin: false, token: old })).status, 401);
  const fresh = tokenOf(re.link);
  ctx.setNow(T0 + LINK_TTL_MS + 1000);
  const view = await (await ctx.call('/sign', { admin: false, token: fresh })).json();
  assert.equal(view.link_expired, true); assert.equal(view.can_sign, false);
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: fresh, body: signBody(doc.sha, '김총무') })).status, 410);
  const renewed = await (await ctx.call(`/${doc.id}/signers/1/reissue`, { method: 'POST', body: '{}' })).json();
  assert.equal((await ctx.call('/sign', { method: 'POST', admin: false, token: tokenOf(renewed.link), body: signBody(doc.sha, '김총무') })).status, 200);
  assert.equal((await ctx.call(`/${doc.id}/signers/1/reissue`, { method: 'POST', body: '{}' })).status, 409, 'signed signer has no link');
});

test('cancel keeps the record, requires a reason and disables unsigned links', async () => {
  const ctx = setup();
  const doc = await startedFileDoc(ctx);
  assert.equal((await ctx.call(`/${doc.id}/cancel`, { method: 'POST', body: { reason: '' } })).status, 400);
  assert.equal((await ctx.call(`/${doc.id}/cancel`, { method: 'POST', body: { reason: '내용 수정 후 재상정' } })).status, 200);
  assert.equal((await ctx.call('/sign', { admin: false, token: tokenOf(doc.links[0].link) })).status, 401);
  const detail = await (await ctx.call(`/${doc.id}`)).json();
  assert.equal(detail.document.status, 'cancelled'); assert.equal(detail.document.cancel_reason, '내용 수정 후 재상정');
  assert.equal(detail.chain_valid, true);
  const list = await (await ctx.call('?status=cancelled')).json();
  assert.equal(list.documents.length, 1); assert.equal(list.summary.cancelled, 1);
});

test('text documents (회의록 본문) sign without a file; numbering increments per year', async () => {
  const ctx = setup();
  await startedFileDoc(ctx);
  const body = '2026년 10월 정기회의\n1. 홈페이지 제작 승인\n2. 차기 회의 일정';
  const created = await (await ctx.call('', { method: 'POST', body: { title: '10월 정기회의 회의록', category: '회의록', content_kind: 'text', body_text: body,
    signers: [{ role_title: '상인회장', signer_name: '정찬균' }] } })).json();
  assert.equal(created.doc_no, 'CGMA-2026-0002');
  assert.equal((await ctx.call(`/${created.id}/file`, { method: 'PUT', body: PDF, headers: { 'content-type': 'application/pdf' } })).status, 409);
  const started = await (await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' })).json();
  const token = tokenOf(started.links[0].link);
  const view = await (await ctx.call('/sign', { admin: false, token })).json();
  assert.equal(view.document.body_text, body); assert.equal(view.document.content_sha256, await sha256Hex(body));
  const done = await (await ctx.call('/sign', { method: 'POST', admin: false, token, body: signBody(view.document.content_sha256, '정찬균') })).json();
  assert.equal(done.completed, true);
  assert.equal((await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' })).status, 409);
  const q = await (await ctx.call('?q=' + encodeURIComponent('회의록'))).json();
  assert.deepEqual(q.documents.map(d => d.doc_no), ['CGMA-2026-0002']);
});

test('uploads reject wrong types and oversize bodies; start requires content', async () => {
  const ctx = setup();
  const created = await (await ctx.call('', { method: 'POST', body: draft() })).json();
  assert.equal((await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' })).status, 409);
  assert.equal((await ctx.call(`/${created.id}/file`, { method: 'PUT', body: new TextEncoder().encode('<script>'), headers: { 'content-type': 'application/pdf' } })).status, 415);
  assert.equal((await ctx.call(`/${created.id}/file`, { method: 'PUT', body: PDF, headers: { 'content-type': 'application/pdf', 'content-length': String(21 * 1024 * 1024) } })).status, 413);
  assert.equal((await ctx.call('', { method: 'POST', body: 'not json' })).status, 400);
});

test('event hash is deterministic and covers every field', async () => {
  const base = { prevHash: 'a', docId: 'd', action: 'signed', actor: 'signer:1', detailJson: '{}', createdAt: '2026-10-25T00:00:00.000Z' };
  const h = await eventHash(base);
  assert.equal(h, await eventHash({ ...base }));
  for (const key of Object.keys(base)) assert.notEqual(h, await eventHash({ ...base, [key]: base[key] + 'x' }), key);
});

test('migration is additive and the API never logs request content', () => {
  assert.doesNotMatch(MIGRATION.replace(/--[^\n]*/g, ''), /\bDROP\b|\bRENAME\b|\bDELETE\s+FROM\b/i);
  const source = fs.readFileSync(new URL('../cgma-edoc-api.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*(body|signed_name|signature|strokes)/);
  assert.doesNotMatch(source, /DELETE FROM cgma_edoc/);
  const entry = fs.readFileSync(new URL('../customer-entry-worker.js', import.meta.url), 'utf8');
  assert.match(entry, /if \(isEdocApiPath\(path\)\) \{\n\s+return handleCgmaEdocs\(request, env\);/);
  assert.match(fs.readFileSync(new URL('../wrangler.api.toml', import.meta.url), 'utf8'), /binding = "CGMA_EDOC_FILES"\nbucket_name = "ekodi-storage"/);
});
