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

const state = { posts: [], category: 'all', query: '', locale: 'ko-KR' };
const listView = document.querySelector('#journal-list-view');
const articleView = document.querySelector('#journal-article-view');
const list = document.querySelector('#journal-list');
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
function dateText(value) {
  return new Intl.DateTimeFormat(state.locale, { year:'numeric', month:'short', day:'numeric' }).format(new Date(value));
}
function updateCopy() {
  const c = copy();
  document.querySelectorAll('[data-copy]').forEach((node) => {
    const key = node.dataset.copy;
    if (c[key]) node.textContent = c[key];
  });
  search.placeholder = c.search;
}
function categories() {
  const seen = new Map();
  for (const post of state.posts) {
    const label = isKorean() ? post.categoryLabel : (post.categoryLabelEn || post.categoryLabel);
    if (!seen.has(post.category)) seen.set(post.category, label);
  }
  return [...seen.entries()];
}

function renderFilters() {
  const items = [['all', copy().all], ...categories()];
  filters.innerHTML = items.map(([id, label]) => `
    <button class="journal-filter" type="button" data-category="${escapeHtml(id)}" aria-pressed="${state.category === id}">${escapeHtml(label)}</button>
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
  const haystack = [post.title, post.titleEn, post.excerpt, post.excerptEn, post.categoryLabel, post.categoryLabelEn, ...(post.values || [])].join(' ').toLowerCase();
  return haystack.includes(q);
}
function renderList() {
  const posts = state.posts.filter(matches);
  empty.hidden = posts.length > 0;
  list.innerHTML = posts.map((post) => {
    const values = (post.values || []).map((value) => `<span class="journal-value">${escapeHtml(value)}</span>`).join('');
    const title = postText(post, 'title');
    const excerpt = postText(post, 'excerpt');
    const category = isKorean() ? post.categoryLabel : (post.categoryLabelEn || post.categoryLabel);
    return `<a class="journal-card" href="/p/${encodeURIComponent(post.slug)}">
      <div class="journal-thumb thumb-${Number(post.imageVariant) || 1}" aria-hidden="true"></div>
      <div class="journal-card-copy">
        <div class="journal-card-meta"><strong>${escapeHtml(category)}</strong><span>${escapeHtml(dateText(post.publishedAt))}</span><span>${escapeHtml(String(post.readMinutes))} ${escapeHtml(copy().min)}</span></div>
        <h2>${escapeHtml(title)}</h2>
        <p class="journal-card-excerpt">${escapeHtml(excerpt)}</p>
        <div class="journal-values">${values}</div>
      </div>
    </a>`;
  }).join('');
}

function bodyHtml(blocks = []) {
  return blocks.map((block) => {
    if (block.type === 'heading') return `<h2>${escapeHtml(block.text)}</h2>`;
    if (block.type === 'quote') return `<blockquote>${escapeHtml(block.text)}</blockquote>`;
    if (block.type === 'list') return `<ul>${(block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    const cls = block.type === 'lead' ? ' class="lead"' : '';
    return `<p${cls}>${escapeHtml(block.text)}</p>`;
  }).join('');
}
function renderArticle(post) {
  const title = postText(post, 'title');
  const excerpt = postText(post, 'excerpt');
  const category = isKorean() ? post.categoryLabel : (post.categoryLabelEn || post.categoryLabel);
  const blocks = isKorean() ? post.body : (post.bodyEn || post.body || []);
  article.innerHTML = `
    <div class="article-meta">${escapeHtml(category)} · ${escapeHtml(dateText(post.publishedAt))}</div>
    <h1 class="article-title">${escapeHtml(title)}</h1>
    <p class="article-deck">${escapeHtml(excerpt)}</p>
    <div class="article-byline"><span>${escapeHtml(post.author?.name || 'EKODI Editorial')}</span><span>${escapeHtml(String(post.readMinutes))} ${escapeHtml(copy().min)}</span><span>${escapeHtml(copy().original)}</span></div>
    <div class="journal-thumb article-visual thumb-${Number(post.imageVariant) || 1}" aria-hidden="true"></div>
    <div class="article-body">${bodyHtml(blocks)}</div>
    <p class="article-disclosure">${escapeHtml(post.author?.disclosure || '')}</p>
  `;
  document.title = `${title} | EKODI Journal`;
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.href = `https://journal.ekodi.kr/p/${encodeURIComponent(post.slug)}`;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = excerpt;
}

async function showRoute() {
  const match = location.pathname.match(/^\/p\/([^/]+)\/?$/);
  if (!match) {
    articleView.hidden = true;
    listView.hidden = false;
    document.title = 'EKODI Journal';
    renderFilters();
    renderList();
    return;
  }
  try {
    const response = await fetch(`/api/posts/${encodeURIComponent(decodeURIComponent(match[1]))}`);
    if (!response.ok) throw new Error('not_found');
    const data = await response.json();
    listView.hidden = true;
    articleView.hidden = false;
    renderArticle(data.post);
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch {
    location.replace('/');
  }
}

function applyLocale(locale) {
  state.locale = normalizeLocale(locale);
  document.documentElement.lang = state.locale;
  updateCopy();
  showRoute();
}

async function boot() {
  try {
    const response = await fetch('/api/posts');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.posts = Array.isArray(data.posts) ? data.posts : [];
  } catch {
    state.posts = [];
  }
  const shellLocale = window.EKODIUserLanguage?.getLocale?.();
  applyLocale(shellLocale || document.documentElement.lang || navigator.language);
}
search.addEventListener('input', () => {
  state.query = search.value;
  renderList();
});
window.addEventListener('ekodi:locale-change', (event) => applyLocale(event.detail?.locale));
window.addEventListener('popstate', showRoute);
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/p/"]');
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.pushState({}, '', link.href);
  showRoute();
});

document.querySelector('.journal-back')?.addEventListener('click', (event) => {
  if (location.origin !== new URL(event.currentTarget.href, location.href).origin) return;
  event.preventDefault();
  history.pushState({}, '', '/');
  showRoute();
});

boot();
