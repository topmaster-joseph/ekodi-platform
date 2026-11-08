import { approvedJournalPhoto } from './media-policy.js';
import { issueLabel, docNumber, postType, citation, JOURNAL_DESK } from './issue.js';

const COPY = Object.freeze({
  'ko-KR': { intro:'말씀과 삶, 기술과 공동체 사이에서 무엇을 만들고 왜 그렇게 선택했는지를 기록합니다.', manifesto:'기록은 기억을 넘어 책임이 됩니다. 성공뿐 아니라 질문, 실패, 수정, 검증의 흔적까지 남깁니다.', search:'검색', searchLabel:'저널 검색', all:'전체', empty:'조건에 맞는 글이 없습니다.', back:'← 모든 글', why:'WHY JOURNAL', closingTitle:'생각을 저장하지 않고 흘려보냅니다.', closingBody:'에코디의 기록은 특정 조직 안에 가두기 위한 지식이 아니라, 다음 사람과 공동체가 더 자유롭게 시작할 수 있도록 건네는 공공의 흔적을 지향합니다.', min:'분 읽기', original:'한국어 원문과 영문 번역을 함께 제공합니다.' },
  en: { intro:'A living record of what EKODI builds and why, between faith, life, technology, and community.', manifesto:'A record is more than memory. It becomes accountability, including questions, failures, corrections, and verification.', search:'Search', searchLabel:'Search the journal', all:'All', empty:'No articles match these filters.', back:'← All articles', why:'WHY JOURNAL', closingTitle:'Knowledge should flow, not be locked away.', closingBody:'EKODI records are meant to help the next person and community begin with greater freedom, not to trap knowledge inside one organization.', min:'min read', original:'Korean originals include an English reading version.' },
  'zh-CN': { intro:'记录 EKODI 在信仰、生活、技术与共同体之间做了什么，以及为什么这样选择。', manifesto:'记录不只是记忆，也是责任。我们也留下问题、失败、修正和验证。', search:'搜索', searchLabel:'搜索期刊', all:'全部', empty:'没有符合条件的文章。', back:'← 全部文章', why:'WHY JOURNAL', closingTitle:'让思想流动，而不是封存。', closingBody:'这些记录旨在帮助下一位实践者和共同体更自由地开始。', min:'分钟阅读', original:'提供韩文原文与英文阅读版本。' },
  ja: { intro:'信仰と生活、技術と共同体の間で、EKODIが何をつくり、なぜそう選んだのかを記録します。', manifesto:'記録は記憶を超えて責任になります。問い、失敗、修正、検証も残します。', search:'検索', searchLabel:'ジャーナルを検索', all:'すべて', empty:'条件に合う記事がありません。', back:'← すべての記事', why:'WHY JOURNAL', closingTitle:'考えを閉じ込めず、流します。', closingBody:'次の人と共同体がより自由に始められるよう、記録を公共の足跡として残します。', min:'分で読めます', original:'韓国語原文と英語版を提供します。' },
  vi: { intro:'Ghi lại EKODI đã xây dựng điều gì và vì sao, giữa đức tin, đời sống, công nghệ và cộng đồng.', manifesto:'Ghi chép không chỉ là ký ức mà còn là trách nhiệm, gồm cả câu hỏi, thất bại, sửa đổi và kiểm chứng.', search:'Tìm kiếm', searchLabel:'Tìm trong nhật ký', all:'Tất cả', empty:'Không có bài viết phù hợp.', back:'← Tất cả bài viết', why:'WHY JOURNAL', closingTitle:'Để tri thức được lưu chuyển.', closingBody:'Những ghi chép này giúp người và cộng đồng tiếp theo bắt đầu tự do hơn.', min:'phút đọc', original:'Có bản gốc tiếng Hàn và bản đọc tiếng Anh.' },
  id: { intro:'Catatan hidup tentang apa yang EKODI bangun dan mengapa, di antara iman, kehidupan, teknologi, dan komunitas.', manifesto:'Catatan melampaui ingatan dan menjadi tanggung jawab, termasuk pertanyaan, kegagalan, koreksi, dan verifikasi.', search:'Cari', searchLabel:'Cari jurnal', all:'Semua', empty:'Tidak ada tulisan yang cocok.', back:'← Semua tulisan', why:'WHY JOURNAL', closingTitle:'Pengetahuan harus mengalir.', closingBody:'Catatan EKODI ditujukan agar orang dan komunitas berikutnya dapat memulai dengan lebih bebas.', min:'menit baca', original:'Tersedia naskah Korea dan versi baca bahasa Inggris.' },
  my: { intro:'EKODI က ယုံကြည်ခြင်း၊ ဘဝ၊ နည်းပညာနှင့် လူမှုအသိုင်းအဝိုင်းကြားတွင် ဘာတည်ဆောက်ပြီး ဘာကြောင့်ရွေးချယ်ခဲ့သည်ကို မှတ်တမ်းတင်ပါသည်။', manifesto:'မှတ်တမ်းသည် အမှတ်တရသာမက တာဝန်ယူမှုလည်း ဖြစ်သည်။', search:'ရှာဖွေရန်', searchLabel:'ဂျာနယ်ရှာဖွေရန်', all:'အားလုံး', empty:'ကိုက်ညီသော ဆောင်းပါး မရှိပါ။', back:'← ဆောင်းပါးအားလုံး', why:'WHY JOURNAL', closingTitle:'အသိပညာကို စီးဆင်းစေပါသည်။', closingBody:'နောက်လာမည့် လူနှင့် အသိုင်းအဝိုင်း ပိုမိုလွတ်လပ်စွာ စတင်နိုင်ရန် မှတ်တမ်းများကို မျှဝေပါသည်။', min:'မိနစ်ဖတ်', original:'ကိုရီးယား မူရင်းနှင့် အင်္ဂလိပ်ဖတ်ရှုဗားရှင်း ရှိပါသည်။' },
  mn: { intro:'EKODI итгэл, амьдрал, технологи, хамтын нийгэмлэгийн дунд юу бүтээж, яагаад тэгж сонгосныг тэмдэглэнэ.', manifesto:'Тэмдэглэл бол дурсамжаас гадна хариуцлага. Асуулт, алдаа, засвар, баталгаажуулалтыг мөн үлдээнэ.', search:'Хайх', searchLabel:'Сэтгүүлээс хайх', all:'Бүгд', empty:'Тохирох нийтлэл алга.', back:'← Бүх нийтлэл', why:'WHY JOURNAL', closingTitle:'Мэдлэгийг түгжих бус урсгана.', closingBody:'Дараагийн хүн, хамт олон илүү эрх чөлөөтэй эхлэхэд эдгээр тэмдэглэл тусална.', min:'мин унших', original:'Солонгос эх ба англи унших хувилбартай.' },
  kac: { intro:'EKODI gaw kam, prat, technology hte community lapran hta hpa galaw ai hte hpa majaw lata ai hpe matsing da ai.', manifesto:'Matsing gaw matsing lamang sha n re, lit laika mung rai nga ai.', search:'Tam', searchLabel:'Journal hta tam', all:'Yawng', empty:'Hkrum ai laika n nga ai.', back:'← Laika yawng', why:'WHY JOURNAL', closingTitle:'Hpaji hpe gawgap da na n re, ginhka ya na.', closingBody:'Ndai matsing ni gaw hpang de wa ai wa ni hte community ni mung shinggyim ai lam hta galaw lu na matu rai nga ai.', min:'min read', original:'Korean original hte English version nga ai.' },
});

// JOURNAL-MASTHEAD-20261108: 정론지(A) 틀 + 학술지(C) 문서번호·초록·인용 + 매거진(B) 번호 목록.
const UI = Object.freeze({
  'ko-KR': { share:'링크 공유', copied:'링크를 복사했습니다', cite:'인용하기', citeCopied:'인용 형식을 복사했습니다', print:'인쇄', related:'함께 읽을 글', prev:'이전 글', next:'다음 글', loading:'글을 불러오는 중입니다…', failed:'글 목록을 잠시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', retry:'다시 시도', book:'에코디서점 도서', picks:'편집부 추천', editor:'편집자의 말', editorBody:'기록은 기억을 넘어 책임이 됩니다. 성공뿐 아니라 질문, 실패, 수정, 검증의 흔적까지 남깁니다.', latest:'최신 기록', abstract:'요약', note:'편집 노트', correction:'정정·의견 보내기', talk:'커뮤니티에서 이야기하기', readerTitle:'이 글에 대해 이야기해 주세요', readerBody:'질문, 반론, 정정 요청 모두 환영합니다. 편집부가 읽고 필요한 내용은 글에 반영합니다.', count:(n) => `${n}편`, by:'글', archive:'모든 기록', motto:'말씀과 삶, 기술과 공동체의 공적 기록', lettersLink:'독자 편지', readersTitle:'독자와 함께 쓰는 기록', readersBody:'새 글은 RSS로 받아 보시고, 의견·질문·정정 요청은 편집부에 보내 주세요. 보내 주신 정정은 글 아래 이력으로 남깁니다.', letter:'독자 편지 보내기', rss:'RSS 구독', community:'커뮤니티에서 이야기하기', policy:'편집 원칙 — 모든 글은 작성 주체(편집부·AI 협업·저자)를 밝히고, 정정 요청을 받으면 글 아래에 이력을 남깁니다.' },
  en: { share:'Share link', copied:'Link copied', cite:'Cite', citeCopied:'Citation copied', print:'Print', related:'Read next', prev:'Previous', next:'Next', loading:'Loading articles…', failed:'Articles could not be loaded right now. Please try again shortly.', retry:'Retry', book:'EKODI Books', picks:'Editors’ picks', editor:'From the editors', editorBody:'A record is more than memory. It becomes accountability, including questions, failures, corrections, and verification.', latest:'Latest', abstract:'Summary', note:'Editorial note', correction:'Send a correction or comment', talk:'Discuss in the community', readerTitle:'Tell us what you think', readerBody:'Questions, objections and corrections are welcome. The editors read every letter and update the record when needed.', count:(n) => `${n}`, by:'By', archive:'All records', motto:'A public record of faith, life, technology and community', lettersLink:'Letters', readersTitle:'A record written with readers', readersBody:'Follow new articles by RSS and send comments, questions or corrections to the editors. Corrections are kept below each article.', letter:'Write to the editors', rss:'RSS', community:'Talk in the EKODI community', policy:'Editorial policy — every article names who wrote it (editors, AI-assisted, author) and keeps its correction history.' },
});
function ui() { return UI[state.locale] || UI.en; }
const state = { posts: [], category: 'all', query: '', locale: 'ko-KR', loaded: false, failed: false };
const listView = document.querySelector('#journal-list-view');
const articleView = document.querySelector('#journal-article-view');
const front = document.querySelector('#journal-front');
const list = document.querySelector('#journal-list');
const count = document.querySelector('#journal-count');
const article = document.querySelector('#journal-article');
const empty = document.querySelector('#journal-empty');
const filters = document.querySelector('#journal-filters');
const search = document.querySelector('#journal-search');

function normalizeLocale(value) {
  const raw = String(value || '').toLowerCase();
  if (raw.startsWith('ko')) return 'ko-KR';
  if (raw.startsWith('zh')) return 'zh-CN';
  if (raw.startsWith('ja')) return 'ja';
  if (raw.startsWith('vi')) return 'vi';
  if (raw.startsWith('id')) return 'id';
  if (raw.startsWith('my')) return 'my';
  if (raw.startsWith('mn')) return 'mn';
  if (raw.startsWith('kac')) return 'kac';
  return raw.startsWith('en') ? 'en' : 'ko-KR';
}

function copy() { return COPY[state.locale] || COPY.en; }
function isKorean() { return state.locale === 'ko-KR'; }
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function postText(post, key) {
  if (isKorean()) return post[key] || '';
  return post[`${key}En`] || post[key] || '';
}
function categoryText(post) { return isKorean() ? post.categoryLabel : (post.categoryLabelEn || post.categoryLabel); }
function dateText(value, long = false) {
  const options = long ? { year:'numeric', month:'long', day:'numeric', weekday:'long' } : { year:'numeric', month:'short', day:'numeric' };
  return new Intl.DateTimeFormat(state.locale, options).format(new Date(value));
}
function postUrl(post) { return `/journal/p/${encodeURIComponent(post.slug)}`; }
function updateCopy() {
  const c = { ...copy(), ...ui() };
  document.querySelectorAll('[data-copy]').forEach((node) => {
    const key = node.dataset.copy;
    if (typeof c[key] === 'string') node.textContent = c[key];
  });
  search.placeholder = c.search;
  const today = document.querySelector('#journal-today');
  if (today) today.textContent = dateText(Date.now(), true);
  const issue = document.querySelector('#journal-issue');
  if (issue) issue.textContent = issueLabel(Date.now());
}
function categories() {
  const seen = new Map();
  for (const post of state.posts) if (!seen.has(post.category)) seen.set(post.category, categoryText(post));
  return [...seen.entries()];
}
function categoryCount(id) {
  return id === 'all' ? state.posts.length : state.posts.filter((post) => post.category === id).length;
}
function renderFilters() {
  const items = [['all', copy().all], ...categories()];
  filters.innerHTML = items.map(([id, label]) => `
    <button class="journal-filter" type="button" data-category="${escapeHtml(id)}" aria-pressed="${state.category === id}">${escapeHtml(label)}<span class="journal-filter-count">${categoryCount(id)}</span></button>
  `).join('');
  filters.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.category = button.dataset.category || 'all';
      renderFilters();
      renderList();
    });
  });
}

function matches(post) {
  if (state.category !== 'all' && post.category !== state.category) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [post.title, post.titleEn, post.excerpt, post.excerptEn, post.categoryLabel, post.categoryLabelEn, docNumber(post, state.posts), ...(post.values || [])].join(' ').toLowerCase();
  return haystack.includes(q);
}
function photoCaption(photo) {
  const caption = [photo.caption, photo.credit].filter(Boolean).map(escapeHtml).join(' · ');
  return caption ? `<figcaption>${caption}</figcaption>` : '';
}
function photoHtml(input, className = '') {
  const photo = approvedJournalPhoto(input);
  if (!photo) return '';
  return `<figure class="journal-photo ${className}"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt)}" loading="lazy" decoding="async">${photoCaption(photo)}</figure>`;
}
// 도서 글은 추상 무늬 대신 책 표지 카드(제목·저자)를 보여준다 — 실제 표지 이미지가 생기면 사진이 우선.
function bookCoverHtml(post, className = '') {
  const book = post.book;
  if (!book?.title) return '';
  return `<div class="journal-thumb journal-book-cover ${className} thumb-${Number(post.imageVariant) || 1}" role="img" aria-label="${escapeHtml(`『${book.title}』 표지`)}">
    <span class="book-cover-series">${escapeHtml(ui().book)}</span>
    <strong class="book-cover-title">${escapeHtml(book.title)}</strong>
    ${book.subtitle ? `<span class="book-cover-subtitle">${escapeHtml(book.subtitle)}</span>` : ''}
    <span class="book-cover-author">${escapeHtml(book.author || '')}</span>
  </div>`;
}
function coverHtml(post, className = '') {
  return photoHtml(post.coverPhoto, className)
    || bookCoverHtml(post, className)
    || `<div class="journal-thumb ${className} thumb-${Number(post.imageVariant) || 1}" aria-hidden="true"></div>`;
}
function safeHref(value) {
  try {
    const url = new URL(String(value || ''), location.origin);
    return url.protocol === 'https:' && (url.hostname === 'ekodi.kr' || url.origin === location.origin) ? url.href : '';
  } catch { return ''; }
}
function kicker(post) {
  return `<span class="kicker-type">${escapeHtml(postType(post.category, isKorean()))}</span><span class="kicker-cat">${escapeHtml(categoryText(post))}</span>`;
}

// 1면: 머리기사(A) + 편집부 추천 번호 목록(B) + 최신 기록 3단(A).
function frontHtml() {
  const posts = state.posts;
  if (!posts.length) return '';
  const lead = posts[0];
  const picks = [...posts.filter((p) => p.featured && p.slug !== lead.slug), ...posts.filter((p) => !p.featured && p.slug !== lead.slug)].slice(0, 4);
  const latest = posts.slice(1, 4);
  return `<section class="front-lead">
      <div class="front-lead-main">
        <div class="journal-kicker">${kicker(lead)}</div>
        <a href="${postUrl(lead)}" class="front-lead-link"><h2 class="front-lead-title">${escapeHtml(postText(lead, 'title'))}</h2></a>
        <p class="front-lead-deck">${escapeHtml(postText(lead, 'excerpt'))}</p>
        <div class="front-byline">${escapeHtml(ui().by)} · ${escapeHtml(lead.author?.name || 'EKODI Editorial')} <span>|</span> ${escapeHtml(dateText(lead.publishedAt))} <span>|</span> ${escapeHtml(String(lead.readMinutes))} ${escapeHtml(copy().min)} <span>|</span> ${escapeHtml(docNumber(lead, posts))}</div>
        <a href="${postUrl(lead)}" class="front-lead-visual">${coverHtml(lead, 'front-lead-cover')}</a>
      </div>
      <aside class="front-picks" aria-label="${escapeHtml(ui().picks)}">
        <h2 class="rule-title">${escapeHtml(ui().picks)}</h2>
        <ol>${picks.map((p, i) => `<li><span class="pick-no">${i + 1}</span><a href="${postUrl(p)}"><span class="pick-cat">${escapeHtml(categoryText(p))}</span><strong>${escapeHtml(postText(p, 'title'))}</strong></a></li>`).join('')}</ol>
        <div class="front-editor"><span>${escapeHtml(ui().editor)}</span><p>${escapeHtml(ui().editorBody)}</p></div>
      </aside>
    </section>
    ${latest.length ? `<section class="front-latest" aria-label="${escapeHtml(ui().latest)}">${latest.map((p) => `<a class="front-latest-item" href="${postUrl(p)}">
      <div class="journal-kicker">${kicker(p)}</div>
      <h3>${escapeHtml(postText(p, 'title'))}</h3>
      <p>${escapeHtml(postText(p, 'excerpt'))}</p>
      <span class="front-latest-meta">${escapeHtml(dateText(p.publishedAt))} · ${escapeHtml(String(p.readMinutes))} ${escapeHtml(copy().min)}</span>
    </a>`).join('')}</section>` : ''}`;
}

function renderList() {
  if (!state.loaded) {
    empty.hidden = true;
    front.innerHTML = '';
    list.innerHTML = `<p class="journal-status" role="status">${escapeHtml(ui().loading)}</p>`;
    return;
  }
  if (state.failed) {
    empty.hidden = true;
    front.innerHTML = '';
    list.innerHTML = `<div class="journal-status" role="alert"><p>${escapeHtml(ui().failed)}</p><button type="button" class="journal-retry">${escapeHtml(ui().retry)}</button></div>`;
    list.querySelector('.journal-retry')?.addEventListener('click', () => boot());
    return;
  }
  const browsing = state.category !== 'all' || state.query.trim();
  front.innerHTML = browsing ? '' : frontHtml();
  const posts = state.posts.filter(matches);
  empty.hidden = posts.length > 0;
  if (count) count.textContent = ui().count(posts.length);
  // 모든 기록(C): 문서번호·유형·날짜·제목·요약 목록.
  list.innerHTML = posts.map((post) => {
    const values = (post.values || []).map((value) => `<span class="journal-value">${escapeHtml(value)}</span>`).join('');
    return `<a class="journal-card" href="${postUrl(post)}">
      ${coverHtml(post, "journal-card-cover")}
      <div class="journal-card-copy">
        <div class="journal-card-meta"><strong>${escapeHtml(postType(post.category, isKorean()))}</strong><span>${escapeHtml(categoryText(post))}</span><span>${escapeHtml(dateText(post.publishedAt))}</span><span class="journal-docno">${escapeHtml(docNumber(post, state.posts))}</span></div>
        <h2>${escapeHtml(postText(post, 'title'))}</h2>
        <p class="journal-card-excerpt">${escapeHtml(postText(post, 'excerpt'))}</p>
        <div class="journal-values">${values}<span class="journal-read">${escapeHtml(String(post.readMinutes))} ${escapeHtml(copy().min)}</span></div>
      </div>
    </a>`;
  }).join('');
}

function bodyHtml(blocks = []) {
  return blocks.map((block) => {
    if (block.type === 'photo') return photoHtml(block.photo, 'journal-body-photo');
    if (block.type === 'heading') return `<h2>${escapeHtml(block.text)}</h2>`;
    if (block.type === 'quote') return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
    if (block.type === 'list') return `<ul>${(block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    if (block.type === 'cta') {
      const href = safeHref(block.href);
      const textOnly = String(block.text || '').replace(/:?\s*https?:\/\/\S+\s*$/, '');
      return href
        ? `<aside class="article-cta"><p>${escapeHtml(textOnly)}</p><a class="article-cta-button" href="${escapeHtml(href)}">${escapeHtml(block.label || href)} →</a></aside>`
        : `<p>${escapeHtml(block.text)}</p>`;
    }
    const cls = block.type === 'lead' ? ' class="lead"' : '';
    return `<p${cls}>${escapeHtml(block.text)}</p>`;
  }).join('');
}
function neighbours(post) {
  const index = state.posts.findIndex((item) => item.slug === post.slug);
  const related = state.posts.filter((item) => item.slug !== post.slug && item.category === post.category).slice(0, 3);
  const fill = state.posts.filter((item) => item.slug !== post.slug && !related.includes(item)).slice(0, 3 - related.length);
  return { newer: index > 0 ? state.posts[index - 1] : null, older: index >= 0 && index < state.posts.length - 1 ? state.posts[index + 1] : null, related: [...related, ...fill] };
}
function miniCard(post) {
  return `<a class="journal-mini" href="/journal/p/${encodeURIComponent(post.slug)}"><span>${escapeHtml(categoryText(post))} · ${escapeHtml(dateText(post.publishedAt))}</span><strong>${escapeHtml(postText(post, 'title'))}</strong></a>`;
}
function letterHref(post) {
  const subject = `[에코디저널] ${docNumber(post, state.posts)} ${post.title}`;
  const body = `글 주소: https://ekodi.kr${postUrl(post)}\n\n의견·질문·정정 요청을 적어 주세요.\n`;
  return `mailto:${JOURNAL_DESK.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function articleFooterHtml(post) {
  const { newer, older, related } = neighbours(post);
  const nav = [
    older ? `<a class="article-nav-link" href="${postUrl(older)}"><span>← ${escapeHtml(ui().prev)}</span><strong>${escapeHtml(postText(older, 'title'))}</strong></a>` : '<span></span>',
    newer ? `<a class="article-nav-link is-next" href="${postUrl(newer)}"><span>${escapeHtml(ui().next)} →</span><strong>${escapeHtml(postText(newer, 'title'))}</strong></a>` : '<span></span>',
  ].join('');
  return `<div class="article-actions">
      <button type="button" class="article-share">${escapeHtml(ui().share)}</button>
      <button type="button" class="article-cite">${escapeHtml(ui().cite)}</button>
      <button type="button" class="article-print">${escapeHtml(ui().print)}</button>
      <span class="article-share-status" role="status" aria-live="polite"></span>
    </div>
    <section class="article-reader" aria-label="${escapeHtml(ui().readerTitle)}">
      <h2>${escapeHtml(ui().readerTitle)}</h2>
      <p>${escapeHtml(ui().readerBody)}</p>
      <div class="article-reader-actions">
        <a class="article-reader-button is-primary" href="${escapeHtml(letterHref(post))}">${escapeHtml(ui().correction)}</a>
        <a class="article-reader-button" href="https://ekodi.kr/community/">${escapeHtml(ui().talk)}</a>
      </div>
      <span class="article-reader-desk">${escapeHtml(JOURNAL_DESK.name)} · ${escapeHtml(JOURNAL_DESK.email)}</span>
    </section>
    <nav class="article-nav" aria-label="${escapeHtml(ui().prev)} / ${escapeHtml(ui().next)}">${nav}</nav>
    ${related.length ? `<section class="article-related"><h2>${escapeHtml(ui().related)}</h2><div class="journal-mini-grid">${related.map(miniCard).join('')}</div></section>` : ''}`;
}
function setMeta(selector, attr, value) {
  const node = document.querySelector(selector);
  if (node) node.setAttribute(attr, value);
}
async function copyText(text, message) {
  const status = article.querySelector('.article-share-status');
  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = message;
  } catch { if (status) status.textContent = text; }
}
function renderArticle(post) {
  const title = postText(post, 'title');
  const excerpt = postText(post, 'excerpt');
  const blocks = isKorean() ? post.body : (post.bodyEn || post.body || []);
  const url = `https://ekodi.kr/journal/p/${encodeURIComponent(post.slug)}`;
  const doc = docNumber(post, state.posts.length ? state.posts : [post]);
  article.innerHTML = `
    <div class="article-meta">${kicker(post)}<span class="journal-docno">${escapeHtml(doc)}</span></div>
    <h1 class="article-title">${escapeHtml(title)}</h1>
    <p class="article-deck">${escapeHtml(excerpt)}</p>
    <div class="article-byline"><strong>${escapeHtml(post.author?.name || 'EKODI Editorial')}</strong><span>${escapeHtml(dateText(post.publishedAt))}</span><span>${escapeHtml(String(post.readMinutes))} ${escapeHtml(copy().min)}</span><span>${escapeHtml(issueLabel(post.publishedAt))}</span>${(post.values || []).length ? `<span>${(post.values || []).map(escapeHtml).join(' · ')}</span>` : ''}</div>
    ${coverHtml(post, "article-visual")}
    <div class="article-body">${bodyHtml(blocks)}</div>
    ${post.author?.disclosure ? `<p class="article-disclosure"><strong>${escapeHtml(ui().note)}</strong> — ${escapeHtml(post.author.disclosure)}</p>` : ''}
    ${articleFooterHtml(post)}
  `;
  article.querySelector('.article-share')?.addEventListener('click', async () => {
    try {
      if (navigator.share) { await navigator.share({ title, text: excerpt, url }); return; }
    } catch { return; }
    copyText(url, ui().copied);
  });
  article.querySelector('.article-cite')?.addEventListener('click', () => copyText(citation(post, state.posts.length ? state.posts : [post]), ui().citeCopied));
  article.querySelector('.article-print')?.addEventListener('click', () => window.print());
  document.title = `${title} | EKODI Journal`;
  setMeta('link[rel="canonical"]', 'href', url);
  setMeta('meta[name="description"]', 'content', excerpt);
  setMeta('meta[property="og:title"]', 'content', `${title} | EKODI Journal`);
  setMeta('meta[property="og:description"]', 'content', excerpt);
  setMeta('meta[property="og:url"]', 'content', url);
}

const progress = document.createElement('div');
progress.className = 'journal-progress';
progress.setAttribute('aria-hidden', 'true');
document.body.appendChild(progress);
function updateProgress() {
  if (articleView.hidden) { progress.style.transform = 'scaleX(0)'; return; }
  const rect = article.getBoundingClientRect();
  const total = Math.max(1, rect.height - window.innerHeight * 0.6);
  const ratio = Math.min(1, Math.max(0, -rect.top / total));
  progress.style.transform = `scaleX(${ratio})`;
}
window.addEventListener('scroll', updateProgress, { passive: true });

async function showRoute() {
  const match = location.pathname.match(/^\/journal\/p\/([^/]+)\/?$/);
  if (!match) {
    document.body.classList.remove('journal-is-article');
    articleView.hidden = true;
    listView.hidden = false;
    document.title = 'EKODI Journal';
    renderFilters();
    renderList();
    return;
  }
  try {
    const response = await fetch(`/journal/api/posts/${encodeURIComponent(decodeURIComponent(match[1]))}`);
    if (!response.ok) throw new Error('not_found');
    const data = await response.json();
    listView.hidden = true;
    articleView.hidden = false;
    document.body.classList.add('journal-is-article');
    renderArticle(data.post);
    window.scrollTo({ top: 0, behavior: 'instant' });
    updateProgress();
  } catch {
    location.replace('/journal/');
  }
}

function applyLocale(locale) {
  state.locale = normalizeLocale(locale);
  document.documentElement.lang = state.locale;
  updateCopy();
  showRoute();
}

async function boot() {
  state.loaded = false;
  state.failed = false;
  if (!location.pathname.match(/^\/journal\/p\//)) renderList();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch('/journal/api/posts');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.posts = Array.isArray(data.posts) ? data.posts : [];
      state.failed = false;
      break;
    } catch {
      state.posts = [];
      state.failed = true;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  state.loaded = true;
  const shellLocale = window.EKODIUserLanguage?.getLocale?.();
  applyLocale(shellLocale || document.documentElement.lang || navigator.language);
}
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.target.closest('input, textarea, [contenteditable="true"]')) return;
  if (listView.hidden) return;
  event.preventDefault();
  search.focus();
});
search.addEventListener('input', () => {
  state.query = search.value;
  renderList();
});
window.addEventListener('ekodi:locale-change', (event) => applyLocale(event.detail?.locale));
window.addEventListener('popstate', showRoute);
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/journal/p/"]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.pushState({}, '', link.href);
  showRoute();
});

document.querySelector('.journal-back')?.addEventListener('click', (event) => {
  if (location.origin !== new URL(event.currentTarget.href, location.href).origin) return;
  event.preventDefault();
  history.pushState({}, '', '/journal/');
  showRoute();
});

boot();
