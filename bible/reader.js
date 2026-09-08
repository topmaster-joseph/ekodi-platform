import { BOOKS } from './books.js';

const $ = selector => document.querySelector(selector);
const BASE_PATH = '/bible';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

async function fetchJson(path) {
  const response = await fetch(BASE_PATH + path, { headers:{ accept:'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
}

function setHidden(node, hidden) {
  node?.classList.toggle('hidden', hidden);
}

function renderPassage(data) {
  const panel = $('#biblePassage');
  const link = $('#bibleOfficialLink');
  setHidden(panel, false);
  $('#bibleCitation').textContent = data.citation || `${data.book?.name || ''} ${data.chapter || ''}`.trim();
  $('#bibleAttribution').textContent = data.attribution || data.provider?.attribution || '';
  $('#bibleReaderNotice').textContent = data.notice || '';
  if (data.mode === 'official-link-only') {
    $('#bibleVerses').innerHTML = '<p>이 번역본의 본문은 에코디에 복제하지 않습니다. 공식 성경 플랫폼에서 안전하게 이어서 읽을 수 있습니다.</p>';
    link.href = data.officialUrl;
    setHidden(link, false);
    return;
  }  setHidden(link, true);
  $('#bibleVerses').innerHTML = (data.verses || []).map(verse => `<p><sup>${verse.verse}</sup> ${esc(verse.text)}</p>`).join('');
}

function renderSearch(data) {
  const host = $('#bibleSearchResults');
  const rows = data.results || [];
  host.innerHTML = rows.length ? rows.map(row => `
    <article class="record bible-search-hit" data-book="${row.bookId}" data-chapter="${row.chapter}" data-verse="${row.verse}">
      <span class="meta">${esc(row.citation)}</span>
      <p>${esc(row.text)}</p>
      <button class="ghost" type="button">이 구절 열기</button>
    </article>`).join('') : '<div class="empty">검색 결과가 없습니다.</div>';
  host.querySelectorAll('.bible-search-hit').forEach(card => {
    card.querySelector('button').onclick = () => {
      $('#bibleBook').value = card.dataset.book;
      $('#bibleChapter').value = card.dataset.chapter;
      $('#bibleVerseStart').value = card.dataset.verse;
      $('#bibleVerseEnd').value = card.dataset.verse;
      $('#bibleReaderForm').requestSubmit();
      $('#bibleReaderForm').scrollIntoView({ behavior:'smooth', block:'start' });
    };
  });
}

function readerParams(form) {
  const data = new FormData(form);
  const params = new URLSearchParams({
    provider:String(data.get('provider') || 'KRV1961'),
    book:String(data.get('book') || 'GEN'),
    chapter:String(data.get('chapter') || '1'),
  });  const start = String(data.get('verseStart') || '').trim();
  const end = String(data.get('verseEnd') || '').trim();
  if (start) params.set('verseStart', start);
  if (end) params.set('verseEnd', end);
  return params;
}

export async function initBibleReader() {
  const providerSelect = $('#bibleProvider');
  const bookSelect = $('#bibleBook');
  if (!providerSelect || !bookSelect) return;
  bookSelect.innerHTML = BOOKS.map(book => `<option value="${book.id}">${esc(book.ko)}</option>`).join('');
  try {
    const catalog = await fetchJson('/api/bible/providers');
    providerSelect.innerHTML = catalog.providers.map(provider => `<option value="${provider.id}"${provider.default ? ' selected' : ''}>${esc(provider.label)}${provider.mode === 'official-link-only' ? ' · 공식링크' : ''}</option>`).join('');
  } catch (error) {
    console.error('Bible provider catalog', error);
    providerSelect.innerHTML = '<option value="KRV1961">개역한글</option><option value="NKRV">개역개정 · 공식링크</option>';
  }

  $('#bibleReaderForm').onsubmit = async event => {
    event.preventDefault();
    $('#bibleReaderNotice').textContent = '본문을 불러오는 중입니다.';
    try {
      const data = await fetchJson(`/api/bible/passage?${readerParams(event.currentTarget)}`);
      renderPassage(data);
    } catch (error) {
      console.error('Bible passage', error);
      $('#bibleReaderNotice').textContent = '본문을 불러오지 못했습니다. 성경과 장·절을 확인해 주세요.';
      setHidden($('#biblePassage'), true);
    }
  };
  $('#bibleSearchForm').onsubmit = async event => {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('q') || '').trim();
    const host = $('#bibleSearchResults');
    host.innerHTML = '<div class="empty">검색 중입니다.</div>';
    try {
      const data = await fetchJson(`/api/bible/search?q=${encodeURIComponent(query)}&limit=30`);
      renderSearch(data);
    } catch (error) {
      console.error('Bible search', error);
      host.innerHTML = '<div class="empty">검색하지 못했습니다. 두 글자 이상 입력해 주세요.</div>';
    }
  };

  providerSelect.onchange = () => {
    $('#bibleReaderNotice').textContent = providerSelect.value === 'NKRV'
      ? '개역개정은 대한성서공회 공식 본문으로 연결합니다.'
      : '개역한글 본문은 원문 그대로 제공됩니다.';
  };
  $('#bibleReaderForm').requestSubmit();
}