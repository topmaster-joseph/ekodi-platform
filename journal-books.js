// JOURNAL-BOOKS-001 — 출판된 AI 협업 도서의 저널 글을 에코디저널에 합류(출판 워커 서비스 바인딩, 읽기 전용).
// 출판 쪽 예약 실행이 책마다 7일에 한 편씩 쓴 글이다. 글마다 'AI 협업' 공개 표기를 단다.
// 바인딩이 없거나 실패하면 기존 저널 글만 보인다(기존 글 불변).
let cache = { at: 0, posts: [] };
const TTL_MS = 60_000;
const SLUG = /^book-[a-z0-9-]{8,80}$/;
const author = Object.freeze({ name: 'EKODI 출판 편집부', type: 'ai-assisted-editorial', disclosure: 'AI와 함께 쓰고 출판이 감수해 펴낸 도서에 관한 글입니다.' });
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

// JOURNAL-OVERHAUL-20261108: AI 원고는 줄바꿈 없이 한 덩어리로 오는 경우가 많다 — 문장 3개 단위로 문단을 나눠 읽기 쉽게 한다.
const SENTENCE = /(?<=[.!?。])\s+/;
export function splitParagraphs(raw, perPara = 3) {
  const out = [];
  for (const para of clean(raw, 8000).split(/\n+/).map(s => s.trim()).filter(Boolean)) {
    if (/^#+\s/.test(para) || para.length <= 260) { out.push(para); continue; }
    const sentences = para.split(SENTENCE).map(s => s.trim()).filter(Boolean);
    for (let i = 0; i < sentences.length; i += perPara) out.push(sentences.slice(i, i + perPara).join(' '));
  }
  return out;
}

// JOURNAL-READER-LETTERS-20261109: 본문 끝의 판매 안내·AI 협업 표기는 CTA 상자·편집 노트와 겹치므로 본문에서 뺀다.
// 요약(deck)과 같은 첫 문단도 반복이므로 뺀다. AI 원고에 섞인 한자 표기는 한글로 고친다.
const HANJA_FIXES = Object.freeze({ '介绍': '소개', '介紹': '소개', '方法': '방법', '使用': '사용' });
const DUPLICATE_TAIL = /(에코디서점|에코디몰).{0,40}(판매|만나|구입|구매)|AI\s*협업\s*초안|저자\s*감수\s*(도서|표기)/;
function fixHanja(text) { return Object.entries(HANJA_FIXES).reduce((out, [from, to]) => out.split(from).join(to), String(text || '')); }
function norm(text) { return String(text || '').replace(/[\s『』「」"'·.,—-]/g, ''); }
export function dedupeBookParagraphs(paras, summary = '') {
  const cleaned = paras.map((p) => {
    const sentences = p.split(/(?<=[.!?。])\s+/);
    return sentences.filter((sentence) => !DUPLICATE_TAIL.test(sentence)).join(' ').trim();
  }).filter(Boolean);
  const deck = norm(summary).slice(0, 40);
  if (deck.length >= 20 && cleaned.length > 1 && norm(cleaned[0]).startsWith(deck)) cleaned.shift();
  return cleaned;
}

export function toJournalPost(row, book) {
  const paras = dedupeBookParagraphs(splitParagraphs(fixHanja(row.body)), fixHanja(row.summary));
  const bookUrl = book ? `https://ekodi.kr/books/book/?id=${encodeURIComponent(book.id)}` : '';
  const store = book ? `에코디서점에서 『${book.title}』(${book.listPrice?.label || ''})을 만나실 수 있습니다: ${bookUrl}` : '';
  const body = [
    ...(paras[0] ? [{ type: 'lead', text: paras[0] }] : []),
    ...paras.slice(1).map(text => (/^#+\s/.test(text) ? { type: 'heading', text: text.replace(/^#+\s*/, '') } : { type: 'p', text })),
    ...(store ? [{ type: 'cta', text: store, href: bookUrl, label: '에코디서점에서 보기' }] : []),
  ];
  const bookInfo = book ? Object.freeze({ id: clean(book.id, 80), title: clean(book.title, 140), subtitle: clean(book.subtitle, 160),
    author: clean(book.author, 80), price: clean(book.listPrice?.label, 40), url: bookUrl }) : null;
  const hash = [...row.slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Object.freeze({
    slug: row.slug, title: fixHanja(clean(row.title, 140)), titleEn: fixHanja(clean(row.title, 140)), excerpt: fixHanja(clean(row.summary, 240)), excerptEn: fixHanja(clean(row.summary, 240)),
    publishedAt: row.published_at, updatedAt: row.published_at, category: 'books', categoryLabel: '출판', categoryLabelEn: 'EKODI Books',
    values: [], author, readMinutes: Math.max(2, Math.round(clean(row.body, 8000).length / 600)), featured: false, imageVariant: 1 + (hash % 4),
    body, bodyEn: body, book: bookInfo, source: 'publishing-ai-release',
  });
}

// JOURNAL-ESSAYS-20261113: 게재된 에코디언 주간 에세이 → 저널 글.
const ESSAY_SLUG = /^ekodian-\d{8}-[a-z0-9-]{2,60}$/;
const ESSAY_CATEGORIES = Object.freeze({
  ekodi: ['EKODI 생각', 'EKODI Thinking'], ai: ['AI & Technology', 'AI & Technology'],
  build: ['Build in Public', 'Build in Public'], principles: ['원칙과 가치', 'Principles'], books: ['출판', 'EKODI Books'],
});
export function toEssayPost(row) {
  const paras = splitParagraphs(fixHanja(row.body));
  const body = paras.map((text, i) => (/^#+\s/.test(text) ? { type: 'heading', text: text.replace(/^#+\s*/, '') } : { type: i === 0 ? 'lead' : 'p', text }));
  const [label, labelEn] = ESSAY_CATEGORIES[row.category] || ESSAY_CATEGORIES.ekodi;
  const hash = [...row.slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Object.freeze({
    slug: row.slug, title: fixHanja(clean(row.title, 140)), titleEn: fixHanja(clean(row.title, 140)), excerpt: fixHanja(clean(row.summary, 240)), excerptEn: fixHanja(clean(row.summary, 240)),
    publishedAt: row.published_at, updatedAt: row.published_at, category: ESSAY_CATEGORIES[row.category] ? row.category : 'ekodi', categoryLabel: label, categoryLabelEn: labelEn,
    values: [], author: Object.freeze({ name: '에코디언', disclosure: '에코디언 이름으로 AI가 초안을 쓰고 편집부가 검토 기간을 거쳐 게재한 글입니다(AI 협업 초안 · 편집부 검토).' }),
    readMinutes: Math.max(2, Math.round(clean(row.body, 9000).length / 600)), featured: false, imageVariant: 1 + (hash % 5),
    body, bodyEn: body, book: null, source: 'journal-essay-weekly',
  });
}

export async function bookJournalPosts(env, now = Date.now()) {
  if (typeof env?.PUBLISHING?.fetch !== 'function') return [];
  if (now - cache.at < TTL_MS) return cache.posts;
  try {
    const r = await env.PUBLISHING.fetch(new Request('https://publishing.internal/api/workflow/public/ai-releases', { headers: { accept: 'application/json' } }));
    if (!r.ok) throw new Error(String(r.status));
    const data = await r.json();
    const books = new Map((data?.books || []).map(b => [b.id, b]));
    const posts = (data?.journal || []).filter(p => SLUG.test(p?.slug || '') && p.title && p.body && Number.isFinite(Date.parse(p.published_at)))
      .map(p => toJournalPost(p, books.get(p.catalog_id)));
    const essays = (data?.essays || []).filter(e => ESSAY_SLUG.test(e?.slug || '') && e.title && e.body && Number.isFinite(Date.parse(e.published_at))).map(toEssayPost);
    posts.push(...essays);
    cache = { at: now, posts };
  } catch { cache = { at: now - TTL_MS + 10_000, posts: cache.posts }; }
  return cache.posts;
}

export function mergePosts(base, extra) {
  const slugs = new Set(base.map(p => p.slug));
  return [...base, ...extra.filter(p => !slugs.has(p.slug))].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

export function __resetJournalBooksCacheForTests() { cache = { at: 0, posts: [] }; }
