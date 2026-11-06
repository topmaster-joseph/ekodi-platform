// PUBLISHING-AI-RELEASE-001 — 최고관리자 '최종 검수 확인' 한 번으로 출판까지.
// 확인 → (감수 완료 처리) → 출간본 정리 → EPUB → 서점 파일 보관(R2) → 자동 가격 → 출간 기록 → 첫 저널 글.
// - 기존 서점 책은 건드리지 않는다. AI 협업 책은 출간 기록(D1)으로만 서점·저널에 합류한다.
// - 'AI 협업 초안 · 저자 감수' 표기, 건강·금융 일반정보 안내는 출간본에 남긴다.
// - 가격은 국내 전자책 시장 가격대(입문 4,900~9,900원, 2026)와 분량으로 자동 산정한다. 수동 변경은 출간 기록에서만.
import { buildEpub } from './publishing-ai-epub.js';
import { sensitiveKinds } from './publishing-ai-quality.js';

export const RELEASE_POLICY = Object.freeze({
  catalogPrefix: 'BOOK-EKODI-AI-',
  journalEveryDays: 7,
  journalMaxPerBook: 8,
  priceSource: '입문 실용 전자책 4,900~9,900원·중급 14,900~19,900원(2026, brunch.co.kr/@mingzi93/155 · calcnara.com/calculators/ebook-revenue)',
});

/** 팔릴 만한 가격: 분량 구간 × 분야 보정, 9로 끝나는 가격. */
export function recommendPrice({ chars = 0, genre = '' } = {}) {
  let amount = chars < 25000 ? 4900 : chars < 45000 ? 6900 : chars < 80000 ? 9900 : 12900;
  if (genre === 'faith-devotion' && amount > 4900) amount -= 2000; // 묵상서는 낮은 가격대에서 더 잘 팔림
  if (genre === 'money-basics' && amount < 12900) amount += 2000;  // 실익이 분명한 경제 실용서는 한 단계 위
  return { currency: 'KRW', amount, label: `${amount.toLocaleString('ko-KR')}원`, basis: `분량 ${Math.round(chars / 1000)}천 자 · ${RELEASE_POLICY.priceSource}` };
}

const NOTICE_LINE = /^>\s*\[확인필요\] 이 장은[^\n]*\n*/gm;
/** 출간본 본문: 감수 안내 줄과 [확인필요]·[본문확인] 표시를 뺀다(원고 기록은 그대로 둔다). */
export function releaseText(body) {
  return String(body || '').replace(NOTICE_LINE, '').replace(/\s*\[(확인필요|본문확인)\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

const now = () => new Date().toISOString();
const clean = (v, n = 400) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export async function ensureReleaseTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS publishing_ai_releases (book_id TEXT PRIMARY KEY, catalog_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, subtitle TEXT,
      author TEXT NOT NULL, genre TEXT, abstract TEXT, toc_json TEXT, price_json TEXT NOT NULL, file_key TEXT NOT NULL, epub_sha256 TEXT NOT NULL, epub_bytes INTEGER,
      disclosure TEXT NOT NULL, sensitive_json TEXT, released_by TEXT, released_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'on_sale')`),
    db.prepare(`CREATE TABLE IF NOT EXISTS publishing_book_journal (id TEXT PRIMARY KEY, book_id TEXT NOT NULL, catalog_id TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL, summary TEXT, body TEXT NOT NULL, theme TEXT, published_at TEXT NOT NULL)`),
  ]);
}

/** 최종 검수 확인 → 출판. 최고관리자(admin)만. 같은 책은 한 번만 출간된다. */
export async function releaseBook(env, db, book, user, { writeText, epubFor } = {}) {
  if (!env.BOOK_FILES?.put) return { status: 503, data: { ok: false, code: 'BOOK_FILES_NOT_CONFIGURED' } };
  await ensureReleaseTables(db);
  const already = await db.prepare('SELECT catalog_id, price_json FROM publishing_ai_releases WHERE book_id=?').bind(book.id).first();
  if (already) return { status: 200, data: { ok: true, status: 'released', catalogId: already.catalog_id, price: JSON.parse(already.price_json), already: true } };
  const chapters = (await db.prepare('SELECT number, title, summary, body, status FROM publishing_ai_chapters WHERE book_id=? ORDER BY number').bind(book.id).all()).results || [];
  if (!chapters.length || chapters.some(c => c.status === 'pending' || String(c.body || '').length < 200)) return { status: 409, data: { ok: false, code: 'CHAPTERS_INCOMPLETE' } };
  const meta = JSON.parse(book.plan_json || '{}');
  const kinds = [...new Set(chapters.flatMap(c => sensitiveKinds({ title: c.title, summary: c.summary, body: c.body, genre: book.genre })))];
  const t = now();
  if (book.status !== 'approved') {
    await db.prepare("UPDATE publishing_ai_books SET status='approved', approved_by=?, approved_at=?, updated_at=? WHERE id=?").bind(user.userId, t, t, book.id).run();
    book = { ...book, status: 'approved', approved_at: t };
  }
  const finalChapters = chapters.map(c => ({ number: c.number, title: c.title, body: releaseText(c.body) }));
  if (kinds.length) finalChapters.push({ number: finalChapters.length + 1, title: '읽기 전에 알아 두실 것',
    body: `이 책의 ${kinds.join('·')} 내용은 일반 정보입니다. 개인의 상황에 맞는 판단은 전문가와 상의해 주세요. 이 책은 AI 협업 초안을 저자가 감수해 펴냈습니다.` });
  const { bytes, digest } = await epubFor({ ...book }, finalChapters);
  const catalogId = RELEASE_POLICY.catalogPrefix + book.id.slice(0, 8).toUpperCase();
  const fileKey = `${catalogId}/ebook.epub`;
  await env.BOOK_FILES.put(fileKey, bytes, { httpMetadata: { contentType: 'application/epub+zip' }, customMetadata: { sha256: digest, source: 'ekodi-ai-factory' } });
  const chars = finalChapters.reduce((s, c) => s + c.body.length, 0);
  const price = recommendPrice({ chars, genre: book.genre });
  const abstract = clean([meta.pitch, `${meta.disclosure || 'AI 협업 초안 · 저자 감수'} — ${meta.author || '정찬균'}이 감수한 EKODI AI 협업 도서입니다.`].filter(Boolean).join(' '), 600);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO publishing_ai_releases (book_id,catalog_id,title,subtitle,author,genre,abstract,toc_json,price_json,file_key,epub_sha256,epub_bytes,disclosure,sensitive_json,released_by,released_at,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'on_sale')`).bind(book.id, catalogId, book.title, clean(meta.subtitle, 160), clean(meta.author || '정찬균', 60), book.genre, abstract,
      JSON.stringify(chapters.map(c => c.title)), JSON.stringify(price), fileKey, digest, bytes.length, clean(meta.disclosure || 'AI 협업 초안 · 저자 감수', 80), JSON.stringify(kinds), user.userId, t),
    db.prepare("INSERT INTO publishing_workflow_audit (id,project_id,actor_user_id,action,from_stage,to_stage,revision,details_json,created_at) VALUES (?, ?, ?, 'ai_book_released', 'approved', 'released', 0, ?, ?)")
      .bind(crypto.randomUUID(), 'ai:' + book.id, user.userId, JSON.stringify({ catalogId, price: price.amount, digest }), t),
  ]);
  const release = { book_id: book.id, catalog_id: catalogId, title: book.title, subtitle: meta.subtitle, author: meta.author || '정찬균', genre: book.genre, abstract, toc_json: JSON.stringify(chapters.map(c => c.title)) };
  await writeJournalPost(db, release, 0, writeText).catch(() => {});
  return { status: 200, data: { ok: true, status: 'released', catalogId, price, storeUrl: `https://ekodi.kr/books/book/?id=${catalogId}` } };
}

// ---- 공개 출간 목록(서점·저널이 읽는다) ----------------------------------------------
export function releaseToCatalogEntry(r) {
  const price = JSON.parse(r.price_json || '{}');
  const id = r.catalog_id;
  return {
    id, workId: 'ai:' + r.book_id, catalogNo: 'EB-AIC-' + id.slice(-8), series: 'EKODI AI 협업', publicationType: 'MONOGRAPH',
    status: '판매 중 · AI 협업 도서', coverTitle: r.title, detailUrl: `/book/?id=${id}`, storeUrl: `/book/?id=${id}`, buyUrl: `/buy/?book=${id}`,
    title: r.title, subtitle: r.subtitle || '', author: r.author, discipline: '', language: 'ko', languageLabel: '한국어', format: ['Digital Edition'], edition: '',
    listPrice: { currency: 'KRW', amount: Number(price.amount) || null, label: price.label || '' },
    abstract: r.abstract || '', citation: `${r.author}. 『${r.title}${r.subtitle ? ': ' + r.subtitle : ''}』. 에코디서점.`,
    identifiers: { googleBooks: '', isbnEbook: '', amazonAsin: '' }, toc: JSON.parse(r.toc_json || '[]'), tocSource: 'ai_factory_release',
    workflow: { manuscript: 'author_approved', editing: 'ai_assisted_author_reviewed', epub: 'released', cover: 'title_cover', metadata: 'released', distribution: 'ekodi_store', storefront: 'on_sale' },
    directSale: { enabled: true, fileKey: r.file_key, format: 'EPUB 3', edition: `AI 협업 1판 (${String(r.released_at).slice(0, 10)})` },
    editionApproval: { approvedBy: '정찬균 (저자·발행인)', approvedAt: String(r.released_at).slice(0, 10), scope: `최종 검수 확인·에코디서점 판매가 ${price.label}`, sourceEdition: 'AI 협업 1판' },
    aiCollaboration: { disclosure: r.disclosure, epubSha256: r.epub_sha256, sensitive: JSON.parse(r.sensitive_json || '[]') },
    audiobook: { freeWithEbook: true, status: 'production_pending', sourceEdition: '', rightsApproved: false },
  };
}

export async function publicReleases(db) {
  await ensureReleaseTables(db);
  const rows = (await db.prepare("SELECT * FROM publishing_ai_releases WHERE status='on_sale' ORDER BY released_at DESC LIMIT 200").all()).results || [];
  const posts = (await db.prepare('SELECT slug, catalog_id, title, summary, body, theme, published_at FROM publishing_book_journal ORDER BY published_at DESC LIMIT 100').all()).results || [];
  return { ok: true, books: rows.map(releaseToCatalogEntry), journal: posts };
}

// ---- 출간 도서 저널 글(무료 AI, 주기적) ----------------------------------------------
const THEMES = Object.freeze([
  ['launch', '새 책 소개', '이 책이 누구에게, 왜 필요한지 소개하는 출간 소개 글'],
  ['chapter', '장 깊이 읽기', '한 장을 골라 핵심 생각과 오늘 해 볼 일을 풀어 주는 글'],
  ['question', '독자 질문', '독자가 물을 법한 질문 세 가지와 저자의 답'],
  ['practice', '한 주 실천', '이 책을 7일 동안 실천하는 작은 계획'],
  ['behind', '집필 노트', 'AI와 함께 쓰고 저자가 감수한 과정과 고민을 정직하게 밝히는 글'],
  ['quote', '한 문장', '책 속 한 문장을 골라 삶에 비추어 묵상하는 짧은 글'],
  ['use', '함께 읽기', '가정·교회·소모임에서 함께 읽고 나눌 방법'],
  ['next', '다음 걸음', '이 책 다음에 읽을거리와 다음 실천을 안내하는 글'],
]);

export async function writeJournalPost(db, release, index, writeText) {
  const [theme, label, brief] = THEMES[index % THEMES.length];
  const toc = JSON.parse(release.toc_json || '[]');
  const focus = toc.length ? toc[index % toc.length] : '';
  const prompt = `에코디저널에 실을 글을 한국어로 900~1,300자 쓰세요. 형식: 첫 줄 제목, 둘째 줄 한 문장 요약, 빈 줄 뒤 본문.
책: 『${release.title}』${release.subtitle ? ' — ' + release.subtitle : ''} (저자 ${release.author}, 에코디서점 판매 중)
글의 종류: ${label} — ${brief}. ${theme === 'chapter' || theme === 'quote' ? `다룰 장: ${focus}.` : ''}
목차: ${toc.join(' / ')}
규칙: 과장 광고 금지, 따뜻하고 분명한 문장, 사실이 아닌 수치·후기 지어내지 않기, 마지막 줄에 "AI 협업 초안 · 저자 감수 도서"를 밝히기.`;
  let text = null;
  try { text = typeof writeText === 'function' ? await writeText('너는 에코디저널의 편집자다. 한국어로만 쓴다.', prompt, 1400, 'journal') : null; } catch { text = null; }
  if (!text) {
    text = `『${release.title}』 ${label}\n${release.abstract || release.title + '을 소개합니다.'}\n\n${release.abstract || ''}\n\n목차: ${toc.join(' · ')}\n\n에코디서점에서 만나실 수 있습니다. AI 협업 초안 · 저자 감수 도서입니다.`;
  }
  const lines = String(text).trim().split('\n');
  const title = clean(lines[0].replace(/^#+\s*/, ''), 120) || `『${release.title}』 ${label}`;
  const summary = clean(lines[1], 240);
  const body = clean(lines.slice(2).join('\n'), 6000) || clean(text, 6000);
  const slug = `book-${release.catalog_id.toLowerCase()}-${index + 1}`;
  await db.prepare('INSERT OR IGNORE INTO publishing_book_journal (id,book_id,catalog_id,slug,title,summary,body,theme,published_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), release.book_id, release.catalog_id, slug, title, summary, body, theme, now()).run();
  return slug;
}

/** 예약 실행에서 호출: 출간 도서마다 7일에 한 편, 책당 8편까지. */
export async function journalTick(db, writeText, max = 2) {
  await ensureReleaseTables(db);
  const rows = (await db.prepare(`SELECT r.*, (SELECT COUNT(*) FROM publishing_book_journal j WHERE j.book_id=r.book_id) AS n,
      (SELECT MAX(published_at) FROM publishing_book_journal j WHERE j.book_id=r.book_id) AS last FROM publishing_ai_releases r WHERE r.status='on_sale'`).all()).results || [];
  const due = rows.filter(r => r.n < RELEASE_POLICY.journalMaxPerBook && (!r.last || Date.now() - Date.parse(r.last) >= RELEASE_POLICY.journalEveryDays * 864e5 - 36e5));
  const written = [];
  for (const r of due.slice(0, max)) written.push(await writeJournalPost(db, r, Number(r.n), writeText));
  return written;
}
