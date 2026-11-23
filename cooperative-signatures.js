// 협동조합 서명·직인 요청과 서명본 업로드(2026-11-17).
//
// 관리자(조합별 관리 권한 또는 플랫폼 최고관리자):
//   GET  /api/signatures                      요청 목록(링크 원문은 다시 보여주지 않음)
//   POST /api/signatures                      {documentKey, founderIds[], kind, message, days} → 사람별 업로드 링크 발급
//   POST /api/signatures/{id}/reissue         링크 다시 만들기(이전 링크는 즉시 무효)
//   POST /api/signatures/{id}/review          {decision: accepted|rejected, note}
//   POST /api/signatures/{id}/cancel          요청 취소(링크 무효)
//   GET  /api/signatures/{id}/file            업로드된 서명본 내려받기
//   GET  /api/documents/{key}                 인쇄용 문서(HTML 조각)
// 서명자(로그인 없이 링크 보유 · 헤더 x-ekodi-sign-token):
//   GET  /api/sign/request                    요청 내용과 인쇄용 문서
//   POST /api/sign/upload                     서명본 업로드(multipart file · PDF/JPG/PNG/WEBP · 10MB 이하)
//
// Invariants
// - 링크 토큰은 해시만 저장한다. 링크는 발급 순간에만 응답하며, 다시 필요하면 새로 발급(이전 링크 무효)한다.
// - 토큰 하나는 한 조합·한 사람·한 서류에만 쓰인다. 만료·취소·승인 뒤에는 업로드할 수 없다.
// - 원본 파일은 비공개 R2 workspace/{조합 slug}/documents/ 아래에만 두고, 사이트 문서함 목록에도 함께 기록한다.
// - 파일 형식은 내용(매직 바이트)으로 확인한다. 확장자·선언 형식만 믿지 않는다.
import { COOP_PRINTABLE_DOCUMENTS, SIGNATURE_KINDS, SIGNATURE_RULES, cooperativeDocumentHtml, printableDocumentLabel } from './cooperative-documents.js';
import { sendOperatorPush, operatorPushReady } from './operator-push.js';

export const SIGN_MAX_BYTES = 10 * 1024 * 1024;
export const SIGN_DEFAULT_DAYS = 14;
export const SIGN_MAX_DAYS = 30;
const ID_RE = /^csr-[0-9a-f-]{36}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const STATUSES = ['requested', 'uploaded', 'accepted', 'rejected', 'cancelled'];
const DOC_TYPE = { charter: '정관·규약', minutes: '회의록' };

const enc = new TextEncoder();
const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256Hex = async data => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data));
export const newSignToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const signLink = (coop, token) => `https://ekodi.kr/${coop.publicSlug}/sign#${token}`;
const storage = env => env?.COOP_SIGNATURE_FILES || env?.WORKSPACE_DOCUMENT_FILES || null;
const fail = (code, status = 400) => { throw Object.assign(new Error(code), { code, status }); };
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function sniffSignatureFile(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return { mime: 'application/pdf', ext: 'pdf' };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export function validateSignatureRequest(body, state) {
  const documentKey = String(body?.documentKey || '');
  if (!COOP_PRINTABLE_DOCUMENTS.some(([key]) => key === documentKey)) fail('COOP_DOCUMENT_UNKNOWN');
  const kind = String(body?.kind || 'either');
  if (!(kind in SIGNATURE_KINDS)) fail('COOP_SIGN_KIND_INVALID');
  const ids = Array.isArray(body?.founderIds) ? [...new Set(body.founderIds.map(String))] : [];
  if (!ids.length || ids.length > 50) fail('COOP_SIGN_SIGNERS_REQUIRED');
  const founders = ids.map(id => state.founders.find(f => f.id === id) || fail('COOP_FOUNDER_NOT_FOUND', 404));
  const days = body?.days === undefined || body?.days === null || body?.days === '' ? SIGN_DEFAULT_DAYS : Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > SIGN_MAX_DAYS) fail('COOP_SIGN_DAYS_INVALID');
  return { documentKey, kind, founders, days, message: clean(body?.message, 500) };
}

const view = (row, now = Date.now()) => ({
  id: row.id, documentKey: row.document_key, documentLabel: printableDocumentLabel(row.document_key),
  founderId: row.founder_id, signerName: row.signer_name, kind: row.kind, kindLabel: SIGNATURE_KINDS[row.kind] || '',
  message: row.message, status: row.status, expiresAt: row.token_expires_at,
  expired: ['requested', 'rejected', 'uploaded'].includes(row.status) && Date.parse(row.token_expires_at || 0) <= now,
  file: row.file_key ? { name: row.file_name, contentType: row.content_type, size: Number(row.size_bytes || 0), uploadedAt: row.uploaded_at } : null,
  reviewNote: row.review_note, reviewedAt: row.reviewed_at, createdAt: row.created_at, updatedAt: row.updated_at,
});

async function event(env, row, action, actor, detail = '') {
  await env.DB.prepare('INSERT INTO cooperative_signature_events (id, request_id, workspace_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), row.id, row.workspace_id, action, clean(actor, 254), clean(detail, 500), new Date().toISOString()).run();
}

async function loadRequest(env, coop, id) {
  if (!ID_RE.test(id)) fail('COOP_SIGN_NOT_FOUND', 404);
  return await env.DB.prepare('SELECT * FROM cooperative_signature_requests WHERE id = ? AND workspace_id = ? LIMIT 1').bind(id, coop.workspaceId).first() || fail('COOP_SIGN_NOT_FOUND', 404);
}

async function issueToken(days) {
  const token = newSignToken();
  return { token, tokenHash: await sha256Hex(token), expiresAt: new Date(Date.now() + days * 86400000).toISOString() };
}

const json = (headers, data, status = 200) => new Response(JSON.stringify(data), { status, headers: headers() });

// 관리자 요청 처리. access는 resolveCooperativeAccess(administrative) 통과 결과.
export async function handleSignatureAdmin(request, env, coop, path, project, access, { headers, inputJson }) {
  const actor = access.identity?.email || access.identity?.id || '';
  const documentPath = path.match(/^\/api\/documents\/([a-z]+)$/);
  if (documentPath && request.method === 'GET') {
    const h = new Headers(headers('text/html; charset=utf-8'));
    h.set('x-robots-tag', 'noindex, nofollow, noarchive');
    return new Response(cooperativeDocumentHtml(coop, project.state, documentPath[1]), { headers: h });
  }
  if (path === '/api/signatures' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM cooperative_signature_requests WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 300').bind(coop.workspaceId).all();
    return json(headers, { ok: true, rules: SIGNATURE_RULES, kinds: SIGNATURE_KINDS, documents: COOP_PRINTABLE_DOCUMENTS, requests: (rows.results || []).map(row => view(row)) });
  }
  if (path === '/api/signatures' && request.method === 'POST') {
    const input = validateSignatureRequest(await inputJson(request), project.state);
    const stamp = new Date().toISOString();
    const issued = [];
    const statements = [];
    for (const founder of input.founders) {
      const id = 'csr-' + crypto.randomUUID();
      const { token, tokenHash, expiresAt } = await issueToken(input.days);
      statements.push(env.DB.prepare(`INSERT INTO cooperative_signature_requests (id, workspace_id, document_key, founder_id, signer_name, kind, message, status, token_hash, token_expires_at, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?)`).bind(id, coop.workspaceId, input.documentKey, founder.id, founder.representative, input.kind, input.message, tokenHash, expiresAt, clean(actor, 254), stamp, stamp));
      statements.push(env.DB.prepare('INSERT INTO cooperative_signature_events (id, request_id, workspace_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), id, coop.workspaceId, 'requested', clean(actor, 254), input.documentKey, stamp));
      issued.push({ id, founderId: founder.id, signerName: founder.representative, phone: founder.phone || '', link: signLink(coop, token), expiresAt });
    }
    await env.DB.batch(statements);
    return json(headers, { ok: true, documentKey: input.documentKey, documentLabel: printableDocumentLabel(input.documentKey), links: issued }, 201);
  }
  const action = path.match(/^\/api\/signatures\/([^/]+)\/(reissue|review|cancel|file)$/);
  if (!action) return null;
  const row = await loadRequest(env, coop, decodeURIComponent(action[1]));
  const stamp = new Date().toISOString();
  if (action[2] === 'file' && request.method === 'GET') {
    const store = storage(env);
    if (!row.file_key || !store) fail('COOP_SIGN_FILE_MISSING', 404);
    const object = await store.get(row.file_key);
    if (!object) fail('COOP_SIGN_FILE_MISSING', 404);
    await event(env, row, 'downloaded', actor);
    const h = new Headers(headers(row.content_type || 'application/octet-stream'));
    h.set('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.file_name || 'signed')}`);
    return new Response(object.body, { headers: h });
  }
  if (request.method !== 'POST') fail('METHOD_NOT_ALLOWED', 405);
  const body = await inputJson(request);
  if (action[2] === 'cancel') {
    if (['accepted', 'cancelled'].includes(row.status)) fail('COOP_SIGN_STATE');
    await env.DB.prepare("UPDATE cooperative_signature_requests SET status = 'cancelled', token_hash = ?, updated_at = ? WHERE id = ? AND status = ?")
      .bind('void:' + crypto.randomUUID(), stamp, row.id, row.status).run();
    await event(env, row, 'cancelled', actor);
    return json(headers, { ok: true, request: view({ ...row, status: 'cancelled', updated_at: stamp }) });
  }
  if (action[2] === 'reissue') {
    if (['accepted', 'cancelled'].includes(row.status)) fail('COOP_SIGN_STATE');
    const days = body.days === undefined || body.days === '' ? SIGN_DEFAULT_DAYS : Number(body.days);
    if (!Number.isInteger(days) || days < 1 || days > SIGN_MAX_DAYS) fail('COOP_SIGN_DAYS_INVALID');
    const { token, tokenHash, expiresAt } = await issueToken(days);
    const result = await env.DB.prepare('UPDATE cooperative_signature_requests SET token_hash = ?, token_expires_at = ?, updated_at = ? WHERE id = ? AND token_hash = ?')
      .bind(tokenHash, expiresAt, stamp, row.id, row.token_hash).run();
    if (Number(result.meta?.changes || 0) !== 1) fail('COOP_SIGN_CONFLICT', 409);
    await event(env, row, 'reissued', actor);
    const founder = project.state.founders.find(f => f.id === row.founder_id);
    return json(headers, { ok: true, link: { id: row.id, founderId: row.founder_id, signerName: row.signer_name, phone: founder?.phone || '', link: signLink(coop, token), expiresAt } });
  }
  if (action[2] === 'review') {
    const decision = String(body.decision || '');
    if (!['accepted', 'rejected'].includes(decision)) fail('COOP_SIGN_DECISION_INVALID');
    if (row.status !== 'uploaded') fail('COOP_SIGN_STATE');
    const note = clean(body.note, 500);
    if (decision === 'rejected' && !note) fail('COOP_SIGN_REJECT_REASON');
    // 승인되면 링크를 더 쓸 수 없게 한다. 반려되면 같은 링크로 다시 올릴 수 있다(만료 전).
    const tokenHash = decision === 'accepted' ? 'void:' + crypto.randomUUID() : row.token_hash;
    const result = await env.DB.prepare("UPDATE cooperative_signature_requests SET status = ?, review_note = ?, reviewed_at = ?, reviewed_by = ?, token_hash = ?, updated_at = ? WHERE id = ? AND status = 'uploaded'")
      .bind(decision, note, stamp, clean(actor, 254), tokenHash, stamp, row.id).run();
    if (Number(result.meta?.changes || 0) !== 1) fail('COOP_SIGN_CONFLICT', 409);
    await event(env, row, decision, actor, note);
    return json(headers, { ok: true, request: view({ ...row, status: decision, review_note: note, reviewed_at: stamp, updated_at: stamp }) });
  }
  fail('METHOD_NOT_ALLOWED', 405);
}

async function requestForToken(request, env, coop) {
  const token = String(request.headers.get('x-ekodi-sign-token') || '');
  if (!TOKEN_RE.test(token)) fail('COOP_SIGN_LINK_INVALID', 401);
  const row = await env.DB.prepare('SELECT * FROM cooperative_signature_requests WHERE token_hash = ? AND workspace_id = ? LIMIT 1').bind(await sha256Hex(token), coop.workspaceId).first();
  if (!row) fail('COOP_SIGN_LINK_INVALID', 401);
  if (Date.parse(row.token_expires_at || 0) <= Date.now()) fail('COOP_SIGN_LINK_EXPIRED', 410);
  if (!['requested', 'uploaded', 'rejected'].includes(row.status)) fail('COOP_SIGN_LINK_CLOSED', 410);
  return row;
}

// 서명자 요청 처리(로그인 없음, 링크 보유). project는 서버 저장본.
export async function handleSignatureSigner(request, env, coop, path, project, { headers }) {
  if (path === '/api/sign/request' && request.method === 'GET') {
    const row = await requestForToken(request, env, coop);
    const p = project.state.profile;
    const chair = project.state.founders.find(f => f.position === 'chair-designate');
    const founder = project.state.founders.find(f => f.id === row.founder_id);
    let documentHtml = '';
    try { documentHtml = cooperativeDocumentHtml(coop, project.state, row.document_key, { founderId: founder ? row.founder_id : '' }); } catch { documentHtml = ''; }
    return json(headers, { ok: true, coopName: p.name, legalName: p.legalName, contact: { name: p.chair, role: '조합장', phone: chair?.phone || '' },
      request: { documentKey: row.document_key, documentLabel: printableDocumentLabel(row.document_key), signerName: row.signer_name,
        kind: row.kind, kindLabel: SIGNATURE_KINDS[row.kind] || '', message: row.message, status: row.status, reviewNote: row.status === 'rejected' ? row.review_note : '',
        expiresAt: row.token_expires_at, uploaded: Boolean(row.file_key), how: SIGNATURE_RULES[row.document_key]?.how || '' },
      documentHtml });
  }
  if (path === '/api/sign/upload' && request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin !== 'https://ekodi.kr' || request.headers.get('sec-fetch-site') === 'cross-site') fail('SAME_ORIGIN_REQUIRED', 403);
    if (!String(request.headers.get('content-type') || '').toLowerCase().startsWith('multipart/form-data')) fail('COOP_SIGN_FILE_REQUIRED', 415);
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > SIGN_MAX_BYTES + 65536) fail('COOP_SIGN_FILE_TOO_LARGE', 413);
    const row = await requestForToken(request, env, coop);
    const store = storage(env);
    if (!store) fail('COOP_SIGN_STORAGE_UNAVAILABLE', 503);
    let form;
    try { form = await request.formData(); } catch { fail('COOP_SIGN_FILE_REQUIRED'); }
    const file = form.get('file');
    if (!file || typeof file === 'string') fail('COOP_SIGN_FILE_REQUIRED');
    if (file.size > SIGN_MAX_BYTES) fail('COOP_SIGN_FILE_TOO_LARGE', 413);
    if (file.size < 100) fail('COOP_SIGN_FILE_TYPE');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffSignatureFile(bytes);
    if (!type) fail('COOP_SIGN_FILE_TYPE', 415);
    const stamp = new Date().toISOString();
    const sha = await sha256Hex(bytes);
    const label = printableDocumentLabel(row.document_key);
    const safeName = `${coop.publicSlug}-${row.document_key}-${row.signer_name}-${stamp.slice(0, 10)}.${type.ext}`.replace(/[\\/:*?"<>|\s]+/g, '_');
    const key = `workspace/${coop.slug}/documents/coop-signatures/${row.id}/${stamp.replace(/[:.]/g, '')}-${sha.slice(0, 16)}.${type.ext}`;
    await store.put(key, bytes, { httpMetadata: { contentType: type.mime }, customMetadata: { workspace: coop.workspaceId, request: row.id, sha256: sha } });
    const result = await env.DB.prepare(`UPDATE cooperative_signature_requests SET status = 'uploaded', file_key = ?, file_name = ?, content_type = ?, size_bytes = ?, sha256 = ?, uploaded_at = ?, review_note = '', updated_at = ?
      WHERE id = ? AND token_hash = ? AND status IN ('requested', 'uploaded', 'rejected')`).bind(key, safeName, type.mime, bytes.length, sha, stamp, stamp, row.id, row.token_hash).run();
    if (Number(result.meta?.changes || 0) !== 1) { await store.delete(key).catch(() => {}); fail('COOP_SIGN_LINK_CLOSED', 410); }
    await event(env, row, 'uploaded', 'link:' + row.signer_name, `${type.mime} ${bytes.length}B sha256:${sha.slice(0, 16)}`);
    // 사이트 문서함(사이트 관리자·최고관리자 현황)에도 같은 원본을 기록한다. 실패해도 업로드 자체는 유지한다.
    try {
      await env.DB.prepare(`INSERT INTO workspace_documents (id, tenant_slug, doc_type, title, holder, issued_on, note, source_url, file_key, file_name, content_type, size_bytes, sha256, status, uploaded_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, 'active', ?, ?, ?)`).bind('wdoc-' + crypto.randomUUID(), coop.slug, DOC_TYPE[row.document_key] || '기타',
        `${label} 서명본 · ${row.signer_name}`, row.signer_name, stamp.slice(0, 10), `서명·직인 요청 ${row.id} 업로드(검토 전)`, key, safeName, type.mime, bytes.length, sha, 'link:' + row.signer_name, stamp, stamp).run();
    } catch (error) { console.warn('cooperative signature document box record skipped', error?.message || error); }
    try {
      if (operatorPushReady(env)) await sendOperatorPush(env, { title: `${project.state.profile.name} 서명본 도착`, body: `${row.signer_name} · ${label} — 확인해 주세요.`, targetPath: `/${coop.publicSlug}/admin#documents` });
    } catch (error) { console.warn('cooperative signature push skipped', error?.message || error); }
    return json(headers, { ok: true, status: 'uploaded', documentLabel: label, fileName: safeName, size: bytes.length }, 201);
  }
  return null;
}

export const COOP_SIGNATURE_STATUSES = STATUSES;
