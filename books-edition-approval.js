// BOOKS-EDITION-APPROVAL-001 — 출판 최종 확정(판권·판본)과 판매 준비도의 결합
//
// 판매 가능 = 카탈로그 출판 공정이 완료(saleReadiness) 이거나,
//            운영자가 '지금 보관함에 있는 바로 그 파일'을 검토·확정한 승인 기록이 살아 있을 때.
// 승인은 파일 etag·크기에 묶인다. 파일을 새로 올리면 승인은 자동 무효 → 다시 검토·확정해야 판매된다.
// 판권 확인·내용 검토 두 항목이 모두 체크되지 않은 승인은 만들 수 없다(fail closed).
import { saleReadiness } from './books-sale-readiness.js';

const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

export async function fileIdentity(env, book) {
  const key = book?.directSale?.fileKey;
  if (!key || !env?.BOOK_FILES) return null;
  const head = await env.BOOK_FILES.head(key).catch(() => null);
  return head ? { key, etag: String(head.httpEtag || head.etag || ''), size: Number(head.size || 0), uploaded: head.uploaded || null } : null;
}

export async function activeApproval(env, book) {
  if (!env?.DB || !book?.id) return null;
  const row = await env.DB.prepare('SELECT * FROM books_edition_approvals WHERE book_id=? AND revoked_at IS NULL').bind(book.id).first().catch(() => null);
  if (!row) return null;
  const file = await fileIdentity(env, book);
  const matches = Boolean(file && file.key === row.file_key && file.etag === row.file_etag && file.size === Number(row.file_size));
  return { ...row, fileMatches: matches };
}

/** Server-side readiness: catalogue evidence OR a live, file-bound owner approval. */
export async function effectiveSaleReadiness(env, book) {
  const base = saleReadiness(book);
  if (base.ready) return { ...base, source: 'catalog' };
  if (book?.directSale?.enabled !== true || !(Math.trunc(Number(book?.listPrice?.amount)) > 0)) return base;
  const approval = await activeApproval(env, book);
  if (approval?.fileMatches && approval.rights_confirmed && approval.content_reviewed && Number(approval.list_price) === Math.trunc(Number(book.listPrice.amount))) {
    return { ready: true, reasons: [], label: '', source: 'approval', edition: approval.edition, approvedAt: approval.approved_at };
  }
  if (approval && !approval.fileMatches) return { ...base, label: '판매 파일 변경 — 재확정 필요', reasons: [...base.reasons, 'APPROVAL_FILE_MISMATCH'] };
  return base;
}

async function log(env, bookId, action, actor, detail = {}) {
  await env.DB.prepare('INSERT INTO books_edition_approval_log (book_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(bookId, action, clean(actor, 120), JSON.stringify(detail).slice(0, 500), new Date().toISOString()).run();
}

/** Operator routes. Caller has already verified the operator. */
export async function approvalRoute(env, request, book, actorEmail, body) {
  if (request.method === 'GET') {
    const approval = await activeApproval(env, book);
    const file = await fileIdentity(env, book);
    return { status: 200, data: { bookId: book.id, file, approval, readiness: await effectiveSaleReadiness(env, book), catalog: { title: book.title || book.id, author: book.author || '', edition: book.edition || '', listPrice: book.listPrice?.amount || 0, workflow: book.workflow || {} } } };
  }
  if (request.method === 'DELETE') {
    const at = new Date().toISOString();
    await env.DB.prepare('UPDATE books_edition_approvals SET revoked_at=?, revoked_by=? WHERE book_id=? AND revoked_at IS NULL').bind(at, clean(actorEmail, 120), book.id).run();
    await log(env, book.id, 'approval.revoked', actorEmail);
    return { status: 200, data: { ok: true, revokedAt: at } };
  }
  if (request.method !== 'POST') return { status: 405, data: { error: 'method not allowed' } };
  const edition = clean(body?.edition, 120);
  const price = Math.trunc(Number(body?.listPrice));
  if (body?.rightsConfirmed !== true || body?.contentReviewed !== true) return { status: 400, data: { error: '판권(저작권·출판권) 확인과 내용 검토를 모두 체크해야 확정할 수 있습니다.', code: 'CHECKLIST_REQUIRED' } };
  if (!edition) return { status: 400, data: { error: '판본 이름을 입력해 주세요.', code: 'EDITION_REQUIRED' } };
  if (!(price > 0) || price !== Math.trunc(Number(book.listPrice?.amount))) return { status: 409, data: { error: `판매가가 서점 등록 가격(${book.listPrice?.amount || 0}원)과 다릅니다. 가격 변경은 별도로 요청해 주세요.`, code: 'PRICE_MISMATCH' } };
  const file = await fileIdentity(env, book);
  if (!file || !file.etag || !(file.size > 0)) return { status: 409, data: { error: '검토 가능한 판매 파일이 없습니다. 유효한 EPUB을 먼저 올려 주세요.', code: 'FILE_MISSING' } };
  // The reviewed file identity is mandatory: a caller may not omit it to bypass the comparison.
  if (typeof body?.fileEtag !== 'string' || !body.fileEtag || body.fileEtag !== file.etag) return { status: 409, data: { error: '검토한 판매 파일이 확인되지 않거나 변경되었습니다. 새로고침 후 다시 검토해 주세요.', code: 'FILE_CHANGED' } };
  const at = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO books_edition_approvals (book_id, edition, list_price, file_key, file_etag, file_size, rights_confirmed, content_reviewed, note, approved_by, approved_at, revoked_at, revoked_by)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, NULL, NULL)
    ON CONFLICT(book_id) DO UPDATE SET edition=excluded.edition, list_price=excluded.list_price, file_key=excluded.file_key, file_etag=excluded.file_etag, file_size=excluded.file_size,
      rights_confirmed=1, content_reviewed=1, note=excluded.note, approved_by=excluded.approved_by, approved_at=excluded.approved_at, revoked_at=NULL, revoked_by=NULL`)
    .bind(book.id, edition, price, file.key, file.etag, file.size, clean(body?.note, 400), clean(actorEmail, 120), at).run();
  await log(env, book.id, 'approval.granted', actorEmail, { edition, price, etag: file.etag, size: file.size });
  return { status: 201, data: { ok: true, bookId: book.id, edition, approvedAt: at, readiness: await effectiveSaleReadiness(env, book) } };
}

/** Public: which books are approved for sale right now (display only; checkout re-checks). */
export async function publicApprovals(env, catalog) {
  const out = [];
  for (const book of catalog?.books || []) {
    if (saleReadiness(book).ready) continue;
    const r = await effectiveSaleReadiness(env, book);
    if (r.ready && r.source === 'approval') out.push({ bookId: book.id, edition: r.edition, approvedAt: r.approvedAt });
  }
  return out;
}
