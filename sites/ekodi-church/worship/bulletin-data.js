// Editable bulletin content: the weekly worship page ships with the prepared
// bulletin, and anything the pastor edits in My Page (church_worship_materials
// .bulletin / .photo_url) replaces the matching block here.
(() => {
  'use strict';
  const SUPABASE_URL = 'https://renzehysxirjilvdxacv.supabase.co';
  const KEY = 'sb_publishable_0QjB0WzZbjrd-FJ5D5cR7A_xUkXyOY_';
  const script = document.currentScript;
  const date = script && script.dataset.date;
  const pages = document.querySelector('[data-bulletin-date]');
  if (!date || !pages) return;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const block = name => pages.querySelector(`[data-b="${name}"]`);
  const rows = list => (Array.isArray(list) ? list : []).filter(r => Array.isArray(r) && r.some(c => String(c).trim()));

  function token() {
    try {
      const s = JSON.parse(localStorage.getItem('sb-renzehysxirjilvdxacv-auth-token') || 'null');
      const v = s && (s.currentSession || s.session || s);
      if (v && v.access_token && Number(v.expires_at || 0) > Date.now() / 1000 + 15) return v.access_token;
    } catch { /* storage blocked */ }
    return '';
  }

  function table(head, body, extra = '') {
    return `<table class="bp-grid ${extra}">${head.length ? '<tr>' + head.map(h => `<th>${esc(h)}</th>`).join('') + '</tr>' : ''}${body.map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('')}</table>`;
  }

  function render(b, photoUrl) {
    if (b) {
      const week = rows(b.week);
      if (week.length && block('week')) block('week').innerHTML = `<table class="bp-week"><tr>${week.map(r => `<th>${esc(r[0])}</th>`).join('')}</tr><tr>${week.map(r => `<td>${esc(r[1] || '')}</td>`).join('')}</tr></table>`;
      if (Array.isArray(b.announce) && block('announce')) block('announce').innerHTML = '<ul class="bp-ann">' + b.announce.filter(Boolean).map(a => `<li>${esc(a)}</li>`).join('') + '</ul>';
      const serve = rows(b.serve);
      if (serve.length && block('serve')) {
        const pairs = [];
        for (let i = 0; i < serve.length; i += 2) pairs.push([...(serve[i] || ['', '']).slice(0, 2), ...((serve[i + 1] || ['', '']).slice(0, 2))]);
        block('serve').innerHTML = table(['구분', '이름', '구분', '이름'], pairs, 'bp-serve');
      }
      const stats = rows(b.stats);
      if (stats.length && block('stats')) {
        const pairs = [];
        for (let i = 0; i < stats.length; i += 2) pairs.push([...(stats[i] || []).concat(['', '', '', '']).slice(0, 4), ...((stats[i + 1] || []).concat(['', '', '', '']).slice(0, 4))]);
        block('stats').innerHTML = table(['구분', '장소', '시간', '인원', '구분', '장소', '시간', '인원'], pairs);
      }
      const committee = rows(b.committee);
      if (committee.length > 1 && block('committee')) block('committee').innerHTML = table(committee[0], committee.slice(1));
      if (Array.isArray(b.sponsors) && block('sponsors')) block('sponsors').innerHTML = '<ul class="bp-sponsors">' + b.sponsors.filter(Boolean).map(a => `<li>${esc(a)}</li>`).join('') + '</ul>';
      if (Array.isArray(b.questions) && block('questions')) block('questions').innerHTML = '<ol class="bp-q">' + b.questions.filter(Boolean).map(a => `<li>${esc(a)}</li>`).join('') + '</ol>';
    }
    const photo = block('photo');
    if (photo) {
      // Photo slot: an uploaded photo, a public Google Drive photo, a blank
      // space, or a short text — chosen in My Page.
      const mode = (b && b.photoMode) || (photoUrl ? 'photo' : '');
      const img = photo.querySelector('img');
      const cap = photo.querySelector('figcaption');
      const allowed = /^https:\/\/(renzehysxirjilvdxacv\.supabase\.co\/storage\/v1\/object\/public\/church-bulletin\/|drive\.google\.com\/thumbnail\?id=[\w-]+&sz=w\d+$)/;
      photo.classList.remove('bp-photo-blank', 'bp-photo-text');
      let note = photo.querySelector('.bp-photo-note');
      if (mode === 'photo' && photoUrl && allowed.test(photoUrl)) {
        img.hidden = false; img.src = photoUrl; img.alt = (b && b.photoCaption) || '';
        cap.textContent = (b && b.photoCaption) || '';
        if (note) note.remove();
        photo.hidden = false;
      } else if (mode === 'blank' || mode === 'text') {
        img.hidden = true; img.removeAttribute('src'); cap.textContent = '';
        photo.classList.add(mode === 'blank' ? 'bp-photo-blank' : 'bp-photo-text');
        if (mode === 'text') {
          if (!note) { note = document.createElement('p'); note.className = 'bp-photo-note'; photo.prepend(note); }
          note.textContent = (b && b.photoText) || '';
        } else if (note) note.remove();
        photo.hidden = false;
      }
    }
  }

  async function load() {
    const key = token();
    const url = `${SUPABASE_URL}/rest/v1/church_worship_materials?select=bulletin,photo_url&service_type=eq.sunday&service_date=eq.${date}&limit=1`;
    const response = await fetch(url, { headers: { apikey: KEY, authorization: 'Bearer ' + (key || KEY) }, cache: 'no-store' });
    if (!response.ok) return;
    const list = await response.json();
    const row = Array.isArray(list) ? list[0] : null;
    if (row) render(row.bulletin, row.photo_url);
  }
  load().catch(() => { /* keep the prepared bulletin */ });
})();
