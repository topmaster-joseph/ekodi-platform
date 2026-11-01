// BOOKS-AUDIOBOOK-REVIEW-001 — 무료 보너스 오디오북: 운영자 검토·승인 + 구매자 전달
//
// 초안 위치는 에코디 음성 엔진(render-ekodi-voice-audiobook.yml)과 같다: 비공개 R2 `{도서ID}/audiobook/NN.mp3`.
// 운영자가 장별로 들어 본 뒤 권리·저자·음성·접근성 4항목을 확인하면, 그 순간의 파일 묶음(번호·etag·크기)에
// 결속된 승인이 생긴다. 파일이 하나라도 추가·교체·삭제되면 승인은 자동 무효 → 다시 검토해야 구매자에게 열린다.
// 기존 카탈로그 기반 승인(books-audiobook.js)은 그대로 유효하며, 이 경로는 그것이 없을 때의 대안이다.
// 오디오북은 전자책 구매자에게만, 추가 결제 없이 제공된다(전용 판매 없음).
import { availableAudiobook, validateAudioChapter, audioSha256, MAX_AUDIO_CHAPTER_BYTES } from './books-audiobook.js';

const clean = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const NAME = /^(\d{2,3})\.mp3$/;
export const trackKey = (bookId, n) => `${bookId}/audiobook/${String(n).padStart(2, '0')}.mp3`;

async function manifestTitles(env, bookId) {
  const titles = new Map();
  try {
    const listed = await env.BOOK_FILES.list({ prefix: `_voice/renders/${bookId}/` });
    for (const o of listed.objects || []) {
      const m = await env.BOOK_FILES.get(o.key); if (!m) continue;
      const data = JSON.parse(await m.text());
      for (const t of data.tracks || []) if (t?.number && t?.title) titles.set(Number(t.number), clean(t.title, 150));
    }
  } catch {}
  return titles;
}

/** Draft chapter files currently in private storage, ordered by number. */
export async function draftTracks(env, book) {
  if (!env?.BOOK_FILES || !book?.id) return [];
  const listed = await env.BOOK_FILES.list({ prefix: `${book.id}/audiobook/` }).catch(() => ({ objects: [] }));
  const titles = await manifestTitles(env, book.id);
  const catalogTitles = new Map((book.audiobook?.tracks || []).map(t => [Number(t.number), t.title]));
  return (listed.objects || [])
    .map(o => ({ o, m: NAME.exec(o.key.slice(`${book.id}/audiobook/`.length)) }))
    .filter(x => x.m && Number(x.o.size) > 0)
    .map(({ o, m }) => { const n = Number(m[1]); return { number: n, key: o.key, size: Number(o.size), etag: String(o.httpEtag || o.etag || ''), uploaded: o.uploaded || null, title: catalogTitles.get(n) || titles.get(n) || `${n}장` }; })
    .sort((a, b) => a.number - b.number);
}

export async function activeAudioApproval(env, book) {
  if (!env?.DB || !book?.id) return null;
  const row = await env.DB.prepare('SELECT * FROM books_audiobook_approvals WHERE book_id=? AND revoked_at IS NULL').bind(book.id).first().catch(() => null);
  if (!row) return null;
  let snap = []; try { snap = JSON.parse(row.tracks_json); } catch {}
  const current = await draftTracks(env, book);
  const matches = snap.length > 0 && snap.length === current.length &&
    snap.every((t, i) => current[i].number === t.number && current[i].etag === t.etag && current[i].size === t.size);
  return { ...row, tracks: snap, filesMatch: matches };
}

/** Buyer-facing availability: catalogue approval first, else a live file-bound review approval. */
export async function reviewedAudiobook(env, book) {
  const base = await availableAudiobook(env, book);
  if (base.ready) return { ...base, source: 'catalog' };
  const a = await activeAudioApproval(env, book);
  if (a?.filesMatch && a.rights_approved && a.author_approved && a.voice_approved && a.accessibility_reviewed) {
    return { included: true, ready: true, state: 'available', priceKrw: 0, source: 'review', tracks: a.tracks.map(t => ({ number: t.number, title: t.title, format: 'mp3' })) };
  }
  return { ...base, included: true };
}

/** Key of an approved, deliverable chapter (review path), or null. */
export async function reviewedTrackKey(env, book, n) {
  const a = await activeAudioApproval(env, book);
  if (!(a?.filesMatch && a.rights_approved && a.author_approved && a.voice_approved && a.accessibility_reviewed)) return null;
  const t = a.tracks.find(x => x.number === Number(n));
  return t ? trackKey(book.id, t.number) : null;
}

async function log(env, bookId, action, actor, detail = {}) {
  await env.DB.prepare('INSERT INTO books_audiobook_review_log (book_id, action, actor, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(bookId, action, clean(actor, 120), JSON.stringify(detail).slice(0, 500), new Date().toISOString()).run();
}

/** Operator routes (caller verified operator). path parts: [bookId, sub?] */
export async function audiobookReviewRoute(env, request, book, actor, sub, body) {
  if (!env.BOOK_FILES) return { status: 503, data: { error: '비공개 보관함이 연결되지 않았습니다.' } };
  if (!sub && request.method === 'GET') {
    const tracks = await draftTracks(env, book);
    const approval = await activeAudioApproval(env, book);
    return { status: 200, data: { bookId: book.id, title: book.title, tracks, approval, delivery: await reviewedAudiobook(env, book) } };
  }
  const contentMatch = /^(\d{1,3})\/content$/.exec(sub || '');
  if (contentMatch && request.method === 'GET') {
    const object = await env.BOOK_FILES.get(trackKey(book.id, Number(contentMatch[1])));
    if (!object) return { status: 404, data: { error: '해당 장의 오디오가 없습니다.' } };
    return { status: 200, raw: new Response(object.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } }) };
  }
  const putMatch = /^(\d{1,3})$/.exec(sub || '');
  if (putMatch && (request.method === 'PUT' || request.method === 'DELETE')) {
    const n = Number(putMatch[1]);
    if (!(n >= 1 && n <= 120)) return { status: 400, data: { error: '장 번호는 1~120입니다.' } };
    if (request.method === 'DELETE') { await env.BOOK_FILES.delete(trackKey(book.id, n)); await log(env, book.id, 'track.deleted', actor, { n }); return { status: 200, data: { ok: true } }; }
    if (Number(request.headers.get('content-length') || 0) > MAX_AUDIO_CHAPTER_BYTES) return { status: 413, data: { error: '장별 오디오 파일은 최대 32MB입니다.' } };
    const bytes = new Uint8Array(await request.arrayBuffer());
    const ok = validateAudioChapter(bytes); if (!ok.ok) return { status: 400, data: { error: ok.error } };
    const sha256 = await audioSha256(bytes);
    await env.BOOK_FILES.put(trackKey(book.id, n), bytes, { httpMetadata: { contentType: 'audio/mpeg' }, customMetadata: { bookId: book.id, kind: 'audiobook-chapter', approved: 'false', sha256, uploadedBy: clean(actor, 120), source: 'operator-upload' } });
    await log(env, book.id, 'track.uploaded', actor, { n, size: bytes.length, sha256 });
    return { status: 201, data: { ok: true, number: n, size: bytes.length } };
  }
  if (sub === 'approval' && request.method === 'DELETE') {
    await env.DB.prepare('UPDATE books_audiobook_approvals SET revoked_at=?, revoked_by=? WHERE book_id=? AND revoked_at IS NULL').bind(new Date().toISOString(), clean(actor, 120), book.id).run();
    await log(env, book.id, 'approval.revoked', actor);
    return { status: 200, data: { ok: true } };
  }
  if (sub === 'approval' && request.method === 'POST') {
    const checks = ['rightsApproved', 'authorApproved', 'voiceApproved', 'accessibilityReviewed'];
    if (!checks.every(k => body?.[k] === true)) return { status: 400, data: { error: '권리·저자·음성·접근성 네 항목을 모두 확인해야 승인할 수 있습니다.', code: 'CHECKLIST_REQUIRED' } };
    const tracks = await draftTracks(env, book);
    if (!tracks.length) return { status: 409, data: { error: '승인할 오디오 파일이 없습니다.', code: 'NO_TRACKS' } };
    if (tracks.some((t, i) => t.number !== i + 1)) return { status: 409, data: { error: '장 번호가 1장부터 빠짐없이 이어져야 합니다.', code: 'TRACK_GAP' } };
    if (Array.isArray(body?.etags) && (body.etags.length !== tracks.length || body.etags.some((e, i) => e !== tracks[i].etag))) return { status: 409, data: { error: '검토 후 파일이 바뀌었습니다. 새로고침 후 다시 들어 주세요.', code: 'FILES_CHANGED' } };
    const snap = tracks.map(t => ({ number: t.number, title: t.title, etag: t.etag, size: t.size }));
    const at = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO books_audiobook_approvals (book_id, tracks_json, rights_approved, author_approved, voice_approved, accessibility_reviewed, note, approved_by, approved_at, revoked_at, revoked_by)
      VALUES (?, ?, 1, 1, 1, 1, ?, ?, ?, NULL, NULL)
      ON CONFLICT(book_id) DO UPDATE SET tracks_json=excluded.tracks_json, rights_approved=1, author_approved=1, voice_approved=1, accessibility_reviewed=1,
        note=excluded.note, approved_by=excluded.approved_by, approved_at=excluded.approved_at, revoked_at=NULL, revoked_by=NULL`)
      .bind(book.id, JSON.stringify(snap), clean(body?.note, 400), clean(actor, 120), at).run();
    await log(env, book.id, 'approval.granted', actor, { tracks: snap.length });
    return { status: 201, data: { ok: true, tracks: snap.length, approvedAt: at } };
  }
  return { status: 404, data: { error: 'not found' } };
}
