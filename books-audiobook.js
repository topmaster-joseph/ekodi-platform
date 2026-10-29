// EKODI AUDIOBOOK-BONUS-001 — free companion to an owned, published EPUB.
// This is a RIGHTS / R2 readiness policy, not a synthetic TTS generator.
// No additional checkout or audio-only entitlement is ever created.
const KEY = /^BOOK-[A-Z0-9-]+\/audiobook\/[A-Za-z0-9._-]+\.mp3$/;
const SAFE_EDITION = value => typeof value === 'string' && value.length > 0 && value.length <= 160;

export function complimentaryAudiobookPolicy(book) {
  const publishedEbook = book?.directSale?.enabled === true &&
    book?.workflow?.epub === 'validated' &&
    book?.workflow?.editing === 'complete' &&
    book?.workflow?.distribution === 'live';
  // Every completed published EKODI digital title automatically qualifies.
  // An unpublished or unvalidated catalog placeholder is not an audiobook offer.
  const bonusIncluded = Boolean(publishedEbook);
  const audio = book?.audiobook || {};
  const tracks = Array.isArray(audio.tracks) ? audio.tracks : [];
  const approved = bonusIncluded &&
    audio.status === 'approved' &&
    audio.freeWithEbook === true &&
    audio.rightsApproved === true &&
    audio.authorApproved === true &&
    audio.publisherApproved === true &&
    audio.voicePerformanceApproved === true &&
    audio.accessibilityReviewed === true &&
    SAFE_EDITION(audio.sourceEdition) && audio.sourceEdition === book.edition &&
    tracks.length > 0 && tracks.length <= 120 &&
    tracks.every((t, i) =>
      t?.number === i + 1 && typeof t.title === 'string' &&
      t.title.trim().length > 0 && t.title.length <= 150 &&
      KEY.test(t.key || '') && t.key.startsWith(book.id + '/audiobook/') &&
      t.format === 'mp3');
  return Object.freeze({
    included: bonusIncluded, priceKrw: 0,
    state: !bonusIncluded ? 'not_yet_published' : approved ? 'approved_pending_files' : 'preparing',
    approved: Boolean(approved), tracks: approved ? tracks : [],
  });
}

export async function availableAudiobook(env, book) {
  const policy = complimentaryAudiobookPolicy(book);
  if (!policy.approved || !env?.BOOK_FILES) return { included: policy.included, ready: false, state: policy.state, priceKrw: 0, tracks: [] };
  const available = [];
  for (const track of policy.tracks) {
    let head;
    try { head = await env.BOOK_FILES.head(track.key); } catch { head = null; }
    const metadata = head?.customMetadata || {};
    // Audio delivered only from the approved edition and book-bound private R2 object.
    if (!head || !(Number(head.size) > 0) ||
        metadata.bookId !== book.id ||
        metadata.kind !== 'audiobook-chapter' ||
        metadata.edition !== book.edition ||
        metadata.approved !== 'true') {
      return { included: true, ready: false, state: 'preparing', priceKrw: 0, tracks: [] };
    }
    available.push({ number: track.number, title: track.title, format: 'mp3' });
  }
  return { included: true, ready: true, state: 'available', priceKrw: 0, tracks: available };
}

export const MAX_AUDIO_CHAPTER_BYTES = 32 * 1024 * 1024;
export function validateAudioChapter(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 128) return { ok: false, error: '오디오 파일이 비어 있습니다.' };
  if (bytes.length > MAX_AUDIO_CHAPTER_BYTES) return { ok: false, error: '한 파일은 최대 32MB입니다. 장별로 나누어 주세요.' };
  // MP3 ID3v2 header, or raw MPEG audio frame sync.
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
  const frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return id3 || frame ? { ok: true } : { ok: false, error: 'MP3 파일이 아닙니다.' };
}

export function audioChapterFor(book, index) {
  const policy = complimentaryAudiobookPolicy(book);
  if (!policy.approved || !Number.isSafeInteger(index) || index < 1) return null;
  return policy.tracks.find(track => track.number === index) || null;
}
