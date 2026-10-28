// EKODIAN-AUDIOBOOK-BONUS-001: ebook ownership is the ONLY authority for audiobook access.
// Never return public R2 URLs or accept object keys from request input.
import { buyerIdentity, directSaleBook, loadCatalog } from './books-commerce.js';

const BOOK_ID = /^[A-Z0-9-]{3,40}$/;
const EDITION = /^[a-z0-9_-]{1,32}$/i;
const TRACK = /^[1-9][0-9]{0,2}$/;
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin',
} });
const fail = (status, code, message) => json(status, { code, error: message });

export function audiobookConfig(book) {
  const bonus = book?.bonusAudio;
  if (!bonus || bonus.included !== true) return null;
  if (!EDITION.test(String(bonus.edition || ''))) return null;
  if (!Array.isArray(bonus.chapterTitles) || bonus.chapterTitles.length > 100) return null;
  if (!bonus.chapterTitles.every(s => typeof s === 'string' && s.length > 0 && s.length <= 120)) return null;
  return { edition: bonus.edition, published: bonus.published === true, titles: bonus.chapterTitles };
}
export function audiobookObjectKey(book, edition, trackNo) {
  if (!BOOK_ID.test(String(book?.id || '')) || !EDITION.test(String(edition || '')) || !Number.isInteger(trackNo) || trackNo < 1 || trackNo > 100) return null;
  return `${book.id}/audiobook/${edition}/chapter-${String(trackNo).padStart(3, '0')}.mp3`;
}
async function gate(env, request, bookId) {
  if (!env?.DB) return { error: fail(503, 'STORAGE_UNAVAILABLE', '서재 서비스를 사용할 수 없습니다.') };
  const buyer = await buyerIdentity(request);
  if (!buyer) return { error: fail(401, 'LOGIN_REQUIRED', '구매자 로그인이 필요합니다.') };
  if (!BOOK_ID.test(String(bookId || ''))) return { error: fail(404, 'NOT_FOUND', '도서를 찾지 못했습니다.') };
  const book = directSaleBook(await loadCatalog(env), bookId);
  const config = audiobookConfig(book);
  if (!config) return { error: fail(404, 'NOT_FOUND', '등록된 오디오북 보너스가 없습니다.') };
  // Explicitly check the live, unrevoked ebook entitlement. No tier, payment intent,
  // browser storage, operator email or catalog flag can replace this check.
  const owned = await env.DB.prepare(
    'SELECT 1 FROM books_entitlements WHERE buyer_user_id=? AND book_id=? AND revoked_at IS NULL'
  ).bind(buyer.userId, book.id).first();
  if (!owned) return { error: fail(403, 'NOT_OWNED', '해당 전자책의 구매권한이 없습니다.') };
  return { book, config, buyer };
}

export async function audiobookInfo(env, request, bookId) {
  const gated = await gate(env, request, bookId);
  if (gated.error) return gated.error;
  const { book, config } = gated;
  if (!config.published || !config.titles.length || !env.BOOK_FILES) {
    return json(200, { bookId: book.id, included: true, status: 'preparing', tracks: [] });
  }
  // Fail closed when a track is not yet uploaded. No incomplete product is "ready".
  const tracks = await Promise.all(config.titles.map(async (title, i) => {
    const head = await env.BOOK_FILES.head(audiobookObjectKey(book, config.edition, i + 1)).catch(() => null);
    return { number: i + 1, title, ready: Boolean(head?.size > 0) };
  }));
  return json(200, { bookId: book.id, included: true,
    status: tracks.every(t => t.ready) ? 'ready' : 'preparing', tracks: tracks.every(t => t.ready) ? tracks : [] });
}

export async function audiobookTrack(env, request, bookId, trackToken) {
  const gated = await gate(env, request, bookId);
  if (gated.error) return gated.error;
  const { book, config, buyer } = gated;
  if (!TRACK.test(String(trackToken || ''))) return fail(404, 'NOT_FOUND', '트랙을 찾지 못했습니다.');
  const number = Number(trackToken);
  if (!config.published || number > config.titles.length || !env.BOOK_FILES) {
    return fail(409, 'NOT_PUBLISHED', '오디오북 보너스를 준비하고 있습니다.');
  }
  const key = audiobookObjectKey(book, config.edition, number);
  const object = key && await env.BOOK_FILES.get(key).catch(() => null);
  if (!object) return fail(409, 'AUDIO_PREPARING', '음원 파일을 준비하고 있습니다.');
  // Audio is obtained only through this authenticated Worker. Do not expose keys.
  return new Response(object.body, { status: 200, headers: {
    'content-type': 'audio/mpeg',
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'content-disposition': `attachment; filename="ekodian-${book.id}-${String(number).padStart(3, '0')}.mp3"`,
    ...(Number.isSafeInteger(object.size) && object.size > 0 ? { 'content-length': String(object.size) } : {}),
  } });
}

export async function handleAudiobook(request, env) {
  if (request.method !== 'GET') return fail(405, 'METHOD_NOT_ALLOWED', '허용되지 않은 요청입니다.');
  const path = new URL(request.url).pathname;
  const match = /^\\/api\\/commerce\\/audiobook\\/([A-Z0-9-]{3,40})(?:\\/track\\/([1-9][0-9]{0,2}))?$/.exec(path);
  if (!match) return fail(404, 'NOT_FOUND', '오디오북을 찾지 못했습니다.');
  try {
    return match[2]
      ? await audiobookTrack(env, request, match[1], match[2])
      : await audiobookInfo(env, request, match[1]);
  } catch {
    return fail(503, 'AUDIO_UNAVAILABLE', '오디오북 서비스가 일시적으로 준비되지 않았습니다.');
  }
}
