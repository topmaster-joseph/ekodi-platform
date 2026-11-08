// JOURNAL-MASTHEAD-20261108 — 권호·문서번호·글 유형·인용 형식(서버·화면 공용, 순수 함수).
// 창간 2026년 9월 = 제1권 제1호. 매달 한 호, 12호마다 한 권.
export const JOURNAL_FOUNDED = Object.freeze({ year: 2026, month: 9 });
export const JOURNAL_DESK = Object.freeze({ name: '에코디저널 편집부 (정찬균)', email: 'joseph@ekodi.kr' });

function kstParts(value) {
  const ms = new Date(value || Date.now()).getTime();
  const d = new Date((Number.isFinite(ms) ? ms : Date.now()) + 9 * 3600_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function issueOf(value) {
  const { year, month } = kstParts(value);
  const serial = Math.max(1, (year - JOURNAL_FOUNDED.year) * 12 + month - JOURNAL_FOUNDED.month + 1);
  return Object.freeze({ serial, volume: Math.floor((serial - 1) / 12) + 1, number: ((serial - 1) % 12) + 1, year, month });
}

export function issueLabel(value) {
  const i = issueOf(value);
  return `제${i.volume}권 제${i.number}호 · ${i.year}년 ${i.month}월`;
}

// EKJ-YYYY-MM-NNN: 같은 달 게재 순서(오래된 글부터 001).
export function docNumber(post, posts = []) {
  if (!post?.publishedAt) return '';
  const { year, month } = kstParts(post.publishedAt);
  const sameMonth = (Array.isArray(posts) ? posts : [])
    .filter((p) => p?.publishedAt && (({ year: y, month: m }) => y === year && m === month)(kstParts(p.publishedAt)))
    .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt) || String(a.slug).localeCompare(String(b.slug)));
  const index = Math.max(0, sameMonth.findIndex((p) => p.slug === post.slug));
  return `EKJ-${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(3, '0')}`;
}

const TYPES = Object.freeze({
  ekodi: { ko: '에세이', en: 'Essay' },
  ai: { ko: '에세이', en: 'Essay' },
  principles: { ko: '원칙', en: 'Principle' },
  build: { ko: '구축 기록', en: 'Build Record' },
  books: { ko: '서평 · 출판', en: 'Books' },
});
export function postType(category, korean = true) {
  const t = TYPES[category] || { ko: '기록', en: 'Record' };
  return korean ? t.ko : t.en;
}

export function citation(post, posts = []) {
  const i = issueOf(post.publishedAt);
  const { year } = kstParts(post.publishedAt);
  const author = post.author?.name || 'EKODI Editorial';
  return `${author}. (${year}). ${post.title}. EKODI Journal, 제${i.volume}권 제${i.number}호, ${docNumber(post, posts)}. https://ekodi.kr/journal/p/${encodeURIComponent(post.slug)}`;
}
