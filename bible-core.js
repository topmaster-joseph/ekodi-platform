import { BOOKS, resolveBook } from './bible/books.js';

const BSK_PLATFORM = 'https://bible.bskorea.or.kr';
const RIGHTS_NOTICE = 'https://bskorea.or.kr/bbs/board.php?bo_table=copyright_faq&wr_id=5';
const PROVIDERS = {
  KRV1961: {
    id:'KRV1961', label:'개역한글', fullName:'성경전서 개역한글판', language:'ko',
    mode:'embedded-verbatim', default:true,
    attribution:'대한성서공회 · 성경전서 개역한글판(1961)',
    rights:{ propertyRights:'expired', moralRights:['attribution','integrity'], officialNotice:RIGHTS_NOTICE },
  },
  NKRV: {
    id:'NKRV', label:'개역개정', fullName:'성경전서 개역개정판', language:'ko',
    mode:'official-link-only', default:false,
    attribution:'성경전서 개역개정판 © 대한성서공회 1998',
    rights:{ propertyRights:'protected', storageAllowed:false, displayMode:'official-link-only' },
  },
};

export function bibleProviderCatalog() {
  return Object.values(PROVIDERS).map(provider => structuredClone(provider));
}

export function bibleCorePolicy() {
  return { version:'1.0.0', defaultProvider:'KRV1961', textIntegrity:'verbatim', protectedText:'official-link-only', aiMayAlterScripture:false };
}function providerFor(value) {
  const key = String(value || 'KRV1961').toUpperCase();
  if (key === 'KRV') return PROVIDERS.KRV1961;
  return PROVIDERS[key] || null;
}

export function parseScriptureReference(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(.+?)\s*(\d+)(?::(\d+)(?:\s*[-~]\s*(\d+))?)?$/u);
  if (!match) return null;
  const book = resolveBook(match[1]);
  if (!book) return null;
  return {
    bookId:book.id,
    chapter:Number(match[2]),
    verseStart:match[3] ? Number(match[3]) : null,
    verseEnd:match[4] ? Number(match[4]) : (match[3] ? Number(match[3]) : null),
  };
}

function officialBibleUrl(provider, book, chapter) {
  const translation = provider.id === 'NKRV' ? 'NKRV' : provider.id;
  return `${BSK_PLATFORM}/bible/${encodeURIComponent(translation)}/${encodeURIComponent(book.id)}.${chapter}`;
}

async function assetJson(request, env, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  url.search = '';
  const response = await env.ASSETS.fetch(new Request(url, request));  if (!response.ok) throw new Error(`asset_not_found:${pathname}:${response.status}`);
  return response.json();
}

function normalizeRange(chapter, start, end) {
  const verses = chapter?.verses || [];
  const first = Number.isInteger(start) && start > 0 ? start : (verses[0]?.verse || 1);
  const lastAvailable = verses.at(-1)?.verse || first;
  const last = Number.isInteger(end) && end >= first ? Math.min(end, lastAvailable) : (start ? first : lastAvailable);
  return { first, last };
}

export async function readBiblePassage(request, env, input = {}) {
  const provider = providerFor(input.provider || input.translation);
  if (!provider) return { ok:false, error:'translation_not_supported' };
  const book = resolveBook(input.bookId || input.book);
  const chapterNumber = Number(input.chapter);
  if (!book || !Number.isInteger(chapterNumber) || chapterNumber < 1) return { ok:false, error:'invalid_reference' };
  if (provider.mode === 'official-link-only') {
    return {
      ok:true, mode:provider.mode, provider, book:{ id:book.id, name:book.ko }, chapter:chapterNumber,
      officialUrl:officialBibleUrl(provider, book, chapterNumber), verses:[],
      notice:'저작권 보호 번역본은 에코디에 저장하지 않고 대한성서공회 공식 본문으로 연결합니다.',
    };
  }
  const data = await assetJson(request, env, `/data/krv/${book.id}.json`);
  const chapter = data.chapters.find(item => item.chapter === chapterNumber);
  if (!chapter) return { ok:false, error:'chapter_not_found' };
  const { first, last } = normalizeRange(chapter, Number(input.verseStart) || null, Number(input.verseEnd) || null);  const verses = chapter.verses.filter(verse => verse.verse >= first && verse.verse <= last);
  const range = first === 1 && last === chapter.verses.at(-1)?.verse ? '' : `:${first}${last > first ? `-${last}` : ''}`;
  return {
    ok:true,
    mode:provider.mode,
    provider,
    book:{ id:book.id, name:book.ko, abbreviation:book.abbr },
    chapter:chapterNumber,
    verseStart:first,
    verseEnd:last,
    citation:`${book.ko} ${chapterNumber}${range}`,
    verses,
    attribution:provider.attribution,
    integrity:'verbatim',
  };
}

export async function readBibleReference(request, env, reference, provider = 'KRV1961') {
  const parsed = parseScriptureReference(reference);
  if (!parsed) return { ok:false, error:'invalid_reference' };
  return readBiblePassage(request, env, { provider, ...parsed });
}

export async function searchBible(request, env, query, limit = 20) {
  const q = String(query || '').trim();
  if (q.length < 2) return { ok:false, error:'query_too_short' };
  const max = Math.max(1, Math.min(Number(limit) || 20, 50));
  const index = await assetJson(request, env, '/data/krv/search-index.json');
  const needle = q.toLocaleLowerCase('ko-KR');
  const results = [];
  for (const verse of index.verses) {
    if (!verse.t.toLocaleLowerCase('ko-KR').includes(needle)) continue;
    results.push({ bookId:verse.b, bookName:verse.k, chapter:verse.c, verse:verse.v, text:verse.t, citation:`${verse.k} ${verse.c}:${verse.v}` });
    if (results.length >= max) break;
  }
  return { ok:true, provider:PROVIDERS.KRV1961, query:q, results, attribution:PROVIDERS.KRV1961.attribution, integrity:'verbatim' };
}

export { BOOKS };