const API = '/bible/api/bible/devotion';
const BASE = '/bible/devotion';
const $ = id => document.getElementById(id);
let current = null;

function requestedDate() {
  const match = location.pathname.match(/\/devotion\/(\d{4}-\d{2}-\d{2})\/?$/);
  if (match) return match[1];
  const query = new URLSearchParams(location.search).get('date');
  return /^\d{4}-\d{2}-\d{2}$/.test(query || '') ? query : '';
}

function koreanDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

function text(id, value) { const el = $(id); if (el) el.textContent = value || ''; }

function lines(container, list, className) {
  container.replaceChildren(...(list || []).map(line => {
    const p = document.createElement('p');
    if (className) p.className = className;
    p.textContent = line;
    return p;
  }));
}

function storageGet(key) { try { return localStorage.getItem(key) || ''; } catch { return ''; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }

function toast(message) {
  const el = $('dvToast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
}

function renderVerses(scripture) {
  const box = $('dvVerses');
  const blocks = (scripture || []).filter(part => part?.ok && part.verses?.length);
  if (!blocks.length) {
    box.replaceChildren();
    const a = document.createElement('a');
    a.href = `/bible/reader`;
    a.textContent = '성경읽기에서 본문 열기';
    box.append(a);
    text('dvAttribution', '');
    return;
  }
  const nodes = [];
  for (const part of blocks) {
    const head = document.createElement('p');
    head.className = 'dv-chapter';
    head.textContent = `${part.book.name} ${part.chapter}장`;
    nodes.push(head);
    for (const verse of part.verses) {
      const p = document.createElement('p');
      const num = document.createElement('sup');
      num.textContent = verse.verse;
      p.append(num, ' ', verse.text);
      nodes.push(p);
    }
  }
  box.replaceChildren(...nodes);
  text('dvAttribution', blocks[0].attribution || '');
}

function render(data) {
  current = data;
  text('dvDate', koreanDate(data.date));
  $('dvPrev').href = `${BASE}/${data.prevDate}`;
  $('dvNext').href = `${BASE}/${data.nextDate}`;
  if (!data.found) {
    text('dvStatus', data.error === 'scripture_not_registered' ? '이 날짜의 공통본문이 아직 등록되지 않았습니다. 다른 날짜를 선택해 주세요.' : '날짜 형식을 확인해 주세요.');
    document.querySelectorAll('.dv-card, .dv-jump').forEach(el => { el.hidden = true; });
    return;
  }
  document.querySelectorAll('.dv-card, .dv-jump').forEach(el => { el.hidden = false; });
  text('dvStatus', '');
  const a = data.activities;
  document.title = `에코디 매일묵상 · ${data.passage}`;
  text('dvPassage', data.passage);
  text('dvTheme', a.theme);
  text('dvKeyLine', a.keyLine);
  renderVerses(data.scripture);

  $('poem').hidden = !a.poem;
  if (a.poem) { text('dvPoemTitle', a.poem.title); lines($('dvPoem'), a.poem.lines); }
  $('song').hidden = !a.song;
  if (a.song) {
    text('dvSongTitle', a.song.title);
    text('dvSongMood', `분위기 · ${a.song.mood}`);
    const verse = document.createElement('div');
    verse.className = 'dv-verse';
    lines(verse, a.song.verse);
    const refrain = document.createElement('div');
    refrain.className = 'dv-refrain';
    const label = document.createElement('small');
    label.textContent = '후렴';
    refrain.append(label);
    for (const line of a.song.refrain) { const p = document.createElement('p'); p.textContent = line; refrain.append(p); }
    $('dvSong').replaceChildren(verse, refrain);
  }
  $('dvQuestions').replaceChildren(...a.questions.map(q => {
    const li = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = 'dv-tag';
    tag.textContent = q.kind;
    li.append(tag, ' ', q.text);
    return li;
  }));
  text('dvFamily', a.family);
  text('dvAction', a.action);
  text('dvPrayer', a.prayer);
  text('dvNotice', `${data.notice}${data.activitySource === 'fallback' ? ' 이 날짜는 기본 묵상 활동을 제공합니다.' : ''}`);

  const doneKey = `ekodi-devotion-done-${data.date}`;
  const mineKey = `ekodi-devotion-mine-${data.date}`;
  $('dvActionDone').checked = storageGet(doneKey) === '1';
  $('dvActionDone').onchange = event => storageSet(doneKey, event.target.checked ? '1' : '');
  $('dvMine').value = storageGet(mineKey);
  $('dvMine').oninput = event => storageSet(mineKey, event.target.value);

  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

function shareBody(kind) {
  const d = current;
  const a = d.activities;
  const [, m, day] = d.date.split('-').map(Number);
  const head = `[에코디 매일묵상 ${m}/${day}] ${d.passage}`;
  switch (kind) {
    case 'poem': return { title: a.poem.title, text: `${head}\n\n〈${a.poem.title}〉\n${a.poem.lines.join('\n')}`, hash: 'poem' };
    case 'song': return { title: a.song.title, text: `${head}\n\n♪ ${a.song.title}\n${a.song.verse.join('\n')}\n(후렴) ${a.song.refrain.join(' / ')}`, hash: 'song' };
    case 'questions': return { title: '적용 질문', text: `${head}\n\n${a.questions.map((q, i) => `${i + 1}. [${q.kind}] ${q.text}`).join('\n')}`, hash: 'questions' };
    case 'family': return { title: '가정 질문', text: `${head}\n\n👨‍👩‍👧 ${a.family}`, hash: 'family' };
    case 'action': return { title: '오늘의 실천', text: `${head}\n\n✔ 오늘의 실천: ${a.action}`, hash: 'action' };
    case 'prayer': return { title: '한 줄 기도', text: `${head}\n\n🙏 ${a.prayer}`, hash: 'prayer' };
    case 'mine': {
      const mine = $('dvMine').value.trim();
      if (!mine) return null;
      return { title: '나의 묵상 한 줄', text: `${head}\n\n✍ ${mine}`, hash: '' };
    }
    default: return { title: `에코디 매일묵상 · ${d.passage}`, text: `${head}\n${a.keyLine}`, hash: '' };
  }
}

async function copy(value) {
  try { await navigator.clipboard.writeText(value); return true; } catch {}
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.className = 'dv-offscreen';
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
  if (!body) { toast('먼저 나의 한 줄을 적어 주세요.'); $('dvMine').focus(); return; }
  const url = current.shareUrl + (body.hash ? `#${body.hash}` : '');
  if (copyOnly) {
    toast(await copy(url) ? '링크를 복사했습니다. 카카오톡 대화방에 붙여 넣어 주세요.' : url);
    return;
  }
  if (navigator.share) {
    try { await navigator.share({ title: body.title, text: body.text, url }); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  toast(await copy(`${body.text}\n\n${url}`) ? '내용과 링크를 복사했습니다. 카카오톡에 붙여 넣어 주세요.' : url);
}

document.addEventListener('click', event => {
  const shareButton = event.target.closest('[data-share]');
  if (shareButton) { share(shareButton.dataset.share); return; }
  const copyButton = event.target.closest('[data-copy]');
  if (copyButton) share(copyButton.dataset.copy, true);
});

async function load() {
  const date = requestedDate();
  try {
    const response = await fetch(`${API}${date ? `?date=${date}` : ''}`, { cache: 'no-store' });
    const data = await response.json();
    if (!date && data.date) history.replaceState(null, '', `${BASE}/${data.date}${location.hash}`);
    render(data);
  } catch (error) {
    text('dvStatus', `묵상을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. (${error.message})`);
  }
}

load();
