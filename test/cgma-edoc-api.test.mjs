import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  handleCgmaEdocs, validateDraft, validateStrokes, sniffFileType, nextSignerState, normalizeName, sha256Hex, eventHash,
  EDOC_API_PREFIX, LINK_TTL_MS, DEFAULT_SIGNER_ROLES, normalizeSourceUrl, snapshotSource,
} from '../cgma-edoc-api.js';

const MIGRATION = fs.readFileSync(new URL('../migrations/202610250500_cgma_edocs.sql', import.meta.url), 'utf8');
const MIGRATION_ARCHIVE = fs.readFileSync(new URL('../migrations/202610280400_cgma_edocs_archive.sql', import.meta.url), 'utf8');
const MIGRATION_SOURCE_URL = fs.readFileSync(new URL('../migrations/202610280600_cgma_edocs_source_url.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://ekodi.kr';
const T0 = Date.parse('2026-10-25T05:00:00Z');

function d1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(MIGRATION);
  sqlite.exec(MIGRATION_ARCHIVE);
  sqlite.exec(MIGRATION_SOURCE_URL);
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
function setup({ scope = 'tenant', fetch: fetchImpl } = {}) {
  const env = { DB: d1(), CGMA_EDOC_FILES: r2() };
  let now = T0;
  const options = {
    now: () => now,
    fetch: fetchImpl || (async () => { throw new Error('network disabled in tests'); }),
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
  assert.equal(validateDraft(draft({ signers: [{ role_title: '총무', signer_name: '' }] })).ok, true, 'name may be filled in later');
  assert.equal(validateDraft(draft({ signers: [{ role_title: '', signer_name: '김총무' }] })).code, 'SIGNERS_INVALID');
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
  // The database itself refuses edits; simulate an out-of-band edit by removing the guard first.
  assert.throws(() => ctx.env.DB.sqlite.prepare("UPDATE cgma_edoc_events SET actor='x'").run(), /append-only/);
  ctx.env.DB.sqlite.exec('DROP TRIGGER trg_cgma_edoc_events_no_update');
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
  assert.doesNotMatch(source, /DELETE FROM cgma_edoc_(documents|events)/);
  // The only signer delete is the guarded draft re-plan; the DB trigger refuses it for any started document.
  assert.deepEqual(source.match(/DELETE FROM cgma_edoc_signers[^`]*/g), ['DELETE FROM cgma_edoc_signers WHERE doc_id=? AND ${guard.sql}']);
  const entry = fs.readFileSync(new URL('../customer-entry-worker.js', import.meta.url), 'utf8');
  assert.match(entry, /if \(isEdocApiPath\(path\)\) \{\n\s+return handleCgmaEdocs\(request, env\);/);
  assert.match(fs.readFileSync(new URL('../wrangler.api.toml', import.meta.url), 'utf8'), /binding = "CGMA_EDOC_FILES"\nbucket_name = "ekodi-storage"/);
});

// ---------- review findings: races and database-level permanence ----------
async function draftWithFile(ctx) {
  const created = await (await ctx.call('', { method: 'POST', body: draft() })).json();
  await ctx.call(`/${created.id}/file`, { method: 'PUT', body: PDF, headers: { 'content-type': 'application/pdf' } });
  return created.id;
}

test('double start is a no-op: first links stay valid, one started event, chain intact', async () => {
  const ctx = setup();
  const id = await draftWithFile(ctx);
  const [a, b] = await Promise.all([1, 2].map(() => ctx.call(`/${id}/start`, { method: 'POST', body: '{}' })));
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const winner = await (a.status === 200 ? a : b).json();
  const view = await (await ctx.call('/sign', { admin: false, token: tokenOf(winner.links[0].link) })).json();
  assert.equal(view.can_sign, true, 'links from the successful start keep working');
  const detail = await (await ctx.call(`/${id}`)).json();
  assert.equal(detail.events.filter(e => e.action === 'started').length, 1);
  assert.equal(detail.chain_valid, true);
});

test('refused operations leave no audit record (cancel after completion, reissue after signing)', async () => {
  const ctx = setup();
  const created = await (await ctx.call('', { method: 'POST', body: { title: '단독 결의서', category: '결의서', content_kind: 'text', body_text: '결의 내용',
    signers: [{ role_title: '상인회장', signer_name: '정찬균' }] } })).json();
  const started = await (await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' })).json();
  const token = tokenOf(started.links[0].link);
  const sha = await sha256Hex('결의 내용');
  const [signed, cancelled, reissued] = await Promise.all([
    ctx.call('/sign', { method: 'POST', admin: false, token, body: signBody(sha, '정찬균') }),
    ctx.call(`/${created.id}/cancel`, { method: 'POST', body: { reason: '경합' } }),
    ctx.call(`/${created.id}/signers/1/reissue`, { method: 'POST', body: '{}' }),
  ]);
  const detail = await (await ctx.call(`/${created.id}`)).json();
  const actions = detail.events.map(e => e.action);
  // Whatever order D1 serialized them in, the log matches the final state exactly.
  if (detail.document.status === 'completed') { assert.equal(signed.status, 200); assert.ok(!actions.includes('cancelled')); }
  else { assert.equal(detail.document.status, 'cancelled'); assert.equal(cancelled.status, 200); assert.ok(!actions.includes('signed')); }
  assert.equal(actions.filter(a => a === 'link_reissued').length, reissued.status === 200 ? 1 : 0);
  assert.equal(detail.chain_valid, true);
});

test('concurrent writers on one document never fork the hash chain', async () => {
  const ctx = setup();
  const doc = await startedFileDoc(ctx);
  const t1 = tokenOf(doc.links[0].link);
  const results = await Promise.all([
    ctx.call('/sign', { method: 'POST', admin: false, token: t1, body: signBody(doc.sha, '김총무') }),
    ctx.call(`/${doc.id}/signers/3/reissue`, { method: 'POST', body: '{}' }),
    ctx.call(`/${doc.id}/signers/2/reissue`, { method: 'POST', body: '{}' }),
  ]);
  assert.deepEqual(results.map(r => r.status), [200, 200, 200]);
  const detail = await (await ctx.call(`/${doc.id}`)).json();
  assert.equal(detail.events.length, 6);
  assert.equal(detail.chain_valid, true);
  const parents = detail.events.map(e => e.prev_hash);
  assert.equal(new Set(parents).size, parents.length, 'every event has a distinct parent');
});

test('database refuses deletion and edits of signed signatures or locked content', async () => {
  const ctx = setup();
  const doc = await startedFileDoc(ctx);
  await ctx.call('/sign', { method: 'POST', admin: false, token: tokenOf(doc.links[0].link), body: signBody(doc.sha, '김총무') });
  const db = ctx.env.DB.sqlite;
  assert.throws(() => db.prepare('DELETE FROM cgma_edoc_documents').run(), /never physically deleted/);
  assert.throws(() => db.prepare('DELETE FROM cgma_edoc_signers').run(), /never physically deleted/);
  assert.throws(() => db.prepare('DELETE FROM cgma_edoc_events').run(), /append-only/);
  assert.throws(() => db.prepare("UPDATE cgma_edoc_signers SET signed_at='2020-01-01' WHERE seq=1").run(), /immutable/);
  assert.throws(() => db.prepare("UPDATE cgma_edoc_signers SET status='active' WHERE seq=1").run(), /immutable/);
  assert.throws(() => db.prepare("UPDATE cgma_edoc_documents SET content_sha256='x'").run(), /locked/);
});

// ---------- 보관(records-only) documents, draft signer plans, 연번 ----------
const HWP = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(64).fill(0)]);
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(64).fill(1)]);

test('archive documents accept office/HWP originals, finalize without signatures and stay locked', async () => {
  const ctx = setup();
  const created = await (await ctx.call('', { method: 'POST', body: { title: '2026년 상반기 결산', category: '회계·정산', mode: 'archive', doc_date: '2026-06-24', source_note: 'Google Drive' } })).json();
  assert.equal(created.ok, true);
  // HWP is accepted for records (by extension + OLE signature), with a generic browser content type.
  let r = await ctx.call(`/${created.id}/file`, { method: 'PUT', body: HWP, headers: { 'content-type': 'application/octet-stream', 'x-ekodi-file-name': encodeURIComponent('결산.hwp') } });
  assert.equal(r.status, 200);
  assert.equal((await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' })).status, 409, 'archive docs are never sent for signing');
  r = await ctx.call(`/${created.id}/archive`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 200);
  assert.equal((await ctx.call(`/${created.id}/archive`, { method: 'POST', body: '{}' })).status, 409);
  assert.equal((await ctx.call(`/${created.id}/file`, { method: 'PUT', body: HWP, headers: { 'x-ekodi-file-name': 'x.hwp' } })).status, 409, 'locked after archiving');
  assert.equal((await ctx.call(`/${created.id}/cancel`, { method: 'POST', body: { reason: 'x' } })).status, 409);
  const detail = await (await ctx.call(`/${created.id}`)).json();
  assert.equal(detail.document.status, 'completed'); assert.equal(detail.document.archived, true);
  assert.equal(detail.document.doc_date, '2026-06-24'); assert.equal(detail.document.file_mime, 'application/x-hwp');
  assert.deepEqual(detail.events.map(e => e.action), ['created', 'file_uploaded', 'archived']);
  assert.equal(detail.chain_valid, true);
  assert.throws(() => ctx.env.DB.sqlite.prepare("UPDATE cgma_edoc_documents SET content_sha256='x'").run(), /locked/);
});

test('signing documents still accept only browser-viewable files; office files are records-only', async () => {
  const ctx = setup();
  const created = await (await ctx.call('', { method: 'POST', body: draft() })).json();
  assert.equal((await ctx.call(`/${created.id}/file`, { method: 'PUT', body: DOCX, headers: { 'x-ekodi-file-name': 'a.docx' } })).status, 415);
  assert.equal((await ctx.call(`/${created.id}/file`, { method: 'PUT', body: PDF, headers: { 'content-type': 'application/octet-stream', 'x-ekodi-file-name': 'a.pdf' } })).status, 200, 'PDF recognised by extension + signature');
  assert.equal((await ctx.call(`/${created.id}/archive`, { method: 'POST', body: '{}' })).status, 409);
});

test('a draft can be registered before names are known; start requires every name', async () => {
  const ctx = setup();
  const created = await (await ctx.call('', { method: 'POST', body: draft({ signers: DEFAULT_SIGNER_ROLES.map(role_title => ({ role_title, signer_name: '' })) }) })).json();
  await ctx.call(`/${created.id}/file`, { method: 'PUT', body: PDF, headers: { 'content-type': 'application/pdf' } });
  let r = await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'SIGNER_NAMES_REQUIRED');
  r = await ctx.call(`/${created.id}/signers`, { method: 'PUT', body: { signers: [{ role_title: '총무', signer_name: '김총무' }, { role_title: '사무국장', signer_name: '이국장' }, { role_title: '상인회장', signer_name: '정찬균' }, { role_title: '감사', signer_name: '박감사' }] } });
  assert.equal(r.status, 200);
  const started = await (await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' })).json();
  assert.deepEqual(started.links.map(l => `${l.role_title} ${l.signer_name}`), ['총무 김총무', '사무국장 이국장', '상인회장 정찬균', '감사 박감사']);
  assert.equal((await ctx.call(`/${created.id}/signers`, { method: 'PUT', body: { signers: [{ role_title: '총무', signer_name: 'x' }] } })).status, 409, 'plan locked after start');
  assert.throws(() => ctx.env.DB.sqlite.prepare('DELETE FROM cgma_edoc_signers').run(), /never physically deleted/);
  assert.equal((await (await ctx.call(`/${created.id}`)).json()).chain_valid, true);
});

test('연번 is a stable registration-order serial, unaffected by filters; summary separates 보관', async () => {
  const ctx = setup();
  const ids = [];
  for (const [i, title] of ['첫 문서', '둘째 회의록', '셋째 결산'].entries()) {
    ctx.setNow(T0 + i * 1000);
    ids.push((await (await ctx.call('', { method: 'POST', body: i === 2 ? { title, category: '회계·정산', mode: 'archive', content_kind: 'text', body_text: '결산 본문' } : draft({ title }) })).json()).id);
  }
  await ctx.call(`/${ids[2]}/archive`, { method: 'POST', body: '{}' });
  const all = await (await ctx.call('')).json();
  assert.deepEqual(all.documents.map(d => [d.serial_no, d.title]), [[3, '셋째 결산'], [2, '둘째 회의록'], [1, '첫 문서']]);
  const filtered = await (await ctx.call('?q=' + encodeURIComponent('회의록'))).json();
  assert.deepEqual(filtered.documents.map(d => d.serial_no), [2]);
  const archived = await (await ctx.call('?status=archived')).json();
  assert.deepEqual(archived.documents.map(d => d.serial_no), [3]);
  assert.equal(all.summary.archived, 1); assert.equal(all.summary.completed, 0); assert.equal(all.summary.draft, 2);
});

// ---------- 링크로 등록 ----------
const GDOC = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit?usp=sharing';
function fakeWeb(routes) {
  const seen = [];
  const impl = async (url, init) => {
    seen.push({ url, redirect: init?.redirect });
    const route = routes[url];
    if (!route) return new Response('not found', { status: 404 });
    return typeof route === 'function' ? route() : route;
  };
  return { impl, seen };
}

test('link addresses: public https only — no internal, IP, credential, port or own-platform hosts', () => {
  assert.equal(normalizeSourceUrl(GDOC + '#heading=h.1'), GDOC);
  for (const bad of ['http://example.com/a.pdf', 'https://127.0.0.1/a.pdf', 'https://[::1]/a', 'https://localhost/a', 'https://user:pw@example.com/a',
    'https://example.com:8443/a', 'https://ekodi.kr/api/cgma/edocs', 'https://www.cgma.or.kr/x', 'https://x.workers.dev/', 'https://intranet/x',
    'https://printer.local/x', 'javascript:alert(1)', 'ftp://example.com/x', '', 'https://example.com/' + 'a'.repeat(2100)]) {
    assert.equal(normalizeSourceUrl(bad), '', bad);
  }
  assert.match(snapshotSource(GDOC).fetchUrl, /\/document\/d\/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789\/export\?format=pdf$/);
  assert.match(snapshotSource('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit#gid=0').fetchUrl, /spreadsheets\/d\/1AbCdEfGhIjKlMnOp\/export\?format=pdf/);
  assert.match(snapshotSource('https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOp/edit').fetchUrl, /presentation\/d\/1AbCdEfGhIjKlMnOp\/export\/pdf/);
  assert.equal(snapshotSource('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=drive_link').fetchUrl,
    'https://drive.usercontent.google.com/download?id=1AbCdEfGhIjKlMnOp&export=download&confirm=t');
  assert.equal(snapshotSource('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp').provider, 'google-drive');
  assert.equal(snapshotSource('https://example.org/files/plan.pdf').fetchUrl, 'https://example.org/files/plan.pdf');
  assert.equal(validateDraft(draft({ source_url: 'https://127.0.0.1/x' })).code, 'SOURCE_URL_INVALID');
  assert.equal(validateDraft(draft({ content_kind: 'text', body_text: 'x', source_url: GDOC })).code, 'SOURCE_URL_INVALID');
});

test('a Google Docs link becomes a PDF snapshot that can then be signed in order', async () => {
  const web = fakeWeb({
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=pdf':
      new Response(null, { status: 307, headers: { location: 'https://doc-0s-docs.googleusercontent.com/export/abc/xyz' } }),
    'https://doc-0s-docs.googleusercontent.com/export/abc/xyz':
      () => new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': "attachment; filename=\"Proposal.pdf\"; filename*=UTF-8''%EC%A0%9C%EC%95%88%EC%84%9C.pdf" } }),
  });
  const ctx = setup({ fetch: web.impl });
  const created = await (await ctx.call('', { method: 'POST', body: draft({ source_url: GDOC }) })).json();
  let r = await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' });
  assert.equal(r.status, 409, 'nothing to sign before the snapshot');
  r = await ctx.call(`/${created.id}/import`, { method: 'POST', body: {} });
  const imported = await r.json();
  assert.equal(r.status, 200, JSON.stringify(imported));
  assert.equal(imported.file_name, '제안서.pdf');
  assert.equal(imported.content_sha256, await sha256Hex(PDF));
  assert.ok(web.seen.every(x => x.redirect === 'manual'), 'every redirect hop is re-validated');
  const detail = await (await ctx.call(`/${created.id}`)).json();
  assert.equal(detail.document.source_url, GDOC);
  assert.equal(detail.document.file_mime, 'application/pdf');
  assert.equal(detail.events.at(-1).action, 'link_imported');
  assert.equal(detail.events.at(-1).detail.provider, 'google-docs');
  const started = await ctx.call(`/${created.id}/start`, { method: 'POST', body: '{}' });
  assert.equal(started.status, 200);
  assert.equal((await ctx.call(`/${created.id}/import`, { method: 'POST', body: {} })).status, 409, 'locked after start');
  assert.throws(() => ctx.env.DB.sqlite.prepare("UPDATE cgma_edoc_documents SET source_url='https://evil.example/x'").run(), /locked/);
  assert.equal((await (await ctx.call(`/${created.id}`)).json()).chain_valid, true);
});

test('private Google links, web pages and unsafe redirects are refused with a clear reason', async () => {
  const web = fakeWeb({
    'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/export?format=pdf':
      new Response(null, { status: 302, headers: { location: 'https://accounts.google.com/ServiceLogin?continue=x' } }),
    'https://accounts.google.com/ServiceLogin?continue=x': () => new Response('<html>로그인</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    'https://example.org/notice': () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    'https://example.org/redirect': new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } }),
    'https://example.org/big.pdf': () => new Response(PDF, { status: 200, headers: { 'content-type': 'application/pdf', 'content-length': String(25 * 1024 * 1024) } }),
    'https://example.org/run.exe': () => new Response(new Uint8Array([0x4d, 0x5a, 0, 0]), { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
  });
  const ctx = setup({ fetch: web.impl });
  const expect = async (url, code, status) => {
    const created = await (await ctx.call('', { method: 'POST', body: draft({ source_url: url }) })).json();
    const r = await ctx.call(`/${created.id}/import`, { method: 'POST', body: {} });
    assert.equal(r.status, status, url);
    assert.equal((await r.json()).code, code, url);
  };
  await expect(GDOC, 'LINK_NOT_PUBLIC', 422);
  await expect('https://example.org/notice', 'LINK_NOT_A_FILE', 422);
  await expect('https://example.org/redirect', 'LINK_URL_INVALID', 422);
  await expect('https://example.org/big.pdf', 'FILE_TOO_LARGE', 413);
  await expect('https://example.org/run.exe', 'FILE_TYPE_INVALID', 415);
  assert.ok(!web.seen.some(x => x.url.includes('169.254')), 'the metadata address is never fetched');
  assert.equal(ctx.env.CGMA_EDOC_FILES.store.size, 0, 'nothing stored for refused links');
});

test('a 보관 document may keep only the link when no copy can be downloaded; a 서명 document may not', async () => {
  const ctx = setup();
  const archiveDoc = await (await ctx.call('', { method: 'POST', body: { title: '상인회 공유 폴더', category: '기타', mode: 'archive', content_kind: 'file', source_url: GDOC } })).json();
  let r = await ctx.call(`/${archiveDoc.id}/import`, { method: 'POST', body: { link_only: true } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).content_sha256, await sha256Hex('link:' + GDOC));
  assert.equal((await ctx.call(`/${archiveDoc.id}/archive`, { method: 'POST', body: '{}' })).status, 200);
  const detail = await (await ctx.call(`/${archiveDoc.id}`)).json();
  assert.equal(detail.document.archived, true); assert.equal(detail.document.file_name, ''); assert.equal(detail.document.source_url, GDOC);
  assert.deepEqual(detail.events.map(e => e.action), ['created', 'link_registered', 'archived']);
  assert.equal((await ctx.call(`/${archiveDoc.id}/file`)).status, 404);
  const listed = await (await ctx.call('?q=docs.google.com')).json();
  assert.equal(listed.documents.length, 1, 'links are searchable');

  const signDoc = await (await ctx.call('', { method: 'POST', body: draft({ source_url: GDOC }) })).json();
  r = await ctx.call(`/${signDoc.id}/import`, { method: 'POST', body: { link_only: true } });
  assert.equal(r.status, 409); assert.equal((await r.json()).code, 'SNAPSHOT_REQUIRED');
  r = await ctx.call(`/${signDoc.id}/import`, { method: 'POST', body: { url: 'https://10.0.0.1/a.pdf' } });
  assert.equal(r.status, 400);
  assert.equal((await ctx.call(`/${signDoc.id}/import`, { method: 'POST', body: {}, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await ctx.call(`/${signDoc.id}/import`, { method: 'POST', body: {}, admin: false })).status, 401);
});
