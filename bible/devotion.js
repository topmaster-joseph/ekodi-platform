// EKODI 오늘의 매일묵상 — shared renderer for /bible, /ekodichurch and /ekodimission.
// Each host page provides its own header/footer and a mount:
//   <div data-ekodi-devotion data-base="/ekodichurch/devotion/" data-date-mode="query" data-site-label="에코디교회"></div>
// Tabs show one activity at a time; the URL hash (#poem, #song …) selects the tab so shared links open it directly.
const API = '/bible/api/bible/devotion';
const ORIGIN = 'https://ekodi.kr';
const TABS = Object.freeze([
  { id: 'passage', label: '본문' },
  { id: 'poem', label: '묵상 시' },
  { id: 'song', label: '묵상 노래' },
  { id: 'questions', label: '적용 질문' },
  { id: 'family', label: '가정·어린이' },
  { id: 'action', label: '오늘의 실천' },
  { id: 'prayer', label: '기도' },
  { id: 'mine', label: '나의 한 줄' },
]);
const TAB_IDS = new Set(TABS.map(tab => tab.id));

const mount = document.querySelector('[data-ekodi-devotion]');
if (mount) boot(mount);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}
function storageGet(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function storageSet(key, value) { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch {} }
function koreanDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

function boot(root) {
  const rawBase = root.dataset.base || '/bible/devotion';
  const base = rawBase.replace(/\/+$/, '');
  const dateMode = root.dataset.dateMode === 'query' ? 'query' : 'path';
  const siteLabel = root.dataset.siteLabel || '에코디';
  const pageUrl = date => dateMode === 'query' ? `${rawBase}?date=${date}` : `${base}/${date}`;
  const shareUrl = (date, hash) => `${ORIGIN}${pageUrl(date)}${hash ? `#${hash}` : ''}`;
  let current = null;
  let activeTab = 'passage';

  root.classList.add('ekodi-devotion');
  root.innerHTML = '';
  const datebar = el('nav', 'dv-datebar');
  datebar.setAttribute('aria-label', '날짜 이동');
  const prev = el('a', 'dv-date-link', '‹ 이전');
  const dateLabel = el('strong', 'dv-date', '불러오는 중');
  const next = el('a', 'dv-date-link', '다음 ›');
  datebar.append(prev, dateLabel, next);
  const status = el('p', 'dv-status');
  status.setAttribute('role', 'status');

  const summary = el('section', 'dv-summary');
  const passageTitle = el('h2', 'dv-passage');
  const theme = el('p', 'dv-theme');
  const keyLine = el('p', 'dv-keyline');
  const shareRow = el('div', 'dv-share-row');
  const shareAll = el('button', 'dv-btn dv-btn-primary', '카카오톡 등으로 공유');
  shareAll.type = 'button';
  shareAll.dataset.share = 'page';
  const copyAll = el('button', 'dv-btn', '링크 복사');
  copyAll.type = 'button';
  copyAll.dataset.copy = 'page';
  shareRow.append(shareAll, copyAll);
  summary.append(el('small', 'dv-kicker', '오늘의 공통본문'), passageTitle, theme, keyLine, shareRow);

  const tabbar = el('div', 'dv-tabs');
  tabbar.setAttribute('role', 'tablist');
  tabbar.setAttribute('aria-label', '묵상 활동');
  const panels = new Map();
  const tabButtons = new Map();
  const panelWrap = el('div', 'dv-panels');
  for (const tab of TABS) {
    const button = el('button', 'dv-tab', tab.label);
    button.type = 'button';
    button.id = `dv-tab-${tab.id}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', `dv-panel-${tab.id}`);
    button.dataset.tab = tab.id;
    tabButtons.set(tab.id, button);
    tabbar.append(button);
    const panel = el('section', 'dv-panel');
    panel.id = `dv-panel-${tab.id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.hidden = true;
    panels.set(tab.id, panel);
    panelWrap.append(panel);
  }
  const notice = el('p', 'dv-notice');
  const toastEl = el('p', 'dv-toast');
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  root.append(datebar, status, summary, tabbar, panelWrap, notice, toastEl);

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  function panelHead(panel, title, shareKind) {
    const head = el('div', 'dv-panel-head');
    head.append(el('h3', '', title));
    if (shareKind) {
      const button = el('button', 'dv-mini', '이것만 공유');
      button.type = 'button';
      button.dataset.share = shareKind;
      head.append(button);
    }
    panel.append(head);
  }

  function selectTab(id, { updateHash = true } = {}) {
    if (!TAB_IDS.has(id) || tabButtons.get(id)?.hidden) id = 'passage';
    activeTab = id;
    for (const [tabId, button] of tabButtons) {
      const on = tabId === id;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
      button.tabIndex = on ? 0 : -1;
      panels.get(tabId).hidden = !on;
    }
    if (updateHash) history.replaceState(null, '', `${location.pathname}${location.search}${id === 'passage' ? '' : `#${id}`}`);
  }

  function renderPassage(panel, data) {
    panelHead(panel, `${data.passage} (개역한글)`);
    const blocks = (data.scripture || []).filter(part => part?.ok && part.verses?.length);
    if (!blocks.length) {
      const link = el('a', 'dv-btn', '성경읽기에서 본문 열기');
      link.href = '/bible/reader';
      panel.append(link);
      return;
    }
    const verses = el('div', 'dv-verses');
    for (const part of blocks) {
      if (blocks.length > 1) verses.append(el('p', 'dv-chapter', `${part.book.name} ${part.chapter}장`));
      for (const verse of part.verses) {
        const p = el('p');
        p.append(el('sup', '', String(verse.verse)), ' ', verse.text);
        verses.append(p);
      }
    }
    panel.append(verses, el('p', 'dv-meta', blocks[0].attribution || ''));
  }

  function render(data) {
    current = data;
    dateLabel.textContent = koreanDate(data.date);
    prev.href = pageUrl(data.prevDate);
    next.href = pageUrl(data.nextDate);
    for (const panel of panels.values()) panel.replaceChildren();
    if (!data.found) {
      status.textContent = data.error === 'scripture_not_registered'
        ? '이 날짜의 공통본문이 아직 등록되지 않았습니다. 다른 날짜를 선택해 주세요.'
        : '날짜 형식을 확인해 주세요.';
      summary.hidden = tabbar.hidden = panelWrap.hidden = true;
      return;
    }
    status.textContent = '';
    summary.hidden = tabbar.hidden = panelWrap.hidden = false;
    const a = data.activities;
    passageTitle.textContent = data.passage;
    theme.textContent = a.theme;
    keyLine.textContent = a.keyLine;

    renderPassage(panels.get('passage'), data);

    tabButtons.get('poem').hidden = !a.poem;
    if (a.poem) {
      const panel = panels.get('poem');
      panelHead(panel, a.poem.title, 'poem');
      const poem = el('div', 'dv-poem');
      for (const line of a.poem.lines) poem.append(el('p', '', line));
      panel.append(poem);
    }
    tabButtons.get('song').hidden = !a.song;
    if (a.song) {
      const panel = panels.get('song');
      panelHead(panel, a.song.title, 'song');
      panel.append(el('p', 'dv-meta', `분위기 · ${a.song.mood}`));
      const verse = el('div', 'dv-song');
      for (const line of a.song.verse) verse.append(el('p', '', line));
      const refrain = el('div', 'dv-refrain');
      refrain.append(el('small', '', '후렴'));
      for (const line of a.song.refrain) refrain.append(el('p', '', line));
      panel.append(verse, refrain, el('p', 'dv-meta', '자유롭게 곡을 붙여 불러 보세요. 가족·소그룹이 함께 만든 곡조도 좋은 고백이 됩니다.'));
    }
    {
      const panel = panels.get('questions');
      panelHead(panel, '삶에 비추어 묻기', 'questions');
      const list = el('ol', 'dv-questions');
      for (const q of a.questions) {
        const li = el('li');
        li.append(el('span', 'dv-tag', q.kind), ' ', q.text);
        list.append(li);
      }
      panel.append(list);
    }
    {
      const panel = panels.get('family');
      panelHead(panel, '가정·어린이와 함께', 'family');
      panel.append(el('p', 'dv-body', a.family));
    }
    {
      const panel = panels.get('action');
      panelHead(panel, '오늘의 실천', 'action');
      const label = el('label', 'dv-check');
      const box = el('input');
      box.type = 'checkbox';
      const doneKey = `ekodi-devotion-done-${data.date}`;
      box.checked = storageGet(doneKey) === '1';
      box.addEventListener('change', () => storageSet(doneKey, box.checked ? '1' : ''));
      label.append(box, el('span', '', a.action));
      panel.append(label, el('p', 'dv-meta', '체크 표시는 이 기기에만 저장됩니다.'));
    }
    {
      const panel = panels.get('prayer');
      panelHead(panel, '한 줄 기도', 'prayer');
      panel.append(el('p', 'dv-prayer', a.prayer));
    }
    {
      const panel = panels.get('mine');
      panelHead(panel, '나의 묵상 한 줄');
      panel.append(el('p', 'dv-meta', '이 기기에만 저장됩니다. 공유는 직접 누를 때만 이루어집니다.'));
      const area = el('textarea', 'dv-mine');
      area.rows = 3;
      area.maxLength = 500;
      area.placeholder = '오늘 말씀 앞에서 붙든 한 문장을 적어 보세요';
      const mineKey = `ekodi-devotion-mine-${data.date}`;
      area.value = storageGet(mineKey);
      area.addEventListener('input', () => storageSet(mineKey, area.value));
      const row = el('div', 'dv-share-row');
      const share = el('button', 'dv-btn dv-btn-primary', '나의 한 줄 공유');
      share.type = 'button';
      share.dataset.share = 'mine';
      row.append(share);
      panel.append(area, row);
    }
    notice.textContent = `${data.notice}${data.activitySource === 'fallback' ? ' 이 날짜는 기본 묵상 활동을 제공합니다.' : ''}`;
    selectTab(location.hash.slice(1) || 'passage', { updateHash: false });
  }

  function shareBody(kind) {
    const d = current;
    const a = d.activities;
    const [, m, day] = d.date.split('-').map(Number);
    const head = `[${siteLabel} 오늘의 매일묵상 ${m}/${day}] ${d.passage}`;
    switch (kind) {
      case 'poem': return { title: a.poem.title, text: `${head}\n\n〈${a.poem.title}〉\n${a.poem.lines.join('\n')}`, hash: 'poem' };
      case 'song': return { title: a.song.title, text: `${head}\n\n♪ ${a.song.title}\n${a.song.verse.join('\n')}\n(후렴) ${a.song.refrain.join(' / ')}`, hash: 'song' };
      case 'questions': return { title: '적용 질문', text: `${head}\n\n${a.questions.map((q, i) => `${i + 1}. [${q.kind}] ${q.text}`).join('\n')}`, hash: 'questions' };
      case 'family': return { title: '가정·어린이 질문', text: `${head}\n\n👨‍👩‍👧 ${a.family}`, hash: 'family' };
      case 'action': return { title: '오늘의 실천', text: `${head}\n\n✔ 오늘의 실천: ${a.action}`, hash: 'action' };
      case 'prayer': return { title: '한 줄 기도', text: `${head}\n\n🙏 ${a.prayer}`, hash: 'prayer' };
      case 'mine': {
        const mine = panels.get('mine').querySelector('textarea')?.value.trim();
        if (!mine) return null;
        return { title: '나의 묵상 한 줄', text: `${head}\n\n✍ ${mine}`, hash: '' };
      }
      default: return { title: `${siteLabel} 오늘의 매일묵상 · ${d.passage}`, text: `${head}\n${a.keyLine}`, hash: '' };
    }
  }

  async function copy(value) {
    try { await navigator.clipboard.writeText(value); return true; } catch {}
    const area = el('textarea', 'dv-offscreen');
    area.value = value;
    area.setAttribute('readonly', '');
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    area.remove();
    return ok;
  }

  async function share(kind, copyOnly = false) {
    if (!current?.found) return;
    const body = shareBody(kind);
    if (!body) { toast('먼저 나의 한 줄을 적어 주세요.'); panels.get('mine').querySelector('textarea')?.focus(); return; }
    const url = shareUrl(current.date, body.hash);
    if (copyOnly) { toast(await copy(url) ? '링크를 복사했습니다. 카카오톡 대화방에 붙여 넣어 주세요.' : url); return; }
    if (navigator.share) {
      try { await navigator.share({ title: body.title, text: body.text, url }); return; }
      catch (error) { if (error?.name === 'AbortError') return; }
    }
    toast(await copy(`${body.text}\n\n${url}`) ? '내용과 링크를 복사했습니다. 카카오톡에 붙여 넣어 주세요.' : url);
  }

  root.addEventListener('click', event => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { selectTab(tab.dataset.tab); return; }
    const shareButton = event.target.closest('[data-share]');
    if (shareButton) { share(shareButton.dataset.share); return; }
    const copyButton = event.target.closest('[data-copy]');
    if (copyButton) share(copyButton.dataset.copy, true);
  });
  tabbar.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft'].includes(event.key)) return;
    const visible = TABS.map(t => t.id).filter(id => !tabButtons.get(id).hidden);
    const index = visible.indexOf(activeTab);
    const nextId = visible[(index + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length];
    selectTab(nextId);
    tabButtons.get(nextId).focus();
  });
  window.addEventListener('hashchange', () => { if (current?.found) selectTab(location.hash.slice(1) || 'passage', { updateHash: false }); });

  function requestedDate() {
    const match = location.pathname.match(/\/devotion\/(\d{4}-\d{2}-\d{2})\/?$/);
    if (match) return match[1];
    const query = new URLSearchParams(location.search).get('date');
    return /^\d{4}-\d{2}-\d{2}$/.test(query || '') ? query : '';
  }

  (async () => {
    const date = requestedDate();
    try {
      const response = await fetch(`${API}${date ? `?date=${date}` : ''}`, { cache: 'no-store' });
      const data = await response.json();
      if (!date && data.date && dateMode === 'path') history.replaceState(null, '', `${pageUrl(data.date)}${location.hash}`);
      render(data);
    } catch (error) {
      status.textContent = `묵상을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. (${error.message})`;
    }
  })();
}
