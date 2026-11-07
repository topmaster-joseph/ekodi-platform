// BOOKS-AI-RELEASES-001 — 출판에서 최고관리자 최종 검수 확인으로 출간된 AI 협업 도서를 서점 목록에 합류.
// - 출처는 출판 워커의 서버 간 서비스 바인딩뿐이다(브라우저·books.json 필드로는 스스로 판매 권한을 얻을 수 없다).
// - 바인딩으로 받은 항목만 WeakSet에 '확인됨'으로 기록한다. 같은 모양의 JSON을 git에 넣어도 판매되지 않는다.
// - 판매 준비는 서점 파일 저장소의 EPUB 지문(sha256)이 출간 기록과 같을 때만 성립한다.
// - 기존 서점 책과 id가 겹치면 기존 책이 이긴다(기존 데이터 불변).
const VERIFIED = new WeakSet();
let cache = { at: 0, list: [] };
const TTL_MS = 60_000;
const ID = /^BOOK-EKODI-AI-[0-9A-F]{8}$/;
const SHA = /^[a-f0-9]{64}$/;

function freeze(o) { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; }

export function validAiReleaseEntry(b) {
  return Boolean(b && ID.test(b.id || '') && typeof b.title === 'string' && b.title && typeof b.author === 'string' && b.author &&
    b.directSale?.enabled === true && typeof b.directSale.fileKey === 'string' && b.directSale.fileKey === `${b.id}/ebook.epub` &&
    b.listPrice?.currency === 'KRW' && Number.isSafeInteger(b.listPrice.amount) && b.listPrice.amount > 0 &&
    SHA.test(b.aiCollaboration?.epubSha256 || '') && typeof b.aiCollaboration?.disclosure === 'string' && b.aiCollaboration.disclosure);
}

/** 서비스 바인딩으로 출간 목록을 읽는다. 실패하면 마지막으로 확인된 목록(없으면 빈 목록). */
export async function aiReleaseBooks(env, now = Date.now()) {
  if (typeof env?.PUBLISHING?.fetch !== 'function') return [];
  if (now - cache.at < TTL_MS) return cache.list;
  try {
    const r = await env.PUBLISHING.fetch(new Request('https://publishing.internal/api/workflow/public/ai-releases', { headers: { accept: 'application/json' } }));
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    const list = (Array.isArray(data?.books) ? data.books : []).filter(validAiReleaseEntry).map(b => { const o = freeze(structuredClone(b)); VERIFIED.add(o); return o; });
    cache = { at: now, list };
  } catch { cache = { at: now - TTL_MS + 10_000, list: cache.list }; }
  return cache.list;
}

export const isVerifiedAiRelease = book => Boolean(book && typeof book === 'object' && VERIFIED.has(book));

export function mergeAiReleases(base, extra) {
  const books = Array.isArray(base?.books) ? base.books : [];
  const ids = new Set(books.map(b => b.id));
  return { ...base, books: [...books, ...extra.filter(b => !ids.has(b.id))] };
}

/** 판매 준비: 확인된 출간 항목 + 서점 파일 저장소의 EPUB 지문 일치. */
export async function aiReleaseSaleReady(env, book) {
  if (!isVerifiedAiRelease(book) || !env?.BOOK_FILES?.head) return false;
  const head = await env.BOOK_FILES.head(book.directSale.fileKey).catch(() => null);
  return Boolean(head && head.customMetadata?.sha256 === book.aiCollaboration.epubSha256);
}

export function __resetAiReleaseCacheForTests() { cache = { at: 0, list: [] }; }
